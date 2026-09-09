/**
 * PR8 — Single branch-context authority.
 *
 * Durable (process restart): DeviceConfig lockedBranchId, lastViewBranchId, lastOwnerAggregate.
 * Session (tab only): BranchContexts / BranchScope sessionStorage mirrors — not restart authority.
 */
(function (global) {
  'use strict';

  const AGGREGATE_MARKERS = new Set(['*', '__ALL__']);

  function normalizeBranchId(value) {
    const bid = String(value || '').trim();
    if (!bid || AGGREGATE_MARKERS.has(bid)) return null;
    return bid;
  }

  function lockedBranchId() {
    if (global.DeviceConfig?.isBranchLocked?.()) {
      return normalizeBranchId(global.DeviceConfig.getLockedBranchId?.());
    }
    return normalizeBranchId(global.DeviceConfig?.load?.()?.lockedBranchId);
  }

  function allowedBranchIds(user) {
    user = user || global.currentUser;
    if (!user) {
      const locked = lockedBranchId();
      return locked ? [locked] : [];
    }
    if (global.BranchScope?.getUserBranchScope) {
      const scope = global.BranchScope.getUserBranchScope(user) || [];
      if (scope.includes('*')) {
        const enrolled = (global.LicenseCloud?.loadLocal?.()?.branches || [])
          .filter((b) => b && b.active !== false)
          .map((b) => b.id);
        return enrolled.length ? enrolled : scope.filter((id) => !AGGREGATE_MARKERS.has(id));
      }
      return scope.map(normalizeBranchId).filter(Boolean);
    }
    const locked = lockedBranchId();
    return locked ? [locked] : [];
  }

  function isOwnerAggregateMode(user) {
    user = user || global.currentUser;
    const active = normalizeBranchId(global.BranchScope?.getActiveBranchId?.())
      || (AGGREGATE_MARKERS.has(String(global.BranchScope?.getActiveBranchId?.() || '')) ? '*' : null);
    if (active === '*' || String(global.BranchScope?.getActiveBranchId?.()) === '__ALL__') return true;
    if (
      global.OwnerBranchMode?.isOwnerMode?.()
      && (global.RolePolicy?.isOrganizationOwner?.(user)
        || String(user?.role || '').toLowerCase() === 'owner')
      && !global.BranchContexts?.getOperationalWriteBranch?.()
    ) {
      return true;
    }
    const cfg = global.DeviceConfig?.load?.() || {};
    if (cfg.lastOwnerAggregate === true && !global.BranchContexts?.getOperationalWriteBranch?.()) {
      return global.RolePolicy?.isOrganizationOwner?.(user)
        || String(user?.role || '').toLowerCase() === 'owner';
    }
    return false;
  }

  function activeBranchId(user) {
    if (isOwnerAggregateMode(user)) return '*';
    const sessionActive = global.BranchScope?.getActiveBranchId?.();
    const viewBid = sessionActive && !AGGREGATE_MARKERS.has(String(sessionActive))
      ? normalizeBranchId(sessionActive)
      : null;
    const write = normalizeBranchId(global.BranchContexts?.getOperationalWriteBranch?.());
    // Device-locked view-only: show selected view branch; writes stay on locked branch.
    if (viewBid && write && viewBid !== write && isBranchAllowed(user, viewBid)) {
      return viewBid;
    }
    if (write) return write;
    if (viewBid && isBranchAllowed(user, viewBid)) return viewBid;
    const durable = normalizeBranchId(global.DeviceConfig?.load?.()?.lastViewBranchId);
    if (durable && isBranchAllowed(user, durable)) return durable;
    const locked = lockedBranchId();
    if (locked) return locked;
    return null;
  }

  function operationalWriteBranchId(user) {
    if (isOwnerAggregateMode(user)) return null;
    return normalizeBranchId(global.BranchContexts?.getOperationalWriteBranch?.()) || activeBranchId(user);
  }

  function isBranchAllowed(user, branchId) {
    const bid = normalizeBranchId(branchId);
    if (!bid) return false;
    const allowed = allowedBranchIds(user);
    if (!allowed.length) return false;
    if (allowed.includes('*')) return true;
    return allowed.includes(bid);
  }

  function assertSwitchAllowed(user, targetBranchId) {
    user = user || global.currentUser;
    if (targetBranchId === '__ALL__' || targetBranchId === '*') {
      if (!global.BranchScope?.canUserSwitchBranch?.(user)) {
        return { ok: false, error: 'branch_switch_denied' };
      }
      return { ok: true, aggregate: true };
    }
    const bid = normalizeBranchId(targetBranchId);
    if (!bid) return { ok: false, error: 'branch_id_required' };
    if (global.DeviceConfig?.isBranchLocked?.()) {
      const locked = lockedBranchId();
      if (locked && locked !== bid) {
        const canViewSwitch = global.BranchScope?.canUserSwitchBranch?.(user)
          || global.RolePolicy?.isOrganizationOwner?.(user)
          || String(user?.role || '').toLowerCase() === 'owner';
        if (!canViewSwitch) {
          return { ok: false, error: 'device_branch_locked', lockedBranchId: locked };
        }
        return { ok: true, branchId: bid, viewOnly: true, deviceLockedBranchId: locked };
      }
    }
    if (!isBranchAllowed(user, bid)) {
      return { ok: false, error: 'branch_access_denied', branchId: bid };
    }
    return { ok: true, branchId: bid };
  }

  function persistDurableViewState(user) {
    const cfg = global.DeviceConfig?.load?.() || {};
    const patch = { ...cfg };
    if (isOwnerAggregateMode(user)) {
      patch.lastOwnerAggregate = true;
      patch.lastViewBranchId = '';
    } else {
      const bid = activeBranchId(user);
      patch.lastOwnerAggregate = false;
      if (bid) patch.lastViewBranchId = bid;
    }
    global.DeviceConfig?.save?.(patch);
    return patch;
  }

  /**
   * Restore branch contexts after true process restart — durable authority first.
   * Returns { ok, branchId, aggregate, error } — fail-closed (no silent BR-MAIN).
   */
  function restoreFromDurable(user) {
    user = user || global.currentUser;
    if (!user) {
      const locked = lockedBranchId();
      if (locked) {
        global.BranchScope?.setActiveBranchId?.(locked);
        global.BranchContexts?.setOperationalWriteBranch?.(locked, { bindDevice: false });
        return { ok: true, branchId: locked, source: 'device_lock' };
      }
      return { ok: false, error: 'branch_context_missing' };
    }

    const cfg = global.DeviceConfig?.load?.() || {};
    const locked = lockedBranchId();

    if (!global.BranchScope?.canUserSwitchBranch?.(user)) {
      if (!locked) {
        return { ok: false, error: 'branch_context_missing' };
      }
      global.BranchScope?.setActiveBranchId?.(locked);
      global.BranchContexts?.setOperationalWriteBranch?.(locked, { bindDevice: false });
      try { global.OwnerBranchMode?.exitToOwnerMode?.(); } catch { /* empty */ }
      return { ok: true, branchId: locked, source: 'device_lock' };
    }

    if (cfg.lastOwnerAggregate === true) {
      global.BranchScope?.setActiveBranchId?.('*');
      global.BranchContexts?.clearOperationalWriteBranch?.();
      try { global.OwnerBranchMode?.exitToOwnerMode?.(); } catch { /* empty */ }
      return { ok: true, aggregate: true, source: 'durable_aggregate' };
    }

    const candidate = normalizeBranchId(cfg.lastViewBranchId) || locked;
    if (!candidate || !isBranchAllowed(user, candidate)) {
      const fallback = allowedBranchIds(user)[0] || locked;
      if (!fallback) return { ok: false, error: 'branch_context_missing' };
      global.BranchScope?.setActiveBranchId?.(fallback);
      global.BranchContexts?.setOperationalWriteBranch?.(fallback, { bindDevice: false });
      try { global.OwnerBranchMode?.enterBranchMode?.(fallback); } catch { /* empty */ }
      return { ok: true, branchId: fallback, source: 'allowed_fallback' };
    }

    global.BranchScope?.setActiveBranchId?.(candidate);
    global.BranchContexts?.setOperationalWriteBranch?.(candidate, { bindDevice: false });
    try { global.OwnerBranchMode?.enterBranchMode?.(candidate); } catch { /* empty */ }
    return { ok: true, branchId: candidate, source: 'durable_view' };
  }

  function snapshot(user) {
    user = user || global.currentUser;
    return {
      lockedBranchId: lockedBranchId(),
      allowedBranchIds: allowedBranchIds(user),
      activeBranchId: activeBranchId(user),
      operationalWriteBranchId: operationalWriteBranchId(user),
      ownerAggregateMode: isOwnerAggregateMode(user),
      scopeGeneration: global.BranchSwitchCache?.getScopeGeneration?.() || 0,
    };
  }

  global.BranchAuthority = {
    normalizeBranchId,
    lockedBranchId,
    allowedBranchIds,
    activeBranchId,
    operationalWriteBranchId,
    isOwnerAggregateMode,
    isBranchAllowed,
    assertSwitchAllowed,
    persistDurableViewState,
    restoreFromDurable,
    snapshot,
  };
})(typeof window !== 'undefined' ? window : globalThis);
