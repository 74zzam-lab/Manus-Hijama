'use strict';

/**
 * Single sync mutex + bounded CAS retry orchestration (Node-safe).
 */

const crypto = require('crypto');

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BACKOFF_MS = [50, 150, 400, 900];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newOperationId(prefix = 'sync') {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function createSyncCoordinatorCore(options = {}) {
  const maxAttempts = Number(options.maxAttempts || DEFAULT_MAX_ATTEMPTS);
  const backoffMs = Array.isArray(options.backoffMs) ? options.backoffMs : DEFAULT_BACKOFF_MS;

  let locked = false;
  let currentOperationId = null;
  let pendingRun = null;
  let waiters = [];

  function isLocked() {
    return locked;
  }

  function getCurrentOperationId() {
    return currentOperationId;
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

  async function withMutex(fn, options = {}) {
    const op = options.operationId || newOperationId(options.prefix || 'sync');
    await acquire(op);
    try {
      return await fn({ operationId: currentOperationId || op });
    } finally {
      release();
    }
  }

  async function runWithBoundedRetry(taskFn, options = {}) {
    const attemptsLimit = Number(options.maxAttempts || maxAttempts);
    let last = { ok: false, code: 'push_retry_exhausted' };

    for (let attempt = 0; attempt < attemptsLimit; attempt += 1) {
      const result = await taskFn({
        attempt,
        operationId: options.operationId,
        maxAttempts: attemptsLimit,
      });
      last = result || last;
      if (result?.ok) return result;
      if (result?.retry !== true) return result;
      const delay = backoffMs[Math.min(attempt, backoffMs.length - 1)] || 200;
      await sleep(delay);
    }

    return { ...last, ok: false, code: last.code || 'push_retry_exhausted', retryExhausted: true };
  }

  return {
    newOperationId,
    isLocked,
    getCurrentOperationId,
    acquire,
    release,
    withMutex,
    runWithBoundedRetry,
  };
}

module.exports = {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_BACKOFF_MS,
  newOperationId,
  createSyncCoordinatorCore,
};
