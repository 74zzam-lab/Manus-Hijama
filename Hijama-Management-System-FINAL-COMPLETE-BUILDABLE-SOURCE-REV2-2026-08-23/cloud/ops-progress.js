/**
 * V2-5.6 — Honest ops progress sessions (backup / sync / restore).
 * Never reports 100% unless markComplete was called.
 */
(function (global) {
  'use strict';

  const OPS = Object.freeze(['backup', 'sync', 'restore']);
  const ACTIVE = Object.freeze(['running', 'paused']);
  const sessions = new Map();
  let seq = 0;

  function nowIso() {
    return new Date().toISOString();
  }

  function requireSession(sessionId) {
    const s = sessions.get(sessionId);
    if (!s) throw new Error('ops_progress_session_not_found:' + sessionId);
    return s;
  }

  function clampRatio(ratio) {
    let r = Number(ratio);
    if (!Number.isFinite(r)) r = 0;
    r = Math.max(0, Math.min(1, r));
    /* Honest progress: ratio 1.0 is reserved for markComplete only. */
    if (r >= 1) r = 0.999;
    return r;
  }

  function ratioToPercent(ratio) {
    return Math.min(99, Math.floor(Number(ratio) * 100));
  }

  function snapshotOf(s) {
    return {
      id: s.id,
      op: s.op,
      stage: s.stage,
      detail: s.detail,
      percent: s.percent,
      status: s.status,
      stages: s.stages.slice(),
      cancellable: s.cancellable,
      cancelRequested: s.cancelRequested,
      paused: s.paused,
      error: s.error,
      updatedAt: s.updatedAt,
      createdAt: s.createdAt
    };
  }

  function createSession(opts) {
    opts = opts || {};
    const op = String(opts.op || '');
    if (!OPS.includes(op)) throw new Error('ops_progress_unknown_op:' + op);
    const stages = Array.isArray(opts.stages)
      ? opts.stages.map((x) => String(x))
      : [];
    seq += 1;
    const id = 'ops-' + op + '-' + Date.now() + '-' + seq;
    const s = {
      id,
      op,
      stages,
      stage: stages[0] || null,
      detail: null,
      ratio: 0,
      percent: 0,
      status: 'running',
      cancellable: opts.cancellable !== false,
      cancelRequested: false,
      paused: false,
      error: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    sessions.set(id, s);
    return snapshotOf(s);
  }

  function setStage(sessionId, stage, detail) {
    const s = requireSession(sessionId);
    if (s.status === 'complete' || s.status === 'failed' || s.status === 'cancelled') {
      return snapshotOf(s);
    }
    s.stage = stage == null ? s.stage : String(stage);
    if (arguments.length >= 3) s.detail = detail == null ? null : String(detail);
    s.updatedAt = nowIso();
    return snapshotOf(s);
  }

  function setRatio(sessionId, ratio) {
    const s = requireSession(sessionId);
    if (s.status === 'complete' || s.status === 'failed' || s.status === 'cancelled') {
      return snapshotOf(s);
    }
    s.ratio = clampRatio(ratio);
    s.percent = ratioToPercent(s.ratio);
    s.updatedAt = nowIso();
    return snapshotOf(s);
  }

  function markComplete(sessionId) {
    const s = requireSession(sessionId);
    s.ratio = 1;
    s.percent = 100;
    s.status = 'complete';
    s.paused = false;
    s.cancelRequested = false;
    s.error = null;
    s.updatedAt = nowIso();
    return snapshotOf(s);
  }

  function markFailed(sessionId, error) {
    const s = requireSession(sessionId);
    s.status = 'failed';
    s.paused = false;
    s.error = error == null ? 'failed' : (typeof error === 'string' ? error : String(error.message || error));
    s.updatedAt = nowIso();
    return snapshotOf(s);
  }

  function markCancelled(sessionId) {
    const s = requireSession(sessionId);
    s.status = 'cancelled';
    s.paused = false;
    s.cancelRequested = true;
    s.updatedAt = nowIso();
    return snapshotOf(s);
  }

  function pause(sessionId) {
    const s = requireSession(sessionId);
    if (s.status !== 'running') return snapshotOf(s);
    s.paused = true;
    s.status = 'paused';
    s.updatedAt = nowIso();
    return snapshotOf(s);
  }

  function resume(sessionId) {
    const s = requireSession(sessionId);
    if (s.status !== 'paused' && !s.paused) return snapshotOf(s);
    s.paused = false;
    if (s.status === 'paused') s.status = 'running';
    s.updatedAt = nowIso();
    return snapshotOf(s);
  }

  function requestCancel(sessionId) {
    const s = requireSession(sessionId);
    if (!s.cancellable) {
      return Object.assign(snapshotOf(s), { cancelAllowed: false });
    }
    if (s.status === 'complete' || s.status === 'failed' || s.status === 'cancelled') {
      return snapshotOf(s);
    }
    s.cancelRequested = true;
    s.updatedAt = nowIso();
    return snapshotOf(s);
  }

  function retry(sessionId) {
    const s = requireSession(sessionId);
    if (s.status !== 'failed' && s.status !== 'cancelled') return snapshotOf(s);
    s.status = 'running';
    s.paused = false;
    s.cancelRequested = false;
    s.error = null;
    s.ratio = 0;
    s.percent = 0;
    s.stage = s.stages[0] || s.stage;
    s.detail = null;
    s.updatedAt = nowIso();
    return snapshotOf(s);
  }

  function getSnapshot(sessionId) {
    return snapshotOf(requireSession(sessionId));
  }

  function assertHonestProgress(snapshot) {
    const snap = snapshot || {};
    const percent = Number(snap.percent);
    const status = String(snap.status || '');
    if (percent === 100 && status !== 'complete') {
      throw new Error('dishonest_progress:percent_100_without_complete');
    }
    if (status === 'complete' && percent !== 100) {
      throw new Error('dishonest_progress:complete_without_100');
    }
    return true;
  }

  function listActive() {
    const out = [];
    sessions.forEach((s) => {
      if (ACTIVE.includes(s.status) || (s.status === 'running' && s.cancelRequested)) {
        out.push(snapshotOf(s));
      }
    });
    return out;
  }

  /** Test helper — clear in-memory sessions. */
  function _reset() {
    sessions.clear();
    seq = 0;
  }

  const api = {
    OPS,
    createSession,
    setStage,
    setRatio,
    markComplete,
    markFailed,
    markCancelled,
    pause,
    resume,
    requestCancel,
    retry,
    getSnapshot,
    assertHonestProgress,
    listActive,
    _reset
  };

  global.OpsProgress = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
