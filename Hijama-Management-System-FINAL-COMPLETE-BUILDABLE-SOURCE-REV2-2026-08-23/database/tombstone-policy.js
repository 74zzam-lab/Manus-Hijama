'use strict';

/**
 * Tombstone (soft-delete) sync rules — delete vs update conflicts, tombstone retention.
 */

/** Retention policy (documented; no aggressive cleanup in PR10). */
const TOMBSTONE_RETENTION = Object.freeze({
  /** Minimum days before tombstone eligible for cleanup evaluation. */
  MIN_RETENTION_DAYS: 90,
  /** Cleanup only when all known devices passed deletion revision (future PR). */
  REQUIRE_ALL_DEVICES_PASSED: true,
  /** PR10: cleanup disabled — tombstones retained until explicit policy job. */
  CLEANUP_ENABLED: false,
});

function isTombstone(record) {
  return !!(record && record.deletedAt);
}

function tombstoneTime(record) {
  if (!record?.deletedAt) return 0;
  const t = new Date(record.deletedAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

function recordRevision(record) {
  return Number(record?.revision) || 0;
}

function recordUpdatedTime(record) {
  const t = new Date(record?.updatedAt || record?.createdAt || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

const ACTIONS = {
  SKIP: 'skip',
  PUSH: 'push',
  PULL: 'pull',
  CONFLICT: 'conflict',
};

/**
 * Block resurrecting a tombstoned record without explicit revive flag.
 */
function assertNotResurrecting(prev, next, options) {
  options = options || {};
  if (options.revive === true || options.hard === true) return { ok: true };
  if (!isTombstone(prev)) return { ok: true };
  if (isTombstone(next)) return { ok: true };
  return {
    ok: false,
    error: 'tombstone_resurrection_blocked',
    code: 'TOMBSTONE_RESURRECTION_BLOCKED',
    recordId: prev?.id || next?.id || null,
  };
}

/**
 * Tombstone-only merge decision. Returns null when neither side is tombstoned.
 */
function decideTombstone(local, remote, table) {
  const localT = isTombstone(local);
  const remoteT = isTombstone(remote);
  if (!localT && !remoteT) return null;

  if (localT && remoteT) {
    const lt = tombstoneTime(local);
    const rt = tombstoneTime(remote);
    if (lt === rt && JSON.stringify(local) === JSON.stringify(remote)) {
      return { action: ACTIONS.SKIP, reason: 'both_tombstone_identical', table };
    }
    if (lt > rt) {
      return { action: ACTIONS.PUSH, reason: 'tombstone_newer_local', tombstone: local, table };
    }
    if (rt > lt) {
      return { action: ACTIONS.PULL, reason: 'tombstone_newer_remote', tombstone: remote, table };
    }
    const lr = recordRevision(local);
    const rr = recordRevision(remote);
    if (lr >= rr) {
      return { action: ACTIONS.PUSH, reason: 'tombstone_revision_local', tombstone: local, table };
    }
    return { action: ACTIONS.PULL, reason: 'tombstone_revision_remote', tombstone: remote, table };
  }

  if (localT && !remoteT) {
    const localDelRev = recordRevision(local);
    const remoteRev = recordRevision(remote);
    if (remoteRev > localDelRev) {
      return {
        action: ACTIONS.CONFLICT,
        reason: 'delete_vs_update',
        fields: ['deletedAt'],
        local,
        remote,
        table,
      };
    }
    return {
      action: ACTIONS.PUSH,
      reason: 'tombstone_wins_over_stale_remote',
      tombstone: local,
      table,
    };
  }

  // remote tombstone, local live — tombstone wins unless local revision is strictly newer
  const localRev = recordRevision(local);
  const remoteDelRev = recordRevision(remote);
  if (localRev > remoteDelRev) {
    return {
      action: ACTIONS.CONFLICT,
      reason: 'update_vs_delete',
      fields: ['deletedAt'],
      local,
      remote,
      table,
    };
  }
  return {
    action: ACTIONS.PULL,
    reason: 'tombstone_wins_over_stale_live',
    tombstone: remote,
    table,
  };
}

function shouldOpenConflict(local, remote) {
  const decision = decideTombstone(local, remote);
  if (!decision) return false;
  return decision.action === ACTIONS.CONFLICT;
}

function recordsConflict(local, remote) {
  if (shouldOpenConflict(local, remote)) return true;
  if (isTombstone(local) || isTombstone(remote)) return false;
  return JSON.stringify(local) !== JSON.stringify(remote);
}

function applyTombstone(record, prev, ctx) {
  ctx = ctx || {};
  const ts = new Date().toISOString();
  let row = {
    ...(record || {}),
    deletedAt: record?.deletedAt || ts,
    updatedAt: ts,
  };
  if (ctx.operationId || ctx.operation_id) {
    row.operationId = ctx.operationId || ctx.operation_id;
  }
  if (typeof ctx.stampUpdate === 'function') {
    row = ctx.stampUpdate(row, prev || record, ctx);
  } else if (prev && typeof prev === 'object') {
    const prevRev = Number(prev.revision) || Number(row.revision) || 0;
    row.revision = prevRev + 1;
    row.createdAt = row.createdAt || prev.createdAt || ts;
    row.deviceId = row.deviceId || prev.deviceId || ctx.deviceId || 'unknown';
    row.branchId = row.branchId || prev.branchId || ctx.branchId || 'BR-MAIN';
  }
  return row;
}

module.exports = {
  TOMBSTONE_RETENTION,
  ACTIONS,
  isTombstone,
  tombstoneTime,
  recordRevision,
  recordUpdatedTime,
  assertNotResurrecting,
  decideTombstone,
  shouldOpenConflict,
  recordsConflict,
  applyTombstone,
};
