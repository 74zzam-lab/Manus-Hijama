/**
 * PR8 — Branch switch cache invalidation + async stale-op generation token.
 */
(function (global) {
  'use strict';

  let scopeGeneration = 0;
  const moduleInvalidators = [];

  function getScopeGeneration() {
    return scopeGeneration;
  }

  function bumpScopeGeneration(reason) {
    scopeGeneration += 1;
    return { generation: scopeGeneration, reason: reason || 'branch_switch' };
  }

  function isGenerationCurrent(token) {
    if (token == null) return true;
    return Number(token) === scopeGeneration;
  }

  function registerInvalidator(fn) {
    if (typeof fn === 'function') moduleInvalidators.push(fn);
  }

  function invalidateAll(reason) {
    bumpScopeGeneration(reason);
    for (const fn of moduleInvalidators) {
      try { fn(reason); } catch { /* empty */ }
    }
    try { global.EmployeeLedger?.invalidateBranchCache?.(); } catch { /* empty */ }
    try { global.BranchDataIsolation?.invalidateViewCaches?.(); } catch { /* empty */ }
    if (typeof global.releaseStaleUiLocks === 'function') {
      try { global.releaseStaleUiLocks({ reason: reason || 'branch_switch' }); } catch { /* empty */ }
    }
    try { global.BranchSwitchForms?.clearOpenForms?.(); } catch { /* empty */ }
  }

  function captureAsyncToken() {
    return scopeGeneration;
  }

  global.BranchSwitchCache = {
    getScopeGeneration,
    bumpScopeGeneration,
    isGenerationCurrent,
    registerInvalidator,
    invalidateAll,
    captureAsyncToken,
  };
})(typeof window !== 'undefined' ? window : globalThis);
