'use strict';

/**
 * Sync push/pull guards — empty push, localRev=0, stale overwrite, CAS.
 * Used by peer-sync-engine (Node) and mirrored in cloud/sync-push-guards.js (renderer).
 */

const casGuards = require('./sync-cas-guards');

function parseRecordCount(payload) {
  if (payload == null) return 0;
  if (Array.isArray(payload)) return payload.length;
  if (typeof payload === 'object') {
    if (Array.isArray(payload.records)) return payload.records.length;
    if (payload.payload_json != null) {
      try {
        const parsed = typeof payload.payload_json === 'string'
          ? JSON.parse(payload.payload_json)
          : payload.payload_json;
        if (Array.isArray(parsed)) return parsed.length;
        if (parsed && Array.isArray(parsed.records)) return parsed.records.length;
      } catch { /* ignore */ }
    }
  }
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed)) return parsed.length;
      if (parsed && Array.isArray(parsed.records)) return parsed.records.length;
    } catch { /* ignore */ }
  }
  return 0;
}

/**
 * Block cloud-destructive pushes (empty snapshot over existing remote data).
 */
function evaluatePushGuard(options = {}) {
  const localRev = Number(options.localRevision || 0);
  const remoteRev = Number(options.remoteRevision || 0);
  const recordCount = options.recordCount != null
    ? Number(options.recordCount)
    : parseRecordCount(options.payload);
  const remoteHasData = options.remoteHasData === true
    || remoteRev > 0
    || Number(options.remoteRecordCount || 0) > 0;

  if (recordCount === 0 && remoteHasData) {
    return {
      ok: false,
      blocked: true,
      code: 'empty_push_blocked',
      reason: 'empty_push_blocked',
      localRevision: localRev,
      remoteRevision: remoteRev,
    };
  }

  if (localRev === 0 && remoteRev > 0 && recordCount === 0) {
    return {
      ok: false,
      blocked: true,
      code: 'local_rev_zero_pull_required',
      reason: 'local_rev_zero_pull_required',
      localRevision: localRev,
      remoteRevision: remoteRev,
    };
  }

  if (options.strictLocalRevZero === true && localRev === 0 && remoteRev > 0) {
    return {
      ok: false,
      blocked: true,
      code: 'local_rev_zero_pull_required',
      reason: 'local_rev_zero_pull_required',
      localRevision: localRev,
      remoteRevision: remoteRev,
    };
  }

  return { ok: true, localRevision: localRev, remoteRevision: remoteRev, recordCount };
}

/**
 * Skip applying remote snapshots that are older than authoritative local revision
 * or would overwrite pending local outbox work.
 */
function evaluatePullApplyGuard(options = {}) {
  const localRev = Number(options.localRevision || 0);
  const remoteRev = Number(options.remoteRevision || 0);
  const pendingOutbox = Number(options.pendingOutbox || 0);

  if (pendingOutbox > 0 && remoteRev > 0 && remoteRev < localRev) {
    return {
      ok: false,
      blocked: true,
      code: 'stale_overwrite_blocked',
      reason: 'stale_overwrite_blocked',
      localRevision: localRev,
      remoteRevision: remoteRev,
      pendingOutbox,
    };
  }

  if (remoteRev > 0 && localRev > remoteRev) {
    return {
      ok: false,
      blocked: true,
      code: 'stale_remote_skipped',
      reason: 'stale_remote_skipped',
      localRevision: localRev,
      remoteRevision: remoteRev,
    };
  }

  return { ok: true, localRevision: localRev, remoteRevision: remoteRev };
}

module.exports = {
  parseRecordCount,
  evaluatePushGuard,
  evaluatePullApplyGuard,
  evaluateCasPushGuard: casGuards.evaluateCasPushGuard,
  evaluateManifestCasGuard: casGuards.evaluateManifestCasGuard,
};
