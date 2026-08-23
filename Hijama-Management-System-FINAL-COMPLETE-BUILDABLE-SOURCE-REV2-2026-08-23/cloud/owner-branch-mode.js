/**
 * Owner Branch Mode (Phase 30)
 * Owner can temporarily work in a selected branch context, then return to owner mode.
 */
(function (global) {
  'use strict';

  const MODE_KEY = '__tdw_owner_mode__';

  function load() {
    try {
      const raw = sessionStorage.getItem(MODE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') return data;
      }
    } catch { /* empty */ }
    return { mode: 'owner', branchId: null, updatedAt: null };
  }

  function save(state) {
    const next = { mode: 'owner', branchId: null, updatedAt: new Date().toISOString(), ...(state || {}) };
    try { sessionStorage.setItem(MODE_KEY, JSON.stringify(next)); } catch { /* empty */ }
    return next;
  }

  function getMode() {
    const state = load();
    return state.mode === 'branch' ? 'branch' : 'owner';
  }

  function getBranchId() {
    const state = load();
    return state.mode === 'branch' ? (state.branchId || null) : null;
  }

  function isOwnerMode() {
    return getMode() === 'owner';
  }

  function isBranchMode() {
    return getMode() === 'branch';
  }

  function enterBranchMode(branchId) {
    branchId = String(branchId || '').trim();
    if (!branchId) return { ok: false, error: 'branch_required' };
    const gate = global.OwnerTrustedAuthority?.assertOwnerMutation?.({
      action: 'enterBranchMode',
      branchId,
    });
    if (gate && !gate.ok) return gate;
    // Refuse operational mode on half-created branches.
    const pending = global.BranchEnrollment?.loadPending?.();
    if (pending?.status === 'BRANCH_CREATION_PENDING' && pending.branchId === branchId) {
      return { ok: false, error: 'BRANCH_CREATION_PENDING' };
    }
    save({ mode: 'branch', branchId });
    // Sets operationalWriteBranch + reporting selection; does NOT change deviceBoundBranch.
    global.BranchContexts?.setOperationalWriteBranch?.(branchId, { bindDevice: false });
    global.BranchScope?.setActiveBranchId?.(branchId);
    return { ok: true, mode: 'branch', branchId, deviceBoundUnchanged: true };
  }

  function exitToOwnerMode() {
    save({ mode: 'owner', branchId: null });
    global.BranchContexts?.clearOperationalWriteBranch?.();
    global.BranchScope?.initSessionBranch?.();
    return { ok: true, mode: 'owner', operationalWriteBranch: null };
  }

  function getLabel(branchNameResolver) {
    if (isOwnerMode()) return 'Owner Mode';
    const branchId = getBranchId();
    const label = typeof branchNameResolver === 'function'
      ? branchNameResolver(branchId)
      : (global.BranchDisplay?.resolveBranchName?.(branchId) || branchId);
    return `Branch Mode: ${label || branchId || '—'}`;
  }

  global.OwnerBranchMode = {
    MODE_KEY,
    load,
    save,
    getMode,
    getBranchId,
    isOwnerMode,
    isBranchMode,
    enterBranchMode,
    exitToOwnerMode,
    getLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
