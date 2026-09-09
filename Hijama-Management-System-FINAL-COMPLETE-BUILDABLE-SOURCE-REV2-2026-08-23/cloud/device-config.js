/**
 * Device config — local-only (__tdw_device_config__).
 */
(function (global) {
  'use strict';

  const DEVICE_CONFIG_KEY = '__tdw_device_config__';

  function load() {
    return global.DB?.get?.(DEVICE_CONFIG_KEY, null);
  }

  function save(cfg) {
    global.DB?.set?.(DEVICE_CONFIG_KEY, cfg);
    return cfg;
  }

  function ensureDeviceUuid() {
    let cfg = load() || {};
    if (!cfg.deviceUuid) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        cfg.deviceUuid = crypto.randomUUID();
      } else {
        cfg.deviceUuid = 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      }
      save(cfg);
    }
    return cfg.deviceUuid;
  }

  function ensureDeviceConfig(patch) {
    patch = patch || {};
    let cfg = load() || {};
    cfg.deviceUuid = cfg.deviceUuid || ensureDeviceUuid();
    if (patch.deviceName != null) cfg.deviceName = patch.deviceName;
    if (patch.centerId != null) cfg.centerId = patch.centerId;
    if (patch.lockedBranchId != null) cfg.lockedBranchId = patch.lockedBranchId;
    if (patch.branchLocked != null) cfg.branchLocked = !!patch.branchLocked;
    if (patch.lastViewBranchId != null) cfg.lastViewBranchId = patch.lastViewBranchId;
    if (patch.lastOwnerAggregate != null) cfg.lastOwnerAggregate = !!patch.lastOwnerAggregate;
    save(cfg);
    return cfg;
  }

  function getLockedBranchId() {
    return load()?.lockedBranchId || '';
  }

  function isBranchLocked() {
    const cfg = load();
    return !!(cfg && cfg.branchLocked && cfg.lockedBranchId);
  }

  function auditBranchLockChange(prev, next, options) {
    if (options?.skipAudit) return;
    const wasLocked = !!(prev?.branchLocked && prev?.lockedBranchId);
    const nowLocked = !!(next?.branchLocked && next?.lockedBranchId);
    if (wasLocked === nowLocked && String(prev?.lockedBranchId || '') === String(next?.lockedBranchId || '')) {
      return;
    }
    const action = nowLocked ? 'DEVICE_BRANCH_LOCKED' : 'DEVICE_BRANCH_UNLOCKED';
    global.AuditLogger?.logSyncEvent?.(action, {
      entity: 'device',
      entityId: next?.deviceUuid || prev?.deviceUuid || '',
      summary: nowLocked
        ? `Device locked to branch ${next.lockedBranchId}${next.deviceName ? ` (${next.deviceName})` : ''}`
        : `Device branch lock cleared (was ${prev?.lockedBranchId || '—'})`,
      meta: {
        beforeBranchId: prev?.lockedBranchId || '',
        afterBranchId: next?.lockedBranchId || '',
        branchLocked: nowLocked,
        activation: !!options?.activation,
        userId: global.currentUser?.id || '',
        role: global.currentUser?.role || ''
      }
    });
  }

  function applyBranchLock(branchId, locked, deviceName, options) {
    options = options || {};
    const prev = load() || {};
    const wasLocked = !!(prev.branchLocked && prev.lockedBranchId);
    const nextLocked = locked !== false;
    const nextBranchId = branchId != null ? String(branchId).trim() : String(prev.lockedBranchId || '').trim();
    const changingExisting = wasLocked && (
      !nextLocked
      || (nextBranchId && String(prev.lockedBranchId || '') !== nextBranchId)
    );
    const idempotentRelock = wasLocked && nextLocked
      && nextBranchId
      && String(prev.lockedBranchId || '') === nextBranchId;

    if (changingExisting && !options.activation) {
      if (!global.RolePolicy?.isOrganizationOwner?.(global.currentUser)) {
        global.AuditLogger?.logSyncEvent?.('DEVICE_BRANCH_LOCK_DENIED', {
          entity: 'device',
          entityId: prev.deviceUuid || '',
          summary: 'Branch lock change denied — organization owner required',
          meta: {
            requestedBranchId: nextBranchId,
            locked: nextLocked,
            currentBranchId: prev.lockedBranchId || '',
            userId: global.currentUser?.id || '',
            role: global.currentUser?.role || ''
          }
        });
        return { ok: false, error: 'owner_required', cfg: prev };
      }
    }

    if (idempotentRelock && !options.forceAudit) {
      const cfg = ensureDeviceConfig({
        lockedBranchId: nextBranchId,
        branchLocked: true,
        deviceName: deviceName || prev.deviceName
      });
      return { ok: true, cfg };
    }

    const cfg = ensureDeviceConfig({
      lockedBranchId: nextBranchId,
      branchLocked: nextLocked,
      deviceName: deviceName || prev.deviceName
    });

    if (!changingExisting || options.activation || global.RolePolicy?.isOrganizationOwner?.(global.currentUser)) {
      auditBranchLockChange(prev, cfg, options);
    }

    if (typeof global.BranchScope?.setActiveBranchId === 'function' && nextBranchId && nextLocked) {
      global.BranchScope.setActiveBranchId(nextBranchId);
    }
    return { ok: true, cfg };
  }

  function setBranchLock(branchId, locked, deviceName, options) {
    const result = applyBranchLock(branchId, locked, deviceName, options);
    return result.cfg;
  }

  function trySetBranchLock(branchId, locked, deviceName, options) {
    return applyBranchLock(branchId, locked, deviceName, options);
  }

  function needsBranchSelection() {
    const cfg = load() || {};
    return !cfg.lockedBranchId || !cfg.branchLocked;
  }

  function getCenterIdFromConfig() {
    const cfg = load();
    if (cfg?.centerId) return cfg.centerId;
    return global.CenterId?.getStoredCenterId?.() || global.LicenseCloud?.loadLocal?.()?.centerId || '';
  }

  /** Alias used by BootFlow — same as setBranchLock(branchId, true, deviceName). */
  async function lockToBranch(branchId, options) {
    options = options || {};
    const deviceName = options.deviceName || options.name || '';
    const result = applyBranchLock(branchId, true, deviceName, {
      activation: !!options.activation,
      skipAudit: options.skipAudit
    });
    if (!result.ok) {
      return { ok: false, error: result.error || 'owner_required' };
    }
    if (deviceName || options.centerId) {
      ensureDeviceConfig({
        deviceName: deviceName || undefined,
        centerId: options.centerId
      });
    }
    return { ok: true, branchId, deviceName, config: result.cfg };
  }

  global.DeviceConfig = {
    DEVICE_CONFIG_KEY,
    load,
    save,
    ensureDeviceUuid,
    ensureDeviceConfig,
    getLockedBranchId,
    isBranchLocked,
    setBranchLock,
    trySetBranchLock,
    lockToBranch,
    needsBranchSelection,
    getCenterIdFromConfig
  };
})(typeof window !== 'undefined' ? window : globalThis);
