'use strict';

/**
 * Sync lifecycle + baseline revision contract (Node + shared logic).
 *
 * SQLite = Local Operational Truth
 * Drive Branch State = Shared Synchronization Truth
 */

const LIFECYCLE = Object.freeze({
  UNINITIALIZED: 'UNINITIALIZED',
  HYDRATING: 'HYDRATING',
  BASELINE_KNOWN: 'BASELINE_KNOWN',
  READY: 'READY',
  RECONCILIATION_REQUIRED: 'RECONCILIATION_REQUIRED',
});

function defaultState() {
  return {
    lifecycle: LIFECYCLE.UNINITIALIZED,
    baselineKnown: false,
    baselineRevisionByBranch: {},
    integrityPass: false,
    organizationResolved: false,
    branchResolved: false,
    hydrateComplete: false,
    updatedAt: null,
    operationId: null,
  };
}

function createSyncBaseline(store) {
  if (!store || typeof store.load !== 'function' || typeof store.save !== 'function') {
    throw new Error('sync_baseline_store_required');
  }

  function load() {
    const raw = store.load();
    return { ...defaultState(), ...(raw && typeof raw === 'object' ? raw : {}) };
  }

  function save(partial) {
    const next = { ...load(), ...(partial || {}), updatedAt: new Date().toISOString() };
    store.save(next);
    return next;
  }

  function getLifecycle() {
    return load().lifecycle || LIFECYCLE.UNINITIALIZED;
  }

  function markUninitialized() {
    return save({ ...defaultState(), lifecycle: LIFECYCLE.UNINITIALIZED });
  }

  function markHydrating(meta = {}) {
    return save({
      lifecycle: LIFECYCLE.HYDRATING,
      hydrateComplete: false,
      baselineKnown: false,
      ...meta,
    });
  }

  function markBaselineKnown(options = {}) {
    const branchId = String(options.branchId || '').trim();
    const remoteRevision = Number(options.remoteRevision);
    if (!branchId) {
      return { ok: false, code: 'branch_required' };
    }
    if (!Number.isFinite(remoteRevision) || remoteRevision < 0) {
      return { ok: false, code: 'baseline_revision_unknown' };
    }
    if (options.integrityPass !== true) {
      return { ok: false, code: 'integrity_check_required' };
    }

    const state = load();
    const baselineRevisionByBranch = { ...(state.baselineRevisionByBranch || {}) };
    baselineRevisionByBranch[branchId] = remoteRevision;

    save({
      lifecycle: LIFECYCLE.BASELINE_KNOWN,
      baselineKnown: true,
      baselineRevisionByBranch,
      integrityPass: true,
      organizationResolved: options.organizationResolved !== false,
      branchResolved: options.branchResolved !== false,
      hydrateComplete: true,
      lastBaselineAt: new Date().toISOString(),
      operationId: options.operationId || state.operationId || null,
    });
    return { ok: true, branchId, remoteRevision };
  }

  function markReady(options = {}) {
    const state = load();
    if (!state.baselineKnown) {
      return { ok: false, code: 'baseline_required' };
    }
    save({
      lifecycle: LIFECYCLE.READY,
      readyAt: new Date().toISOString(),
      operationId: options.operationId || state.operationId || null,
    });
    return { ok: true };
  }

  function enterReconciliationRequired(options = {}) {
    return save({
      lifecycle: LIFECYCLE.RECONCILIATION_REQUIRED,
      reconcileRequiredAt: new Date().toISOString(),
      pushBlockedUntilReconcile: true,
      operationId: options.operationId || null,
    });
  }

  function completeReconciliation(options = {}) {
    const branchId = String(options.branchId || '').trim();
    const remoteRevision = Number(options.remoteRevision);
    const patch = {
      lifecycle: LIFECYCLE.READY,
      pushBlockedUntilReconcile: false,
      reconciledAt: new Date().toISOString(),
      operationId: options.operationId || null,
    };
    if (branchId && Number.isFinite(remoteRevision) && remoteRevision >= 0) {
      const state = load();
      patch.baselineRevisionByBranch = {
        ...(state.baselineRevisionByBranch || {}),
        [branchId]: remoteRevision,
      };
      patch.baselineKnown = true;
    }
    save(patch);
    return { ok: true };
  }

  function getBaselineRevision(branchId) {
    const state = load();
    const bid = String(branchId || '').trim();
    if (!bid) return null;
    const value = state.baselineRevisionByBranch?.[bid];
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function isPushAllowed(options = {}) {
    options = options || {};
    if (options.force === true) return { ok: true, forced: true };

    const state = load();
    const lifecycle = state.lifecycle || LIFECYCLE.UNINITIALIZED;

    if (lifecycle === LIFECYCLE.UNINITIALIZED || lifecycle === LIFECYCLE.HYDRATING) {
      return {
        ok: false,
        blocked: true,
        code: 'sync_lifecycle_push_blocked',
        reason: 'sync_lifecycle_push_blocked',
        lifecycle,
      };
    }

    if (lifecycle === LIFECYCLE.RECONCILIATION_REQUIRED || state.pushBlockedUntilReconcile === true) {
      return {
        ok: false,
        blocked: true,
        code: 'reconciliation_required',
        reason: 'reconciliation_required',
        lifecycle,
      };
    }

    if (!state.baselineKnown) {
      return {
        ok: false,
        blocked: true,
        code: 'baseline_unknown',
        reason: 'baseline_unknown',
        lifecycle,
      };
    }

    if (state.integrityPass !== true) {
      return {
        ok: false,
        blocked: true,
        code: 'integrity_check_failed',
        reason: 'integrity_check_failed',
        lifecycle,
      };
    }

    const branchId = String(options.branchId || '').trim();
    if (branchId) {
      const baseline = getBaselineRevision(branchId);
      if (baseline == null) {
        return {
          ok: false,
          blocked: true,
          code: 'baseline_revision_unknown',
          reason: 'baseline_revision_unknown',
          branchId,
          lifecycle,
        };
      }
    }

    return { ok: true, lifecycle, baselineRevisionByBranch: { ...(state.baselineRevisionByBranch || {}) } };
  }

  function assertPushAllowed(options = {}) {
    return isPushAllowed(options);
  }

  function updateBaselineAfterVerifiedPush(branchId, remoteRevision, operationId) {
    const bid = String(branchId || '').trim();
    const rev = Number(remoteRevision);
    if (!bid || !Number.isFinite(rev) || rev < 0) {
      return { ok: false, code: 'baseline_update_invalid' };
    }
    const state = load();
    const baselineRevisionByBranch = { ...(state.baselineRevisionByBranch || {}) };
    baselineRevisionByBranch[bid] = rev;
    save({
      baselineRevisionByBranch,
      baselineKnown: true,
      lastVerifiedPushAt: new Date().toISOString(),
      operationId: operationId || state.operationId || null,
    });
    return { ok: true, branchId: bid, remoteRevision: rev };
  }

  return {
    LIFECYCLE,
    load,
    save,
    getLifecycle,
    markUninitialized,
    markHydrating,
    markBaselineKnown,
    markReady,
    enterReconciliationRequired,
    completeReconciliation,
    getBaselineRevision,
    isPushAllowed,
    assertPushAllowed,
    updateBaselineAfterVerifiedPush,
  };
}

module.exports = {
  LIFECYCLE,
  defaultState,
  createSyncBaseline,
};
