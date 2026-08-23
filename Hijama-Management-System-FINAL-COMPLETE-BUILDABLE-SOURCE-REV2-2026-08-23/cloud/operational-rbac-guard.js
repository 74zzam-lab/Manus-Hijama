/**
 * Operational RBAC guard — authoritative user + manager/owner gates for sync/conflicts/hub.
 */
(function (global) {
  'use strict';

  function authoritativeUser(claimed) {
    if (global.RbacGuard?.resolveAuthoritativeUser) {
      return global.RbacGuard.resolveAuthoritativeUser(claimed || global.currentUser);
    }
    return claimed || global.currentUser || null;
  }

  function auditDenial(entry) {
    if (global.RbacGuard?.auditDenial) return global.RbacGuard.auditDenial(entry);
    return entry;
  }

  function deny(error, entry) {
    auditDenial(entry);
    const truth = global.OperationalErrorTruth?.present?.(error);
    return {
      ok: false,
      error: error || 'rbac_denied',
      userMessageAr: truth?.userMessageAr,
      code: truth?.code || error,
    };
  }

  function requireAuthenticated(options) {
    options = options || {};
    let user = authoritativeUser(options.user);
    if (!user) {
      if (options.notify && typeof global.notify === 'function') {
        global.notify('⛔ يجب تسجيل الدخول', 'danger');
      }
      return deny('not_authenticated', { reason: 'not_authenticated', action: options.action });
    }
    if (global.RbacGuard?.rejectTamperedRole) {
      const tamper = global.RbacGuard.rejectTamperedRole(user);
      if (!tamper.ok) {
        if (options.notify && typeof global.notify === 'function') {
          global.notify('⛔ تم رفض محاولة تلاعب بالصلاحية', 'danger');
        }
        return deny(tamper.error || 'tampered_role', {
          reason: 'tampered_role',
          userId: user.id,
          role: user.role,
          action: options.action,
        });
      }
      user = tamper.user || user;
    }
    return { ok: true, user };
  }

  function requireManager(options) {
    options = options || {};
    const auth = requireAuthenticated(options);
    if (!auth.ok) return auth;
    const user = auth.user;
    if (user.isDev || global.RolePolicy?.isManager?.(user)) {
      return { ok: true, user };
    }
    if (options.notify && typeof global.notify === 'function') {
      global.notify(`⛔ صلاحية المدير مطلوبة — ${options.action || ''}`.trim(), 'danger');
    }
    return deny('manager_only', {
      reason: 'manager_only',
      userId: user.id,
      role: user.role,
      action: options.action,
      entity: 'operational_rbac',
    });
  }

  function requireOwner(options) {
    options = options || {};
    if (global.OwnerTrustedAuthority?.assertOwnerMutation) {
      const trusted = global.OwnerTrustedAuthority.assertOwnerMutation({
        user: options.user,
        action: options.action,
        centerId: options.centerId,
        branchId: options.branchId,
        deviceUuid: options.deviceUuid,
        entity: options.entity,
      });
      if (!trusted.ok) {
        if (options.notify && typeof global.notify === 'function') {
          global.notify(`⛔ صلاحية المالك مطلوبة — ${options.action || ''}`.trim(), 'danger');
        }
        return trusted;
      }
      return trusted;
    }
    const auth = requireAuthenticated(options);
    if (!auth.ok) return auth;
    const user = auth.user;
    if (user.isDev || global.RolePolicy?.isOrganizationOwner?.(user)) {
      return { ok: true, user };
    }
    if (options.notify && typeof global.notify === 'function') {
      global.notify(`⛔ صلاحية المالك مطلوبة — ${options.action || ''}`.trim(), 'danger');
    }
    return deny('owner_required', {
      reason: 'owner_required',
      userId: user.id,
      role: user.role,
      action: options.action,
      entity: 'owner_hub',
    });
  }

  function requireOwnerOrBootstrap(options) {
    options = options || {};
    if (global.OwnerTrustedAuthority?.assertOwnerOrBootstrap) {
      const trusted = global.OwnerTrustedAuthority.assertOwnerOrBootstrap({
        user: options.user,
        action: options.action,
        centerId: options.centerId,
        branchId: options.branchId,
      });
      if (!trusted.ok) {
        if (options.notify && typeof global.notify === 'function') {
          global.notify(`⛔ صلاحية المدير/المالك مطلوبة — ${options.action || ''}`.trim(), 'danger');
        }
        return trusted;
      }
      return trusted;
    }
    const auth = requireAuthenticated(options);
    if (!auth.ok) return auth;
    const user = auth.user;
    if (global.RolePolicy?.canManageOrganization?.(user)) return { ok: true, user };
    if (global.RolePolicy?.canBootstrapOwner?.(user)) return { ok: true, user };
    if (global.RolePolicy?.isManager?.(user) && !global.OwnerProfile?.hasProfile?.()) {
      return { ok: true, user };
    }
    if (options.notify && typeof global.notify === 'function') {
      global.notify(`⛔ صلاحية المدير/المالك مطلوبة — ${options.action || ''}`.trim(), 'danger');
    }
    return deny('owner_required', {
      reason: 'owner_or_bootstrap_required',
      userId: user.id,
      role: user.role,
      action: options.action,
    });
  }

  function canResolveConflicts(user) {
    user = authoritativeUser(user);
    if (!user) return false;
    if (user.isDev) return true;
    return !!global.RolePolicy?.isManager?.(user);
  }

  function requireConflictResolve(options) {
    return requireManager({ ...options, action: options?.action || 'conflict_resolve' });
  }

  function applyAuthoritativeSession() {
    if (global.RbacGuard?.applyAuthoritativeCurrentUser) {
      return global.RbacGuard.applyAuthoritativeCurrentUser();
    }
    return authoritativeUser();
  }

  global.OperationalRbacGuard = {
    authoritativeUser,
    requireAuthenticated,
    requireManager,
    requireOwner,
    requireOwnerOrBootstrap,
    requireConflictResolve,
    canResolveConflicts,
    applyAuthoritativeSession,
  };
})(typeof window !== 'undefined' ? window : globalThis);
