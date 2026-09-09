/**
 * Merge Policy — unified record-level merge rules.
 */
(function (global) {
  'use strict';

  const ACTIONS = {
    SKIP: 'skip',
    PUSH: 'push',
    PULL: 'pull',
    MERGE: 'merge',
    CONFLICT: 'conflict'
  };

  function compareRevision(local, remote) {
    const lr = Number(local?.revision) || 0;
    const rr = Number(remote?.revision) || 0;
    if (lr > rr) return 1;
    if (rr > lr) return -1;
    const lt = local?.updatedAt ? new Date(local.updatedAt).getTime() : 0;
    const rt = remote?.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
    if (lt > rt) return 1;
    if (rt > lt) return -1;
    return 0;
  }

  function isIdentical(local, remote) {
    if (!local || !remote) return false;
    if (global.RecordMetadata?.contentHash) {
      return global.RecordMetadata.contentHash(local) === global.RecordMetadata.contentHash(remote);
    }
    return compareRevision(local, remote) === 0;
  }

  function overlappingFieldConflicts(local, remote) {
    const conflicts = [];
    const keys = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})]);
    const ignore = new Set(['revision', 'updatedAt', 'updatedBy', 'deviceId', 'createdAt', 'createdBy']);
    keys.forEach(k => {
      if (ignore.has(k)) return;
      const lv = local?.[k];
      const rv = remote?.[k];
      if (lv === undefined || rv === undefined) return;
      if (JSON.stringify(lv) !== JSON.stringify(rv)) conflicts.push(k);
    });
    return conflicts;
  }

  function applyTombstoneDecision(tombDecision) {
    if (!tombDecision) return null;
    switch (tombDecision.action) {
      case 'skip':
        return { action: ACTIONS.SKIP, reason: tombDecision.reason };
      case 'push':
        return { action: ACTIONS.PUSH, reason: tombDecision.reason };
      case 'pull':
        return { action: ACTIONS.PULL, reason: tombDecision.reason };
      case 'conflict':
        return {
          action: ACTIONS.CONFLICT,
          reason: tombDecision.reason,
          fields: tombDecision.fields,
          local: tombDecision.local,
          remote: tombDecision.remote,
        };
      default:
        return null;
    }
  }

  function decideRecord(local, remote, table) {
    if (table && global.TableMergePolicy?.decideForTable) {
      return global.TableMergePolicy.decideForTable(table, local, remote);
    }
    const tombDecision = global.TombstonePolicy?.decideTombstone?.(local, remote, table);
    const tombResolved = applyTombstoneDecision(tombDecision);
    if (tombResolved) return tombResolved;
    if (!local && !remote) return { action: ACTIONS.SKIP };
    if (local && !remote) return { action: ACTIONS.PUSH, reason: 'local_only' };
    if (!local && remote) return { action: ACTIONS.PULL, reason: 'cloud_only' };
    if (isIdentical(local, remote)) return { action: ACTIONS.SKIP, reason: 'identical' };

    const cmp = compareRevision(local, remote);
    const fields = overlappingFieldConflicts(local, remote);

    if (!fields.length) {
      return {
        action: ACTIONS.MERGE,
        reason: 'complementary_fields',
        merged: { ...remote, ...local, revision: Math.max(Number(local.revision) || 0, Number(remote.revision) || 0) + 1 }
      };
    }

    if (cmp > 0) return { action: ACTIONS.PUSH, reason: 'local_newer', fields };
    if (cmp < 0) return { action: ACTIONS.PULL, reason: 'cloud_newer', fields };

    return { action: ACTIONS.CONFLICT, reason: 'diverged', fields, local, remote };
  }

  function decideTable(localRecords, remoteRecords, table) {
    if (table && global.TableMergePolicy?.decideTable) {
      return global.TableMergePolicy.decideTable(table, localRecords, remoteRecords);
    }
    localRecords = Array.isArray(localRecords) ? localRecords : [];
    remoteRecords = Array.isArray(remoteRecords) ? remoteRecords : [];
    const byIdLocal = new Map(localRecords.filter(r => r?.id).map(r => [r.id, r]));
    const byIdRemote = new Map(remoteRecords.filter(r => r?.id).map(r => [r.id, r]));
    const ids = new Set([...byIdLocal.keys(), ...byIdRemote.keys()]);

    const stats = { skip: 0, push: 0, pull: 0, merge: 0, conflict: 0 };
    const merged = [];
    const conflicts = [];
    const toPush = [];
    const toPull = [];

    ids.forEach(id => {
      const decision = decideRecord(byIdLocal.get(id), byIdRemote.get(id), table);
      switch (decision.action) {
        case ACTIONS.SKIP:
          stats.skip++;
          if (byIdLocal.get(id)) merged.push(byIdLocal.get(id));
          else merged.push(byIdRemote.get(id));
          break;
        case ACTIONS.PUSH:
          stats.push++;
          toPush.push(byIdLocal.get(id));
          merged.push(byIdLocal.get(id));
          break;
        case ACTIONS.PULL:
          stats.pull++;
          toPull.push(byIdRemote.get(id));
          merged.push(byIdRemote.get(id));
          break;
        case ACTIONS.MERGE:
          stats.merge++;
          merged.push(decision.merged);
          break;
        case ACTIONS.CONFLICT:
          stats.conflict++;
          conflicts.push({ id, ...decision });
          merged.push(byIdLocal.get(id));
          break;
        default:
          break;
      }
    });

    return {
      ok: conflicts.length === 0,
      stats,
      merged,
      conflicts,
      toPush,
      toPull,
      hasConflict: conflicts.length > 0,
      safeAutoMerge: conflicts.length === 0
    };
  }

  global.MergePolicy = {
    ACTIONS,
    compareRevision,
    isIdentical,
    decideRecord,
    decideTable,
    overlappingFieldConflicts
  };
})(typeof window !== 'undefined' ? window : globalThis);
