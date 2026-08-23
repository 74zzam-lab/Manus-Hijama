/**
 * Backups Layer — daily Auto snapshots on Drive V2 (Cloud V2 Sprint 5).
 */
(function (global) {
  'use strict';

  const CHECK_INTERVAL_MS = 60 * 60 * 1000;
  const AUTO_HOUR = 2;

  let _timer = null;

  function ensureCloudV2Settings() {
    if (!global.settings) return;
    if (!global.settings.cloudV2) global.settings.cloudV2 = {};
    if (global.settings.cloudV2.autoBackupEnabled == null) {
      global.settings.cloudV2.autoBackupEnabled = true;
    }
    global.DB?.set?.('settings', global.settings);
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function autoBackupPath(centerId, dateKey, branchId) {
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    if (global.DriveLayout?.backupAutoFile) {
      return global.DriveLayout.backupAutoFile(centerId, dateKey, branchId);
    }
    const dir = global.DriveLayout?.backupAutoDir?.(centerId, branchId) || `NajjarTech/${centerId}/Backup`;
    return `${dir}/${dateKey}.tdw`;
  }

  function canRunAuto() {
    if (!global.CloudMeta?.isCloudV2Enabled?.()) return false;
    ensureCloudV2Settings();
    if (global.settings.cloudV2.autoBackupEnabled === false) return false;
    if (!global.DriveAdapter?.isConnected?.()) return false;
    return true;
  }

  function isDue() {
    const last = global.settings?.cloudV2?.lastAutoBackupDate;
    if (last === todayKey()) return false;
    const h = new Date().getHours();
    return h >= AUTO_HOUR;
  }

  async function resolvePayload() {
    if (typeof global.buildFullBackupObject !== 'function') return null;
    const data = global.buildFullBackupObject();
    data._meta.backupLayer = 'v2-auto';
    data._meta.centerId = global.ConfigLayer?.getCenterId?.() || '';
    data._meta.organizationId = global.Organization?.getId?.()
      || data._meta.centerId
      || global.CenterId?.getStoredCenterId?.()
      || '';
    data._meta.branchId = global.BranchScope?.getActiveBranchId?.() || data._meta.branchId || 'BR-MAIN';
    data._meta.ownerMode = global.OwnerBranchMode?.getMode?.() || data._meta.ownerMode || 'owner';
    let payload = JSON.stringify(data, null, 2);
    let encrypted = false;

    const cfg = global.settings?.backup || {};
    if (cfg.encrypt !== false && typeof global.encryptBackupPayload === 'function') {
      const pass = global._backupSessionKey || null;
      if (pass) {
        payload = await global.encryptBackupPayload(payload, pass);
        encrypted = true;
      } else {
        return { skip: true, reason: 'no_backup_password_session' };
      }
    }

    return { payload, encrypted };
  }

  async function runAutoBackup(force) {
    if (!canRunAuto()) return { ok: false, skipped: true };
    if (!force && !isDue()) return { ok: false, skipped: true, reason: 'not_due' };

    const centerId = global.ConfigLayer?.getCenterId?.() || '';
    if (!centerId) return { ok: false, error: 'no_center_id' };

    const dateKey = todayKey();
    const built = await resolvePayload();
    if (built?.skip) return { ok: false, skipped: true, reason: built.reason };
    if (!built?.payload) return { ok: false, error: 'no_payload' };

    const remotePath = autoBackupPath(centerId, dateKey);
    const filename = `${dateKey}.tdw`;
    const up = await global.DriveAdapter.uploadJson(remotePath, built.payload, { overwrite: true });

    if (!up?.ok) {
      global.SyncState?.setError?.(up?.message || up?.error || 'auto_backup_failed');
      return up;
    }

    ensureCloudV2Settings();
    global.settings.cloudV2.lastAutoBackupDate = dateKey;
    global.settings.cloudV2.lastAutoBackupAt = new Date().toISOString();
    global.settings.cloudV2.lastAutoBackupPath = remotePath;
    global.DB?.set?.('settings', global.settings);

    if (typeof global.AuditLogger?.log === 'function') {
      global.AuditLogger.log({
        action: 'BACKUP_CREATED',
        entity: 'backup',
        entityId: dateKey,
        summary: `نسخة Auto يومية — ${filename}${built.encrypted ? ' (مشفّرة)' : ''}`
      });
    }

    return { ok: true, dateKey, remotePath, encrypted: built.encrypted };
  }

  function start() {
    stop();
    if (!global.CloudMeta?.isCloudV2Enabled?.()) return { ok: false, skipped: true };
    _timer = setInterval(() => { runAutoBackup(false).catch(() => {}); }, CHECK_INTERVAL_MS);
    setTimeout(() => { runAutoBackup(false).catch(() => {}); }, 15000);
    return { ok: true };
  }

  function stop() {
    if (_timer) {
      clearInterval(_timer);
      _timer = null;
    }
  }

  function getStatus() {
    ensureCloudV2Settings();
    const cv2 = global.settings?.cloudV2 || {};
    return {
      enabled: cv2.autoBackupEnabled !== false,
      lastAutoBackupDate: cv2.lastAutoBackupDate || null,
      lastAutoBackupAt: cv2.lastAutoBackupAt || null,
      lastAutoBackupPath: cv2.lastAutoBackupPath || null,
      due: isDue(),
      canRun: canRunAuto()
    };
  }

  global.BackupLayer = {
    CHECK_INTERVAL_MS,
    AUTO_HOUR,
    autoBackupPath,
    runAutoBackup,
    start,
    stop,
    getStatus,
    isDue,
    canRunAuto
  };
})(typeof window !== 'undefined' ? window : globalThis);
