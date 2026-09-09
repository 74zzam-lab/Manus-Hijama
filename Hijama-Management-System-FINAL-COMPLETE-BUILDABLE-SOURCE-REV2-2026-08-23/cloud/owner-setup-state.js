/**
 * Owner Setup State (Phase 24/25 + V2-5.8 self-healing)
 * Tracks whether owner profile setup is required after activation / restore / migration.
 */
(function (global) {
  'use strict';

  const OWNER_SETUP_KEY = '__tdw_owner_setup__';

  const REASONS = {
    activation: 'activation',
    first_run: 'first_run',
    restore: 'restore',
    migration: 'migration',
    device_transfer: 'device_transfer',
    database_upgrade: 'database_upgrade',
    license_rebinding: 'license_rebinding',
    missing_owner: 'missing_owner'
  };

  function loadState() {
    const raw = global.DB?.get?.(OWNER_SETUP_KEY, null);
    if (!raw || typeof raw !== 'object') {
      return { required: false, reason: '', updatedAt: null, activatedAt: null };
    }
    return {
      required: !!raw.required,
      reason: String(raw.reason || ''),
      updatedAt: raw.updatedAt || null,
      activatedAt: raw.activatedAt || null
    };
  }

  function saveState(next) {
    const cur = loadState();
    const state = {
      ...cur,
      ...(next || {}),
      updatedAt: new Date().toISOString()
    };
    if (next && Object.prototype.hasOwnProperty.call(next, 'required')) {
      state.required = !!next.required;
    }
    global.DB?.set?.(OWNER_SETUP_KEY, state);
    return state;
  }

  function isRequired() {
    return !!loadState().required;
  }

  function markRequired(reason) {
    return saveState({
      required: true,
      reason: reason || REASONS.missing_owner,
      activatedAt: new Date().toISOString()
    });
  }

  function clearRequired() {
    return saveState({ required: false, reason: 'completed' });
  }

  function needsSetup() {
    if (global.OwnerManagement?.getOwnerState) {
      const s = global.OwnerManagement.getOwnerState().state;
      return s === 'NO_OWNER' || s === 'OWNER_CORRUPTED' || s === 'OWNER_RECOVERY_REQUIRED';
    }
    if (global.OwnerManagement?.needsOwnerBootstrap) {
      return !!global.OwnerManagement.needsOwnerBootstrap();
    }
    // Without OwnerManagement loaded: OwnerProfile presence is the setup signal.
    return !global.OwnerProfile?.hasProfile?.();
  }

  /**
   * V2-5.9: License/Google activation must NOT force Owner Bootstrap.
   * Owner is a seeded normal account; support may mark required explicitly.
   */
  function ensureFromActivation() {
    return clearRequired();
  }

  /**
   * Self-healing: if Organization has NO Owner, mark setup required.
   * Call after restore / migration / device transfer / DB upgrade / license rebinding.
   */
  function ensureMissingOwner(reason) {
    if (global.OwnerLifecycleAuthority?.ownerExistsInDb?.()) {
      return clearRequired();
    }
    if (global.OwnerLifecycleAuthority?.isCreateBlocked?.()) {
      return clearRequired();
    }
    if (!needsSetup()) return clearRequired();
    return markRequired(reason || REASONS.missing_owner);
  }

  global.OwnerSetupState = {
    OWNER_SETUP_KEY,
    REASONS,
    loadState,
    saveState,
    isRequired,
    markRequired,
    clearRequired,
    ensureFromActivation,
    ensureMissingOwner,
    needsSetup
  };
})(typeof window !== 'undefined' ? window : globalThis);
