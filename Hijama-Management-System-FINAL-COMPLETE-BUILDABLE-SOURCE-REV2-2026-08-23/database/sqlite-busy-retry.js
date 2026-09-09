'use strict';

/**
 * Retry wrapper for SQLITE_BUSY / SQLITE_LOCKED during short atomic writes.
 */
const DEFAULTS = { attempts: 4, baseMs: 12, maxMs: 200 };

function isSqliteBusyError(err) {
  const text = String(err?.code || err?.message || err || '').toUpperCase();
  return text.includes('SQLITE_BUSY') || text.includes('SQLITE_LOCKED');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function syncSleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* empty */ }
}

function runWithSqliteBusyRetry(fn, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || DEFAULTS.attempts));
  const baseMs = Number(options.baseMs || DEFAULTS.baseMs);
  const maxMs = Number(options.maxMs || DEFAULTS.maxMs);
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return fn();
    } catch (err) {
      lastErr = err;
      if (!isSqliteBusyError(err) || i >= attempts - 1) throw err;
      syncSleep(Math.min(baseMs * Math.pow(2, i), maxMs));
    }
  }
  throw lastErr;
}

async function withSqliteBusyRetry(fn, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || DEFAULTS.attempts));
  const baseMs = Number(options.baseMs || DEFAULTS.baseMs);
  const maxMs = Number(options.maxMs || DEFAULTS.maxMs);
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isSqliteBusyError(err) || i >= attempts - 1) throw err;
      const delay = Math.min(baseMs * Math.pow(2, i), maxMs);
      await sleep(delay);
    }
  }
  throw lastErr;
}

module.exports = {
  DEFAULTS,
  isSqliteBusyError,
  runWithSqliteBusyRetry,
  withSqliteBusyRetry,
};
