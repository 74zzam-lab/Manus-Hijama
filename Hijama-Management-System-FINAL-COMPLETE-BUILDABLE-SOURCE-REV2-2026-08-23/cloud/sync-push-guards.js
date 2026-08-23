/**
 * Renderer mirror of database/sync-push-guards.js
 */
(function (global) {
  'use strict';

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
        } catch { /* empty */ }
      }
    }
    if (typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload);
        if (Array.isArray(parsed)) return parsed.length;
        if (parsed && Array.isArray(parsed.records)) return parsed.records.length;
      } catch { /* empty */ }
    }
    return 0;
  }

  function evaluatePushGuard(options) {
    options = options || {};
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

  function evaluatePullApplyGuard(options) {
    options = options || {};
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

  function evaluateCasPushGuard(options) {
    options = options || {};
    const expected = Number(options.expectedRemoteRevision);
    const actual = Number(options.actualRemoteRevision);
    const baseRevision = options.baseRevision != null ? Number(options.baseRevision) : null;

    if (!Number.isFinite(expected) || expected < 0) {
      return {
        ok: false,
        blocked: true,
        code: 'baseline_revision_unknown',
        reason: 'baseline_revision_unknown',
        retry: false,
      };
    }

    if (!Number.isFinite(actual) || actual < 0) {
      return {
        ok: false,
        blocked: true,
        code: 'remote_revision_unconfirmed',
        reason: 'remote_revision_unconfirmed',
        retry: false,
      };
    }

    if (actual !== expected) {
      return {
        ok: false,
        blocked: true,
        code: 'remote_revision_mismatch',
        reason: 'remote_revision_mismatch',
        expectedRemoteRevision: expected,
        actualRemoteRevision: actual,
        retry: true,
      };
    }

    if (baseRevision != null && Number.isFinite(baseRevision) && baseRevision < actual) {
      return {
        ok: false,
        blocked: true,
        code: 'remote_revision_mismatch',
        reason: 'remote_revision_mismatch',
        expectedRemoteRevision: expected,
        actualRemoteRevision: actual,
        baseRevision,
        retry: true,
      };
    }

    return {
      ok: true,
      expectedRemoteRevision: expected,
      actualRemoteRevision: actual,
      baseRevision,
    };
  }

  function evaluateManifestCasGuard(options) {
    options = options || {};
    const expected = Number(options.expectedManifestRevision);
    const actual = Number(options.actualManifestRevision);

    if (!Number.isFinite(expected) || expected < 0) {
      return {
        ok: false,
        blocked: true,
        code: 'manifest_revision_unknown',
        reason: 'manifest_revision_unknown',
        retry: false,
      };
    }

    if (!Number.isFinite(actual) || actual < 0) {
      return {
        ok: false,
        blocked: true,
        code: 'manifest_revision_unconfirmed',
        reason: 'manifest_revision_unconfirmed',
        retry: false,
      };
    }

    if (actual !== expected) {
      return {
        ok: false,
        blocked: true,
        code: 'manifest_revision_mismatch',
        reason: 'manifest_revision_mismatch',
        expectedManifestRevision: expected,
        actualManifestRevision: actual,
        retry: true,
      };
    }

    return { ok: true, expectedManifestRevision: expected, actualManifestRevision: actual };
  }

  global.SyncPushGuards = {
    parseRecordCount,
    evaluatePushGuard,
    evaluatePullApplyGuard,
    evaluateCasPushGuard,
    evaluateManifestCasGuard,
  };
})(typeof window !== 'undefined' ? window : globalThis);
