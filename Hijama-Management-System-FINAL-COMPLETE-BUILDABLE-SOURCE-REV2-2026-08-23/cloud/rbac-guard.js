/**
 * V2-5.4 — Authoritative RBAC guard (renderer).
 * Resolves user from DB by id (ignores forged currentUser.role).
 */
(function (global) {
  'use strict';

  const DENY_LOG_KEY = '__tdw_rbac_deny_log__';

  function loadUsers() {
    if (Array.isArray(global.users) && global.users.length) return global.users;
    return global.DB?.get?.('users', []) || [];
  }

  /** Authoritative user from persistence — never trust claimed.role alone. */
  function resolveAuthoritativeUser(claimed) {
    claimed = claimed || global.currentUser;
    if (!claimed) return null;
    if (claimed.isDev) return claimed;
    const id = claimed.id;
    if (id == null) return null;
    const real = loadUsers().find((u) => u && String(u.id) === String(id) && u.active !== false);
    if (!real) return null;
    // Merge UI fields but force role/permissions/branchScope from DB record.
    return {
      ...claimed,
      id: real.id,
      username: real.username,
      role: real.role,
      permissions: real.permissions,
      branchScope: real.branchScope,
      canSwitchBranch: real.canSwitchBranch,
      active: real.active,
      doctorId: real.doctorId,
    };
  }

  function userHasPermission(user, key) {
    if (!user) return false;
    if (user.isDev) return true;
    if (global.RolePolicy?.isOrganizationOwner?.(user) || global.RolePolicy?.isManager?.(user)) {
      // Managers: full unless custom matrix on admin is used — match PermissionPolicy
      if (user.role === 'custom') {
        /* fall through */
      } else if (user.role === 'owner' || user.role === 'hq_admin' || user.role === 'admin') {
        return true;
      }
    }
    if (typeof global.hasPermission === 'function') {
      const prev = global.currentUser;
      try {
        global.currentUser = user;
        return !!global.hasPermission(key);
      } finally {
        global.currentUser = prev;
      }
    }
    const perms = global.PermissionPolicy?.getUserPermissions?.(user)
      || user.permissions
      || {};
    return !!perms[key];
  }

  function auditDenial(entry) {
    entry = Object.assign({
      at: new Date().toISOString(),
      userId: null,
      role: null,
      action: 'denied',
      reason: 'rbac_denied',
    }, entry || {});
    try {
      const log = global.DB?.get?.(DENY_LOG_KEY, []) || [];
      log.unshift(entry);
      global.DB?.set?.(DENY_LOG_KEY, log.slice(0, 200));
    } catch { /* empty */ }
    try {
      global.AuditLogger?.log?.({
        action: 'RBAC_DENIED',
        entity: entry.entity || 'rbac',
        entityId: entry.resource || entry.page || entry.permission || '',
        summary: `${entry.reason}: ${entry.resource || entry.page || entry.permission || entry.channel || ''}`,
      });
    } catch { /* empty */ }
    return entry;
  }

  function requirePermission(key, options) {
    options = options || {};
    const user = resolveAuthoritativeUser(options.user || global.currentUser);
    if (!user) {
      return { ok: false, error: 'not_authenticated', denial: auditDenial({ reason: 'not_authenticated', permission: key }) };
    }
    if (!userHasPermission(user, key)) {
      if (options.notify !== false && typeof global.notify === 'function') {
        global.notify('⛔ ليس لديك صلاحية: ' + (options.label || key), 'danger');
      }
      return {
        ok: false,
        error: 'permission_denied',
        denial: auditDenial({
          userId: user.id, role: user.role, permission: key, reason: 'permission_denied',
        }),
      };
    }
    return { ok: true, user };
  }

  function requirePage(pageId, options) {
    options = options || {};
    const user = resolveAuthoritativeUser(options.user || global.currentUser);
    if (!user) {
      return { ok: false, error: 'not_authenticated', denial: auditDenial({ reason: 'not_authenticated', page: pageId }) };
    }
    if (user.role === 'employee' && pageId !== 'employee' && pageId !== 'page-employee') {
      return {
        ok: false,
        error: 'page_denied',
        denial: auditDenial({ userId: user.id, role: user.role, page: pageId, reason: 'employee_scope' }),
      };
    }
    const pages = global.PAGE_PERMISSIONS || {};
    const perm = pages[pageId];
    if (perm && !userHasPermission(user, perm) && !global.RolePolicy?.isManager?.(user) && !user.isDev) {
      return {
        ok: false,
        error: 'page_denied',
        denial: auditDenial({ userId: user.id, role: user.role, page: pageId, permission: perm, reason: 'page_denied' }),
      };
    }
    return { ok: true, user };
  }

  function requireBranchAccess(branchId, options) {
    options = options || {};
    const user = resolveAuthoritativeUser(options.user || global.currentUser);
    if (!user) {
      return { ok: false, error: 'not_authenticated' };
    }
    if (!global.BranchScope?.userCanAccessBranch?.(user, branchId)) {
      return {
        ok: false,
        error: 'branch_access_denied',
        denial: auditDenial({
          userId: user.id, role: user.role, resource: branchId, reason: 'branch_access_denied', entity: 'branch',
        }),
      };
    }
    return { ok: true, user };
  }

  function rejectTamperedRole(claimed) {
    claimed = claimed || global.currentUser;
    if (!claimed || claimed.isDev) return { ok: true, user: claimed };
    const auth = resolveAuthoritativeUser(claimed);
    if (!auth) return { ok: false, error: 'user_not_found' };
    if (String(claimed.role || '') !== String(auth.role || '')) {
      auditDenial({
        userId: auth.id, role: auth.role, reason: 'tampered_role',
        resource: `claimed=${claimed.role}`,
      });
      if (global.currentUser && global.currentUser.id === auth.id) {
        global.currentUser.role = auth.role;
      }
      return { ok: false, error: 'tampered_role', user: auth };
    }
    return { ok: true, user: auth };
  }

  function rejectTamperedBranchId(branchId, options) {
    return requireBranchAccess(branchId, options);
  }

  function isElementHiddenNotDisabled(el) {
    if (!el) return false;
    const style = el.style || {};
    const hidden = el.hidden === true || style.display === 'none' || el.getAttribute?.('aria-hidden') === 'true';
    const disabled = el.disabled === true || el.getAttribute?.('aria-disabled') === 'true';
    return hidden && !disabled;
  }

  function shouldBlockShortcut(combo, options) {
    options = options || {};
    const map = {
      'ctrl+p': 'reports.print',
      'ctrl+s': 'settings.edit',
      'ctrl+e': 'cases.edit',
    };
    const key = map[String(combo || '').toLowerCase()];
    if (!key) return { block: false };
    const gate = requirePermission(key, { notify: false, user: options.user });
    if (!gate.ok) {
      auditDenial({
        userId: gate.denial?.userId, role: gate.denial?.role,
        reason: 'shortcut_blocked', permission: key, resource: combo,
      });
      return { block: true, error: gate.error };
    }
    return { block: false };
  }

  function applyAuthoritativeCurrentUser() {
    const auth = resolveAuthoritativeUser(global.currentUser);
    if (auth && global.currentUser) {
      global.currentUser.role = auth.role;
      global.currentUser.permissions = auth.permissions;
      global.currentUser.branchScope = auth.branchScope;
    }
    return auth;
  }

  function getDenyLog() {
    return global.DB?.get?.(DENY_LOG_KEY, []) || [];
  }

  global.RbacGuard = {
    DENY_LOG_KEY,
    resolveAuthoritativeUser,
    userHasPermission,
    auditDenial,
    requirePermission,
    requirePage,
    requireBranchAccess,
    rejectTamperedRole,
    rejectTamperedBranchId,
    isElementHiddenNotDisabled,
    shouldBlockShortcut,
    applyAuthoritativeCurrentUser,
    getDenyLog,
  };
})(typeof window !== 'undefined' ? window : globalThis);
