/**
 * Branch display — resolve human-readable branch names (never raw codes in primary UI).
 */
(function (global) {
  'use strict';

  const LEGACY_MAIN_LABEL = 'الفرع الرئيسي';

  function getLicensedBranches() {
    const doc = global.LicenseCloud?.loadLocal?.();
    return (doc?.branches || []).filter((b) => b && b.active !== false);
  }

  function findBranchRecord(branchId) {
    if (!branchId || branchId === '*' || branchId === '__ALL__') return null;
    return getLicensedBranches().find((b) => String(b.id) === String(branchId)) || null;
  }

  function resolveBranchName(branchId, options) {
    options = options || {};
    if (!branchId || branchId === '*') return options.allLabel || 'كل الفروع';
    if (branchId === '__ALL__') return options.allLabel || 'كل الفروع';

    const rec = findBranchRecord(branchId);
    if (rec?.name) return String(rec.name).trim();

    try {
      const store = global.DB?.get?.('__tdw_branch_settings_store__', {}) || {};
      const slice = store[branchId];
      if (slice?.branchName) return String(slice.branchName).trim();
    } catch { /* empty */ }

    const activeBid = global.BranchContexts?.getOperationalWriteBranch?.()
      || global.BranchScope?.getActiveBranchId?.()
      || global.DeviceConfig?.getLockedBranchId?.();
    if (branchId === activeBid && global.settings?.branchName) {
      return String(global.settings.branchName).trim();
    }

    if (branchId === 'BR-MAIN') return LEGACY_MAIN_LABEL;

    if (options.fallbackToId === false) {
      return options.unknownLabel || 'فرع غير معرّف';
    }
    return String(branchId);
  }

  function resolveBranchMetaLine(branchId) {
    const rec = findBranchRecord(branchId);
    const parts = [];
    if (rec?.city) parts.push(String(rec.city).trim());
    if (rec?.phone) parts.push(String(rec.phone).trim());
    return parts.filter(Boolean).join(' · ');
  }

  /** Tooltip / support: name + optional internal code */
  function resolveBranchTitle(branchId) {
    const name = resolveBranchName(branchId);
    const meta = resolveBranchMetaLine(branchId);
    if (meta) return `${name} — ${meta}`;
    if (name !== branchId && branchId) return `${name} (${branchId})`;
    return name;
  }

  function formatBranchOption(branch) {
    if (!branch) return '—';
    const name = branch.name ? String(branch.name).trim() : resolveBranchName(branch.id);
    const city = branch.city ? ` — ${branch.city}` : '';
    return `${name}${city}`;
  }

  global.BranchDisplay = {
    LEGACY_MAIN_LABEL,
    getLicensedBranches,
    findBranchRecord,
    resolveBranchName,
    resolveBranchMetaLine,
    resolveBranchTitle,
    formatBranchOption,
  };
})(typeof window !== 'undefined' ? window : globalThis);
