/**
 * Data State Analyzer — compare Local vs Cloud before any sync/bootstrap.
 *
 * Auto-safe rules (approved):
 * - identical → no action
 * - local_only → push
 * - cloud_only → pull
 * - safe merge (no true conflicts) → merge
 * - diverged / conflict / unsafe → STOP (prepare for Phase 2 UI)
 */
(function (global) {
  'use strict';

  const STATES = {
    IDENTICAL: 'identical',
    LOCAL_ONLY: 'local_only',
    CLOUD_ONLY: 'cloud_only',
    SAFE_MERGE: 'safe_merge',
    DIVERGED: 'diverged',
    CONFLICT: 'conflict',
    UNSAFE: 'unsafe',
    OFFLINE: 'offline'
  };

  const OPERATIONAL_TABLES = [
    'cases', 'clientsRegistry', 'bookings', 'expenses', 'attendance', 'doctors',
    'inventoryItems', 'inventorySuppliers', 'inventoryMovements'
  ];

  const CONFIG_TABLES = ['settings', 'services', 'packages', 'users'];

  function getSyncedTables() {
    return global.Repository?.SYNCED_TABLES
      ? [...global.Repository.SYNCED_TABLES]
      : [...OPERATIONAL_TABLES, ...CONFIG_TABLES];
  }

  function getLocalRecords(table, branchId) {
    const repo = global.Repository;
    let rows = repo?.get?.(table) || global.DB?.get?.(table, Array.isArray(repo?._defaultFor?.(table)) ? [] : {});
    if (!Array.isArray(rows)) return [];
    if (branchId && global.BranchScope?.filterByBranch) {
      rows = global.BranchScope.filterByBranch(rows, branchId);
    }
    return rows;
  }

  async function fetchRemoteTable(table, branchId) {
    if (!global.DriveAdapter?.isConnected?.()) return { ok: false, offline: true };
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    const centerId = global.ConfigLayer?.getCenterId?.() || global.CenterId?.getStoredCenterId?.() || '';

    if (OPERATIONAL_TABLES.includes(table)) {
      const paths = global.DriveLayout?.operationalBranchFileCandidates?.(centerId, branchId, table)
        || [global.OperationalLayer?.drivePathForTable?.(centerId, branchId, table)];
      const dl = await global.DriveAdapter.downloadJsonFirst(paths);
      if (!dl?.ok || !dl.data) return dl || { ok: false, error: 'not_found' };
      return { ok: true, records: dl.data.records || dl.data || [] };
    }

    if (CONFIG_TABLES.includes(table)) {
      const fileMap = {
        settings: 'settings.json', services: 'services.json',
        packages: 'packages.json', users: 'users.json'
      };
      const fileName = fileMap[table];
      if (!fileName) return { ok: false, error: 'unknown_config_table' };
      const paths = global.DriveLayout?.configBranchFileCandidates?.(centerId, branchId, fileName) || [];
      const dl = await global.DriveAdapter.downloadJsonFirst(paths);
      if (!dl?.ok) return dl || { ok: false, error: 'not_found' };
      const data = dl.data;
      if (table === 'settings') return { ok: true, records: [data] };
      return { ok: true, records: Array.isArray(data) ? data : (data?.records || []) };
    }

    return { ok: false, error: 'unsupported_table' };
  }

  function analyzeTable(localRecords, remoteRecords, table, branchId) {
    const merge = global.RecordMerger?.mergeRecords?.(localRecords, remoteRecords, {
      table,
      branchId,
      enqueueConflicts: false,
      preserveOtherBranches: true
    }) || { ok: true, merged: localRecords, stats: {}, conflicts: [] };

    const hasLocal = localRecords.length > 0;
    const hasRemote = remoteRecords.length > 0;
    const stats = merge.stats || {};

    if (!hasLocal && !hasRemote) {
      return { table, state: STATES.IDENTICAL, allowedActions: ['noop'], stats, conflicts: [] };
    }
    if (hasLocal && !hasRemote) {
      return { table, state: STATES.LOCAL_ONLY, allowedActions: ['push_local'], stats, conflicts: [] };
    }
    if (!hasLocal && hasRemote) {
      return { table, state: STATES.CLOUD_ONLY, allowedActions: ['pull_cloud'], stats, conflicts: [] };
    }
    if (merge.hasConflict) {
      return {
        table,
        state: STATES.CONFLICT,
        allowedActions: [],
        blocked: true,
        requiresUserDecision: true,
        stats,
        conflicts: merge.conflicts
      };
    }
    if (stats.skip === (localRecords.length) && stats.skip === (remoteRecords.length)) {
      return { table, state: STATES.IDENTICAL, allowedActions: ['noop'], stats, conflicts: [] };
    }
    if (merge.safeAutoMerge) {
      return {
        table,
        state: STATES.SAFE_MERGE,
        allowedActions: ['merge_safe', 'push_local', 'pull_cloud'],
        stats,
        conflicts: [],
        mergePreview: merge.merged
      };
    }
    return {
      table,
      state: STATES.DIVERGED,
      allowedActions: [],
      blocked: true,
      requiresUserDecision: true,
      stats,
      conflicts: merge.conflicts
    };
  }

  async function analyze(options) {
    options = options || {};
    const branchId = options.branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    const tables = options.tables || getSyncedTables();
    const dryRun = options.dryRun !== false;

    if (!global.DriveAdapter?.isConnected?.()) {
      return {
        ok: true,
        state: STATES.OFFLINE,
        offline: true,
        allowedActions: ['noop'],
        blocked: false,
        requiresUserDecision: false,
        tables: {},
        summary: { offline: true }
      };
    }

    const perTable = {};
    let blocked = false;
    let requiresUserDecision = false;
    const allowedSet = new Set(['noop']);

    for (const table of tables) {
      const localRecords = getLocalRecords(table, branchId);
      let remoteRecords = [];
      if (!dryRun || options.fetchRemote !== false) {
        const remote = await fetchRemoteTable(table, branchId);
        if (remote?.offline) {
          return {
            ok: true,
            state: STATES.OFFLINE,
            offline: true,
            allowedActions: ['noop'],
            blocked: false,
            tables: perTable,
            branchId
          };
        }
        if (remote?.ok) remoteRecords = remote.records || [];
        else if (remote?.error === 'not_found') remoteRecords = [];
      }
      const t = analyzeTable(localRecords, remoteRecords, table, branchId);
      perTable[table] = t;
      if (t.blocked) {
        blocked = true;
        requiresUserDecision = true;
      } else {
        (t.allowedActions || []).forEach(a => allowedSet.add(a));
      }
    }

    let overallState = STATES.IDENTICAL;
    const states = Object.values(perTable).map(t => t.state);
    if (states.includes(STATES.CONFLICT)) overallState = STATES.CONFLICT;
    else if (states.includes(STATES.DIVERGED)) overallState = STATES.DIVERGED;
    else if (states.includes(STATES.SAFE_MERGE)) overallState = STATES.SAFE_MERGE;
    else if (states.every(s => s === STATES.IDENTICAL)) overallState = STATES.IDENTICAL;
    else if (states.includes(STATES.LOCAL_ONLY) && !states.includes(STATES.CLOUD_ONLY)) overallState = STATES.LOCAL_ONLY;
    else if (states.includes(STATES.CLOUD_ONLY) && !states.includes(STATES.LOCAL_ONLY)) overallState = STATES.CLOUD_ONLY;
    else if (states.includes(STATES.LOCAL_ONLY) || states.includes(STATES.CLOUD_ONLY)) overallState = STATES.UNSAFE;

    if (overallState === STATES.UNSAFE || overallState === STATES.DIVERGED || overallState === STATES.CONFLICT) {
      blocked = true;
      requiresUserDecision = true;
    }

    const analysis = {
      ok: true,
      state: overallState,
      branchId,
      tables: perTable,
      blocked,
      requiresUserDecision,
      allowedActions: blocked ? [] : [...allowedSet],
      analyzedAt: new Date().toISOString()
    };

    if (blocked) global.SyncGuard?.pause?.(overallState, analysis);
    else global.SyncGuard?.resume?.(analysis);

    global.AuditLogger?.logSyncEvent?.('DATA_ANALYSIS', {
      summary: `تحليل البيانات: ${overallState}`,
      state: overallState,
      blocked,
      branchId
    });

    return analysis;
  }

  async function executeSafeAuto(analysis, options) {
    options = options || {};
    if (!analysis?.ok) return { ok: false, error: 'no_analysis' };
    if (analysis.blocked || analysis.requiresUserDecision) {
      return { ok: false, error: 'blocked', state: analysis.state, analysis };
    }

    const branchId = analysis.branchId || options.branchId;
    const results = [];

    for (const [table, t] of Object.entries(analysis.tables || {})) {
      if (t.state === STATES.IDENTICAL || t.state === STATES.OFFLINE) {
        results.push({ table, action: 'noop', ok: true });
        continue;
      }
      if (t.state === STATES.LOCAL_ONLY) {
        const r = await global.SyncEngine?.pushTable?.(table, branchId);
        global.AuditLogger?.logSyncEvent?.('LOCAL_PUSH', { entity: table, summary: `رفع ${table} إلى السحابة`, ok: !!r?.ok });
        results.push({ table, action: 'push_local', ok: !!r?.ok });
        continue;
      }
      if (t.state === STATES.CLOUD_ONLY) {
        const r = await global.SyncEngine?.pullOperationalTable?.(branchId, table)
          || await global.SyncEngine?.pullConfigFile?.(branchId, table + '.json');
        global.AuditLogger?.logSyncEvent?.('CLOUD_PULL', { entity: table, summary: `تنزيل ${table} من السحابة`, ok: !!r?.ok });
        results.push({ table, action: 'pull_cloud', ok: !!r?.ok });
        continue;
      }
      if (t.state === STATES.SAFE_MERGE && t.mergePreview) {
        const applied = global.RecordMerger?.applyMergeToRepository?.(table, { merged: t.mergePreview }, { source: 'safe_auto', branchId });
        global.AuditLogger?.logSyncEvent?.('SAFE_AUTO_MERGE', { entity: table, summary: `دمج آمن لـ ${table}`, ok: !!applied?.ok });
        results.push({ table, action: 'merge_safe', ok: !!applied?.ok });
        continue;
      }
      results.push({ table, action: 'skipped', ok: false, reason: t.state });
    }

    return { ok: true, results, analysis };
  }

  global.DataStateAnalyzer = {
    STATES,
    OPERATIONAL_TABLES,
    CONFIG_TABLES,
    getSyncedTables,
    analyze,
    analyzeTable,
    executeSafeAuto
  };
})(typeof window !== 'undefined' ? window : globalThis);
