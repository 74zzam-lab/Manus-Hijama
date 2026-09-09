/**
 * Renderer bridge to durable SQLite outbox via Electron IPC (V2-4).
 * Falls back to no-op when not in Electron — Node tests use database/sync-outbox.js directly.
 */
(function (global) {
  'use strict';

  function api() {
    return global.cuppingElectron?.database || global.tadawi?.database || null;
  }

  async function syncOp(request) {
    const db = api();
    if (!db?.syncOp) return { ok: false, error: 'no_electron_sync_bridge' };
    return db.syncOp(request);
  }

  async function enqueue(entry) {
    return syncOp({ op: 'enqueue', entry });
  }

  async function claimPending(options) {
    return syncOp({ op: 'claimPending', options: options || {} });
  }

  async function ack(eventId, remoteFileId, leaseToken) {
    return syncOp({ op: 'ack', eventId, remoteFileId, leaseToken });
  }

  async function fail(eventId, error, options) {
    return syncOp({ op: 'fail', eventId, error, options });
  }

  async function counts(branchId) {
    return syncOp({ op: 'counts', branchId });
  }

  async function listDeadLetters(options) {
    return syncOp({ op: 'listDeadLetters', options: options || {} });
  }

  async function requeueDeadLetter(eventId) {
    return syncOp({ op: 'requeueDeadLetter', eventId });
  }

  async function requeueDeadLetters(options) {
    return syncOp({ op: 'requeueDeadLetters', options: options || {} });
  }

  async function markApplied(entry) {
    return syncOp({ op: 'markApplied', entry });
  }

  async function openConflict(entry) {
    return syncOp({ op: 'openConflict', entry });
  }

  async function resolveConflict(conflictId, resolution, resolvedRevision, actorId) {
    return syncOp({ op: 'resolveConflict', conflictId, resolution, resolvedRevision, actorId });
  }

  async function audit(entry) {
    return syncOp({ op: 'audit', entry });
  }

  function isAvailable() {
    return !!(api()?.syncOp);
  }

  global.SqliteOutboxBridge = {
    isAvailable,
    syncOp,
    enqueue,
    claimPending,
    ack,
    fail,
    counts,
    listDeadLetters,
    requeueDeadLetter,
    requeueDeadLetters,
    markApplied,
    openConflict,
    resolveConflict,
    audit,
  };
})(typeof window !== 'undefined' ? window : global);
