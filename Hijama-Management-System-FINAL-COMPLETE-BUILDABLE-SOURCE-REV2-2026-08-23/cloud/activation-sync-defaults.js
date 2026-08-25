/**
 * V2-5.9 — Single Source of Truth for post-activation sync/backup defaults.
 * After Google + License + Branch binding: enable Cloud Sync, V2 Sync, local/cloud backup,
 * initial sync resume — without conflicting duplicate toggles.
 */
(function (global) {
  'use strict';

  function hasGoogle() {
    const prov = global.settings?.backup?.providers?.google;
    if (global.DriveAdapter?.isConnected?.()) return true;
    return !!(prov?.connected && !prov?.userDisconnected && prov?.oauth !== false);
  }

  function hasLicense() {
    const cloud = global.LicenseCloud?.loadLocal?.();
    if (cloud?.centerId) return true;
    const lic = typeof global.licLoad === 'function' ? global.licLoad() : null;
    return !!(lic && global._licStatus !== 'expired' && global._licStatus !== 'blocked');
  }

  function hasBranchBinding() {
    const cfg = global.DeviceConfig?.load?.();
    return !!(cfg?.lockedBranchId && (cfg?.deviceName || cfg?.deviceUuid));
  }

  function isActivationBound() {
    return hasGoogle() && hasLicense() && hasBranchBinding();
  }

  function getState() {
    const settings = global.settings || global.DB?.get?.('settings', {}) || {};
    const backup = settings.backup || {};
    const google = backup.providers?.google || {};
    return {
      googleConnected: hasGoogle(),
      licenseReady: hasLicense(),
      branchBound: hasBranchBinding(),
      activationBound: isActivationBound(),
      cloudEnabled: !!backup.cloudEnabled,
      cloudDbEnabled: !!(backup.cloudDb && backup.cloudDb.enabled !== false && backup.cloudDb.enabled),
      cloudV2: !!(global.CloudMeta?.isCloudV2Enabled?.() || settings.cloudV2Enabled),
      syncRunning: !!global.SyncEngine?.isRunning?.(),
      googleEmail: google.email || ''
    };
  }

  /**
   * Apply defaults when Google+License+Branch are satisfied.
   * Idempotent. Does not wipe outbox. Does not invent empty license.
   */
  function applyDefaults(options) {
    options = options || {};
    if (!isActivationBound() && !options.force) {
      return { ok: false, skipped: true, reason: 'activation_incomplete', state: getState() };
    }
    if (!global.settings) global.settings = global.DB?.get?.('settings', {}) || {};
    if (!global.settings.backup) global.settings.backup = {};
    const b = global.settings.backup;
    if (!b.providers) b.providers = {};
    if (!b.providers.google) b.providers.google = {};
    if (!b.cloudDb) b.cloudDb = {};

    b.cloudEnabled = true;
    b.cloudDb.enabled = true;
    if (b.cloudDb.autoBackup !== false) b.cloudDb.autoBackup = true;
    // Local auto backup must have a positive interval or startAutoBackupTimer no-ops.
    if (b.localAuto !== false) b.localAuto = true;
    if (b.localEnabled !== false) b.localEnabled = true;
    if (!(parseInt(b.autoIntervalMin, 10) > 0)) b.autoIntervalMin = 60;
    if (!(parseInt(b.cloudDb.autoIntervalMin, 10) > 0) && b.cloudDb.autoBackup) {
      b.cloudDb.autoIntervalMin = 60;
    }
    global.settings.cloudV2Enabled = true;
    global.DB?.set?.('settings', global.settings);

    try { global.CloudMeta?.setCloudV2Enabled?.(true); } catch { /* empty */ }
    try {
      if (typeof global.CloudMeta?.loadMeta === 'function') {
        const meta = global.CloudMeta.loadMeta() || {};
        meta.cloudV2Enabled = true;
        global.CloudMeta.saveMeta?.(meta);
      }
    } catch { /* empty */ }

    try { global.CloudV2?.maybeAutoEnableCloudV2?.(); } catch { /* empty */ }

    if (options.startSync !== false) {
      try {
        global.SyncGuard?.resume?.({ reason: 'activation_defaults' });
        if (global.SyncEngine?.start && !global.SyncEngine.isRunning?.()) {
          global.SyncEngine.start({
            pollIntervalMs: global.SyncState?.load?.()?.pollIntervalMs
          });
        }
      } catch { /* empty */ }
    }

    // Actually start backup services — flags alone are not enough.
    if (options.startBackup !== false) {
      try {
        global.BackupLayer?.start?.();
      } catch { /* empty */ }
      try {
        if (typeof global.startAutoBackupTimer === 'function') {
          global.startAutoBackupTimer();
        }
      } catch { /* empty */ }
      try {
        const api = global.cuppingElectron?.backup || global.tadawiElectron?.backup || global.BackupBridge;
        if (api?.v2ScheduleConfigure) {
          api.v2ScheduleConfigure({
            enabled: true,
            intervalMinutes: 60,
            cloudEnabled: true,
          }).catch?.(() => {});
        }
      } catch { /* empty */ }
    }

    try {
      global.AuditLogger?.logSyncEvent?.('SETTINGS_CHANGED', {
        summary: 'V2-5.10 activation sync/backup defaults applied + services started',
        meta: { activationBound: true }
      });
    } catch { /* empty */ }

    return { ok: true, state: getState() };
  }

  global.ActivationSyncDefaults = {
    hasGoogle,
    hasLicense,
    hasBranchBinding,
    isActivationBound,
    getState,
    applyDefaults
  };
})(typeof window !== 'undefined' ? window : globalThis);
