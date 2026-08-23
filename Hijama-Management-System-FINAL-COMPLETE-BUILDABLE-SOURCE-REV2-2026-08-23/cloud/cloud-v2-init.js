/**
 * Cloud V2 bootstrap — init (migrations, repository, meta, boot flow).
 */
(function (global) {
  'use strict';

  function init(options) {
    options = options || {};
    global.DbBridge?.install?.();

    if (!global.Repository && global.RepositoryFactory && global.DB) {
      global.Repository = global.RepositoryFactory.createRepository(
        global.RepositoryFactory.createLocalStorageAdapter(global.DB)
      );
    }

    const meta = global.CloudMeta?.loadMeta?.() || {};
    const enabled = options.force === true || global.CloudMeta?.isCloudV2Enabled?.() || meta.cloudV2Enabled;

    if (!enabled && !options.alwaysMigrateMeta) {
      return { ok: true, cloudV2: false, skipped: true };
    }

    global.DeviceConfig?.ensureDeviceUuid?.();

    let mig = { ok: true, ran: [] };
    try {
      global._migrationRunning = true;
      mig = global.MigrationRunner?.runMigrations?.() || { ok: true, ran: [] };
    } finally {
      global._migrationRunning = false;
    }

    const centerId = global.CenterId?.getStoredCenterId?.() || meta.centerId || '';
    if (centerId) {
      global.DeviceConfig?.ensureDeviceConfig?.({ centerId });
      global.DriveFolderRegistry?.ensureRegistry?.(centerId);
    }

    if (enabled) {
      global.BranchScope?.initSessionBranch?.();
      if (global.LicenseCloud?.loadLocal?.()) {
        global.DeviceRegistry?.registerDevice?.({}).catch(() => {});
        global.DeviceRegistry?.startHeartbeat?.();
      }
      global.BranchLockUI?.maybePromptBranchLock?.();
      setTimeout(() => {
        try { global.LegacyBranchMigrationUI?.maybePrompt?.(); } catch { /* empty */ }
      }, 1200);

      if (typeof stopLegacyDriveSync === 'function') stopLegacyDriveSync('Cloud V2 active');
      else if (typeof stopDriveSyncTimers === 'function') {
        try { stopDriveSyncTimers(); } catch { /* empty */ }
      }
    }
    let versions = global.VersionsIndex?.syncFromRepository?.(
      global.Repository,
      centerId,
      global.BranchScope?.getActiveBranchId?.()
    ) || global.VersionsIndex?.loadLocal?.(centerId);
    if (versions && centerId && !versions.centerId) {
      versions.centerId = centerId;
      global.VersionsIndex?.saveLocal?.(versions);
    }

    if (enabled) {
      global.DeviceCache?.snapshotFromLocal?.(global.BranchScope?.getActiveBranchId?.()).catch(() => {});

      if (global.DataStateAnalyzer?.analyze && global.DriveAdapter?.isConnected?.()) {
        global.DataStateAnalyzer.analyze({
          branchId: global.BranchScope?.getActiveBranchId?.()
        }).then(analysis => {
          if (analysis?.blocked) global.SyncGuard?.blockUnsafe?.(analysis);
          else if (!analysis?.offline) global.SyncGuard?.resume?.(analysis);
        }).catch(() => {});
      }

      if (!global.SyncGuard?.isPaused?.()) {
        global.SyncEngine?.start?.({ pollIntervalMs: global.SyncState?.load?.()?.pollIntervalMs });
      }
      global.BackupLayer?.start?.();
      global.AuditLogger?.flushToDrive?.().catch(() => {});

      const cfg = global.DeviceConfig?.load?.() || {};
      if (cfg.branchLocked && !global.CloudBootstrap?.isBootstrapComplete?.()) {
        global.CloudBootstrap?.runNewDeviceBootstrap?.({
          branchId: global.BranchScope?.getActiveBranchId?.(),
          startSync: false
        }).catch(() => {});
      }
    }

    return {
      ok: mig.ok !== false,
      cloudV2: !!enabled,
      meta: global.CloudMeta?.loadMeta?.(),
      migrations: mig,
      centerId,
      repository: !!global.Repository,
      deviceUuid: global.DeviceConfig?.load?.()?.deviceUuid || null,
      activeBranchId: global.BranchScope?.getActiveBranchId?.() || null,
      versions: global.VersionsIndex?.toDriveJson?.(versions) || versions,
      sync: global.SyncEngine?.getStatus?.() || null,
      backup: global.BackupLayer?.getStatus?.() || null
    };
  }

  function getMaxDevicesFromLicense() {
    return null;
  }

  function canUseCloudV2Sync() {
    const lic = global.LicenseCloud?.loadLocal?.();
    if (global.LicenseLimits?.isCloudSyncEligible?.(lic)) return true;
    const legacy = typeof global.licLoad === 'function' ? global.licLoad() : null;
    if (!legacy) return false;
    if (legacy.devices === 0 || legacy.device === 'DEVICE_ANY') return true;
    const feats = legacy.features || {};
    if (Object.keys(feats).some(k => feats[k] && /cloud|drive|multi|owner/i.test(k))) return true;
    if (Number(legacy.commercialMeta?.devices) === 0) return true;
    return false;
  }

  function isDriveConnectedForV2() {
    // Cloud V2 eligibility follows the verified main-process OAuth snapshot.
    // Renderer settings are display cache and must not auto-enable sync alone.
    return !!global.DriveAdapter?.isConnected?.();
  }

  /** Auto-enable when license allows cloud sync + Google Drive is linked. */
  function maybeAutoEnableCloudV2() {
    if (global.settings?.cloudV2UserDisabled) {
      return { ok: false, skipped: true, reason: 'user_disabled' };
    }
    if (global.CloudMeta?.isCloudV2Enabled?.()) {
      return { ok: true, already: true };
    }
    if (!canUseCloudV2Sync()) {
      return { ok: false, skipped: true, reason: 'cloud_sync_not_in_license' };
    }
    if (!isDriveConnectedForV2()) {
      return { ok: false, skipped: true, reason: 'drive_not_connected' };
    }

    global.CloudMeta?.setCloudV2Enabled?.(true);
    if (global.settings) {
      global.settings.cloudV2Enabled = true;
      if (!global.settings.cloudV2) global.settings.cloudV2 = {};
      global.settings.cloudV2.enabled = true;
      global.settings.cloudV2.autoEnabled = true;
      global.DB?.set?.('settings', global.settings);
    }

    const result = init({ force: true });
    const licDoc = global.LicenseCloud?.loadLocal?.();
    if (licDoc?.centerId) {
      global.LicenseCloud?.pushToDrive?.(licDoc).catch(() => {});
    }
    if (typeof global.notify === 'function') {
      global.notify('✅ Cloud V2 — مزامنة ونسخ بين الأجهزة (حتى مع فرع واحد)', 'success');
    }
    global.OwnerHub?.applyNavVisibility?.();
    if (typeof document !== 'undefined') {
      if (typeof global.renderCloudV2BackupStatus === 'function') global.renderCloudV2BackupStatus();
      if (typeof global.loadCloudV2PollIntervalUI === 'function') global.loadCloudV2PollIntervalUI();
    }
    return { ok: true, autoEnabled: true, ...result };
  }

  async function afterLicenseActivation(record, resolved) {
    if (!record || !global.LicenseCloud) return null;
    const existing = global.LicenseCloud.loadLocal?.() || null;
    const doc = await global.LicenseCloud.buildFromRecord(record, {
      centerName: global.settings?.centerName || existing?.centerName,
      features: resolved?.featureKeys ? Object.keys(resolved.featureKeys).filter(k => resolved.featureKeys[k]) : [],
      mergeLocal: true
    });
    // Keep activation consumed block from commitActivation
    if (existing?.activation?.consumed) {
      doc.activation = existing.activation;
    }
    if ((!doc.branches || !doc.branches.length) && existing?.branches?.length) {
      doc.branches = existing.branches;
    }
    if (!doc.branches || !doc.branches.filter((b) => b && b.active !== false).length) {
      const name = doc.centerName || 'الفرع الرئيسي';
      doc.branches = global.LicenseCloud.defaultBranches?.(1, name) || [
        { id: 'BR-MAIN', name, code: 'MAIN', active: true }
      ];
    }

    let signed = doc;
    if (global.LicenseCloud.resignDoc) {
      signed = await global.LicenseCloud.resignDoc({ ...doc, updatedAt: new Date().toISOString() });
    }
    global.LicenseCloud.saveLocal(signed);

    if (record && !record.centerId) {
      record.centerId = signed.centerId;
      const CL = global.CommercialLicense;
      if (CL?.store?.saveLicense) CL.store.saveLicense(record);
    }

    let drivePush = null;
    try {
      drivePush = typeof global.LicenseCloud.ensurePushedToDrive === 'function'
        ? await global.LicenseCloud.ensurePushedToDrive({ doc: signed })
        : await global.LicenseCloud.pushToDrive?.(signed);
    } catch (e) {
      drivePush = { ok: false, error: e.message || String(e) };
    }

    const auto = maybeAutoEnableCloudV2();
    if (auto?.ok || auto?.autoEnabled) {
      init({ force: true });
      setTimeout(() => global.BranchLockUI?.maybePromptBranchLock?.(), 600);
    }
    return { doc: signed, drivePush, auto };
  }

  global.CloudV2 = { init, afterLicenseActivation, maybeAutoEnableCloudV2, getMaxDevicesFromLicense, canUseCloudV2Sync, isDriveConnectedForV2 };
})(typeof window !== 'undefined' ? window : globalThis);
