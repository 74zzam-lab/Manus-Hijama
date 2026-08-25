/**
 * V2-5.6 — Restore wizard state machine (select → … → done|failed|cancelled).
 */
(function (global) {
  'use strict';

  const STEPS = Object.freeze([
    'select',
    'validate',
    'preSummary',
    'confirm',
    'running',
    'postSummary',
    'done',
    'failed',
    'cancelled'
  ]);

  const DEFAULT_OVERWRITE_PHRASE = 'استعادة';

  let state = null;

  function freshState(opts) {
    opts = opts || {};
    return {
      step: 'select',
      point: null,
      validation: null,
      preSummary: null,
      postSummary: null,
      progressSession: null,
      overwritePhrase: opts.overwritePhrase || DEFAULT_OVERWRITE_PHRASE,
      confirmed: false,
      error: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function touch() {
    if (state) state.updatedAt = new Date().toISOString();
  }

  function getState() {
    if (!state) return null;
    return {
      step: state.step,
      point: state.point,
      validation: state.validation,
      preSummary: state.preSummary,
      postSummary: state.postSummary,
      progressSession: state.progressSession,
      overwritePhrase: state.overwritePhrase,
      confirmed: state.confirmed,
      error: state.error,
      startedAt: state.startedAt,
      updatedAt: state.updatedAt
    };
  }

  function start(opts) {
    state = freshState(opts);
    return getState();
  }

  function ensureStarted() {
    if (!state) throw new Error('restore_wizard_not_started');
    return state;
  }

  function assertStep(...allowed) {
    ensureStarted();
    if (!allowed.includes(state.step)) {
      throw new Error('restore_wizard_bad_step:' + state.step + ':expected:' + allowed.join('|'));
    }
  }

  function selectPoint(point) {
    assertStep('select', 'validate', 'preSummary', 'confirm');
    if (!point || (typeof point !== 'object' && typeof point !== 'string')) {
      throw new Error('restore_wizard_point_required');
    }
    state.point = typeof point === 'string' ? { id: point } : Object.assign({}, point);
    state.step = 'validate';
    state.validation = null;
    state.preSummary = null;
    state.confirmed = false;
    state.error = null;
    touch();
    return getState();
  }

  function validate(fn) {
    assertStep('validate');
    if (typeof fn !== 'function') throw new Error('restore_wizard_validate_fn_required');
    let result;
    try {
      result = fn(state.point);
    } catch (err) {
      state.validation = { ok: false, error: String(err && err.message || err) };
      state.step = 'failed';
      state.error = state.validation.error;
      touch();
      return getState();
    }
    if (result && typeof result.then === 'function') {
      throw new Error('restore_wizard_validate_async_unsupported');
    }
    const ok = !!(result && result.ok !== false && result !== false);
    state.validation = ok
      ? Object.assign({ ok: true }, typeof result === 'object' ? result : {})
      : Object.assign({ ok: false }, typeof result === 'object' ? result : { error: 'invalid' });
    if (!ok) {
      state.step = 'failed';
      state.error = state.validation.error || 'validation_failed';
    } else {
      state.step = 'preSummary';
    }
    touch();
    return getState();
  }

  function buildPreSummary(meta) {
    assertStep('preSummary');
    state.preSummary = Object.assign({}, meta || {}, {
      point: state.point,
      builtAt: new Date().toISOString()
    });
    state.step = 'confirm';
    touch();
    return getState();
  }

  function confirmOverwrite(opts) {
    assertStep('confirm');
    opts = opts || {};
    const expected = String(
      opts.expectedPhrase != null ? opts.expectedPhrase : state.overwritePhrase
    );
    const typed = String(opts.typedPhrase == null ? '' : opts.typedPhrase).trim();
    if (typed !== expected) {
      state.confirmed = false;
      state.error = 'overwrite_phrase_mismatch';
      touch();
      return Object.assign(getState(), { ok: false, error: 'overwrite_phrase_mismatch' });
    }
    state.confirmed = true;
    state.error = null;
    touch();
    return Object.assign(getState(), { ok: true });
  }

  function startRunning(session) {
    assertStep('confirm');
    if (!state.confirmed) throw new Error('restore_wizard_not_confirmed');
    const snap = session && typeof session === 'object' ? session : null;
    if (!snap || (!snap.id && !snap.sessionId)) {
      throw new Error('restore_wizard_progress_session_required');
    }
    state.progressSession = {
      id: snap.id || snap.sessionId,
      op: snap.op || 'restore',
      percent: Number(snap.percent) || 0,
      status: snap.status || 'running'
    };
    state.step = 'running';
    touch();
    return getState();
  }

  function finish(opts) {
    assertStep('running', 'postSummary');
    opts = opts || {};
    const ok = !!opts.ok;
    state.postSummary = opts.postSummary != null ? opts.postSummary : null;
    if (state.step === 'running') {
      state.step = 'postSummary';
      touch();
    }
    state.step = ok ? 'done' : 'failed';
    if (!ok) state.error = opts.error || state.error || 'restore_failed';
    else state.error = null;
    touch();
    return getState();
  }

  function cancel() {
    ensureStarted();
    if (state.step === 'done' || state.step === 'failed' || state.step === 'cancelled') {
      return getState();
    }
    state.step = 'cancelled';
    state.error = 'cancelled';
    touch();
    return getState();
  }

  function _reset() {
    state = null;
  }

  const api = {
    STEPS,
    DEFAULT_OVERWRITE_PHRASE,
    start,
    selectPoint,
    validate,
    buildPreSummary,
    confirmOverwrite,
    startRunning,
    finish,
    cancel,
    getState,
    _reset
  };

  global.RestoreWizard = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
