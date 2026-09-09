/**
 * Sync Guard — no sync/bootstrap without DataStateAnalyzer approval.
 */
(function (global) {
  'use strict';

  const STATE_KEY = '__tdw_sync_guard__';

  function loadState() {
    return global.DB?.get?.(STATE_KEY, null) || {
      paused: false,
      pauseReason: null,
      lastAnalysis: null,
      pendingAction: null
    };
  }

  function saveState(state) {
    global.DB?.set?.(STATE_KEY, state);
    return state;
  }

  function isPaused() {
    return !!loadState().paused;
  }

  function pause(reason, analysis) {
    const state = loadState();
    state.paused = true;
    state.pauseReason = reason || 'analysis_required';
    state.lastAnalysis = analysis || null;
    state.pausedAt = new Date().toISOString();
    return saveState(state);
  }

  function resume(analysis, action) {
    const state = loadState();
    state.paused = false;
    state.pauseReason = null;
    state.lastAnalysis = analysis || state.lastAnalysis;
    state.pendingAction = action || null;
    state.resumedAt = new Date().toISOString();
    return saveState(state);
  }

  function canSync(options) {
    options = options || {};
    if (!global.CloudMeta?.isCloudV2Enabled?.()) return { ok: true, skipped: true };
    if (options.force) return { ok: true, forced: true };
    const state = loadState();
    if (state.paused) {
      return {
        ok: false,
        blocked: true,
        reason: state.pauseReason || 'sync_paused',
        analysis: state.lastAnalysis
      };
    }
    return { ok: true };
  }

  function canBootstrap(options) {
    return canSync(options);
  }

  function requireApprovedAction(action, analysis) {
    if (!analysis?.ok) return { ok: false, error: 'no_analysis' };
    const allowed = analysis.allowedActions || [];
    if (!allowed.includes(action)) {
      return {
        ok: false,
        error: 'action_not_allowed',
        state: analysis.state,
        allowedActions: allowed
      };
    }
    return { ok: true, action, analysis };
  }

  function blockUnsafe(analysis) {
    if (!analysis) return pause('no_analysis');
    if (analysis.blocked || analysis.requiresUserDecision) {
      return pause(analysis.state || 'unsafe', analysis);
    }
    return { ok: true, analysis };
  }

  global.SyncGuard = {
    STATE_KEY,
    loadState,
    saveState,
    isPaused,
    pause,
    resume,
    canSync,
    canBootstrap,
    requireApprovedAction,
    blockUnsafe
  };
})(typeof window !== 'undefined' ? window : globalThis);
