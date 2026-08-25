/**
 * Renderer SQLite bridge — authoritative operational SoT (Phase 1).
 *
 * Read path (Electron):
 *   DB.get operational key → memory lastCommitted / SQLite hydrate — NOT localStorage
 * Write path:
 *   UI → SQLite transaction (+ outbox) → success → LS cache mirror + memory
 */
(function (global) {
  'use strict';

  const REG = global.SqliteOperationalRegistry || {};
  const CORE_TABLES = REG.CORE_TABLES || [
    'clientsRegistry', 'cases', 'bookings', 'doctors', 'attendance', 'expenses',
  ];
  const KV_MIRROR = REG.KV_MIRROR || REG.KV_OPERATIONAL || [
    'users', 'settings', 'packages', 'services', 'otRecords', 'budget', 'invoiceCounter',
    'clientFileCounter', 'nextSessions', 'employeeLeaveRequests', 'employeeLedgerAccruals',
    'employeeLedgerPayments', 'employeeLedgerEntries', 'importHistory',
    'inventoryItems', 'inventorySuppliers', 'inventoryMovements',
    'attachments_meta',
    '__tdw_conflict_queue__', '__tdw_conflict_archive__', '__tdw_attachment_manifest__',
    '__tdw_branch_settings_store__', '__tdw_branch_counters_store__',
    '__tdw_owner_profile__', '__tdw_owner_setup__', '__tdw_owner_migration__',
    'activityLog', 'messageLog', 'systemLogs', 'cashDrawerSession',
    'communicationWebhookLog', 'communicationQueue', 'backupLog',
  ];
  const OPERATIONAL_PREFIXES = REG.OPERATIONAL_PREFIXES || [
    '__tdw_owner_', '__tdw_conflict_', '__tdw_attachment_',
  ];
  const OPERATIONAL_KEYS = REG.OPERATIONAL_KEYS || new Set(CORE_TABLES.concat(KV_MIRROR));
  const UI_ONLY_KEYS = new Set(REG.UI_ONLY_KEYS || [
    '__tdw_ui_theme__', '__tdw_ui_lang__', '__tdw_last_tab__', '__tdw_wizard_ui__',
    'tdw_sidebar_collapsed', 'tablePageSize', 'logsPageSize', 'devContact',
  ]);

  const state = {
    ready: false,
    bootPromise: null,
    sqlitePrimary: false,
    lastError: null,
    status: null,
    lastCommitted: {},
    pendingKeys: new Set(),
    bundleActive: false,
    bundleOps: [],
    staleLsOverridden: [],
    capturedWriteBranchId: null,
  };

  function api() {
    return global.cuppingElectron?.database || global.tadawi?.database || null;
  }

  function isOperationalKey(key) {
    if (REG.isOperationalKey) return REG.isOperationalKey(key);
    if (OPERATIONAL_KEYS.has(key) || CORE_TABLES.includes(key)) return true;
    return OPERATIONAL_PREFIXES.some((p) => String(key).startsWith(p));
  }

  function defaultForKey(key) {
    if (REG.defaultForOperationalKey) return REG.defaultForOperationalKey(key);
    if (key.endsWith('Counter')) return 0;
    if (key === 'settings') return {};
    if (key === 'budget') return 0;
    if (key === 'cashDrawerSession') return null;
    return [];
  }

  function shouldBlockLocalStorage(key) {
    const db = api();
    if (!db) return false;
    if (REG.shouldBlockLocalStorageForKey) {
      return REG.shouldBlockLocalStorageForKey(key, true);
    }
    if (UI_ONLY_KEYS.has(key)) return false;
    return isOperationalKey(key);
  }

  function hasElectronDatabase() {
    return !!api();
  }

  function readFromLocalStorageOnly(k, def) {
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : def;
    } catch {
      return def;
    }
  }

  /**
   * Authoritative read for operational keys.
   * Returns undefined → caller may fall back to localStorage (browser-only / pre-bridge).
   */
  function shouldUseAggregateView() {
    if (global.BranchScope?.isAggregateBranchView?.()) return true;
    const active = global.BranchScope?.getActiveBranchId?.();
    return active === '*' || active === '__ALL__';
  }

  function filterForActiveViewIfNeeded(key, value) {
    if (global.BranchDataIsolation?.filterKvForView) {
      return global.BranchDataIsolation.filterKvForView(key, value);
    }
    if (!CORE_TABLES.includes(key) || !Array.isArray(value)) return value;
    if (shouldUseAggregateView()) return value;
    if (global.BranchScope?.filterForActiveView) {
      return global.BranchScope.filterForActiveView(value);
    }
    if (global.BranchScope?.filterByBranch) {
      const bid = global.BranchDataIsolation?.getViewBranchId?.()
        || global.BranchContexts?.getSelectedReportingBranch?.()
        || global.BranchContexts?.getOperationalWriteBranch?.()
        || (global.DeviceConfig?.isBranchLocked?.() ? global.DeviceConfig?.getLockedBranchId?.() : null);
      if (!bid) return [];
      return global.BranchScope.filterByBranch(value, bid);
    }
    return value;
  }

  function filterRecordsForWriteBranch(records) {
    if (!Array.isArray(records)) return [];
    const bid = getOperationalWriteBranchId();
    if (global.BranchScope?.filterByBranch) {
      return global.BranchScope.filterByBranch(records, bid);
    }
    return records;
  }

  function recordOutsideBranch(record, branchId) {
    if (!record || typeof record !== 'object') return true;
    const bid = branchId || getOperationalWriteBranchId();
    if (!bid) return true;
    if (global.BranchScope?.filterByBranch) {
      return global.BranchScope.filterByBranch([record], bid).length === 0;
    }
    if (global.LegacyBranchMigration?.resolveLegacyBranchId) {
      const resolved = global.LegacyBranchMigration.resolveLegacyBranchId(record);
      return resolved !== bid;
    }
    return String(record.branchId || '') !== bid;
  }

  function mergeBranchSliceIntoCommitted(tableKey, branchRecords, branchId) {
    const bid = branchId || getOperationalWriteBranchId({ honorCaptured: true });
    const scopeCheck = assertScopeMatch(branchRecords, bid);
    if (!scopeCheck.ok) {
      throw Object.assign(new Error(scopeCheck.error || 'branch_scope_mismatch'), scopeCheck);
    }
    const full = Array.isArray(state.lastCommitted[tableKey])
      ? state.lastCommitted[tableKey].slice()
      : [];
    const others = full.filter((r) => recordOutsideBranch(r, bid));
    const merged = [...others, ...(Array.isArray(branchRecords) ? branchRecords : [])];
    rememberCommit(tableKey, merged);
    const viewVal = filterForActiveViewIfNeeded(tableKey, merged);
    rawSet(tableKey, viewVal);
    syncMemory(tableKey, viewVal);
  }

  function applyCommittedToView(key, value) {
    rememberCommit(key, value);
    const viewVal = filterForActiveViewIfNeeded(key, value);
    rawSet(key, viewVal);
    syncMemory(key, viewVal);
  }

  function readOperational(key, def) {
    if (UI_ONLY_KEYS.has(key)) return undefined;
    if (!isOperationalKey(key)) return undefined;

    if (Object.prototype.hasOwnProperty.call(state.lastCommitted, key)) {
      const raw = state.lastCommitted[key];
      return filterForActiveViewIfNeeded(key, raw);
    }

    const db = api();
    if (db) {
      // Electron: never delegate authority to localStorage for operational keys.
      if (!state.ready) return def !== undefined ? def : defaultForKey(key);
      return def !== undefined ? def : defaultForKey(key);
    }

    return undefined;
  }

  function rawSet(k, v) {
    if (typeof DB !== 'undefined' && DB.__rawSet) return DB.__rawSet(k, v);
    if (typeof DB !== 'undefined' && DB.set && !DB.__sqliteWriteThrough) return DB.set(k, v);
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* empty */ }
  }

  function syncMemory(tableKey, value) {
    if (tableKey === 'clientsRegistry') global.clientsRegistry = value;
    else if (tableKey === 'cases') global.cases = value;
    else if (tableKey === 'bookings') global.bookings = value;
    else if (tableKey === 'doctors') global.doctors = value;
    else if (tableKey === 'attendance') global.attendance = value;
    else if (tableKey === 'expenses') global.expenses = value;
    else if (tableKey === 'users') {
      global.users = value;
      if (typeof globalThis.__assignUsersClosure === 'function') {
        try { globalThis.__assignUsersClosure(value); } catch { /* empty */ }
      }
    }
    else if (tableKey === 'services') global.services = value;
    else if (tableKey === 'packages') global.packages = value;
    else if (tableKey === 'settings' && value && !Array.isArray(value)) global.settings = value;
    else if (tableKey === 'inventoryItems') global.inventoryItems = value;
    else if (tableKey === 'inventorySuppliers') global.inventorySuppliers = value;
    else if (tableKey === 'inventoryMovements') global.inventoryMovements = value;
    else if (tableKey === 'activityLog') global.activityLog = value;
    else if (tableKey === 'messageLog') global.messageLog = value;
    else if (tableKey === 'backupLog') global.backupLog = value;
    else if (tableKey === 'cashDrawerSession') global.cashDrawerSession = value;
    else if (tableKey === 'systemLogs') global.systemLogs = value;
    else if (tableKey === 'attachments_meta') global.attachments_meta = value;
    else if (tableKey === 'employeeLeaveRequests') global.employeeLeaveRequests = value;
    else if (tableKey === 'importHistory') global.importHistory = value;
    else if (tableKey === 'otRecords') global.otRecords = value;
    else if (tableKey === 'nextSessions') global.nextSessions = value;
  }

  function noteStaleLocalStorageOverride(key, sqliteValue) {
    try {
      const lsRaw = localStorage.getItem(key);
      if (!lsRaw) return;
      const lsVal = JSON.parse(lsRaw);
      if (JSON.stringify(lsVal) !== JSON.stringify(sqliteValue)) {
        if (!state.staleLsOverridden.includes(key)) state.staleLsOverridden.push(key);
      }
    } catch { /* empty */ }
  }

  function isBundledOperationalKey(key) {
    return CORE_TABLES.includes(key) || OPERATIONAL_KEYS.has(key) || KV_MIRROR.includes(key);
  }

  function beginBundle() {
    state.bundleActive = true;
    state.bundleOps = [];
    state.capturedWriteBranchId = getOperationalWriteBranchId();
    return { ok: true, branchId: state.capturedWriteBranchId };
  }

  function queueBundleOp(key, value) {
    const kind = CORE_TABLES.includes(key) ? 'table' : 'kv';
    const tableValue = kind === 'table' ? filterRecordsForWriteBranch(Array.isArray(value) ? value : []) : undefined;
    const op = {
      key,
      kind,
      records: kind === 'table' ? tableValue : undefined,
      value: kind === 'kv' ? value : undefined,
    };
    const idx = state.bundleOps.findIndex((o) => o.key === key);
    if (idx >= 0) state.bundleOps[idx] = op;
    else state.bundleOps.push(op);
  }

  function getTableRevision(tableKey, branchId) {
    return Number(
      global.VersionsIndex?.getTableRevision?.(tableKey, branchId) ||
      global.Repository?.getRevision?.(tableKey) ||
      global.Repository?._revisions?.[tableKey] ||
      0
    );
  }

  function buildOutboxEntryForKv(key, value) {
    const centerId =
      global.ConfigLayer?.getCenterId?.() ||
      global.CenterId?.getStoredCenterId?.() ||
      global.LicenseCloud?.loadLocal?.()?.centerId ||
      '';
    if (!centerId) return null;
    const branchId = getOperationalWriteBranchId();
    if (!branchId) return null;
    const deviceId =
      global.DeviceConfig?.getDeviceId?.() ||
      global.DeviceConfig?.load?.()?.deviceUuid ||
      'unknown-device';
    const base = getTableRevision(key, branchId);
    const next = base + 1;
    const payload_json = JSON.stringify(value ?? null);
    const entry = {
      center_id: centerId,
      branch_id: branchId,
      table_name: key,
      operation: 'TABLE_BUMP',
      base_revision: base,
      new_revision: next,
      device_id: deviceId,
      payload_json,
    };
    return entry;
  }

  function getOperationalWriteBranchId(options = {}) {
    options = options || {};
    if (options.honorCaptured && state.capturedWriteBranchId) {
      return state.capturedWriteBranchId;
    }
    const fromWriteContext = global.BranchContexts?.getOperationalWriteBranch?.();
    if (fromWriteContext) return fromWriteContext;
    if (options.allowDeviceLock !== false && global.DeviceConfig?.isBranchLocked?.()) {
      const locked = global.DeviceConfig?.getLockedBranchId?.();
      if (locked) return locked;
    }
    return null;
  }

  function assertScopeMatch(records, branchId) {
    const bid = branchId || getOperationalWriteBranchId({ honorCaptured: true });
    if (!bid || !Array.isArray(records)) return { ok: true, branchId: bid };
    for (const r of records) {
      if (recordOutsideBranch(r, bid)) {
        return {
          ok: false,
          error: 'branch_scope_mismatch',
          branchId: bid,
          recordBranchId: r?.branchId || null,
          recordId: r?.id || null,
        };
      }
    }
    return { ok: true, branchId: bid };
  }

  function hasPendingCommits() {
    return state.pendingKeys.size > 0 || state.bundleActive;
  }

  function assertOperationalWriteBranch() {
    const ctx = global.BranchContexts?.assertOperationalWriteContext?.();
    if (ctx && ctx.ok === false) {
      return ctx;
    }
    const branchId = getOperationalWriteBranchId();
    if (!branchId) {
      return { ok: false, error: 'operational_write_branch_required' };
    }
    return { ok: true, branchId };
  }

  function buildBundlePayloadFromOps(ops) {
    const writeGate = assertOperationalWriteBranch();
    if (!writeGate.ok) {
      throw Object.assign(new Error(writeGate.error || 'operational_write_branch_required'), {
        code: writeGate.error || 'operational_write_branch_required',
      });
    }
    const branchId = state.capturedWriteBranchId || writeGate.branchId;
    const steps = ops.map((op) => {
      if (op.kind === 'table') {
        return { type: 'table', tableKey: op.key, records: op.records || [], branchId };
      }
      return { type: 'kv', key: op.key, value: op.value };
    });
    const entries = [];
    for (const op of ops) {
      if (op.kind === 'table') {
        const entry = buildOutboxEntry(op.key, op.records);
        if (entry) entries.push(entry);
      } else if (KV_MIRROR.includes(op.key) || OPERATIONAL_KEYS.has(op.key)) {
        const entry = buildOutboxEntryForKv(op.key, op.value);
        if (entry) entries.push(entry);
      }
    }
    return { steps, entries };
  }

  async function commitBundle() {
    const ops = state.bundleOps.slice();
    const capturedBranch = state.capturedWriteBranchId;
    state.bundleActive = false;
    state.bundleOps = [];
    if (!ops.length) {
      state.capturedWriteBranchId = null;
      return { ok: true, skipped: true, reason: 'bundle_empty' };
    }

    const db = api();
    if (!db) {
      for (const op of ops) restoreLastCommit(op.key);
      return { ok: false, error: 'database_api_unavailable' };
    }
    if (!state.sqlitePrimary) {
      const en = await ensureSqlitePrimaryEnabled();
      if (!en.ok) {
        for (const op of ops) restoreLastCommit(op.key);
        return { ok: false, error: en.error || 'sqlite_primary_required' };
      }
    }
    if (global.LegacyBranchMigration?.isPushBlocked?.()) {
      for (const op of ops) restoreLastCommit(op.key);
      return { ok: false, error: 'legacy_branch_migration_required' };
    }

    const { steps, entries } = buildBundlePayloadFromOps(ops);
    const keys = ops.map((o) => o.key);
    keys.forEach((k) => state.pendingKeys.add(k));

    try {
      let res;
      if (entries.length && db.syncOp) {
        res = await db.syncOp({ op: 'enqueueAtomicBundle', steps, entries });
      } else if (db.syncOp) {
        res = await db.syncOp({ op: 'persistBundle', steps });
      } else {
        res = { ok: false, error: 'sync_op_unavailable' };
      }
      if (!res?.ok) {
        state.lastError = res?.error || 'bundle_commit_failed';
        for (const k of keys) restoreLastCommit(k);
        return { ok: false, error: state.lastError, res };
      }
      for (const op of ops) {
        if (op.kind === 'table') {
          mergeBranchSliceIntoCommitted(op.key, op.records, capturedBranch || getOperationalWriteBranchId());
        } else {
          applyCommittedToView(op.key, op.value);
        }
      }
      state.lastError = null;
      return { ok: true, count: ops.length, bundle: true, outbox: entries.length };
    } catch (e) {
      state.lastError = String(e?.message || e);
      for (const k of keys) restoreLastCommit(k);
      return { ok: false, error: state.lastError };
    } finally {
      keys.forEach((k) => state.pendingKeys.delete(k));
      state.capturedWriteBranchId = null;
    }
  }

  function isBundleActive() {
    return !!state.bundleActive;
  }

  function rememberCommit(key, value) {
    try {
      state.lastCommitted[key] = typeof structuredClone === 'function'
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
    } catch {
      state.lastCommitted[key] = value;
    }
  }

  function restoreLastCommit(key) {
    if (!Object.prototype.hasOwnProperty.call(state.lastCommitted, key)) return false;
    const prev = state.lastCommitted[key];
    const viewVal = filterForActiveViewIfNeeded(key, prev);
    rawSet(key, viewVal);
    syncMemory(key, viewVal);
    return true;
  }

  /** Migration-only: LS snapshot when SQLite not yet primary. */
  function collectSnapshotFromLocal() {
    const snap = {};
    const read = (k, def) => {
      if (api() && state.ready && Object.prototype.hasOwnProperty.call(state.lastCommitted, k)) {
        return state.lastCommitted[k];
      }
      return readFromLocalStorageOnly(k, def);
    };
    snap.clientsRegistry = read('clientsRegistry', []);
    snap.cases = read('cases', []);
    snap.bookings = read('bookings', []);
    snap.doctors = read('doctors', []);
    snap.attendance = read('attendance', []);
    snap.expenses = read('expenses', []);
    for (const k of KV_MIRROR) {
      snap[k] = read(k, k.endsWith('Counter') ? 0 : (k === 'settings' ? {} : []));
    }
    if (typeof buildFullBackupObject === 'function') {
      try {
        const full = buildFullBackupObject();
        return { ...snap, ...full };
      } catch { /* use snap */ }
    }
    return snap;
  }

  async function migrateAndEnable(options) {
    const db = api();
    if (!db) return { ok: false, error: 'database_api_unavailable' };
    const snapshot = options?.snapshot || collectSnapshotFromLocal();
    if (!options?.skipSafetyTdw && global.PreInstallSafetySnapshot?.ensureSafetySnapshotBeforeMigration) {
      const safety = await global.PreInstallSafetySnapshot.ensureSafetySnapshotBeforeMigration({ snapshot });
      if (safety.blocked) return safety;
    }
    const report = await db.migrateFromBackup(snapshot, {
      sourceLabel: options?.sourceLabel || 'localStorage',
      dryRun: !!options?.dryRun,
      internalMigration: true,
      migrationOnly: true,
    });
    if (!report?.ok) {
      if (typeof global.MigrationSafety?.notifyMigrationFailure === 'function') {
        return global.MigrationSafety.notifyMigrationFailure(report, { toast: !options?.silent });
      }
      if (typeof global.OperationalErrorTruth?.notifyTruthful === 'function') {
        global.OperationalErrorTruth.notifyTruthful(report, { toast: !options?.silent });
      }
      return report;
    }
    if (options?.dryRun) return report;
    try { await db.enableSqlitePrimary?.(); } catch { /* empty */ }
    return hydrateIntoMemory();
  }

  async function ensureSqlitePrimaryEnabled() {
    const db = api();
    if (!db) return { ok: false, error: 'database_api_unavailable' };
    if (state.sqlitePrimary) return { ok: true, already: true };
    try {
      const st = await db.enableSqlitePrimary?.();
      state.status = st || (await db.status?.());
      state.sqlitePrimary = !!(state.status && state.status.sqlitePrimary);
      if (state.sqlitePrimary) installWriteThrough();
      return { ok: !!state.sqlitePrimary, status: state.status };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  async function hydrateIntoMemory() {
    const db = api();
    if (!db) return { ok: false, error: 'database_api_unavailable' };
    const res = await db.hydrate();
    if (!res?.ok) return res;
    const data = res.data || {};
    state.status = res.status;
    state.sqlitePrimary = !!(res.status && res.status.sqlitePrimary);
    if (!state.sqlitePrimary) {
      try {
        await db.enableSqlitePrimary?.();
        const st = await db.status?.();
        state.status = st;
        state.sqlitePrimary = !!(st && st.sqlitePrimary);
      } catch { /* empty */ }
    }

    state.staleLsOverridden = [];
    const apply = (k, v) => {
      noteStaleLocalStorageOverride(k, v);
      rememberCommit(k, v);
      const viewVal = filterForActiveViewIfNeeded(k, v);
      rawSet(k, viewVal);
      syncMemory(k, viewVal);
    };
    apply('clientsRegistry', data.clientsRegistry || []);
    apply('cases', data.cases || []);
    apply('bookings', data.bookings || []);
    apply('doctors', data.doctors || []);
    apply('attendance', data.attendance || []);
    apply('expenses', data.expenses || []);
    for (const k of KV_MIRROR) {
      if (data[k] !== undefined) apply(k, data[k]);
    }

    state.ready = true;
    installWriteThrough();
    installReadThrough();
    try { await global.OperationalDbHealth?.refresh?.({ force: true }); } catch { /* empty */ }
    try { await global.OperationalReadiness?.refresh?.({ force: true }); } catch { /* empty */ }
    return { ok: true, status: state.status, report: res, sqlitePrimary: state.sqlitePrimary };
  }

  /**
   * Re-read SQLite SoT and apply active branch view filter to globals (branch switch).
   */
  async function rehydrateBranchView() {
    const db = api();
    if (!db) return { ok: false, error: 'database_api_unavailable' };
    const res = await db.hydrate();
    if (!res?.ok) return res;
    const data = res.data || {};
    state.status = res.status;
    state.sqlitePrimary = !!(res.status && res.status.sqlitePrimary);

    state.staleLsOverridden = [];
    const apply = (k, v) => {
      noteStaleLocalStorageOverride(k, v);
      rememberCommit(k, v);
      const viewVal = filterForActiveViewIfNeeded(k, v);
      rawSet(k, viewVal);
      syncMemory(k, viewVal);
    };
    apply('clientsRegistry', data.clientsRegistry || []);
    apply('cases', data.cases || []);
    apply('bookings', data.bookings || []);
    apply('doctors', data.doctors || []);
    apply('attendance', data.attendance || []);
    apply('expenses', data.expenses || []);
    for (const k of KV_MIRROR) {
      if (data[k] !== undefined) apply(k, data[k]);
    }

    state.ready = true;
    state.lastError = null;
    return {
      ok: true,
      aggregateView: shouldUseAggregateView(),
      branchId: getOperationalWriteBranchId(),
      status: state.status,
    };
  }

  function buildOutboxEntry(tableKey, records) {
    const centerId =
      global.ConfigLayer?.getCenterId?.() ||
      global.CenterId?.getStoredCenterId?.() ||
      global.LicenseCloud?.loadLocal?.()?.centerId ||
      '';
    const branchId = getOperationalWriteBranchId();
    if (!branchId) return null;
    const deviceId =
      global.DeviceConfig?.getDeviceId?.() ||
      global.DeviceConfig?.load?.()?.deviceUuid ||
      'unknown-device';
    if (!centerId) return null;
    const base = getTableRevision(tableKey, branchId);
    const next = base + 1;
    const payload_json = JSON.stringify(records ?? null);
    const entry = {
      center_id: centerId,
      branch_id: branchId,
      table_name: tableKey,
      operation: 'TABLE_BUMP',
      base_revision: base,
      new_revision: next,
      device_id: deviceId,
      payload_json,
    };
    return entry;
  }

  async function commitOperational(tableKey, records, options) {
    options = options || {};
    if (global.LicenseReadOnlyMode?.isDbKeyBlocked?.(tableKey)) {
      return { ok: false, error: 'license_readonly_mode' };
    }
    const writeGate = assertOperationalWriteBranch();
    if (!writeGate.ok) return { ok: false, error: writeGate.error || 'operational_write_branch_required' };
    const db = api();
    if (!db) return { ok: false, error: 'database_api_unavailable' };
    if (!state.sqlitePrimary) {
      const en = await ensureSqlitePrimaryEnabled();
      if (!en.ok) return { ok: false, error: en.error || 'sqlite_primary_required' };
    }
    if (global.LegacyBranchMigration?.isPushBlocked?.()) {
      return { ok: false, error: 'legacy_branch_migration_required' };
    }
    const healthBlock = global.OperationalDbHealth?.isOperationalAllowed?.();
    if (healthBlock && healthBlock.ok === false) {
      return {
        ok: false,
        error: healthBlock.error || 'database_unhealthy',
        health: healthBlock.health,
        messageAr: healthBlock.messageAr,
      };
    }
    const list = filterRecordsForWriteBranch(Array.isArray(records) ? records : []);
    const branchId = writeGate.branchId;
    const scopeCheck = assertScopeMatch(list, state.capturedWriteBranchId || branchId);
    if (!scopeCheck.ok) {
      return { ok: false, error: scopeCheck.error || 'branch_scope_mismatch', ...scopeCheck };
    }
    state.pendingKeys.add(tableKey);
    try {
      const entry = buildOutboxEntry(tableKey, list);
      let res;
      if (entry && db.syncOp) {
        res = await db.syncOp({
          op: 'enqueueAtomicPersistTable',
          tableKey,
          records: list,
          branchId,
          entry,
        });
      } else {
        res = await db.persistTable(tableKey, list, branchId);
      }
      if (res && res.ok === false) {
        state.lastError = res.error || 'commit_failed';
        restoreLastCommit(tableKey);
        return { ok: false, error: state.lastError, res };
      }
      mergeBranchSliceIntoCommitted(tableKey, list, branchId);
      state.lastError = null;
      try { global.SyncEngine?.schedulePush?.(tableKey, branchId); } catch { /* empty */ }
      return { ok: true, tableKey, count: list.length, authoritative: true };
    } catch (e) {
      state.lastError = String(e?.message || e);
      restoreLastCommit(tableKey);
      return { ok: false, error: state.lastError };
    } finally {
      state.pendingKeys.delete(tableKey);
    }
  }

  async function commitKv(key, value) {
    if (global.LicenseReadOnlyMode?.isDbKeyBlocked?.(key)) {
      return { ok: false, error: 'license_readonly_mode' };
    }
    const writeGate = assertOperationalWriteBranch();
    if (!writeGate.ok) return { ok: false, error: writeGate.error || 'operational_write_branch_required' };
    const db = api();
    if (!db) return { ok: false, error: 'database_api_unavailable' };
    if (!state.sqlitePrimary) {
      const en = await ensureSqlitePrimaryEnabled();
      if (!en.ok) return { ok: false, error: en.error || 'sqlite_primary_required' };
    }
    const healthBlock = global.OperationalDbHealth?.isOperationalAllowed?.();
    if (healthBlock && healthBlock.ok === false) {
      return {
        ok: false,
        error: healthBlock.error || 'database_unhealthy',
        health: healthBlock.health,
        messageAr: healthBlock.messageAr,
      };
    }
    let persistValue = value;
    const branchScopedKv = global.BranchDataIsolation?.BRANCH_SCOPED_ARRAY_KEYS?.has?.(key);
    if (Array.isArray(value) && branchScopedKv) {
      const branchId = state.capturedWriteBranchId || getOperationalWriteBranchId();
      const slice = filterRecordsForWriteBranch(value.map((r) => {
        if (r && typeof r === 'object' && !r.branchId && global.BranchDataIsolation?.stampBranchId) {
          return global.BranchDataIsolation.stampBranchId({ ...r });
        }
        return r;
      }));
      const scopeCheck = assertScopeMatch(slice, branchId);
      if (!scopeCheck.ok) {
        return { ok: false, error: scopeCheck.error || 'branch_scope_mismatch', ...scopeCheck };
      }
      mergeBranchSliceIntoCommitted(key, slice, branchId);
      persistValue = state.lastCommitted[key] || value;
    }
    state.pendingKeys.add(key);
    try {
      const res = await db.persistKv(key, persistValue);
      if (res && res.ok === false) {
        state.lastError = res.error || 'kv_persist_failed';
        restoreLastCommit(key);
        return { ok: false, error: state.lastError };
      }
      applyCommittedToView(key, persistValue);
      state.lastError = null;
      try { global.SyncEngine?.schedulePush?.(key, getOperationalWriteBranchId()); } catch { /* empty */ }
      return { ok: true, key, authoritative: true };
    } catch (e) {
      state.lastError = String(e?.message || e);
      restoreLastCommit(key);
      return { ok: false, error: state.lastError };
    } finally {
      state.pendingKeys.delete(key);
    }
  }

  async function setAuthoritative(key, value) {
    if (UI_ONLY_KEYS.has(key)) {
      rawSet(key, value);
      return { ok: true, uiOnly: true };
    }
    if (state.bundleActive && isBundledOperationalKey(key)) {
      queueBundleOp(key, value);
      return { ok: true, queued: true, bundle: true };
    }
    if (CORE_TABLES.includes(key)) return commitOperational(key, Array.isArray(value) ? value : []);
    if (KV_MIRROR.includes(key) || OPERATIONAL_KEYS.has(key)) return commitKv(key, value);
    rawSet(key, value);
    return { ok: true, local: true };
  }

  function installReadThrough() {
    if (typeof DB === 'undefined') return;
    DB.__sqliteReadThrough = true;
    DB.readOperational = readOperational;
  }

  function installWriteThrough() {
    if (typeof DB === 'undefined') return;
    if (!DB.__rawSet) {
      const candidate = DB.raw?.set ? DB.raw.set.bind(DB.raw) : DB.set.bind(DB);
      DB.__rawSet = candidate;
    }
    if (DB.__sqliteWriteThrough) {
      DB.__sqliteWriteThrough = false;
    }
    const baseRaw = DB.__rawSet;
    DB.set = function sqliteAuthoritativeSet(k, v) {
      if (UI_ONLY_KEYS.has(k)) {
        baseRaw(k, v);
        return true;
      }
      const db = api();
      if (!db || !state.sqlitePrimary) {
        const branchScopedKv = global.BranchDataIsolation?.BRANCH_SCOPED_ARRAY_KEYS?.has?.(k);
        if (Array.isArray(v) && branchScopedKv) {
          const branchId = getOperationalWriteBranchId();
          const slice = filterRecordsForWriteBranch(v.map((r) => {
            if (r && typeof r === 'object' && !r.branchId && global.BranchDataIsolation?.stampBranchId) {
              return global.BranchDataIsolation.stampBranchId({ ...r });
            }
            return r;
          }));
          mergeBranchSliceIntoCommitted(k, slice, branchId);
          baseRaw(k, state.lastCommitted[k] || v);
          syncMemory(k, filterForActiveViewIfNeeded(k, state.lastCommitted[k]));
          return true;
        }
        baseRaw(k, v);
        rememberCommit(k, v);
        return true;
      }
      if (CORE_TABLES.includes(k) || OPERATIONAL_KEYS.has(k) || KV_MIRROR.includes(k)) {
        if (state.bundleActive) {
          queueBundleOp(k, v);
          return false;
        }
        const run = CORE_TABLES.includes(k)
          ? commitOperational(k, Array.isArray(v) ? v : [])
          : commitKv(k, v);
        Promise.resolve(run).then((res) => {
          if (!res?.ok) {
            try {
              if (global.OperationalErrorTruth?.notifyTruthful) {
                global.OperationalErrorTruth.notifyTruthful(res?.error || 'commit_failed');
              } else {
                global.notify?.(
                  '⚠️ فشل الحفظ في SQLite — أُعيدت آخر حالة معتمدة (' + (res?.error || 'commit_failed') + ')',
                  'danger'
                );
              }
            } catch { /* empty */ }
          }
        });
        return false;
      }
      baseRaw(k, v);
      return true;
    };
    DB.__sqliteWriteThrough = true;
    DB.__noOptimisticOperational = true;
    DB.commitOperational = commitOperational;
    DB.setAuthoritative = setAuthoritative;
    DB.restoreLastCommit = restoreLastCommit;
    DB.readOperational = readOperational;
    DB.beginBundle = beginBundle;
    DB.commitBundle = commitBundle;
  }

  async function bootFromSQLiteSoT() {
    const db = api();
    if (!db) {
      return { ok: true, mode: 'browser_localStorage_fallback' };
    }
    let res = await hydrateIntoMemory();
    if (!res?.ok) {
      const mig = await migrateAndEnable({ sourceLabel: 'boot_localStorage_migration' });
      if (mig?.ok) res = mig;
    }
    if (res?.ok) {
      try {
        if (typeof global.reloadClientStoreFromDb === 'function') global.reloadClientStoreFromDb();
        if (typeof global.syncAppGlobals === 'function') global.syncAppGlobals();
      } catch { /* empty */ }
    }
    return res || { ok: false, error: 'boot_hydrate_failed' };
  }

  function invalidateOperationalCaches() {
    state.bootPromise = null;
    state.ready = false;
    state.lastCommitted = {};
    state.pendingKeys.clear();
    state.staleLsOverridden = [];
    state.lastError = null;
  }

  function bootFromSQLiteSoTOnce() {
    if (!state.bootPromise) {
      state.bootPromise = bootFromSQLiteSoT();
    }
    return state.bootPromise;
  }

  async function status() {
    const db = api();
    if (!db) return { ok: false, error: 'database_api_unavailable' };
    state.status = await db.status();
    state.sqlitePrimary = !!(state.status && state.status.sqlitePrimary);
    return state.status;
  }

  function isPrimary() {
    return !!state.sqlitePrimary;
  }

  async function getOperationalReadiness(options) {
    if (typeof global.OperationalReadiness?.ensureFresh === 'function') {
      return global.OperationalReadiness.ensureFresh(options);
    }
    const st = await status();
    return st?.operationalReadiness || {
      ok: !!(st?.operationalHealth?.ok),
      unknown: !st?.operationalReadiness,
      health: st?.operationalHealth,
    };
  }

  function getCommittedRaw(key) {
    if (!Object.prototype.hasOwnProperty.call(state.lastCommitted, key)) return undefined;
    const raw = state.lastCommitted[key];
    try {
      return typeof structuredClone === 'function' ? structuredClone(raw) : JSON.parse(JSON.stringify(raw));
    } catch {
      return raw;
    }
  }

  global.SqliteBridge = {
    migrateAndEnable,
    hydrateIntoMemory,
    rehydrateBranchView,
    invalidateOperationalCaches,
    bootFromSQLiteSoT,
    bootFromSQLiteSoTOnce,
    ensureSqlitePrimaryEnabled,
    commitOperational,
    commitKv,
    setAuthoritative,
    beginBundle,
    commitBundle,
    isBundleActive,
    hasPendingCommits,
    assertScopeMatch,
    restoreLastCommit,
    readOperational,
    shouldBlockLocalStorage,
    hasElectronDatabase,
    isOperationalKey,
    status,
    isPrimary,
    getOperationalReadiness,
    collectSnapshotFromLocal,
    CORE_TABLES,
    KV_MIRROR,
    OPERATIONAL_KEYS,
    getState: () => ({
      ready: state.ready,
      sqlitePrimary: state.sqlitePrimary,
      lastError: state.lastError,
      pending: Array.from(state.pendingKeys),
      bundleActive: state.bundleActive,
      bundleQueued: state.bundleOps.length,
      hasLastCommitted: Object.keys(state.lastCommitted),
      staleLsOverridden: state.staleLsOverridden.slice(),
    }),
    getLastError: () => state.lastError,
    getCommittedRaw,
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      void bootFromSQLiteSoTOnce();
    });
  }
})(typeof window !== 'undefined' ? window : global);
