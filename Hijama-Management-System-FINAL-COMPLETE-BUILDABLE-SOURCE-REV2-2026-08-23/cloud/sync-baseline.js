/**
 * Renderer mirror of database/sync-baseline.js
 */
(function (global) {
  'use strict';

  const LIFECYCLE = Object.freeze({
    UNINITIALIZED: 'UNINITIALIZED',
    HYDRATING: 'HYDRATING',
    BASELINE_KNOWN: 'BASELINE_KNOWN',
    READY: 'READY',
    RECONCILIATION_REQUIRED: 'RECONCILIATION_REQUIRED',
  });

  const STATE_KEY = '__tdw_sync_lifecycle__';
  let memoryOverlay = null;

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

  function load() {
    if (memoryOverlay && typeof memoryOverlay === 'object') {
      return { ...defaultState(), ...memoryOverlay };
    }
    try {
      const raw = global.DB?.get?.(STATE_KEY, null);
      return { ...defaultState(), ...(raw && typeof raw === 'object' ? raw : {}) };
    } catch {
      return defaultState();
    }
  }

  async function persistState(next) {
    if (typeof global.DB?.setAuthoritative === 'function') {
      return global.DB.setAuthoritative(STATE_KEY, next);
    }
    if (typeof global.SqliteBridge?.setAuthoritative === 'function') {
      return global.SqliteBridge.setAuthoritative(STATE_KEY, next);
    }
    return Promise.resolve(global.DB?.set?.(STATE_KEY, next));
  }

  async function save(partial, options) {
    options = options || {};
    const next = { ...load(), ...(partial || {}), updatedAt: new Date().toISOString() };
    if (options.persistBestEffort === true) {
      memoryOverlay = next;
      void Promise.resolve(persistState(next)).catch(() => {});
      return { ok: true, state: next, deferred: true };
    }
    try {
      const committed = await persistState(next);
      if (committed === false || committed?.ok === false) {
        return {
          ok: false,
          error: committed?.error || 'sync_lifecycle_commit_failed',
          state: next,
        };
      }
      memoryOverlay = next;
      return { ok: true, state: next, authoritative: committed?.authoritative === true };
    } catch (error) {
      return { ok: false, error: error?.code || 'sync_lifecycle_commit_failed', state: next };
    }
  }

  function getLifecycle() {
    return load().lifecycle || LIFECYCLE.UNINITIALIZED;
  }

  async function markUninitialized() {
    return save({ ...defaultState(), lifecycle: LIFECYCLE.UNINITIALIZED });
  }

  async function markHydrating(meta) {
    meta = meta || {};
    return save({
      lifecycle: LIFECYCLE.HYDRATING,
      hydrateComplete: false,
      baselineKnown: false,
      organizationResolved: meta.organizationResolved === true,
      branchResolved: meta.branchResolved === true,
    });
  }

  async function markBaselineKnown(options) {
    options = options || {};
    const branchId = String(options.branchId || '').trim();
    const remoteRevision = Number(options.remoteRevision);
    if (!branchId) return { ok: false, code: 'branch_required' };
    if (!Number.isFinite(remoteRevision) || remoteRevision < 0) {
      return { ok: false, code: 'baseline_revision_unknown' };
    }
    if (options.integrityPass !== true) {
      return { ok: false, code: 'integrity_check_required' };
    }

    const state = load();
    const baselineRevisionByBranch = { ...(state.baselineRevisionByBranch || {}) };
    baselineRevisionByBranch[branchId] = remoteRevision;

    const committed = await save({
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
    return committed.ok ? { ok: true, branchId, remoteRevision } : committed;
  }

  async function markReady(options) {
    options = options || {};
    const state = load();
    if (!state.baselineKnown) return { ok: false, code: 'baseline_required' };
    const committed = await save({
      lifecycle: LIFECYCLE.READY,
      readyAt: new Date().toISOString(),
      operationId: options.operationId || state.operationId || null,
    });
    return committed.ok ? { ok: true } : committed;
  }

  async function enterReconciliationRequired(options) {
    options = options || {};
    return save({
      lifecycle: LIFECYCLE.RECONCILIATION_REQUIRED,
      reconcileRequiredAt: new Date().toISOString(),
      pushBlockedUntilReconcile: true,
      operationId: options.operationId || null,
    });
  }

  async function completeReconciliation(options) {
    options = options || {};
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
    const committed = await save(patch);
    return committed.ok ? { ok: true } : committed;
  }

  function getBaselineRevision(branchId) {
    const state = load();
    const bid = String(branchId || '').trim();
    if (!bid) return null;
    const value = state.baselineRevisionByBranch?.[bid];
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function isPushAllowed(options) {
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

  function assertPushAllowed(options) {
    return isPushAllowed(options);
  }

  async function updateBaselineAfterVerifiedPush(branchId, remoteRevision, operationId) {
    const bid = String(branchId || '').trim();
    const rev = Number(remoteRevision);
    if (!bid || !Number.isFinite(rev) || rev < 0) {
      return { ok: false, code: 'baseline_update_invalid' };
    }
    const state = load();
    const baselineRevisionByBranch = { ...(state.baselineRevisionByBranch || {}) };
    baselineRevisionByBranch[bid] = rev;
    const committed = await save({
      baselineRevisionByBranch,
      baselineKnown: true,
      lastVerifiedPushAt: new Date().toISOString(),
      operationId: operationId || state.operationId || null,
    });
    return committed.ok ? { ok: true, branchId: bid, remoteRevision: rev } : committed;
  }

  /**
   * BootFlow / post-restore: mark baseline from local + optional remote revision.
   * Idempotent — safe after hydrate, local DB, or empty start.
   */
  async function establishFromLocalState(options) {
    options = options || {};
    const branchId = String(
      options.branchId
      || global.DeviceConfig?.getLockedBranchId?.()
      || global.BranchScope?.getActiveBranchId?.()
      || 'BR-MAIN'
    ).trim();
    const centerId = String(
      options.centerId
      || global.CenterId?.getStoredCenterId?.()
      || global.LicenseCloud?.loadLocal?.()?.centerId
      || ''
    ).trim();
    if (!branchId) return { ok: false, code: 'branch_required' };

    const localVersions = global.VersionsIndex?.loadLocal?.(centerId) || {};
    let remoteRevision = Number(
      localVersions?.branches?.[branchId]?.databaseVersion
      || localVersions?.databaseVersion
      || 0
    );
    if (options.remoteRevision != null && Number.isFinite(Number(options.remoteRevision))) {
      remoteRevision = Number(options.remoteRevision);
    } else if (!options.localOnly && global.SyncEngine?.getRemoteBranchDatabaseRevision) {
      try {
        const remote = await global.SyncEngine.getRemoteBranchDatabaseRevision(branchId);
        if (remote?.ok && Number.isFinite(Number(remote.remoteRevision))) {
          remoteRevision = Number(remote.remoteRevision);
        }
      } catch { /* keep local revision */ }
    }

    const integrityPass = global.OperationalDbHealth?.isOperationalAllowed?.()?.ok !== false;
    if (options.requireIntegrity === true && !integrityPass) {
      return { ok: false, code: 'integrity_check_required' };
    }

    const persistBestEffort = options.persistBestEffort === true || options.localOnly === true;
    const state = load();
    if (state.lifecycle === LIFECYCLE.READY && state.baselineKnown === true) {
      return { ok: true, skipped: true, branchId, remoteRevision };
    }

    if (persistBestEffort) {
      const committed = await save({
        lifecycle: LIFECYCLE.READY,
        baselineKnown: true,
        baselineRevisionByBranch: {
          ...(state.baselineRevisionByBranch || {}),
          [branchId]: Math.max(0, remoteRevision),
        },
        integrityPass: true,
        organizationResolved: !!centerId,
        branchResolved: !!branchId,
        hydrateComplete: true,
        pushBlockedUntilReconcile: false,
        lastBaselineAt: new Date().toISOString(),
        readyAt: new Date().toISOString(),
        operationId: options.operationId || state.operationId || null,
      }, { persistBestEffort: true });
      return committed.ok !== false
        ? { ok: true, branchId, remoteRevision, localOnly: true, deferred: committed.deferred === true }
        : committed;
    }

    if (state.baselineKnown !== true || state.lifecycle === LIFECYCLE.UNINITIALIZED) {
      const hydrating = await markHydrating({
        organizationResolved: !!centerId,
        branchResolved: !!branchId,
      });
      if (hydrating?.ok === false) return hydrating;
    }

    const baseline = await markBaselineKnown({
      branchId,
      remoteRevision: Math.max(0, remoteRevision),
      integrityPass: true,
      organizationResolved: !!centerId,
      branchResolved: !!branchId,
      operationId: options.operationId || null,
    });
    if (baseline?.ok === false) return baseline;
    return markReady({ operationId: options.operationId || null });
  }

  global.SyncBaseline = {
    STATE_KEY,
    LIFECYCLE,
    defaultState,
    load,
    save,
    getLifecycle,
    markUninitialized,
    markHydrating,
    markBaselineKnown,
    markReady,
    enterReconciliationRequired,
    completeReconciliation,
    establishFromLocalState,
    getBaselineRevision,
    isPushAllowed,
    assertPushAllowed,
    updateBaselineAfterVerifiedPush,
  };
})(typeof window !== 'undefined' ? window : globalThis);
