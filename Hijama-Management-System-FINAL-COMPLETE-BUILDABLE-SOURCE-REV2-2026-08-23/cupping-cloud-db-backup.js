/**
 * Cloud DB Backup — renderer bridge (LevelDB snapshot via main process).
 * Pipeline: clinic.db → ZIP → AES-256 → Google Drive
 */
(function (global) {
  'use strict';

  function getElectronBackup() {
    return global.getCuppingElectron?.()?.backup || global.cuppingElectron?.backup;
  }

  async function getBackupMeta() {
    const api = global.getCuppingElectron?.()?.app;
    let runtime = {};
    if (api?.getRuntimeInfo) {
      try { runtime = await api.getRuntimeInfo(); } catch { /* ignore */ }
    }
    const cfg = global.settings?.backup?.cloudDb || {};
    const orgId = global.Organization?.getId?.()
      || global.CenterId?.getStoredCenterId?.()
      || '';
    const centerId = global.CenterId?.getStoredCenterId?.() || orgId || '';
    const branchId = global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    const ownerMode = global.OwnerBranchMode?.getMode?.() || 'owner';
    return {
      centerName: global.settings?.centerName || 'Center',
      appVersion: runtime.appVersion || '0',
      buildVersion: runtime.buildVersion || runtime.appVersion || '0',
      dbSchemaVersion: runtime.dbSchemaVersion || 0,
      deviceName: global.DeviceConfig?.load?.()?.deviceName || global.settings?.backup?.deviceName || 'Device',
      organizationId: orgId,
      centerId,
      branchId,
      ownerMode
    };
  }

  function denyV1(action) {
    return {
      ok: false,
      error: 'backup_v1_disabled',
      action: action || null,
      message: 'Backup V1 معطّل — استخدم Backup V2 لاستعادة الكوارث وCloud V2 للمزامنة',
    };
  }

  const CloudDbBackupBridge = {
    isElectron() { return !!getElectronBackup()?.uploadDbBackup; },

    /** V2-5.10: renderer bridge refuses V1 LevelDB DR (main IPC also denies). */
    isDisabled() {
      if (typeof global.isBackupV1CustomerUiDisabled === 'function') {
        return global.isBackupV1CustomerUiDisabled() !== false;
      }
      return true;
    },

    async uploadNow(password, mode) {
      if (CloudDbBackupBridge.isDisabled()) return denyV1('uploadNow');
      const api = getElectronBackup();
      if (!api?.uploadDbBackup) return { ok: false, message: 'متاح في Electron فقط' };
      const meta = await getBackupMeta();
      meta.backupMode = mode === 'manual' ? 'manual' : 'auto';
      meta.trigger = mode === 'manual' ? 'manual' : 'sync';
      return api.uploadDbBackup(password, meta);
    },

    async listBackups() {
      if (CloudDbBackupBridge.isDisabled()) return { ...denyV1('listBackups'), items: [] };
      const api = getElectronBackup();
      if (!api?.listDbBackups) return { ok: true, items: [] };
      return api.listDbBackups(await getBackupMeta());
    },

    async restore(_remotePath, _password, _relaunch) {
      return {
        ok: false,
        error: 'legacy_restore_disabled',
        code: 'LEGACY_RESTORE_DISABLED',
        message: 'Legacy LevelDB restore is disabled. Use Backup V2 atomic restore.',
      };
    },

    async syncNow(password) {
      if (CloudDbBackupBridge.isDisabled()) return denyV1('syncNow');
      const api = getElectronBackup();
      if (!api?.syncDbBackup) return { ok: false, message: 'متاح في Electron فقط' };
      return api.syncDbBackup(password, await getBackupMeta());
    },

    async verify(remotePath, expectedHash) {
      if (CloudDbBackupBridge.isDisabled()) return denyV1('verify');
      const api = getElectronBackup();
      if (!api?.verifyDbBackup) return { ok: false, message: 'غير متاح' };
      return api.verifyDbBackup(remotePath, expectedHash);
    },

    buildRemoteFolder(centerName) {
      const center = (centerName || global.settings?.centerName || 'Center').replace(/[<>:"|?*\\/]/g, '_').trim() || 'Center';
      return `NajjarTech Hijama Management/${center}`;
    },

    mainBackupFile: 'Hijama-Clinic-Backup.tdw'
  };

  global.CloudDbBackupBridge = CloudDbBackupBridge;
})(typeof window !== 'undefined' ? window : globalThis);
