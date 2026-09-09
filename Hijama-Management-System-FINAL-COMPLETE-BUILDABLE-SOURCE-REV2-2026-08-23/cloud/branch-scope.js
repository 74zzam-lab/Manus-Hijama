/**
 * Branch Scope (user account) + activeBranchId session.
 * Device branch lock is sync/diagnostics only — permissions use user.branchScope.
 */
(function (global) {
  'use strict';

  const ACTIVE_BRANCH_KEY = '__tdw_active_branch__';
  const DEFAULT_BRANCH_ID = 'BR-MAIN';

  const ROLE_DEFAULTS = {
    reception: { branchScope: null, canSwitchBranch: false },
    employee: { branchScope: null, canSwitchBranch: false },
    doctor: { branchScope: null, canSwitchBranch: false },
    accountant: { branchScope: null, canSwitchBranch: false },
    branch_manager: { branchScope: null, canSwitchBranch: false },
    admin: { branchScope: null, canSwitchBranch: false },
    custom: { branchScope: null, canSwitchBranch: false },
    owner: { branchScope: ['*'], canSwitchBranch: true },
    hq_admin: { branchScope: ['*'], canSwitchBranch: true }
  };

  function getDeviceBranchId() {
    if (global.DeviceConfig?.isBranchLocked?.()) {
      return global.DeviceConfig.getLockedBranchId() || DEFAULT_BRANCH_ID;
    }
    return global.DeviceConfig?.getLockedBranchId?.() || DEFAULT_BRANCH_ID;
  }

  function getActiveBranchId() {
    try {
      const raw = sessionStorage.getItem(ACTIVE_BRANCH_KEY);
      if (raw) return raw;
    } catch { /* empty */ }
    const cfg = global.DeviceConfig?.load?.() || {};
    if (cfg.lastOwnerAggregate === true) return '*';
    const durable = String(cfg.lastViewBranchId || '').trim();
    if (durable) return durable;
    if (global.DeviceConfig?.isBranchLocked?.()) {
      const locked = global.DeviceConfig.getLockedBranchId?.();
      if (locked) return locked;
    }
    return null;
  }

  function setActiveBranchId(branchId) {
    if (!branchId) return;
    try { sessionStorage.setItem(ACTIVE_BRANCH_KEY, branchId); } catch { /* empty */ }
    global.activeBranchId = branchId;
  }

  function clearActiveBranchId() {
    try { sessionStorage.removeItem(ACTIVE_BRANCH_KEY); } catch { /* empty */ }
    global.activeBranchId = getDeviceBranchId() || DEFAULT_BRANCH_ID;
  }

  function defaultScopeForRole(role) {
    const d = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.reception;
    if (d.branchScope === null) {
      return { branchScope: [DEFAULT_BRANCH_ID], canSwitchBranch: !!d.canSwitchBranch };
    }
    return { branchScope: d.branchScope.slice(), canSwitchBranch: !!d.canSwitchBranch };
  }

  function applyDefaultScopeToUser(user) {
    if (!user || typeof user !== 'object') return user;
    if (Array.isArray(user.branchScope) && user.branchScope.length) return user;
    const defs = defaultScopeForRole(user.role);
    user.branchScope = defs.branchScope;
    user.canSwitchBranch = user.canSwitchBranch != null ? !!user.canSwitchBranch : defs.canSwitchBranch;
    return user;
  }

  function migrateUsersScope(users) {
    if (!Array.isArray(users)) return users;
    return users.map(u => applyDefaultScopeToUser({ ...u }));
  }

  function isOrganizationBranchSwitcher(user) {
    if (!user) return false;
    if (user.isDev) return true;
    return !!(global.RolePolicy?.isOrganizationOwner?.(user));
  }

  function getUserBranchScope(user) {
    if (!user) return [];
    if (!isOrganizationBranchSwitcher(user)) {
      return [getDeviceBranchId() || DEFAULT_BRANCH_ID];
    }
    applyDefaultScopeToUser(user);
    const scope = Array.isArray(user.branchScope) ? user.branchScope : [];
    if (scope.length) return scope;
    return defaultScopeForRole(user.role).branchScope;
  }

  /** Only Owner / HQ Admin (and dev) may switch branches in the UI. */
  function canUserSwitchBranch(user) {
    return isOrganizationBranchSwitcher(user);
  }

  function userCanAccessBranch(user, branchId) {
    if (!branchId) return true;
    const scope = getUserBranchScope(user);
    if (scope.includes('*')) return true;
    return scope.includes(branchId);
  }

  function filterByBranch(records, branchId) {
    if (!Array.isArray(records)) return records;
    branchId = branchId || getActiveBranchId();
    if (!branchId) return records.slice();
    return records.filter(r => {
      if (!r || typeof r !== 'object') return false;
      if (r.branchId) return r.branchId === branchId;
      // No silent BR-MAIN attribution when LegacyBranchMigration says unresolved.
      if (global.LegacyBranchMigration?.resolveLegacyBranchId) {
        const resolved = global.LegacyBranchMigration.resolveLegacyBranchId(r);
        if (resolved == null) return false;
        return resolved === branchId;
      }
      return branchId === DEFAULT_BRANCH_ID;
    });
  }

  function getViewBranchFilter() {
    const active = getActiveBranchId();
    if (active && active !== '*' && active !== '__ALL__') return active;
    const write = global.BranchContexts?.getOperationalWriteBranch?.();
    if (write) return write;
    if (global.OwnerBranchMode?.isBranchMode?.()) {
      return global.OwnerBranchMode.getBranchId() || null;
    }
    return null;
  }

  function isAggregateBranchView() {
    const active = getActiveBranchId();
    if (active === '*' || active === '__ALL__') return true;
    if (!getViewBranchFilter()
      && global.OwnerBranchMode?.isOwnerMode?.()
      && (global.RolePolicy?.isOrganizationOwner?.(global.currentUser)
        || String(global.currentUser?.role || '').toLowerCase() === 'owner')) {
      return true;
    }
    return false;
  }

  function filterForActiveView(records) {
    if (!Array.isArray(records)) return [];
    const user = global.currentUser;
    const ownerCanSwitch = !!(user && canUserSwitchBranch(user));
    // Device lock applies to staff only — owners who switch branches use session write branch.
    if (global.DeviceConfig?.isBranchLocked?.() && !ownerCanSwitch) {
      return filterByBranch(records, global.DeviceConfig.getLockedBranchId() || DEFAULT_BRANCH_ID);
    }
    const viewBranch = getViewBranchFilter();
    if (viewBranch) return filterByBranch(records, viewBranch);
    if (isAggregateBranchView()) return records.slice();
    return filterByBranch(records, getActiveBranchId());
  }

  function ensureRecordBranch(record, branchId) {
    if (!record || typeof record !== 'object') return record;
    if (!record.branchId) {
      record.branchId = branchId || getActiveBranchId() || DEFAULT_BRANCH_ID;
    }
    const centerId = global.DeviceConfig?.getCenterIdFromConfig?.() || global.CenterId?.getStoredCenterId?.();
    if (centerId && !record.centerId) record.centerId = centerId;
    return record;
  }

  function guardBranchAccess(user, branchId, actionLabel) {
    if (userCanAccessBranch(user, branchId)) return true;
    if (typeof global.notify === 'function') {
      global.notify(actionLabel || '⛔ لا يمكنك الوصول لهذا الفرع', 'danger');
    }
    return false;
  }

  const TRUSTED_WRITE_SOURCES = new Set([
    'import',
    'import_legacy',
    'conflict_resolve',
    'wipe',
    'bootstrap',
    'sync',
    'poll',
    'push',
    'migration'
  ]);

  function assertWriteAllowed(user, branchId, options) {
    options = options || {};
    if (options.skipBranchGuard) return { ok: true, skipped: true };
    if (options.source && TRUSTED_WRITE_SOURCES.has(options.source)) {
      return { ok: true, skipped: true, source: options.source };
    }
    // V2-5.4: unauthenticated writes are denied (no silent skip).
    if (!user) {
      return { ok: false, error: 'not_authenticated', branchId: branchId || null };
    }
    // Prefer authoritative user (ignore forged role/scope on currentUser).
    let effective = user;
    if (global.RbacGuard?.resolveAuthoritativeUser) {
      effective = global.RbacGuard.resolveAuthoritativeUser(user) || user;
    }
    // V2-5.9: Owner Mode (cross-branch overview) is operational read-only unless explicit write flag.
    if (
      options.allowOwnerModeWrite !== true
      && global.OwnerBranchMode?.isOwnerMode?.()
      && (global.RolePolicy?.isOrganizationOwner?.(effective) || String(effective.role || '').toLowerCase() === 'owner')
    ) {
      return { ok: false, error: 'owner_mode_readonly', branchId: branchId || null };
    }
    // Authoritative write context — not deviceBound / not reporting-only selection.
    if (global.BranchContexts?.assertOperationalWriteContext && options.skipWriteContext !== true) {
      const ctx = global.BranchContexts.assertOperationalWriteContext({ user: effective });
      if (!ctx.ok) {
        return { ok: false, error: ctx.error || 'operational_write_branch_required', branchId: branchId || null };
      }
      if (branchId && ctx.branchId && branchId !== ctx.branchId && options.allowCrossWrite !== true) {
        return { ok: false, error: 'write_branch_mismatch', branchId, writeBranch: ctx.branchId };
      }
      if (!branchId) branchId = ctx.branchId;
    }
    if (!branchId) return { ok: true, user: effective };
    if (userCanAccessBranch(effective, branchId)) return { ok: true, branchId, user: effective };
    try {
      global.RbacGuard?.auditDenial?.({
        userId: effective.id, role: effective.role, resource: branchId,
        reason: 'branch_access_denied', entity: 'branch',
      });
    } catch { /* empty */ }
    return { ok: false, error: 'branch_access_denied', branchId };
  }

  function filterByUserScope(records, user) {
    if (!Array.isArray(records)) return records;
    const scope = getUserBranchScope(user);
    if (!scope.length || scope.includes('*')) return records.slice();
    return records.filter((r) => {
      if (!r || typeof r !== 'object') return false;
      const bid = r.branchId || DEFAULT_BRANCH_ID;
      return scope.includes(bid);
    });
  }

  /** Branches the user may activate/select (license enrolled ∩ membership scope). */
  function listAuthorizedBranches(user, doc) {
    doc = doc || global.LicenseCloud?.loadLocal?.() || {};
    const enrolled = (doc.branches || []).filter((b) => b && b.active !== false);
    if (!user) return enrolled.slice();
    const scope = getUserBranchScope(user);
    if (!scope.length || scope.includes('*')) return enrolled.slice();
    return enrolled.filter((b) => scope.includes(b.id));
  }

  function initSessionBranch() {
    const user = global.currentUser;
    if (global.BranchAuthority?.restoreFromDurable) {
      const restored = global.BranchAuthority.restoreFromDurable(user);
      global.activeBranchId = global.BranchAuthority.activeBranchId(user)
        || getActiveBranchId()
        || null;
      return restored;
    }
    if (!user) {
      global.activeBranchId = getActiveBranchId();
      return { ok: !!global.activeBranchId };
    }
    if (!canUserSwitchBranch(user)) {
      try { sessionStorage.removeItem('__tdw_branch_drawer_pref__'); } catch { /* empty */ }
      const deviceBranch = getDeviceBranchId() || DEFAULT_BRANCH_ID;
      setActiveBranchId(deviceBranch);
      try {
        global.BranchContexts?.setOperationalWriteBranch?.(deviceBranch, { bindDevice: false });
      } catch { /* empty */ }
      global.activeBranchId = deviceBranch;
      return { ok: true, branchId: deviceBranch };
    }
    const scope = getUserBranchScope(user);
    const preferred = scope.includes('*')
      ? (getDeviceBranchId() || DEFAULT_BRANCH_ID)
      : (scope[0] || DEFAULT_BRANCH_ID);
    const current = getActiveBranchId();
    if (!current || !userCanAccessBranch(user, current)) {
      setActiveBranchId(preferred);
      global.activeBranchId = preferred;
    } else {
      global.activeBranchId = current;
    }
    return { ok: true, branchId: global.activeBranchId };
  }

  global.BranchScope = {
    ACTIVE_BRANCH_KEY,
    DEFAULT_BRANCH_ID,
    ROLE_DEFAULTS,
    getDeviceBranchId,
    getActiveBranchId,
    setActiveBranchId,
    clearActiveBranchId,
    defaultScopeForRole,
    applyDefaultScopeToUser,
    migrateUsersScope,
    getUserBranchScope,
    isOrganizationBranchSwitcher,
    canUserSwitchBranch,
    userCanAccessBranch,
    filterByBranch,
    filterForActiveView,
    getViewBranchFilter,
    isAggregateBranchView,
    filterByUserScope,
    listAuthorizedBranches,
    ensureRecordBranch,
    guardBranchAccess,
    assertWriteAllowed,
    TRUSTED_WRITE_SOURCES,
    initSessionBranch
  };

  global.activeBranchId = getActiveBranchId();
  global.filterByBranch = filterByBranch;
})(typeof window !== 'undefined' ? window : globalThis);
