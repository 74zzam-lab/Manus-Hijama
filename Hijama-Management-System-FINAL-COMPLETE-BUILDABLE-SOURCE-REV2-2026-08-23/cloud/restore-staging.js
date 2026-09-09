/**
 * Restore Staging — backup restore via temp staging + comparison + merge (no direct overwrite).
 */
(function (global) {
  'use strict';

  const STAGING_KEY = '__tdw_restore_staging__';

  const SYNCED_MAP = {
    cases: 'cases',
    clientsRegistry: 'clientsRegistry',
    bookings: 'bookings',
    users: 'users',
    doctors: 'doctors',
    settings: 'settings',
    expenses: 'expenses',
    packages: 'packages',
    services: 'services',
    attendance: 'attendance',
    inventoryItems: 'inventoryItems',
    inventorySuppliers: 'inventorySuppliers',
    inventoryMovements: 'inventoryMovements',
    attachments_meta: 'attachments_meta',
    messageLog: 'messageLog',
    activityLog: 'activityLog',
    nextSessions: 'nextSessions',
    otRecords: 'otRecords',
    employeeLeaveRequests: 'employeeLeaveRequests',
    employeeLedgerAccruals: 'employeeLedgerAccruals',
    employeeLedgerPayments: 'employeeLedgerPayments',
    employeeLedgerEntries: 'employeeLedgerEntries',
    importHistory: 'importHistory',
    communicationWebhookLog: 'communicationWebhookLog',
    systemLogs: 'systemLogs',
    cashDrawerSession: 'cashDrawerSession',
    opsKv: 'opsKv'
  };

  const MIGRATION_ALLOW_TOP_KEYS = new Set([
    'clientsRegistry',
    'clients',
    'cases',
    'visits',
    'bookings',
    'invoices',
    'inventoryItems',
    'inventorySuppliers',
    'inventoryMovements',
    'employees',
    'doctors',
    'users',
    'expenses',
    'ledger',
    'ledgerEntries',
    'employeeLedgerEntries',
    'employeeLedgerPayments',
    'employeeLedgerAccruals',
    'attendance',
    'packages',
    'services',
    'settings',
    'attachments_meta',
    'invoiceCounter',
    'clientFileCounter',
    'budget',
    'messageLog',
    'activityLog',
    'nextSessions',
    'otRecords',
    'employeeLeaveRequests',
    'importHistory',
    'communicationWebhookLog',
    'systemLogs',
    'cashDrawerSession',
  ]);

  const MIGRATION_DENY_TOP_KEYS = new Set([
    'license',
    '__tdw_wizard__',
    '__tdw_boot_done__',
    '__tdw_setup_state__',
    'deviceConfig',
    'oauth',
    'wizard',
    'google',
    'cloud',
    'cloudV2',
    'syncBaseline',
    'bootFlags',
    'activation',
  ]);

  const SETTINGS_ALLOW_KEYS = new Set([
    'centerName',
    'branchName',
    'prices',
    'printReports',
    'bookingStatuses',
    'communication',
    'tax',
    'locale',
    'theme',
    'colorScheme',
  ]);

  function cloneJson(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  function normalizeSettingsRow(settings) {
    if (Array.isArray(settings)) return settings[0] && typeof settings[0] === 'object' ? { ...settings[0] } : {};
    return settings && typeof settings === 'object' ? { ...settings } : {};
  }

  /** Allowlist JSON migration imports — never import device/oauth/license identity. */
  function sanitizeMigrationImport(data, meta) {
    if (!data || typeof data !== 'object') return data;
    if (!meta || meta.migrationOnly !== true) return data;

    const report = buildMigrationImportReport(data);
    const clean = {};
    report.imported.forEach(({ key }) => {
      if (data[key] != null) clean[key] = cloneJson(data[key]);
    });

    if (clean.settings) {
      const settings = normalizeSettingsRow(clean.settings);
      const filtered = {};
      SETTINGS_ALLOW_KEYS.forEach((key) => {
        if (settings[key] != null) filtered[key] = settings[key];
      });
      if (Array.isArray(clean.settings)) clean.settings = [filtered];
      else clean.settings = filtered;
    }

    if (Array.isArray(clean.users)) {
      clean.users = clean.users.map((u) => {
        if (!u || typeof u !== 'object') return u;
        const row = { ...u };
        delete row.password;
        delete row.passwordPlain;
        delete row.passwordHash;
        delete row.salt;
        return row;
      });
    }

    clean.__migrationImportReport = report;
    return clean;
  }

  function buildMigrationImportReport(data) {
    const imported = [];
    const skipped = [];
    const failed = [];
    if (!data || typeof data !== 'object') {
      return { imported, skipped, failed };
    }

    Object.keys(data).forEach((key) => {
      if (MIGRATION_DENY_TOP_KEYS.has(key)) {
        skipped.push({ key, reason: 'security_policy_device_identity' });
        return;
      }
      if (MIGRATION_ALLOW_TOP_KEYS.has(key)) {
        imported.push({ key, count: Array.isArray(data[key]) ? data[key].length : 1 });
        return;
      }
      if (/^__tdw_|oauth|google|cloud|license|device|wizard|boot|sync/i.test(key)) {
        skipped.push({ key, reason: 'security_policy_device_identity' });
        return;
      }
      skipped.push({ key, reason: 'not_in_migration_allowlist' });
    });

    if (data.users) {
      skipped.push({
        key: 'users.credentials',
        reason: 'security_policy_password_hashes',
        labelAr: 'تم تجاهل بيانات تسجيل الدخول عمداً لأسباب السلامة',
      });
    }

    return { imported, skipped, failed };
  }

  function stageBackup(data, meta) {
    meta = meta || {};
    const payload = sanitizeMigrationImport(data, meta);
    const staged = {
      stagedAt: new Date().toISOString(),
      source: meta.source || 'backup',
      fileName: meta.fileName || '',
      data: payload || {},
      tables: {}
    };
    Object.keys(SYNCED_MAP).forEach(key => {
      if (payload[key] != null) {
        const rows = Array.isArray(payload[key])
          ? payload[key]
          : (key === 'settings' || key === 'cashDrawerSession' ? [payload[key]] : []);
        staged.tables[key] = rows;
      }
    });
    global.DB?.set?.(STAGING_KEY, staged);
    return staged;
  }

  function loadStaging() {
    return global.DB?.get?.(STAGING_KEY, null);
  }

  function clearStaging() {
    global.DB?.set?.(STAGING_KEY, null);
  }

  function compareWithLocal(staged, branchId) {
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    const perTable = {};
    let hasConflict = false;
    let canSafeMerge = true;

    Object.keys(staged.tables || {}).forEach(table => {
      const remote = staged.tables[table];
      const local = global.DataStateAnalyzer?.getLocalRecords?.(table, branchId)
        || global.Repository?.get?.(table) || [];
      const localRows = Array.isArray(local) ? local : (table === 'settings' ? [local] : []);
      const merge = global.RecordMerger?.mergeRecords?.(localRows, remote, {
        table,
        branchId,
        enqueueConflicts: false,
        preserveOtherBranches: true
      }) || { hasConflict: false, safeAutoMerge: true, stats: {} };

      perTable[table] = {
        localCount: localRows.length,
        stagedCount: remote.length,
        hasConflict: merge.hasConflict,
        safeAutoMerge: merge.safeAutoMerge,
        stats: merge.stats,
        mergePreview: merge.merged
      };
      if (merge.hasConflict) { hasConflict = true; canSafeMerge = false; }
    });

    return { ok: true, perTable, hasConflict, canSafeMerge, branchId };
  }

  async function applyStagedMerge(options) {
    options = options || {};
    const staged = loadStaging();
    if (!staged) return { ok: false, error: 'no_staging' };

    if (options.manual && global.RestoreSurfaceAuthority) {
      const gate = global.RestoreSurfaceAuthority.assertMigrationMergeAllowed(
        { source: staged.source, migrationOnly: options.migrationOnly },
        options
      );
      if (!gate.ok) return gate;
    }

    const branchId = options.branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    const comparison = compareWithLocal(staged, branchId);

    if (comparison.hasConflict && !options.force && !global.RolePolicy?.isManager?.()) {
      return { ok: false, error: 'conflict_manager_required', comparison };
    }

    const bridge = global.SqliteBridge;
    const useBundle = bridge?.isPrimary?.() && bridge?.beginBundle && !bridge?.isBundleActive?.();
    if (useBundle) bridge.beginBundle();

    const results = [];
    Object.keys(staged.tables || {}).forEach(table => {
      const t = comparison.perTable[table];
      if (!t) return;
      if (t.hasConflict && !options.force) {
        results.push({ table, ok: false, skipped: true, reason: 'conflict' });
        return;
      }
      if (table === 'cashDrawerSession') {
        const rows = staged.tables[table] || t.mergePreview || [];
        const raw = Array.isArray(rows) ? rows[0] : rows;
        if (raw && typeof raw === 'object' && !raw.kind && (raw.date || Array.isArray(raw.movements))) {
          global.cashDrawerSession = raw;
          try { global.DB?.set?.('cashDrawerSession', raw); } catch { /* empty */ }
          results.push({ table, ok: true, restoredObject: true });
          return;
        }
        const applied = global.OperationalLayer?.applyCashDrawerRecords?.(rows, branchId);
        results.push({ table, ok: applied != null });
        return;
      }
      const applied = global.RecordMerger?.applyMergeToRepository?.(table, { merged: t.mergePreview }, {
        source: options.manual ? 'manual' : 'safe_auto',
        branchId
      });
      results.push({ table, ok: !!applied?.ok });
    });

    if (useBundle) {
      const bundleRes = await bridge.commitBundle();
      if (!bundleRes?.ok && !bundleRes?.skipped) {
        return {
          ok: false,
          error: bundleRes?.error || 'restore_bundle_failed',
          results,
          comparison,
          atomic: true,
        };
      }
    }

    global.AuditLogger?.logSyncEvent?.('MANUAL_RESTORE', {
      summary: `استعادة من نسخة احتياطية — ${results.filter(r => r.ok).length} جدول`,
      source: staged.source,
      fileName: staged.fileName
    });

    if (!options.keepStaging) clearStaging();
    return { ok: true, results, comparison, atomic: !!useBundle };
  }

  async function stageAndPrompt(backupData, meta) {
    const staged = stageBackup(backupData, meta);
    const comparison = compareWithLocal(staged);

    global.AuditLogger?.logSyncEvent?.('MANUAL_RESTORE', {
      summary: 'تم تحميل نسخة احتياطية للمراجعة قبل الاستعادة',
      source: meta?.source || 'backup'
    });

    if (comparison.hasConflict) {
      if (global.RolePolicy?.isManager?.()) {
        global.notify?.('⚠️ النسخة الاحتياطية تحتوي على بيانات متعارضة — راجع قبل الاستعادة', 'warning');
        global.DataStateUI?.open?.({
          ok: true,
          state: 'conflict',
          blocked: true,
          requiresUserDecision: true,
          branchId: comparison.branchId
        });
      } else {
        global.notify?.('⛔ لا يمكن الاستعادة — تواصل مع المدير', 'danger');
        return { ok: false, error: 'manager_required', comparison };
      }
    }

    return { ok: true, staged, comparison, needsReview: comparison.hasConflict || !comparison.canSafeMerge };
  }

  global.RestoreStaging = {
    STAGING_KEY,
    SYNCED_MAP,
    MIGRATION_ALLOW_TOP_KEYS,
    MIGRATION_DENY_TOP_KEYS,
    sanitizeMigrationImport,
    buildMigrationImportReport,
    stageBackup,
    loadStaging,
    clearStaging,
    compareWithLocal,
    applyStagedMerge,
    stageAndPrompt
  };
})(typeof window !== 'undefined' ? window : globalThis);
