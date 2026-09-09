/**
 * V2-5.9 — Separate branch contexts (must not share one activeBranch variable).
 *
 * - deviceBoundBranch: permanent device lock (DeviceConfig)
 * - selectedReportingBranch: Owner Hub / reports viewing selection
 * - operationalWriteBranch: only context that may accept operational writes
 */
(function (global) {
  'use strict';

  const REPORTING_KEY = '__tdw_selected_reporting_branch__';
  const WRITE_KEY = '__tdw_operational_write_branch__';

  function getDeviceBoundBranch() {
    return global.DeviceConfig?.getLockedBranchId?.()
      || global.DeviceConfig?.load?.()?.lockedBranchId
      || null;
  }

  function getSelectedReportingBranch() {
    try {
      const raw = sessionStorage.getItem(REPORTING_KEY);
      if (raw) return raw;
    } catch { /* empty */ }
    if (global.OwnerBranchMode?.isBranchMode?.()) {
      return global.OwnerBranchMode.getBranchId?.() || null;
    }
    return getDeviceBoundBranch() || global.BranchScope?.getActiveBranchId?.() || null;
  }

  function setSelectedReportingBranch(branchId) {
    branchId = String(branchId || '').trim();
    if (!branchId) return { ok: false, error: 'branch_required' };
    try { sessionStorage.setItem(REPORTING_KEY, branchId); } catch { /* empty */ }
    return { ok: true, branchId };
  }

  function getOperationalWriteBranch() {
    try {
      const raw = sessionStorage.getItem(WRITE_KEY);
      if (raw) return raw;
    } catch { /* empty */ }
    // Owner Mode overview: no write branch unless explicitly entered Branch Mode.
    if (
      global.OwnerBranchMode?.isOwnerMode?.()
      && (global.RolePolicy?.isOrganizationOwner?.(global.currentUser)
        || String(global.currentUser?.role || '').toLowerCase() === 'owner')
    ) {
      return null;
    }
    if (global.OwnerBranchMode?.isBranchMode?.()) {
      return global.OwnerBranchMode.getBranchId?.() || null;
    }
    if (global.DeviceConfig?.isBranchLocked?.()) {
      return getDeviceBoundBranch();
    }
    return global.BranchScope?.getActiveBranchId?.() || getDeviceBoundBranch() || null;
  }

  function setOperationalWriteBranch(branchId, options) {
    options = options || {};
    branchId = String(branchId || '').trim();
    if (!branchId) return { ok: false, error: 'branch_required' };
    // Entering write context must NOT change permanent device binding unless requested.
    if (options.bindDevice === true) {
      global.DeviceConfig?.setBranchLock?.(branchId, true);
    }
    try { sessionStorage.setItem(WRITE_KEY, branchId); } catch { /* empty */ }
    global.BranchScope?.setActiveBranchId?.(branchId);
    setSelectedReportingBranch(branchId);
    return { ok: true, branchId, deviceBound: options.bindDevice === true };
  }

  /** Owner view branch ≠ device operational write branch (read-only cross-branch view). */
  function setViewBranchOnly(viewBranchId, writeBranchId) {
    viewBranchId = String(viewBranchId || '').trim();
    writeBranchId = String(writeBranchId || '').trim();
    if (!viewBranchId || !writeBranchId) return { ok: false, error: 'branch_required' };
    try { sessionStorage.setItem(WRITE_KEY, writeBranchId); } catch { /* empty */ }
    setSelectedReportingBranch(viewBranchId);
    global.BranchScope?.setActiveBranchId?.(viewBranchId);
    return { ok: true, viewBranchId, writeBranchId, viewOnly: true };
  }

  function clearOperationalWriteBranch() {
    try { sessionStorage.removeItem(WRITE_KEY); } catch { /* empty */ }
    return { ok: true };
  }

  function assertOperationalWriteContext(options) {
    options = options || {};
    const writeBranch = getOperationalWriteBranch();
    if (!writeBranch) {
      return {
        ok: false,
        error: 'operational_write_branch_required',
        message: 'Owner Mode للقراءة — ادخل Branch Mode لكتابة تشغيلية',
      };
    }
    const user = options.user || global.currentUser;
    if (user && global.BranchScope?.userCanAccessBranch && !global.BranchScope.userCanAccessBranch(user, writeBranch)) {
      return { ok: false, error: 'branch_access_denied', branchId: writeBranch };
    }
    return { ok: true, branchId: writeBranch };
  }

  function snapshot() {
    return {
      deviceBoundBranch: getDeviceBoundBranch(),
      selectedReportingBranch: getSelectedReportingBranch(),
      operationalWriteBranch: getOperationalWriteBranch(),
    };
  }

  global.BranchContexts = {
    REPORTING_KEY,
    WRITE_KEY,
    getDeviceBoundBranch,
    getSelectedReportingBranch,
    setSelectedReportingBranch,
    getOperationalWriteBranch,
    setOperationalWriteBranch,
    setViewBranchOnly,
    clearOperationalWriteBranch,
    assertOperationalWriteContext,
    snapshot,
  };
})(typeof window !== 'undefined' ? window : globalThis);
