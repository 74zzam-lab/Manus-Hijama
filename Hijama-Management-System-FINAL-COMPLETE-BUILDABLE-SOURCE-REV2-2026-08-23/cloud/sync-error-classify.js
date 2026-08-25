/**
 * Renderer mirror of sync error classification (V2-4).
 */
(function (global) {
  'use strict';

  // Prefer Node module when available (tests); otherwise embed compact classifier.
  let impl = null;
  try {
    if (typeof require === 'function') impl = require('../database/sync-error-classify.js');
  } catch { /* browser */ }

  function classify(err) {
    if (impl?.classify) return impl.classify(err);
    const msg = String(err?.message || err?.error || err || '').toLowerCase();
    const status = Number(err?.status || 0);
    let category = 'unknown';
    if (err?.offline || /offline|enotfound/.test(msg)) category = 'offline';
    else if (status === 401 || /unauthorized|invalid_grant/.test(msg)) category = 'unauthorized';
    else if (status === 403) category = 'forbidden';
    else if (status === 429) category = 'rate_limit';
    else if (/quota/.test(msg)) category = 'quota';
    else if (/conflict/.test(msg)) category = 'conflict';
    else if (/corrupt|checksum/.test(msg)) category = 'remote_corrupt';
    else if (/timeout/.test(msg)) category = 'timeout';
    const preserveLocal = true;
    const retryable = !['unauthorized', 'forbidden', 'quota', 'remote_corrupt', 'conflict'].includes(category);
    return {
      category,
      retryable,
      backoff: retryable,
      pauseSync: ['unauthorized', 'forbidden', 'quota', 'remote_corrupt'].includes(category),
      deadLetter: category === 'remote_corrupt',
      preserveLocal,
      userMessage: 'Sync issue: ' + category,
      raw: { message: String(err?.message || err || '').slice(0, 500), status },
    };
  }

  global.SyncErrorClassify = { classify };
})(typeof window !== 'undefined' ? window : globalThis);
