/**
 * Role Policy — additive owner semantics (Phase 22).
 * Keeps existing manager behavior intact for compatibility.
 */
(function (global) {
  'use strict';

  const MANAGER_ROLES = new Set(['admin', 'owner', 'hq_admin']);
  const ORGANIZATION_OWNER_ROLES = new Set(['owner', 'hq_admin']);
  const EMPLOYEE_ROLES = new Set(['employee', 'reception', 'doctor', 'accountant', 'branch_manager', 'custom']);

  function getUser() {
    return global.currentUser || null;
  }

  function isDev(user) {
    user = user || getUser();
    return !!(user?.isDev);
  }

  function isManager(user) {
    user = user || getUser();
    if (!user) return false;
    if (isDev(user)) return true;
    return MANAGER_ROLES.has(user.role);
  }

  function isOrganizationOwner(user) {
    user = user || getUser();
    if (!user) return false;
    if (isDev(user)) return true;
    return ORGANIZATION_OWNER_ROLES.has(user.role);
  }

  function isBranchAdmin(user) {
    user = user || getUser();
    if (!user) return false;
    if (isDev(user)) return true;
    return user.role === 'admin';
  }

  function isEmployee(user) {
    user = user || getUser();
    return !!(user && user.role === 'employee');
  }

  function canManageBranches(user) {
    return isManager(user);
  }

  /** Create/disable/delete branches — organization Owner only (not Branch Admin). */
  function canCreateBranches(user) {
    return isOrganizationOwner(user);
  }

  function canManageUsers(user) {
    return isManager(user);
  }

  function canManageCloud(user) {
    return isManager(user);
  }

  function canResolveConflicts(user) {
    user = user || getUser();
    if (global.RbacGuard?.resolveAuthoritativeUser) {
      const auth = global.RbacGuard.resolveAuthoritativeUser(user);
      if (!auth) return false;
      user = auth;
    }
    if (!user) return false;
    if (isDev(user)) return true;
    return isManager(user);
  }

  function canBootstrapOwner(user) {
    user = user || getUser();
    if (!user) return false;
    if (isOrganizationOwner(user)) return true;
    // Managers may create/skip Owner Profile during first bootstrap when none exists yet.
    if (!isManager(user)) return false;
    if (global.OwnerProfile?.hasProfile?.()) return false;
    return true;
  }

  function canManageOrganization(user) {
    return isOrganizationOwner(user);
  }

  // Explicit owner-only hub lanes. Existing hub access remains backward-compatible.
  function canAccessOwnerHubCore(user) {
    return isOrganizationOwner(user);
  }

  function hasManagerAccount(users) {
    users = users || global.users || global.DB?.get?.('users', []) || [];
    return users.some(u => u && u.active && (MANAGER_ROLES.has(u.role) || u.isDev));
  }

  function hasOrganizationOwnerAccount(users) {
    users = users || global.users || global.DB?.get?.('users', []) || [];
    return users.some(u => u && u.active && (ORGANIZATION_OWNER_ROLES.has(u.role) || u.isDev));
  }

  function listOwnerUsers(users) {
    users = users || global.users || global.DB?.get?.('users', []) || [];
    return users.filter(u => u && !u.isDev && ORGANIZATION_OWNER_ROLES.has(u.role));
  }

  function countActiveOwners(users) {
    return listOwnerUsers(users).filter(u => u && u.active !== false).length;
  }

  /** Block delete/disable/demote when it would remove the last active Owner. */
  function canRemoveOwnerUser(userId, users) {
    if (global.OwnerManagement?.canRemoveOwnerUser) {
      return global.OwnerManagement.canRemoveOwnerUser(userId, users);
    }
    users = users || global.users || global.DB?.get?.('users', []) || [];
    const target = users.find(u => u && String(u.id) === String(userId));
    if (!target) return { ok: false, error: 'not_found' };
    if (!ORGANIZATION_OWNER_ROLES.has(target.role)) return { ok: true };
    if (String(target.id) === '1') return { ok: false, error: 'primary_protected' };
    const active = countActiveOwners(users);
    if (target.active !== false && active <= 1) {
      return { ok: false, error: 'last_active_owner' };
    }
    return { ok: true };
  }

  global.RolePolicy = {
    MANAGER_ROLES,
    ORGANIZATION_OWNER_ROLES,
    EMPLOYEE_ROLES,
    isDev,
    isManager,
    isOrganizationOwner,
    isBranchAdmin,
    isEmployee,
    canManageBranches,
    canCreateBranches,
    canManageUsers,
    canManageCloud,
    canResolveConflicts,
    canManageOrganization,
    canAccessOwnerHubCore,
    canBootstrapOwner,
    hasManagerAccount,
    hasOrganizationOwnerAccount,
    listOwnerUsers,
    countActiveOwners,
    canRemoveOwnerUser
  };
})(typeof window !== 'undefined' ? window : globalThis);
