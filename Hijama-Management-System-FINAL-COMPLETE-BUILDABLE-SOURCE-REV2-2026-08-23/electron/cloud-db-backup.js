/**
 * Google Drive — full clinic DB backup (ZIP + AES-256) — no JSON export.
 */
const path = require('path');
const { app, session } = require('electron');
const clinicSnapshot = require('./clinic-snapshot');
const backupCrypto = require('./backup-crypto');
const cloud = require('./cloud-providers/cloud-service');
const drivePaths = require('./cloud-drive-paths');

const MAX_MANUAL_BACKUPS = 20;

function resolveBackupMode(meta) {
  return meta?.backupMode === 'manual' || meta?.trigger === 'manual' ? 'manual' : 'auto';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function flushStorage() {
  try {
    await session.defaultSession.flushStorageData();
    await wait(350);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function createEncryptedBackupPackage(password, meta) {
  await flushStorage();
  const zipBuf = clinicSnapshot.createClinicZipBuffer(meta);
  const encBuf = backupCrypto.encryptBuffer(zipBuf, password);
  const mode = resolveBackupMode(meta);
  const filename = mode === 'manual'
    ? drivePaths.buildManualBackupFilename()
    : drivePaths.MAIN_BACKUP_FILE;
  const hash = backupCrypto.sha256Hex(encBuf);
  const remoteFolder = drivePaths.buildRemoteFolder(meta);
  const remotePath = `${remoteFolder}/${filename}`;
  return {
    filename,
    backupMode: mode,
    zipSize: zipBuf.length,
    encryptedSize: encBuf.length,
    hash,
    payload: encBuf.toString('base64'),
    buffer: encBuf,
    remoteFolder,
    remotePath,
    overwrite: mode === 'auto'
  };
}

async function uploadDbBackup(password, meta) {
  const pkg = await createEncryptedBackupPackage(password, meta);
  const uploadMeta = {
    brand: 'NajjarTech',
    centerName: meta?.centerName || 'Center',
    filename: pkg.filename,
    hash: pkg.hash,
    size: pkg.encryptedSize,
    zipSize: pkg.zipSize,
    encrypted: true,
    pipeline: 'clinic.db→zip→aes256',
    appVersion: meta?.appVersion,
    dbSchemaVersion: meta?.dbSchemaVersion,
    remotePath: pkg.remotePath,
    overwrite: pkg.overwrite,
    backupMode: pkg.backupMode
  };
  const result = await cloud.uploadCloud(pkg.buffer, pkg.filename, 'google', uploadMeta);
  if (result.ok && pkg.backupMode === 'manual') await pruneManualBackups(meta);
  return {
    ...result,
    filename: result.filename || pkg.filename,
    hash: pkg.hash,
    zipSize: pkg.zipSize,
    encryptedSize: pkg.encryptedSize,
    remotePath: result.remotePath || result.path || pkg.remotePath,
    backupMode: pkg.backupMode,
    overwritten: pkg.overwrite && result.ok
  };
}

async function listDbBackups(meta) {
  const prefix = drivePaths.buildRemoteFolder(meta);
  const res = await cloud.listCloudBackups('google', prefix);
  if (!res.ok) return res;
  const items = (res.items || [])
    .filter(it => drivePaths.isDbBackupName(it.name))
    .sort((a, b) => {
      if (drivePaths.isMainBackupName(a.name) && !drivePaths.isMainBackupName(b.name)) return -1;
      if (!drivePaths.isMainBackupName(a.name) && drivePaths.isMainBackupName(b.name)) return 1;
      return (b.modifiedAt || '').localeCompare(a.modifiedAt || '');
    });
  return { ok: true, items, prefix, mainFile: drivePaths.MAIN_BACKUP_FILE };
}

async function findPrimaryBackup(meta) {
  const list = await listDbBackups(meta);
  if (!list.ok) return list;
  const main = list.items.find(it => drivePaths.isMainBackupName(it.name));
  if (main) return { ok: true, item: main, items: list.items };
  if (list.items.length) return { ok: true, item: list.items[0], items: list.items };
  return { ok: false, message: 'لا توجد نسخ على Drive', items: [] };
}

async function downloadDbBackup(remotePath) {
  const dl = await cloud.downloadCloudBackup(remotePath, 'google');
  if (!dl.ok) return dl;
  const buf = dl.buffer || Buffer.from(dl.text || dl.payload || '', dl.buffer ? undefined : 'utf8');
  return { ok: true, buffer: Buffer.isBuffer(buf) ? buf : Buffer.from(buf), file: dl.file };
}

function buildMetaPath(remotePath) {
  return String(remotePath || '').replace(/\.tdw$/i, '.meta.json');
}

async function readBackupMeta(remotePath) {
  const metaPath = buildMetaPath(remotePath);
  const dl = await cloud.downloadCloudBackup(metaPath, 'google');
  if (!dl?.ok) return { ok: false, message: dl?.message || 'meta_not_found', metaPath };
  try {
    const text = dl.text || (dl.buffer ? dl.buffer.toString('utf8') : '');
    const data = JSON.parse(String(text || '{}'));
    return { ok: true, data, metaPath };
  } catch (err) {
    return { ok: false, message: err.message || String(err), metaPath };
  }
}

async function restoreDbBackup(remotePath, password) {
  const dl = await downloadDbBackup(remotePath);
  if (!dl.ok) return dl;
  const expectedMeta = await readBackupMeta(remotePath);
  if (expectedMeta.ok && expectedMeta.data?.hash) {
    const actualHash = backupCrypto.sha256Hex(dl.buffer);
    if (actualHash !== expectedMeta.data.hash) {
      return {
        ok: false,
        error: 'backup_hash_mismatch',
        message: 'فشل التحقق من سلامة النسخة الاحتياطية',
        expectedHash: expectedMeta.data.hash,
        actualHash
      };
    }
  }
  const zipBuf = backupCrypto.decryptBuffer(dl.buffer, password);
  const structure = clinicSnapshot.inspectClinicZipBuffer(zipBuf);
  if (!structure.ok) {
    return {
      ok: false,
      error: 'invalid_backup_zip_structure',
      message: 'النسخة الاحتياطية غير صالحة أو ناقصة',
      details: structure
    };
  }
  const restored = clinicSnapshot.restoreClinicZipBuffer(zipBuf);
  return {
    ok: true,
    needRestart: true,
    backupPath: restored.backupPath,
    remotePath,
    manifest: structure.manifest || null
  };
}

async function verifyDbBackup(remotePath, expectedHash) {
  const dl = await downloadDbBackup(remotePath);
  if (!dl.ok) return dl;
  const hash = backupCrypto.sha256Hex(dl.buffer);
  return { ok: !expectedHash || hash === expectedHash, hash, expectedHash, size: dl.buffer.length };
}

async function pruneManualBackups(meta) {
  const list = await listDbBackups(meta);
  if (!list.ok || !list.items?.length) return 0;
  const manualOnly = list.items.filter(it => drivePaths.isManualBackupName(it.name));
  const excess = manualOnly.slice(MAX_MANUAL_BACKUPS);
  let count = 0;
  for (const it of excess) {
    const res = await cloud.deleteCloudBackup(it.path, 'google');
    if (res.ok) count++;
  }
  return count;
}

async function syncDbBackup(password, meta) {
  return uploadDbBackup(password, { ...meta, backupMode: 'auto', trigger: 'sync' });
}

module.exports = {
  buildBackupFilename: drivePaths.buildManualBackupFilename,
  buildRemoteFolder: drivePaths.buildRemoteFolder,
  buildMainBackupRemotePath: drivePaths.buildMainBackupRemotePath,
  MAIN_BACKUP_FILE: drivePaths.MAIN_BACKUP_FILE,
  DRIVE_APP_FOLDER: drivePaths.DRIVE_APP_FOLDER,
  flushStorage,
  createEncryptedBackupPackage,
  uploadDbBackup,
  listDbBackups,
  findPrimaryBackup,
  downloadDbBackup,
  restoreDbBackup,
  verifyDbBackup,
  syncDbBackup,
  pruneManualBackups,
  MAX_MANUAL_BACKUPS
};
