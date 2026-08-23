/**
 * PR8 — Guard open forms against cross-branch silent saves.
 */
(function (global) {
  'use strict';

  let boundBranchId = null;
  let boundRecordId = null;
  let boundScopeGeneration = null;
  let invalidatedBySwitch = false;

  function bindOpenForm(meta) {
    meta = meta || {};
    invalidatedBySwitch = false;
    boundBranchId = global.BranchAuthority?.operationalWriteBranchId?.()
      || global.BranchContexts?.getOperationalWriteBranch?.()
      || null;
    boundRecordId = meta.recordId != null ? String(meta.recordId) : null;
    boundScopeGeneration = global.BranchSwitchCache?.captureAsyncToken?.() ?? 0;
    return { ok: true, branchId: boundBranchId, scopeGeneration: boundScopeGeneration };
  }

  function clearOpenForms() {
    invalidatedBySwitch = true;
    boundBranchId = null;
    boundRecordId = null;
    boundScopeGeneration = null;
    try {
      if (typeof global.clearDailyForm === 'function') global.clearDailyForm();
    } catch { /* empty */ }
    const editId = global._editCaseId;
    if (editId != null) global._editCaseId = null;
  }

  function assertSaveAllowed(options) {
    options = options || {};
    const currentBranch = global.BranchAuthority?.operationalWriteBranchId?.()
      || global.BranchContexts?.getOperationalWriteBranch?.();
    const currentGen = global.BranchSwitchCache?.getScopeGeneration?.() ?? 0;

    if (invalidatedBySwitch) {
      return { ok: false, error: 'branch_switch_form_stale', code: 'branch_switch_form_stale' };
    }
    if (boundScopeGeneration != null && boundScopeGeneration !== currentGen) {
      return { ok: false, error: 'branch_switch_form_stale', code: 'branch_switch_form_stale' };
    }
    if (boundBranchId && currentBranch && boundBranchId !== currentBranch && !options.honorCapturedBranch) {
      return {
        ok: false,
        error: 'branch_switch_form_branch_mismatch',
        code: 'branch_switch_form_branch_mismatch',
        formBranchId: boundBranchId,
        currentBranchId: currentBranch,
      };
    }
    if (options.recordBranchId && currentBranch && options.recordBranchId !== currentBranch && !options.honorCapturedBranch) {
      return {
        ok: false,
        error: 'branch_scope_mismatch',
        code: 'branch_scope_mismatch',
        recordBranchId: options.recordBranchId,
        currentBranchId: currentBranch,
      };
    }
    return { ok: true, branchId: options.honorCapturedBranch ? (boundBranchId || currentBranch) : currentBranch };
  }

  global.BranchSwitchForms = {
    bindOpenForm,
    clearOpenForms,
    assertSaveAllowed,
  };
})(typeof window !== 'undefined' ? window : globalThis);
