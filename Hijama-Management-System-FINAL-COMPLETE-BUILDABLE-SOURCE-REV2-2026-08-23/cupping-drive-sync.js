/* ═══════════════════════════════════════════════════════════
   Cupping Center Drive Sync — رفع دوري + استعادة دورية
   Cloud V2: كل الأجهزة peers — لا primary/secondary
   ═══════════════════════════════════════════════════════════ */

const DRIVE_SYNC_LATEST = 'CuppingCenter-Sync-Latest.tdw';
const DRIVE_SYNC_META = 'CuppingCenter-Sync-Meta.json';

const defaultDriveSyncConfig = {
  enabled: false,
  uploadIntervalMin: 30,
  downloadIntervalMin: 15,
  autoRestore: false,
  encrypt: true,
  lastUploadAt: null,
  lastDownloadAt: null,
  lastRemoteHash: null,
  lastRemoteUpdatedAt: null,
  lastStatus: '',
  lastError: null
};

const defaultAltSyncConfig = {
  firebase: { enabled: false, projectId: '', apiKey: '', databaseURL: '', notes: '' },
  localServer: { enabled: false, baseUrl: '', apiKey: '', notes: '' },
  usbFolder: { enabled: false, path: '', notes: '' },
  manualFile: { enabled: false, watchPath: '', notes: 'استيراد يدوي من ملف' }
};

let _driveSyncUploadTimer = null;
let _driveSyncDownloadTimer = null;
let _driveSyncRunning = false;

/** Cloud V2: legacy file-level Drive sync is fully disabled (Decision 1A). */
function isLegacyDriveSyncBlocked() {
  return typeof CloudMeta !== 'undefined' && CloudMeta.isCloudV2Enabled?.();
}

function stopLegacyDriveSync(reason) {
  clearInterval(_driveSyncUploadTimer);
  clearInterval(_driveSyncDownloadTimer);
  _driveSyncUploadTimer = null;
  _driveSyncDownloadTimer = null;
  ensureDriveSyncSettings();
  if (settings.driveSync.enabled) {
    settings.driveSync.enabled = false;
    settings.driveSync.lastStatus = 'disabled_cloud_v2';
    settings.driveSync.lastError = reason || 'Cloud V2 active — use Sync Engine instead';
    DB.set('settings', settings);
  }
}

function ensureDriveSyncSettings() {
  if (typeof ensureBackupSettings === 'function') ensureBackupSettings();
  if (!settings.driveSync) settings.driveSync = JSON.parse(JSON.stringify(defaultDriveSyncConfig));
  else {
    settings.driveSync = { ...JSON.parse(JSON.stringify(defaultDriveSyncConfig)), ...settings.driveSync };
    if ('deviceRole' in settings.driveSync) delete settings.driveSync.deviceRole;
  }
  if (!settings.altSync) settings.altSync = JSON.parse(JSON.stringify(defaultAltSyncConfig));
  else {
    settings.altSync = { ...JSON.parse(JSON.stringify(defaultAltSyncConfig)), ...settings.altSync };
    Object.keys(defaultAltSyncConfig).forEach(k => {
      settings.altSync[k] = { ...defaultAltSyncConfig[k], ...(settings.altSync[k] || {}) };
    });
  }
}

async function hashSyncPayload(text) {
  const buf = new TextEncoder().encode(String(text).slice(0, 800000));
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function isDriveSyncCloudReady() {
  ensureDriveSyncSettings();
  const prov = settings.backup?.cloudProvider || 'google';
  return settings.driveSync.enabled && settings.backup?.cloudEnabled && settings.backup?.providers?.[prov]?.connected;
}

function canDriveSyncUpload() {
  ensureDriveSyncSettings();
  return isDriveSyncCloudReady();
}

function canDriveSyncDownload() {
  ensureDriveSyncSettings();
  return isDriveSyncCloudReady();
}

async function buildSyncBackupPayload() {
  const data = buildFullBackupObject();
  data._meta.syncAt = new Date().toISOString();
  data._meta.syncDevice = settings.backup?.deviceName || DeviceConfig?.load?.()?.deviceName || 'PC-MAIN';
  let payload = JSON.stringify(data);
  let encrypted = false;
  const useEncrypt = settings.driveSync.encrypt !== false && settings.backup?.encrypt !== false;
  if (useEncrypt && typeof encryptBackupPayload === 'function') {
    const pass = typeof getBackupPassword === 'function' ? await getBackupPassword() : null;
    if (!pass) throw new Error('كلمة مرور التشفير مطلوبة للمزامنة');
    payload = await encryptBackupPayload(payload, pass);
    encrypted = true;
  }
  const hash = await hashSyncPayload(payload);
  return { payload, hash, encrypted };
}

async function runDriveSyncUpload(trigger) {
  if (isLegacyDriveSyncBlocked()) {
    stopLegacyDriveSync('Cloud V2 active');
    return { ok: false, reason: 'cloud_v2_active', blocked: true };
  }
  if (!canDriveSyncUpload() || _driveSyncRunning) return { ok: false, reason: 'skipped' };
  _driveSyncRunning = true;
  ensureDriveSyncSettings();
  try {
    const { payload, hash, encrypted } = await buildSyncBackupPayload();
    const prov = settings.backup.cloudProvider || 'google';
    const meta = {
      updatedAt: new Date().toISOString(),
      device: settings.backup.deviceName || DeviceConfig?.load?.()?.deviceName || 'PC-MAIN',
      hash, encrypted, version: 1, trigger: trigger || 'auto'
    };
    const up = await BackupBridge.uploadSyncFile(payload, DRIVE_SYNC_LATEST, prov);
    if (!up?.ok) throw new Error(up?.message || 'فشل رفع ملف المزامنة');
    await BackupBridge.uploadSyncFile(JSON.stringify(meta, null, 2), DRIVE_SYNC_META, prov);
    settings.driveSync.lastUploadAt = meta.updatedAt;
    settings.driveSync.lastRemoteHash = hash;
    settings.driveSync.lastStatus = 'upload_ok';
    settings.driveSync.lastError = null;
    DB.set('settings', settings);
    if (typeof logBackupEntry === 'function') logBackupEntry('success', 'مزامنة Drive: رفع', trigger || 'sync_upload');
    if (typeof logAudit === 'function') logAudit('BACKUP_CREATED', `مزامنة Drive — رفع (${trigger || 'auto'})`, { hash });
    renderDriveSyncUI();
    return { ok: true, hash };
  } catch (e) {
    settings.driveSync.lastStatus = 'upload_fail';
    settings.driveSync.lastError = e.message || String(e);
    DB.set('settings', settings);
    if (typeof logBackupEntry === 'function') logBackupEntry('fail', 'مزامنة Drive: ' + settings.driveSync.lastError, trigger || 'sync_upload');
    renderDriveSyncUI();
    return { ok: false, error: settings.driveSync.lastError };
  } finally {
    _driveSyncRunning = false;
  }
}

async function runDriveSyncDownload(trigger) {
  if (isLegacyDriveSyncBlocked()) {
    stopLegacyDriveSync('Cloud V2 active');
    return { ok: false, reason: 'cloud_v2_active', blocked: true };
  }
  if (!canDriveSyncDownload() || _driveSyncRunning) return { ok: false, reason: 'skipped' };
  _driveSyncRunning = true;
  ensureDriveSyncSettings();
  try {
    const prov = settings.backup.cloudProvider || 'google';
    const metaRes = await BackupBridge.downloadSyncFile(DRIVE_SYNC_META, prov);
    if (!metaRes?.ok || !metaRes.text) throw new Error(metaRes?.message || 'لا توجد بيانات مزامنة على Drive');
    const meta = JSON.parse(metaRes.text);
    if (meta.hash && meta.hash === settings.driveSync.lastRemoteHash) {
      settings.driveSync.lastStatus = 'download_unchanged';
      DB.set('settings', settings);
      renderDriveSyncUI();
      return { ok: true, unchanged: true };
    }
    const fileRes = await BackupBridge.downloadSyncFile(DRIVE_SYNC_LATEST, prov);
    if (!fileRes?.ok) throw new Error(fileRes?.message || 'فشل تنزيل ملف المزامنة');
    let raw = fileRes.text || fileRes.payload;
    if (meta.encrypted && typeof decryptBackupPayload === 'function') {
      const pass = typeof getBackupPassword === 'function' ? await getBackupPassword() : null;
      if (!pass) throw new Error('كلمة مرور التشفير مطلوبة لفك المزامنة');
      const obj = typeof raw === 'string' && raw.trim().startsWith('{') ? JSON.parse(raw) : raw;
      raw = await decryptBackupPayload(obj, pass);
    }
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!settings.driveSync.autoRestore) {
      settings.driveSync.lastRemoteHash = meta.hash;
      settings.driveSync.lastRemoteUpdatedAt = meta.updatedAt;
      settings.driveSync.lastStatus = 'download_ready';
      DB.set('settings', settings);
      renderDriveSyncUI();
      return { ok: true, pending: true };
    }
    if (typeof SyncedWrite !== 'undefined' && SyncedWrite.restoreFromBackup) {
      const restoreRes = await SyncedWrite.restoreFromBackup(data, { source: 'legacy_drive_sync' });
      if (!restoreRes?.ok) throw new Error(restoreRes?.error || 'فشل استعادة البيانات عبر محرك الدمج');
      if (typeof refreshAfterBackupRestore === 'function') refreshAfterBackupRestore(data, restoreRes);
    } else {
      throw new Error('محرك الاستعادة غير متاح — أعد تشغيل البرنامج');
    }
    settings.driveSync.lastDownloadAt = new Date().toISOString();
    settings.driveSync.lastRemoteHash = meta.hash;
    settings.driveSync.lastRemoteUpdatedAt = meta.updatedAt;
    settings.driveSync.lastStatus = 'download_restored';
    settings.driveSync.lastError = null;
    DB.set('settings', settings);
    if (typeof logBackupEntry === 'function') logBackupEntry('success', 'مزامنة Drive: استعادة', trigger || 'sync_download');
    if (typeof logAudit === 'function') logAudit('BACKUP_RESTORED', `مزامنة Drive — استعادة (${trigger || 'auto'})`, { hash: meta.hash, device: meta.device });
    if (typeof refreshDashboard === 'function') refreshDashboard();
    if (typeof refreshDailyTable === 'function') refreshDailyTable();
    if (typeof refreshClientsView === 'function') refreshClientsView();
    renderDriveSyncUI();
    if (trigger === 'manual') notify('✅ تم تحديث البيانات من Drive');
    return { ok: true, restored: true };
  } catch (e) {
    settings.driveSync.lastStatus = 'download_fail';
    settings.driveSync.lastError = e.message || String(e);
    DB.set('settings', settings);
    if (typeof logBackupEntry === 'function') logBackupEntry('fail', 'مزامنة Drive: ' + settings.driveSync.lastError, trigger || 'sync_download');
    renderDriveSyncUI();
    if (trigger === 'manual') notify('⚠️ ' + settings.driveSync.lastError, 'danger');
    return { ok: false, error: settings.driveSync.lastError };
  } finally {
    _driveSyncRunning = false;
  }
}

function startDriveSyncTimers() {
  clearInterval(_driveSyncUploadTimer);
  clearInterval(_driveSyncDownloadTimer);
  if (isLegacyDriveSyncBlocked()) {
    stopLegacyDriveSync('Cloud V2 active');
    return;
  }
  ensureDriveSyncSettings();
  const s = settings.driveSync;
  if (!s.enabled) return;
  const upMin = parseInt(s.uploadIntervalMin, 10) || 0;
  const downMin = parseInt(s.downloadIntervalMin, 10) || 0;
  if (upMin > 0) {
    _driveSyncUploadTimer = setInterval(() => runDriveSyncUpload('auto'), upMin * 60 * 1000);
  }
  if (downMin > 0) {
    _driveSyncDownloadTimer = setInterval(() => runDriveSyncDownload('auto'), downMin * 60 * 1000);
  }
}

function saveDriveSyncSettingsFromUI() {
  ensureDriveSyncSettings();
  const s = settings.driveSync;
  s.enabled = !!document.getElementById('ds-enabled')?.checked;
  s.uploadIntervalMin = parseInt(document.getElementById('ds-upload-interval')?.value, 10) || 30;
  s.downloadIntervalMin = parseInt(document.getElementById('ds-download-interval')?.value, 10) || 15;
  s.autoRestore = document.getElementById('ds-auto-restore')?.checked !== false;
  s.encrypt = document.getElementById('ds-encrypt')?.checked !== false;
  DB.set('settings', settings);
  startDriveSyncTimers();
  renderDriveSyncUI();
  notify('✅ تم حفظ إعدادات مزامنة Drive');
}

function saveAltSyncSettingsFromUI() {
  ensureDriveSyncSettings();
  const alt = settings.altSync;
  alt.firebase.projectId = document.getElementById('alt-firebase-project')?.value?.trim() || '';
  alt.firebase.apiKey = document.getElementById('alt-firebase-key')?.value?.trim() || '';
  alt.firebase.databaseURL = document.getElementById('alt-firebase-url')?.value?.trim() || '';
  alt.localServer.baseUrl = document.getElementById('alt-server-url')?.value?.trim() || '';
  alt.localServer.apiKey = document.getElementById('alt-server-key')?.value?.trim() || '';
  alt.usbFolder.path = document.getElementById('alt-usb-path')?.value?.trim() || '';
  alt.manualFile.watchPath = document.getElementById('alt-manual-path')?.value?.trim() || '';
  DB.set('settings', settings);
  notify('✅ تم حفظ إعدادات الطرق البديلة (جاهزة للتفعيل لاحقاً)');
}

function renderDriveSyncUI() {
  ensureDriveSyncSettings();
  const s = settings.driveSync;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '—'; };
  const chk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
  const val = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  chk('ds-enabled', s.enabled);
  val('ds-upload-interval', s.uploadIntervalMin);
  val('ds-download-interval', s.downloadIntervalMin);
  chk('ds-auto-restore', s.autoRestore);
  chk('ds-encrypt', s.encrypt);
  set('ds-last-upload', s.lastUploadAt && typeof formatBackupDateTime === 'function' ? formatBackupDateTime(s.lastUploadAt) : (s.lastUploadAt || '—'));
  set('ds-last-download', s.lastDownloadAt && typeof formatBackupDateTime === 'function' ? formatBackupDateTime(s.lastDownloadAt) : (s.lastDownloadAt || '—'));
  set('ds-remote-updated', s.lastRemoteUpdatedAt && typeof formatBackupDateTime === 'function' ? formatBackupDateTime(s.lastRemoteUpdatedAt) : (s.lastRemoteUpdatedAt || '—'));
  const statusLabels = {
    upload_ok: '🟢 آخر رفع ناجح',
    download_restored: '🟢 آخر استعادة ناجحة',
    download_unchanged: '⚪ لا تغيير على Drive',
    download_ready: '🟡 نسخة جديدة — بانتظار الاستعادة',
    upload_fail: '🔴 فشل الرفع',
    download_fail: '🔴 فشل الاستعادة'
  };
  set('ds-status', statusLabels[s.lastStatus] || (s.enabled ? '⏳ مفعّل' : 'معطّل'));
  set('ds-error', s.lastError || '');
  const errEl = document.getElementById('ds-error-wrap');
  if (errEl) errEl.style.display = s.lastError ? '' : 'none';
}

function initDriveSyncUI() {
  if (isLegacyDriveSyncBlocked()) {
    stopLegacyDriveSync('Cloud V2 active');
    renderDriveSyncUI();
    return;
  }
  ensureDriveSyncSettings();
  renderDriveSyncUI();
  const alt = settings.altSync || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  set('alt-firebase-project', alt.firebase?.projectId);
  set('alt-firebase-key', alt.firebase?.apiKey);
  set('alt-firebase-url', alt.firebase?.databaseURL);
  set('alt-server-url', alt.localServer?.baseUrl);
  set('alt-server-key', alt.localServer?.apiKey);
  set('alt-usb-path', alt.usbFolder?.path);
  set('alt-manual-path', alt.manualFile?.watchPath);
  startDriveSyncTimers();
  if (!settings.driveSync.enabled) return;
  setTimeout(() => {
    if (canDriveSyncDownload()) runDriveSyncDownload('startup');
    else if (canDriveSyncUpload()) runDriveSyncUpload('startup');
  }, 8000);
}
