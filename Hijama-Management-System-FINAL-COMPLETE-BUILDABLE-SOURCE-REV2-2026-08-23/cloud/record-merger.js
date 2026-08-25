/**
 * Record Merger — record-level merge for operational/config/inventory tables.
 */
(function (global) {
  'use strict';

  function auditMerge(action, table, details) {
    global.AuditLogger?.logSyncEvent?.(action, {
      entity: table,
      summary: details?.summary || `${action}: ${table}`,
      ...details
    });
  }

  function mergeRecords(localRecords, remoteRecords, options) {
    options = options || {};
    const table = options.table || '';
    const branchId = options.branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    localRecords = (localRecords || []).map(r => global.RecordMetadata?.migrateLegacy?.(r, branchId) || r);
    remoteRecords = (remoteRecords || []).map(r => global.RecordMetadata?.migrateLegacy?.(r, branchId) || r);

    const otherBranches = options.preserveOtherBranches !== false
      ? (localRecords || []).filter(r => r?.branchId && r.branchId !== branchId)
      : [];

    const localBranch = localRecords.filter(r => !r?.branchId || r.branchId === branchId);
    const remoteBranch = remoteRecords;

    const result = global.MergePolicy?.decideTable?.(localBranch, remoteBranch, table)
      || global.TableMergePolicy?.decideTable?.(table, localBranch, remoteBranch)
      || { ok: true, merged: localBranch, conflicts: [], stats: {} };

    if (result.hasConflict && options.enqueueConflicts !== false) {
      global.ConflictQueue?.enqueueMany?.(result.conflicts, table, branchId);
    } else if (!result.hasConflict && result.stats?.merge > 0) {
      auditMerge('DATA_MERGE', table, {
        summary: `دمج ${result.stats.merge} سجل في ${table}`,
        stats: result.stats,
        branchId,
        source: options.source || 'merge'
      });
    }

    const merged = otherBranches.concat(result.merged || []);

    return {
      ok: !result.hasConflict,
      merged,
      stats: result.stats,
      conflicts: result.conflicts,
      hasConflict: result.hasConflict,
      safeAutoMerge: result.safeAutoMerge,
      toPush: result.toPush,
      toPull: result.toPull,
      policy: result.policy
    };
  }

  function applyMergeToRepository(table, mergeResult, options) {
    options = options || {};
    if (!mergeResult?.merged) return { ok: false, error: 'no_merge_result' };
    const repo = global.Repository;
    if (!repo?.setAll) return { ok: false, error: 'no_repository' };
    repo.setAll(table, mergeResult.merged, { skipMetadata: false, source: options.source || 'merge', branchId: options.branchId });
    const action = options.source === 'safe_auto' ? 'SAFE_AUTO_MERGE'
      : options.source === 'manual' ? 'MANUAL_MERGE' : 'DATA_MERGE';
    auditMerge(action, table, {
      summary: `تطبيق دمج على ${table} (${mergeResult.merged.length} سجل)`,
      count: mergeResult.merged.length,
      branchId: options.branchId,
      source: options.source
    });
    return { ok: true, table, count: mergeResult.merged.length };
  }

  global.RecordMerger = {
    mergeRecords,
    applyMergeToRepository
  };
})(typeof window !== 'undefined' ? window : globalThis);
