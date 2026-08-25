/**
 * Shared button busy/lock helper (Category B).
 * Prefer window.runWithButtonLock from index.html when present.
 */
(function (global) {
  'use strict';

  function runWithButtonLock(btn, fn) {
    if (typeof global.runWithButtonLock === 'function' && global.runWithButtonLock !== runWithButtonLock) {
      return global.runWithButtonLock(btn, fn);
    }
    const el = typeof btn === 'string' ? document.querySelector(btn) : btn;
    if (!el || el.dataset.busy === '1') return;
    const orig = el.innerHTML;
    el.dataset.busy = '1';
    el.disabled = true;
    el.classList.add('is-busy');
    const unlock = () => {
      el.dataset.busy = '0';
      el.disabled = false;
      el.classList.remove('is-busy');
      el.innerHTML = orig;
    };
    try {
      const result = fn(el, unlock);
      if (result && typeof result.then === 'function') {
        return result.then(unlock, (err) => {
          try { global.notify?.('⚠️ ' + (err?.message || 'حدث خطأ'), 'danger'); } catch { /* empty */ }
          unlock();
        });
      }
      unlock();
      return result;
    } catch (err) {
      try { global.notify?.('⚠️ ' + (err?.message || 'حدث خطأ'), 'danger'); } catch { /* empty */ }
      unlock();
    }
  }

  global.UiBusy = { runWithButtonLock };
  if (typeof global.runWithButtonLock !== 'function') {
    global.runWithButtonLock = runWithButtonLock;
  }
})(typeof window !== 'undefined' ? window : globalThis);
