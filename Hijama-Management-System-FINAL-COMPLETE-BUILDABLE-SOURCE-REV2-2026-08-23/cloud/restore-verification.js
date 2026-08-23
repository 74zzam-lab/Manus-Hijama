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

    const counts = {
      clients: countRecords('clientsRegistry'),
      visits: countRecords('cases'),
      bookings: countRecords('bookings'),
      licenseBranches: Array.isArray(licenseBranches) ? licenseBranches.length : 0,
      backupBranches: Array.isArray(backupBranches) ? backupBranches.length : 0,
    };

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
    const exp = summary.expectedCounts || {};
    const ownerLine = summary.ownerDeferred
      ? 'Owner: سيُؤكَّد بعد المزامنة الكاملة'
      : `Owner: ${summary.ownerUsername || '—'}`;
    const branchLine = summary.branchesInBackup > 0 && summary.branchesInLicense !== summary.branchesInBackup
      ? `الفروع: ${c.licenseBranches ?? '—'} (في الترخيص) · ${summary.branchesInBackup} (في النسخة)`
      : `الفروع: ${c.licenseBranches ?? summary.branchesInBackup ?? '—'}`;
    const countLine = (exp.clients >= 0 && exp.clients > 0)
      ? `العملاء: ${c.clients ?? 0}/${exp.clients} · الجلسات: ${c.visits ?? 0}/${exp.visits >= 0 ? exp.visits : '—'} · الحجوزات: ${c.bookings ?? 0}/${exp.bookings >= 0 ? exp.bookings : '—'}`
      : `العملاء: ${c.clients ?? '—'} · الجلسات: ${c.visits ?? '—'} · الحجوزات: ${c.bookings ?? '—'} · ${branchLine}`;
    const kindLabel = summary.backupV2 || summary.restoreKind === 'backup_v2'
      ? 'تم استعادة Backup V2 والتحقق منه ✓'
      : (summary.cloudHydrate
        ? 'تم سحب/دمج بيانات السحابة (Sync Hydrate) ✓'
        : 'تمت الاستعادة والتحقق من البيانات ✓');
    return `<div class="bf-restore-verify" dir="rtl">
      <strong>${kindLabel}</strong><br>
      Center: <code dir="ltr">${summary.centerId || '—'}</code><br>
      ${ownerLine}<br>
      ${countLine}
    </div>`;
  }

  global.RestoreVerification = {
    verifyPostRestore,
    formatSummaryHtml,
    rehydrateOperationalCaches,
    extractExpectedCounts,
    compareExpectedCounts,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.RestoreVerification;
  }
})(typeof window !== 'undefined' ? window : globalThis);
