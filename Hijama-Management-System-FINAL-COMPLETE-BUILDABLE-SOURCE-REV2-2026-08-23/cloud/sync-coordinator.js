/**
 * Unified sync coordinator — single mutex for all sync pathways.
 */
(function (global) {
  'use strict';

  const DEFAULT_DEBOUNCE_MS = 2000;
  const DEFAULT_MAX_ATTEMPTS = 4;
  const BACKOFF_MS = [50, 150, 400, 900];

  let locked = false;
  let currentOperationId = null;
  let waiters = [];
  let debounceTimer = null;
  let lastCycleResult = null;
  let lastCycleCompletedAt = null;
  let lastCycleError = null;

  function newOperationId(prefix) {
    prefix = prefix || 'sync';
    const rand = Math.random().toString(16).slice(2, 10);
    return `${prefix}-${Date.now().toString(36)}-${rand}`;
  }

  function isLocked() {
    return locked;
  }

  function getCurrentOperationId() {
    return currentOperationId;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function acquire(operationId) {
    if (!locked) {
      locked = true;
      currentOperationId = operationId || newOperationId();
      return { ok: true, operationId: currentOperationId, coalesced: false };
    }
    return new Promise((resolve) => {
      waiters.push({ resolve, operationId: operationId || null });
    });
  }

  function release() {
    locked = false;
    currentOperationId = null;
    const next = waiters.shift();
    if (next) {
      locked = true;
      currentOperationId = next.operationId || newOperationId();
      next.resolve({ ok: true, operationId: currentOperationId, coalesced: true });
    }
  }

  async function withMutex(fn, options) {
    options = options || {};
    const op = options.operationId || newOperationId(options.prefix || 'sync');
    await acquire(op);
    try {
      return await fn({ operationId: currentOperationId || op });
    } finally {
      release();
    }
  }

  async function runWithBoundedRetry(taskFn, options) {
    options = options || {};
    const attemptsLimit = Number(options.maxAttempts || DEFAULT_MAX_ATTEMPTS);
    let last = { ok: false, code: 'push_retry_exhausted' };
    for (let attempt = 0; attempt < attemptsLimit; attempt += 1) {
      const result = await taskFn({ attempt, operationId: options.operationId, maxAttempts: attemptsLimit });
      last = result || last;
      if (result?.ok) return result;
      if (result?.retry !== true) return result;
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] || 200;
      await sleep(delay);
    }
    return { ...last, ok: false, code: last.code || 'push_retry_exhausted', retryExhausted: true };
  }

  async function runCycle(options) {
    options = options || {};
    return withMutex(async ({ operationId }) => {
      const cycleOptions = { ...options, operationId, _coordinator: true };
      let pull = { ok: true, skipped: true };
      let push = { ok: true, skipped: true };

      if (options.afterRestore === true || options.direction === 'pull') {
        try {
          pull = await global.SyncEngine._pollInternal(cycleOptions);
        } catch (err) {
          pull = { ok: false, error: err.message || String(err) };
        }
      } else {
        try {
          pull = await global.SyncEngine._pollInternal(cycleOptions);
        } catch (err) {
          pull = { ok: false, error: err.message || String(err) };
        }
        if (options.direction !== 'pull' && options.afterRestore !== true) {
          try {
            push = await global.SyncEngine._flushPendingInternal({ ...cycleOptions, _coordinator: true });
          } catch (err) {
            push = { ok: false, error: err.message || String(err) };
          }
        }
      }

      async function recoverAfterRestoreBaseline(pullErr, note) {
        const established = await global.SyncBaseline?.establishFromLocalState?.({
          operationId,
          source: note || 'after_restore_pull_soft_fail',
        });
        if (established?.ok === false) {
          const reconciled = await global.SyncBaseline?.completeReconciliation?.({
            branchId: global.SyncEngine?.getBranchId?.(options.branchId) || undefined,
            remoteRevision: 0,
            operationId,
          });
          if (reconciled?.ok !== false) {
            return {
              ok: true,
              recovered: true,
              softFail: pullErr || null,
              baseline: reconciled,
              reconciliationFallback: true,
            };
          }
          return null;
        }
        return {
          ok: true,
          recovered: true,
          softFail: pullErr || null,
          baseline: established,
        };
      }

      if (options.afterRestore === true && pull?.ok === false) {
        const recoverable = new Set([
          'remote_pull_failed',
          'branch_pull_incomplete',
          'no_remote_versions',
          'not_found',
          'offline',
          'branch_context_required',
          'google_not_connected',
          'google_identity_transfer',
          'google_email_mismatch',
          'sync_lifecycle_commit_failed',
          'baseline_commit_failed',
          'sync_lifecycle_push_blocked',
          'reconciliation_required',
          'baseline_unknown',
          'cycle_failed',
        ]);
        const pullErr = String(pull?.error || pull?.failed?.result?.error || pull?.reason || '').trim();
        if (recoverable.has(pullErr) || pull?.offline === true || pull?.blocked === true) {
          const recovered = await recoverAfterRestoreBaseline(pullErr, 'after_restore_pull_soft_fail');
          if (recovered) pull = { ...pull, ...recovered };
        }
      }

      if (options.afterRestore === true && pull?.ok !== false) {
        const branchId = global.SyncEngine?.getBranchId?.(options.branchId) || null;
        let remoteRevision = 0;
        const remote = await global.SyncEngine.getRemoteBranchDatabaseRevision?.(branchId);
        if (remote?.ok && Number.isFinite(Number(remote.remoteRevision))) {
          remoteRevision = Number(remote.remoteRevision);
        } else {
          const centerId = global.SyncEngine?.getCenterId?.() || '';
          const local = global.VersionsIndex?.loadLocal?.(centerId) || {};
          remoteRevision = Number(
            local?.branches?.[branchId]?.databaseVersion
            || local?.databaseVersion
            || 0
          );
        }
        if (branchId) {
          const completed = await global.SyncBaseline?.completeReconciliation?.({
            branchId,
            remoteRevision,
            operationId,
          });
          if (completed?.ok === false) {
            const recovered = await recoverAfterRestoreBaseline(
              completed.error || 'sync_lifecycle_commit_failed',
              'after_restore_reconcile_fallback'
            );
            if (recovered) {
              pull = { ...pull, ...recovered, reconcileFallback: true };
            } else {
              pull = { ...pull, ok: false, error: completed.error || 'sync_lifecycle_commit_failed' };
            }
          }
        } else if (global.SyncBaseline?.establishFromLocalState) {
          const established = await global.SyncBaseline.establishFromLocalState({ operationId });
          if (established?.ok === false) {
            const recovered = await recoverAfterRestoreBaseline(
              established.error || established.code || 'baseline_commit_failed',
              'after_restore_baseline_fallback'
            );
            if (recovered) {
              pull = { ...pull, ...recovered, baselineFallback: true };
            } else {
              pull = { ...pull, ok: false, error: established.error || established.code || 'baseline_commit_failed' };
            }
          }
        }
      }

      if (options.afterRestore === true && pull?.ok === false) {
        const recovered = await recoverAfterRestoreBaseline(
          pull?.error || 'cycle_failed',
          'after_restore_final_fallback'
        );
        if (recovered) pull = { ...pull, ...recovered, finalFallback: true };
      }

      const ok = pull?.ok !== false && push?.ok !== false;
      lastCycleResult = ok ? 'success' : 'failed';
      lastCycleCompletedAt = new Date().toISOString();
      lastCycleError = ok ? null : (pull?.error || push?.error || 'cycle_failed');
      return { ok, pull, push, operationId, at: lastCycleCompletedAt, cycleCompleted: true };
    }, { operationId: options.operationId, prefix: 'cycle' });
  }

  function scheduleDebounced(options) {
    options = options || {};
    const ms = Number(options.debounceMs || global.SyncEngine?.PUSH_DEBOUNCE_MS || DEFAULT_DEBOUNCE_MS);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      runCycle(options).catch(() => { /* never throw into UI */ });
    }, ms);
  }

  function isCycleInFlight() {
    return locked;
  }

  function getLastCycleResult() {
    return {
      result: lastCycleResult,
      completedAt: lastCycleCompletedAt,
      error: lastCycleError,
    };
  }

  global.SyncCoordinator = {
    DEFAULT_DEBOUNCE_MS,
    DEFAULT_MAX_ATTEMPTS,
    newOperationId,
    isLocked,
    isCycleInFlight,
    getLastCycleResult,
    getCurrentOperationId,
    withMutex,
    runWithBoundedRetry,
    runCycle,
    scheduleDebounced,
  };
})(typeof window !== 'undefined' ? window : globalThis);
