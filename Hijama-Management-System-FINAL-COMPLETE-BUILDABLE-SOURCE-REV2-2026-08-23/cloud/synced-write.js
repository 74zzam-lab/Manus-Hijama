/**
 * Synced Write — single gateway for synced table writes and backup restore.
 */
(function (global) {
  'use strict';

  const LOCAL_ONLY_KEYS = new Set([
    'otRecords', 'clientFileCounter', 'hardwareLog', 'messageLog', 'nextSessions',
    'employeeLeaveRequests', 'employeeLedgerAccruals', 'employeeLedgerPayments',
    'employeeLedgerEntries', 'importHistory', 'communicationWebhookLog',
    'invoiceCounter', 'backupLog', 'backupRegistry', 'budget', 'systemLogs',
    'logCounter', 'logsPageSize', 'cashDrawerSession', 'preImportBackup',
    'importStudioLog', 'activityLog'
  ]);

  function ensureBridge() {
    global.DbBridge?.install?.();
    return global.Repository;
  }

  function syncedTables() {
    return new Set(global.DbBridge?.syncedTables?.() || global.Repository?.SYNCED_TABLES || []);
  }

  function isSyncedTable(table) {
    return syncedTables().has(table);
  }

  function syncGlobalVar(table, value) {
    if (table === 'cases') global.cases = value;
    else if (table === 'clientsRegistry') global.clientsRegistry = value;
    else if (table === 'bookings') global.bookings = value;
    else if (table === 'users') global.users = value;
    else if (table === 'doctors') global.doctors = value;
    else if (table === 'services') global.services = value;
    else if (table === 'packages') global.packages = value;
    else if (table === 'settings' && value && !Array.isArray(value)) global.settings = value;
    else if (table === 'expenses') global.expenses = value;
    else if (table === 'attendance') global.attendance = value;
    else if (table === 'inventoryItems') global.inventoryItems = value;
    else if (table === 'inventorySuppliers') global.inventorySuppliers = value;
    else if (table === 'inventoryMovements') global.inventoryMovements = value;
  }

  async function setTable(table, value, options) {
    options = options || {};
    ensureBridge();
    if (global.LegacyBranchMigration?.isPushBlocked?.() && isSyncedTable(table)) {
      return { ok: false, error: 'legacy_branch_migration_required' };
    }
    // Synced tables always commit through Repository. With SQLite authority this method
    // awaits exactly one table+revision commit and only then updates renderer mirrors.
    if (isSyncedTable(table)) {
      if (!global.Repository?.setAll) return { ok: false, error: 'no_repository' };
      const result = await global.Repository.setAll(table, value, options);
      if (result?.ok === false) return result;
      syncGlobalVar(table, value);
      return { ok: true, via: global.Repository?.adapter?.authoritative ? 'repository_sqlite_authoritative' : 'repository', table, result };
    }
    // Non-synced operational keys use the explicit SQLite bridge directly.
    if (global.SqliteBridge?.setAuthoritative && (
      global.SqliteBridge.CORE_TABLES?.includes?.(table)
      || global.SqliteBridge.OPERATIONAL_KEYS?.has?.(table)
    )) {
      const res = await global.SqliteBridge.setAuthoritative(table, value);
      if (!res?.ok) return { ok: false, error: res?.error || 'sqlite_commit_failed', via: 'sqlite' };
      syncGlobalVar(table, value);
      return { ok: true, via: 'sqlite_authoritative', table };
    }
    global.DbBridge?.rawDb?.()?.set?.(table, value) || global.DB?.set?.(table, value);
    return { ok: true, via: 'local', table };
  }

  async function upsertRecord(table, record, options) {
    options = options || {};
    ensureBridge();
    if (!isSyncedTable(table)) {
      return { ok: false, error: 'not_synced_table' };
    }
    if (global.LegacyBranchMigration?.isPushBlocked?.()) {
      return { ok: false, error: 'legacy_branch_migration_required' };
    }
    if (!global.Repository?.upsert) return { ok: false, error: 'no_repository' };
    const r = await global.Repository.upsert(table, record, options);
    if (r?.ok === false) return r;
    const all = global.Repository.get(table);
    syncGlobalVar(table, all);
    return r;
  }

  function applyLocalOnlyPayload(data) {
    if (!data || typeof data !== 'object') return [];
    const applied = [];
    Object.keys(data).forEach(key => {
      if (LOCAL_ONLY_KEYS.has(key) && data[key] != null) {
        global.DB?.set?.(key, data[key]);
        if (key === 'invoiceCounter') global.invoiceCounter = data[key];
        if (key === 'clientFileCounter') global.clientFileCounter = data[key];
        applied.push(key);
      }
    });
    return applied;
  }

  function wipeTable(table, emptyValue) {
    ensureBridge();
    const val = emptyValue != null ? emptyValue : (table.includes('Counter') ? 1 : []);
    if (isSyncedTable(table)) {
      global.SyncGuard?.pause?.('admin_wipe', { table });
      const r = setTable(table, val, { source: 'wipe' });
      global.SyncGuard?.resume?.({ state: 'local_only' });
      return r;
    }
    global.DbBridge?.rawDb?.()?.set?.(table, val);
    return { ok: true, via: 'local', table };
  }

  function restoreLocalExtensions(data) {
    if (!data || typeof data !== 'object') return;
    if (typeof global.extRestoreData === 'function') global.extRestoreData(data);
    if (typeof global.extRestoreLedgerData === 'function') global.extRestoreLedgerData(data);
    if (typeof global.extRestoreLeaveData === 'function') global.extRestoreLeaveData(data);
  }

  async function restoreFromBackup(data, meta) {
    meta = meta || {};
    const gate = global.RestoreSurfaceAuthority?.assertMigrationMergeAllowed?.(meta);
    if (gate && !gate.ok) return gate;

    ensureBridge();
    if (!global.RestoreStaging?.stageBackup) {
      return { ok: false, error: 'no_restore_staging' };
    }

    const staged = global.RestoreStaging.stageBackup(data, meta);
    const comparison = global.RestoreStaging.compareWithLocal(staged);

    global.AuditLogger?.logSyncEvent?.('MANUAL_RESTORE', {
      summary: 'بدء استيراد/دمج بيانات عبر Staging (migration-only)',
      source: meta.source || 'backup'
    });

    if (comparison.hasConflict) {
      if (!global.RolePolicy?.isManager?.(global.currentUser)) {
        global.notify?.('⛔ لا يمكن الاستعادة — تواصل مع المدير', 'danger');
        return { ok: false, error: 'manager_required', comparison };
      }
      global.SyncGuard?.pause?.('restore_conflict', comparison);
      return { ok: false, error: 'conflict', needsReview: true, comparison };
    }

    const merged = await global.RestoreStaging.applyStagedMerge({
      manual: true,
      migrationOnly: meta.migrationOnly === true,
      branchId: meta.branchId,
      keepStaging: false
    });

    if (!merged.ok) return merged;

    Object.keys(global.RestoreStaging.SYNCED_MAP || {}).forEach(table => {
      if (global.Repository?.get) syncGlobalVar(table, global.Repository.get(table));
    });

    const localOnly = applyLocalOnlyPayload(data);
    restoreLocalExtensions(data);

    return { ok: true, merged, localOnly, comparison };
  }

  global.SyncedWrite = {
    LOCAL_ONLY_KEYS,
    ensureBridge,
    isSyncedTable,
    setTable,
    upsertRecord,
    wipeTable,
    restoreFromBackup,
    restoreLocalExtensions,
    applyLocalOnlyPayload,
    syncGlobalVar
  };
})(typeof window !== 'undefined' ? window : globalThis);
