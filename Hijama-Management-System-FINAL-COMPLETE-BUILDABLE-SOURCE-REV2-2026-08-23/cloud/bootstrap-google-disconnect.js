/**
 * RC Hotfix Round 2 — disconnect Google during incomplete bootstrap (wizard only).
 * Clears Google-derived identity; does not wipe pre-existing local clinic data.
 */
(function (global) {
  'use strict';

  const WIZARD_KEY = '__tdw_boot_wizard__';
  const STEPS_AFTER_GOOGLE = ['license', 'organization', 'branch', 'branch_select', 'restore', 'sync', 'ready'];

  function loadWizardRaw() {
    try {
      return JSON.parse(global.localStorage?.getItem(WIZARD_KEY) || 'null') || {};
    } catch {
      return {};
    }
  }

  function saveWizardRaw(w) {
    try { global.localStorage?.setItem(WIZARD_KEY, JSON.stringify(w)); } catch { /* empty */ }
  }

  async function disconnectOAuthTokens() {
    const prov = global.settings?.backup?.cloudProvider || 'google';
    if (global.BackupBridge?.disconnectCloud) {
      try { await global.BackupBridge.disconnectCloud(prov); } catch { /* empty */ }
    }
    if (!global.settings) global.settings = global.DB?.get?.('settings', {}) || {};
    if (!global.settings.backup) global.settings.backup = {};
    if (!global.settings.backup.providers) global.settings.backup.providers = {};
    global.settings.backup.providers.google = {
      connected: false,
      email: '',
      path: '',
      tokenEnc: '',
      oauth: false,
      lastSync: null,
      userDisconnected: true,
    };
    global.settings.backup.cloudEnabled = false;
    global.DB?.set?.('settings', global.settings);
    try {
      global.DriveAdapter?.persistAuthorityStatus?.(
        { connected: false, needsReauth: false, email: '' },
        'user_disconnect'
      );
    } catch { /* fail closed: BootFlow still sees userDisconnected */ }
  }

  async function clearGoogleDerivedBootstrapState() {
    try { global.CloudDataDiscovery?.cancelDiscovery?.(); } catch { /* empty */ }
    try { global.CloudDataDiscovery?.cancelRestore?.(); } catch { /* empty */ }
    const bootstrapKeys = [
      '__tdw_cloud_license__',
      '__tdw_meta__',
      '__tdw_drive_folders__',
      '__tdw_sync_state__',
      '__tdw_sync_guard__',
      '__tdw_sync_baseline__',
    ];
    bootstrapKeys.forEach((k) => {
      try { global.DB?.remove?.(k); } catch { /* empty */ }
      try { global.localStorage?.removeItem(k); } catch { /* empty */ }
    });
    try {
      if (global.settings) {
        delete global.settings.centerId;
        delete global.settings.centerName;
        delete global.settings.organizationId;
        if (global.settings.backup) {
          global.settings.backup.cloudEnabled = false;
        }
        global.DB?.set?.('settings', global.settings);
      }
    } catch { /* empty */ }
    try {
      if (global.DeviceConfig?.load && global.DeviceConfig?.save) {
        const dc = global.DeviceConfig.load() || {};
        delete dc.centerId;
        delete dc.lockedBranchId;
        delete dc.branchLocked;
        delete dc.pendingBranchEnrollment;
        delete dc.pendingDeviceName;
        delete dc.lastViewBranchId;
        delete dc.lastOwnerAggregate;
        global.DeviceConfig.save(dc);
      }
    } catch { /* empty */ }
    try {
      await global.SyncBaseline?.enterReconciliationRequired?.({ source: 'google_disconnect' });
    } catch { /* fail closed through bootstrap reset below */ }
    try { global.OwnerLifecycleAuthority?.clearRestorePreserve?.(); } catch { /* empty */ }

    const w = loadWizardRaw();
    w.restoreChoice = null;
    w.cloudDiscovery = null;
    w.syncDone = false;
    w.completedSteps = (w.completedSteps || []).filter((s) => s === 'language' || s === 'google');
    STEPS_AFTER_GOOGLE.forEach((s) => {
      const i = w.completedSteps.indexOf(s);
      if (i >= 0) w.completedSteps.splice(i, 1);
    });
    // BootFlow indexes its route arrays numerically. Persist the canonical Google
    // index (language=0, google=1) rather than the old string step id.
    w.currentStep = 1;
    try { global.DB?.set?.(WIZARD_KEY, w); } catch { /* localStorage compatibility remains below */ }
    saveWizardRaw(w);

    try { global.localStorage?.removeItem('__tdw_boot_complete__'); } catch { /* empty */ }
  }

  /**
   * Full bootstrap Google disconnect — only when wizard incomplete / not READY.
   */
  async function disconnectGoogleDuringBootstrap(options = {}) {
    if (global.BootFlow?.isBootComplete?.() && !options.force) {
      return { ok: false, error: 'bootstrap_complete_use_owner_flow' };
    }
    await disconnectOAuthTokens();
    await clearGoogleDerivedBootstrapState();
    try { global.DriveAdapter?.refresh?.(); } catch { /* empty */ }
    return { ok: true, step: 'google' };
  }

  global.BootstrapGoogleDisconnect = {
    disconnectGoogleDuringBootstrap,
    clearGoogleDerivedBootstrapState,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.BootstrapGoogleDisconnect;
  }
})(typeof window !== 'undefined' ? window : globalThis);
