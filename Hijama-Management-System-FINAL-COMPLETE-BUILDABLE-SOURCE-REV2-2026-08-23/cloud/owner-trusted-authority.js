/**
 * PR12 — Owner trusted mutation authority.
 * Enforces current RolePolicy + lifecycle binding; never trusts renderer role alone.
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
      error: error || 'owner_mutation_denied',
      code: truth?.code || error,
      userMessageAr: truth?.userMessageAr,
    };
  }

  function assertLifecycleReady() {
    const inv = global.OwnerLifecycleAuthority?.assertOwnerCountInvariant?.();
    if (inv && !inv.ok) {
      return deny('owner_corrupted', {
        reason: 'owner_count_invariant_violation',
        code: inv.code || inv.error,
        entity: 'owner_lifecycle',
      });
    }
    const state = global.OwnerManagement?.getOwnerState?.();
    if (state?.state === 'OWNER_CORRUPTED') {
      return deny('owner_corrupted', {
        reason: 'owner_corrupted',
        invariantViolation: state.invariantViolation || null,
        entity: 'owner_management',
      });
    }
    return { ok: true };
  }

  function assertSessionEpoch(user) {
    user = user || global.currentUser;
    if (!global.OwnerProfile?.isSessionEpochValid) return { ok: true };
    const profileEpoch = global.OwnerProfile.getSessionEpoch?.();
    if (!profileEpoch) return { ok: true };
    const claimedEpoch = Number(user?.sessionEpoch);
    if (!Number.isFinite(claimedEpoch)) {
      return deny('stale_session', {
        reason: 'session_epoch_missing',
        entity: 'owner_session',
      });
    }
    if (!global.OwnerProfile.isSessionEpochValid(claimedEpoch)) {
      return deny('stale_session', {
        reason: 'session_epoch_invalid',
        entity: 'owner_session',
      });
    }
    return { ok: true };
  }

  function assertOrgScope(options) {
    options = options || {};
    const localCenter = global.Organization?.getId?.()
      || global.CenterId?.getStoredCenterId?.()
      || global.LicenseCloud?.loadLocal?.()?.centerId
      || null;
    const targetCenter = options.centerId
      || options.doc?.centerId
      || global.LicenseCloud?.loadLocal?.()?.centerId
      || null;
    if (localCenter && targetCenter && String(localCenter) !== String(targetCenter)) {
      return deny('org_scope_denied', {
        reason: 'cross_org_denied',
        localCenter,
        targetCenter,
        entity: 'organization',
      });
    }
    if (options.branchId && global.RbacGuard?.requireBranchAccess) {
      const branchGate = global.RbacGuard.requireBranchAccess(options.branchId, options);
      if (!branchGate.ok) {
        return deny(branchGate.error || 'branch_access_denied', {
          reason: 'branch_access_denied',
          branchId: options.branchId,
          entity: 'branch',
        });
      }
    }
    if (options.deviceUuid && options.branchId) {
      const doc = global.LicenseCloud?.loadLocal?.();
      const dev = global.DeviceRegistry?.findDevice?.(doc, options.deviceUuid);
      if (dev?.branchId && String(dev.branchId) !== String(options.branchId)) {
        return deny('device_scope_denied', {
          reason: 'device_branch_mismatch',
          deviceUuid: options.deviceUuid,
          branchId: options.branchId,
          entity: 'device',
        });
      }
    }
    return { ok: true };
  }

  /**
   * Trusted Owner-only mutation gate (policy unchanged: owner + hq_admin via DB role).
   */
  function assertOwnerMutation(options) {
    options = options || {};
    let user = authoritativeUser(options.user);
    if (!user) {
      return deny('not_authenticated', { reason: 'not_authenticated', action: options.action });
    }
    if (global.RbacGuard?.rejectTamperedRole) {
      const tamper = global.RbacGuard.rejectTamperedRole(user);
      if (!tamper.ok) {
        return deny(tamper.error || 'tampered_role', {
          reason: 'tampered_role',
          userId: user.id,
          role: user.role,
          action: options.action,
        });
      }
      user = tamper.user || user;
    }
    if (!user.isDev && !global.RolePolicy?.isOrganizationOwner?.(user)) {
      return deny('owner_required', {
        reason: 'owner_required',
        userId: user.id,
        role: user.role,
        action: options.action,
        entity: options.entity || 'owner_mutation',
      });
    }
    const lifecycle = assertLifecycleReady();
    if (!lifecycle.ok) return lifecycle;
    const epoch = assertSessionEpoch(user);
    if (!epoch.ok) return epoch;
    const scope = assertOrgScope(options);
    if (!scope.ok) return scope;
    return { ok: true, user };
  }

  /**
   * Bootstrap exception per current policy: canBootstrapOwner / manager when no profile.
   */
  function assertOwnerOrBootstrap(options) {
    options = options || {};
    const ownerGate = assertOwnerMutation({ ...options, _bootstrapFallback: true });
    if (ownerGate.ok) return ownerGate;

    let user = authoritativeUser(options.user);
    if (!user) {
      return deny('not_authenticated', { reason: 'not_authenticated', action: options.action });
    }
    if (global.RbacGuard?.rejectTamperedRole) {
      const tamper = global.RbacGuard.rejectTamperedRole(user);
      if (!tamper.ok) return deny(tamper.error || 'tampered_role', { action: options.action });
      user = tamper.user || user;
    }
    if (user.isDev) return { ok: true, user, bootstrap: true };
    if (global.RolePolicy?.canBootstrapOwner?.(user)) {
      return { ok: true, user, bootstrap: true };
    }
    if (global.RolePolicy?.isManager?.(user) && !global.OwnerProfile?.hasProfile?.()) {
      return { ok: true, user, bootstrap: true };
    }
    return ownerGate;
  }

  function canPerformOwnerMutation(user) {
    return assertOwnerMutation({ user, action: 'probe' }).ok === true;
  }

  global.OwnerTrustedAuthority = {
    authoritativeUser,
    assertLifecycleReady,
    assertSessionEpoch,
    assertOrgScope,
    assertOwnerMutation,
    assertOwnerOrBootstrap,
    canPerformOwnerMutation,
  };
})(typeof window !== 'undefined' ? window : globalThis);
