/**
 * RC Hotfix Round 2/3 — post-restore verification before wizard marks restore complete.
 */
(function (global) {
  'use strict';

  async function verifyDatabaseIntegrity() {
    try {
      const api = global.cuppingElectron?.database || global.tadawiElectron?.database || global.tadawi?.database;
      if (api?.status) {
        const st = await api.status();
        const ic = st?.integrity || st?.operationalHealth?.integrity;
        if (ic && ic !== 'ok' && ic.ok === false) {
          return { ok: false, error: 'integrity_check_failed', detail: ic };
        }
        return { ok: true, status: st };
      }
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
    return { ok: true, skipped: true };
  }

  function countRecords(key) {
    try {
      if (global.SqliteBridge?.getCommittedRaw) {
        const raw = global.SqliteBridge.getCommittedRaw(key);
        if (Array.isArray(raw)) return raw.length;
      }
      const v = global.DB?.get?.(key, []);
      return Array.isArray(v) ? v.length : 0;
    } catch {
      return 0;
    }
  }

  function countActiveUsers() {
    try {
      const users = global.AuthCredentialTruth?.readAuthoritativeUsers?.()
        || global.DB?.get?.('users', []) || [];
      if (!Array.isArray(users)) return 0;
      return users.filter((u) => u && u.active !== false).length;
    } catch {
      return 0;
    }
  }

  function normalizeSqliteRowCounts(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      clients: Number(raw.clients ?? raw.clientsRegistry ?? 0),
      visits: Number(raw.visits ?? raw.cases ?? 0),
      invoices: Number(raw.invoices ?? 0),
      bookings: Number(raw.bookings ?? 0),
      employees: Number(raw.employees ?? raw.doctors ?? 0),
      users: Number(raw.users ?? 0),
      expenses: Number(raw.expenses ?? 0),
      attendance: Number(raw.attendance ?? 0),
      payments: Number(raw.payments ?? 0),
      services: Number(raw.services ?? 0),
    };
  }

  async function collectRestoreCounts(options) {
    options = options || {};
    const fromBackup = normalizeSqliteRowCounts(options.sqliteRowCounts);
    let fromStatus = null;
    try {
      const api = global.cuppingElectron?.database || global.tadawiElectron?.database || global.tadawi?.database;
      if (api?.status) {
        const st = await api.status();
        if (st?.counts) {
          fromStatus = normalizeSqliteRowCounts(st.counts);
        }
      }
    } catch { /* empty */ }

    const merged = { ...(fromStatus || {}), ...(fromBackup || {}) };
    const memory = {
      clients: countRecords('clientsRegistry'),
      visits: countRecords('cases'),
      bookings: countRecords('bookings'),
      employees: countRecords('doctors'),
      expenses: countRecords('expenses'),
      attendance: countRecords('attendance'),
      users: countActiveUsers(),
    };

    const pick = (key) => {
      const sqliteVal = Number(merged[key]);
      if (Number.isFinite(sqliteVal) && sqliteVal > 0) return sqliteVal;
      const memVal = Number(memory[key]);
      return Number.isFinite(memVal) ? memVal : 0;
    };

    return {
      clients: pick('clients'),
      visits: pick('visits'),
      invoices: pick('invoices') || pick('visits'),
      bookings: pick('bookings'),
      employees: pick('employees'),
      users: pick('users') || memory.users,
      expenses: pick('expenses'),
      attendance: pick('attendance'),
      payments: pick('payments'),
      services: pick('services'),
      licenseBranches: 0,
      backupBranches: 0,
    };
  }

  function extractExpectedCounts(options) {
    options = options || {};
    const point = options.point || {};
    const manifest = point.manifest || options.manifest || {};
    const scopeTruth = point.scopeTruth || manifest.scopeTruth || manifest.scope || {};
    const rc = scopeTruth.recordCounts || manifest.recordCounts || options.expectedCounts || null;
    if (!rc || typeof rc !== 'object') return null;
    return {
      clients: Number(rc.clients ?? rc.clientsRegistry ?? rc.clientCount ?? -1),
      visits: Number(rc.cases ?? rc.visits ?? rc.caseCount ?? -1),
      bookings: Number(rc.bookings ?? rc.bookingCount ?? -1),
    };
  }

  function compareExpectedCounts(expected, actual) {
    if (!expected) return { ok: true, mismatches: [] };
    const mismatches = [];
    const pairs = [
      ['clients', 'clients'],
      ['visits', 'visits'],
      ['bookings', 'bookings'],
    ];
    pairs.forEach(([expKey, actKey]) => {
      const exp = Number(expected[expKey]);
      if (!Number.isFinite(exp) || exp < 0) return;
      const got = Number(actual[actKey]) || 0;
      if (exp > 0 && got === 0) {
        mismatches.push({ key: actKey, expected: exp, actual: got });
      }
    });
    return { ok: mismatches.length === 0, mismatches };
  }

  async function rehydrateOperationalCaches() {
    try {
      global.SqliteBridge?.invalidateOperationalCaches?.();
      if (global.SqliteBridge?.bootFromSQLiteSoTOnce) {
        await global.SqliteBridge.bootFromSQLiteSoTOnce();
      }
    } catch { /* empty */ }
    if (global.SqliteBridge?.rehydrateBranchView) {
      await global.SqliteBridge.rehydrateBranchView();
    }
    if (global.AuthCredentialTruth?.syncUsersFromAuthoritativeStore) {
      global.AuthCredentialTruth.syncUsersFromAuthoritativeStore();
    }
    try {
      if (typeof global.reloadClientStoreFromDb === 'function') global.reloadClientStoreFromDb();
      if (typeof global.syncAppGlobals === 'function') global.syncAppGlobals();
    } catch { /* empty */ }
  }

  function formatCountLine(counts, expectedCounts) {
    const c = counts || {};
    const exp = expectedCounts || {};
    const fmt = (label, value, expected) => {
      const got = Number(value) || 0;
      if (Number.isFinite(Number(expected)) && Number(expected) >= 0 && Number(expected) > 0) {
        return `${label}: ${got}/${expected}`;
      }
      return `${label}: ${got}`;
    };
    return [
      fmt('العملاء', c.clients, exp.clients),
      fmt('الجلسات', c.visits, exp.visits),
      fmt('الفواتير', c.invoices, exp.visits),
      fmt('الحجوزات', c.bookings, exp.bookings),
      fmt('الموظفون', c.employees),
      fmt('المستخدمون', c.users),
      fmt('المصروفات', c.expenses),
      fmt('الحضور', c.attendance),
    ].join(' · ');
  }

  /**
   * Verify restore actually landed before wizard advances.
   */
  async function verifyPostRestore(options = {}) {
    options = options || {};
    try { await global.reconcileAuthUsersAfterHydrate?.(); } catch { /* empty */ }
    await rehydrateOperationalCaches();

    const integrity = await verifyDatabaseIntegrity();
    if (!integrity.ok) {
      return { ok: false, verified: false, error: integrity.error, integrity };
    }

    const users = global.AuthCredentialTruth?.readAuthoritativeUsers?.()
      || global.DB?.get?.('users', []) || [];
    const owner = users.find((u) => u && String(u.role || '').toLowerCase() === 'owner' && u.active !== false);
    const centerId = global.DeviceConfig?.load?.()?.centerId
      || global.LicenseCloud?.loadLocal?.()?.centerId
      || global.settings?.centerId
      || null;
    const licenseDoc = typeof global.licLoad === 'function' ? global.licLoad() : null;
    const licenseBranches = global.LicenseCloud?.loadLocal?.()?.branches || [];
    const backupBranches = options.point?.manifest?.scopeTruth?.includedBranchIds
      || options.point?.scopeTruth?.includedBranchIds
      || null;

    const counts = await collectRestoreCounts(options);
    counts.licenseBranches = Array.isArray(licenseBranches) ? licenseBranches.length : 0;
    counts.backupBranches = Array.isArray(backupBranches) ? backupBranches.length : 0;

    const kind = options.kind || options.restoreKind || null;
    const isCloudHydrate = kind === 'cloud_hydrate' || options.source === 'bootflow_cloud_restore';
    const isBackupRestore = kind === 'backup_v2' || kind === 'file' || kind === 'local_backup';

    const expectedCounts = extractExpectedCounts(options);
    const countCompare = compareExpectedCounts(expectedCounts, counts);

    const summary = {
      centerId,
      branchId: global.DeviceConfig?.load?.()?.lockedBranchId || null,
      ownerUsername: owner?.username || null,
      ownerPresent: !!owner,
      counts,
      expectedCounts,
      countMismatches: countCompare.mismatches,
      restoreKind: kind,
      backupV2: isBackupRestore,
      backupPoint: options.point?.path || options.point?.name || null,
      cloudHydrate: isCloudHydrate,
      branchesInLicense: counts.licenseBranches,
      branchesInBackup: counts.backupBranches,
    };

    const requireOwner = options.requireOwner !== false && !isCloudHydrate;
    const requireData = options.requireData === true;
    if (requireOwner && !owner) {
      return { ok: false, verified: false, error: 'restore_owner_missing', summary };
    }
    if (isCloudHydrate && !owner) {
      const hasIdentity = !!(centerId || licenseDoc?.centerId || licenseDoc?.licenseId);
      const hasAnyData = counts.clients > 0 || counts.visits > 0 || counts.bookings > 0;
      if (!hasIdentity && !hasAnyData) {
        return { ok: false, verified: false, error: 'restore_cloud_identity_missing', summary };
      }
      summary.ownerPresent = false;
      summary.ownerDeferred = true;
    }
    if (isBackupRestore && !countCompare.ok) {
      return { ok: false, verified: false, error: 'restore_count_mismatch', summary };
    }
    if (requireData && counts.clients === 0 && counts.visits === 0 && counts.bookings === 0) {
      return { ok: false, verified: false, error: 'restore_data_empty', summary };
    }

    try {
      global.OwnerLifecycleAuthority?.reconcileAfterRestore?.({
        gateId: options.gateId || null,
        source: options.source || 'bootflow_restore_verify',
      });
    } catch { /* empty */ }

    return { ok: true, verified: true, summary, integrity };
  }

  function formatSummaryHtml(summary) {
    if (!summary) return '';
    const c = summary.counts || {};
    const ownerLine = summary.ownerDeferred
      ? 'Owner: سيُؤكَّد بعد المزامنة الكاملة'
      : `Owner: ${summary.ownerUsername || '—'}`;
    const branchLine = summary.branchesInBackup > 0 && summary.branchesInLicense !== summary.branchesInBackup
      ? `الفروع: ${c.licenseBranches ?? '—'} (في الترخيص) · ${summary.branchesInBackup} (في النسخة)`
      : `الفروع: ${c.licenseBranches ?? summary.branchesInBackup ?? '—'}`;
    const countLine = formatCountLine(c, summary.expectedCounts);
    const kindLabel = summary.backupV2 || summary.restoreKind === 'backup_v2'
      ? 'تم استعادة Backup V2 والتحقق منه ✓'
      : (summary.cloudHydrate
        ? 'تم سحب/دمج بيانات السحابة (Sync Hydrate) ✓'
        : 'تمت الاستعادة والتحقق من البيانات ✓');
    return `<div class="bf-restore-verify" dir="rtl">
      <strong>${kindLabel}</strong><br>
      Center: <code dir="ltr">${summary.centerId || '—'}</code><br>
      ${ownerLine}<br>
      ${countLine}<br>
      <span class="bf-source-meta">${branchLine}</span>
    </div>`;
  }

  global.RestoreVerification = {
    verifyPostRestore,
    formatSummaryHtml,
    rehydrateOperationalCaches,
    extractExpectedCounts,
    compareExpectedCounts,
    collectRestoreCounts,
    formatCountLine,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.RestoreVerification;
  }
})(typeof window !== 'undefined' ? window : globalThis);
