/**
 * V2-5.10 — Single Source of Truth for activation / setup lifecycle.
 * All UI (BootFlow, Login, Sync, Ready) must resolve visibility from getState().
 */
(function (global) {
  'use strict';

  const STATES = Object.freeze({
    UNINITIALIZED: 'UNINITIALIZED',
    GOOGLE_REQUIRED: 'GOOGLE_REQUIRED',
    LICENSE_REQUIRED: 'LICENSE_REQUIRED',
    CENTER_REQUIRED: 'CENTER_REQUIRED',
    BRANCH_REQUIRED: 'BRANCH_REQUIRED',
    DEVICE_REQUIRED: 'DEVICE_REQUIRED',
    DATA_SOURCE_REQUIRED: 'DATA_SOURCE_REQUIRED',
    RESTORE_IN_PROGRESS: 'RESTORE_IN_PROGRESS',
    SYNC_INITIALIZING: 'SYNC_INITIALIZING',
    OWNER_PASSWORD_CHANGE_REQUIRED: 'OWNER_PASSWORD_CHANGE_REQUIRED',
    RESTART_REQUIRED: 'RESTART_REQUIRED',
    READY: 'READY',
  });

  const BOOT_DONE_KEY = '__tdw_boot_complete__';
  const RESTART_REQUIRED_KEY = '__tdw_restart_required__';
  const RESTART_META_KEY = '__tdw_restart_meta__';

  function hasGoogle() {
    if (global.BootFlow?.hasGoogle) return !!global.BootFlow.hasGoogle();
    const snap = global.DriveAdapter?.authoritySnapshot?.();
    return !!(snap?.verified && snap?.connected && !snap?.needsReauth && !snap?.stale);
  }

  function hasLicense() {
    if (global.BootFlow?.hasValidLicense) return !!global.BootFlow.hasValidLicense();
    const cloud = global.LicenseCloud?.loadLocal?.();
    if (cloud?.centerId) return true;
    const lic = typeof global.licLoad === 'function' ? global.licLoad() : null;
    return !!(lic && global._licStatus !== 'expired' && global._licStatus !== 'blocked');
  }

  function hasCenter() {
    if (global.BootFlow?.hasCenterData) return !!global.BootFlow.hasCenterData();
    return !!(global.CenterId?.getStoredCenterId?.() || global.ConfigLayer?.getCenterId?.());
  }

  function hasBranch() {
    if (global.BootFlow?.hasBranch) return !!global.BootFlow.hasBranch();
    const branches = global.DB?.get?.('branches') || global.branches || [];
    return Array.isArray(branches) && branches.some((b) => b && b.active !== false);
  }

  function hasDevice() {
    if (global.BootFlow?.hasDeviceBranch) return !!global.BootFlow.hasDeviceBranch();
    const cfg = global.DeviceConfig?.load?.();
    return !!(cfg?.lockedBranchId && (cfg?.deviceName || cfg?.deviceUuid));
  }

  function hasDataSource() {
    if (global.BootFlow?.hasRestoreDecision) return !!global.BootFlow.hasRestoreDecision();
    const w = global.DB?.get?.('__tdw_boot_wizard__');
    return ['empty', 'cloud', 'skip_existing', 'local', 'file'].includes(w?.restoreChoice);
  }

  function hasSyncDone() {
    if (global.BootFlow?.hasSyncDone) return !!global.BootFlow.hasSyncDone();
    return !!global.DB?.get?.('__tdw_boot_wizard__')?.syncDone;
  }

  function bootDoneFlag() {
    try { return localStorage.getItem(BOOT_DONE_KEY) === '1'; } catch { return false; }
  }

  function readRestartMeta() {
    try {
      const raw = localStorage.getItem(RESTART_META_KEY) || localStorage.getItem(RESTART_REQUIRED_KEY);
      if (!raw) return null;
      if (raw === '1') return { required: true, at: null, attemptCount: 1, id: null };
      return JSON.parse(raw);
    } catch {
      return { required: true, at: null, attemptCount: 1, id: null };
    }
  }

  function markRestartRequired(reason) {
    const prev = readRestartMeta() || {};
    const meta = {
      required: true,
      at: new Date().toISOString(),
      reason: reason || 'setup_finalize',
      id: prev.id || `RST-${Date.now().toString(36)}`,
      attemptCount: Number(prev.attemptCount || 0),
      completedAt: null,
    };
    try {
      localStorage.setItem(RESTART_META_KEY, JSON.stringify(meta));
      localStorage.setItem(RESTART_REQUIRED_KEY, '1');
    } catch { /* empty */ }
    return meta;
  }

  /**
   * Consume restart marker once after relaunch. Prevents READY↔RESTART loops.
   */
  function consumeRestartMarker() {
    const meta = readRestartMeta();
    if (!meta || !meta.required) return { consumed: false, meta: null };
    const attemptCount = Number(meta.attemptCount || 0) + 1;
    const completed = {
      ...meta,
      required: false,
      completedAt: new Date().toISOString(),
      attemptCount,
      consumed: true,
    };
    try {
      localStorage.removeItem(RESTART_REQUIRED_KEY);
      localStorage.setItem(RESTART_META_KEY, JSON.stringify(completed));
      localStorage.setItem(BOOT_DONE_KEY, '1');
    } catch { /* empty */ }
    return {
      consumed: true,
      loopDetected: attemptCount > 3,
      meta: completed,
    };
  }

  function ownerPasswordChangeRequired() {
    const u = global.currentUser;
    if (!u) return false;
    if (typeof global.userMustChangePassword === 'function') return !!global.userMustChangePassword(u);
    return !!(u.mustChangePassword || u.seedDefaultPassword);
  }

  function resolveState(options) {
    options = options || {};
    const checks = {
      google: hasGoogle(),
      license: hasLicense(),
      center: hasCenter(),
      branch: hasBranch(),
      device: hasDevice(),
      dataSource: hasDataSource(),
      syncDone: hasSyncDone(),
      bootDoneFlag: bootDoneFlag(),
      ownerPasswordChangeRequired: ownerPasswordChangeRequired(),
    };

    const restart = readRestartMeta();
    if (restart?.required && !options.ignoreRestart) {
      // After successful prerequisites + sync, restart is the only remaining gate.
      if (checks.google && checks.license && checks.center && checks.device && checks.dataSource && checks.syncDone) {
        return { state: STATES.RESTART_REQUIRED, checks, restart };
      }
    }

    if (checks.ownerPasswordChangeRequired) {
      return { state: STATES.OWNER_PASSWORD_CHANGE_REQUIRED, checks, restart };
    }

    if (!checks.google) return { state: STATES.GOOGLE_REQUIRED, checks, restart };
    if (!checks.license) return { state: STATES.LICENSE_REQUIRED, checks, restart };
    if (!checks.center) return { state: STATES.CENTER_REQUIRED, checks, restart };
    if (!checks.branch) return { state: STATES.BRANCH_REQUIRED, checks, restart };
    if (!checks.device) return { state: STATES.DEVICE_REQUIRED, checks, restart };
    if (!checks.dataSource) return { state: STATES.DATA_SOURCE_REQUIRED, checks, restart };

    if (global.CloudDataDiscovery?.isRestoreLocked?.() || global.OwnerManagement?.isSystemBusy?.('restore')) {
      return { state: STATES.RESTORE_IN_PROGRESS, checks, restart };
    }

    if (!checks.syncDone) return { state: STATES.SYNC_INITIALIZING, checks, restart };

    // Durable completion: live checks + optional flag
    if (checks.google && checks.license && checks.center && checks.device && checks.dataSource && checks.syncDone) {
      return { state: STATES.READY, checks, restart };
    }

    return { state: STATES.UNINITIALIZED, checks, restart };
  }

  function getState(options) {
    options = options || {};
    const resolved = resolveState(options);
    const syncReadiness = global.SyncEngine?.getReadiness?.() || null;
    return {
      ...resolved,
      states: STATES,
      isReady: resolved.state === STATES.READY,
      needsBootFlow: ![STATES.READY, STATES.OWNER_PASSWORD_CHANGE_REQUIRED].includes(resolved.state),
      showLoginBootCta: ![STATES.READY, STATES.OWNER_PASSWORD_CHANGE_REQUIRED].includes(resolved.state),
      showCenterSupport: !!options.supportMode,
      syncReadiness,
      at: new Date().toISOString(),
    };
  }

  function markBootCompleteDurable() {
    try { localStorage.setItem(BOOT_DONE_KEY, '1'); } catch { /* empty */ }
    try {
      const w = global.DB?.get?.('__tdw_boot_wizard__') || {};
      w.setupCompletedAt = new Date().toISOString();
      global.DB?.set?.('__tdw_boot_wizard__', w);
    } catch { /* empty */ }
  }

  function visibilityFor(surface) {
    const s = getState();
    const ready = s.state === STATES.READY;
    switch (surface) {
      case 'login_boot_cta':
        return { show: s.showLoginBootCta };
      case 'google_connect':
        return { show: !s.checks.google };
      case 'license_activate':
        return { show: !s.checks.license };
      case 'center_setup':
        return { show: !s.checks.center && s.showCenterSupport };
      case 'bootflow':
        return { show: s.needsBootFlow };
      case 'ready_restart':
        return { show: s.state === STATES.RESTART_REQUIRED };
      case 'sync_manual':
        return { show: ready || s.state === STATES.SYNC_INITIALIZING };
      default:
        return { show: true, state: s.state };
    }
  }

  global.SetupStateService = {
    STATES,
    BOOT_DONE_KEY,
    RESTART_REQUIRED_KEY,
    RESTART_META_KEY,
    getState,
    resolveState,
    markRestartRequired,
    consumeRestartMarker,
    markBootCompleteDurable,
    visibilityFor,
    hasGoogle,
    hasLicense,
    hasCenter,
    hasBranch,
    hasDevice,
    hasDataSource,
    hasSyncDone,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.SetupStateService;
  }
})(typeof window !== 'undefined' ? window : globalThis);
