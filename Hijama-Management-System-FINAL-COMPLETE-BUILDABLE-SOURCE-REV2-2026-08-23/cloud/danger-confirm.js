/**
 * V2-5.6 — Typed confirmation for dangerous ops (wipe / restore overwrite).
 */
(function (global) {
  'use strict';

  const WIPE_PHRASE = 'مسح الكل';
  const RESTORE_OVERWRITE_PHRASE = 'استعادة';

  const DANGEROUS_ACTIONS = Object.freeze([
    'wipe',
    'factory_wipe',
    'full_wipe',
    'restore_overwrite',
    'restore',
    'delete_center',
    'purge'
  ]);

  function normalizeAction(action) {
    return String(action == null ? '' : action).trim().toLowerCase();
  }

  function isDangerousAction(action) {
    const a = normalizeAction(action);
    if (!a) return false;
    if (DANGEROUS_ACTIONS.includes(a)) return true;
    return /wipe|purge|overwrite|factory.?reset|delete.?all/.test(a);
  }

  function requireTypedConfirm(opts) {
    opts = opts || {};
    const typed = String(opts.typed == null ? '' : opts.typed).trim();
    const expected = String(opts.expected == null ? '' : opts.expected);
    const action = normalizeAction(opts.action) || 'dangerous';
    const matched = typed === expected && expected.length > 0;
    return {
      ok: matched,
      matched,
      action,
      expected,
      dangerous: isDangerousAction(action),
      error: matched ? null : 'typed_confirm_mismatch'
    };
  }

  function wipeConfirm(opts) {
    opts = opts || {};
    return requireTypedConfirm({
      typed: opts.typed,
      expected: WIPE_PHRASE,
      action: opts.action || 'wipe'
    });
  }

  function restoreOverwriteConfirm(opts) {
    opts = opts || {};
    return requireTypedConfirm({
      typed: opts.typed,
      expected: RESTORE_OVERWRITE_PHRASE,
      action: opts.action || 'restore_overwrite'
    });
  }

  const api = {
    WIPE_PHRASE,
    RESTORE_OVERWRITE_PHRASE,
    DANGEROUS_ACTIONS,
    requireTypedConfirm,
    wipeConfirm,
    restoreOverwriteConfirm,
    isDangerousAction
  };

  global.DangerConfirm = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
