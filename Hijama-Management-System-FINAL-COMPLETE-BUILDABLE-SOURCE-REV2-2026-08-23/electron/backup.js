/**
 * Electron backup facade — delegates to Cloud Backup Provider layer.
 */
const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');
const cloud = require('./cloud-providers/cloud-service');
const { hasTraversal, isAbsoluteOrUnc, resolveInside, safeFilename } = require('./security/path-guard');

const branding = require('../branding.config.json');
const BACKUP_FOLDER = branding.product?.name || 'Hijama Management System';

function resolveLocalBackupDir(localPathHint) {
  const documentsRoot = app.getPath('documents');
  const defaultDir = path.join(documentsRoot, BACKUP_FOLDER, 'Backups');

  if (!localPathHint || localPathHint === 'custom') {
    return defaultDir;
  }

  const hint = String(localPathHint).trim();
  if (hasTraversal(hint)) {
    const err = new Error('local_path_traversal_rejected');
    err.code = 'PATH_TRAVERSAL';
    throw err;
  }

  // Allow Documents-relative hints only (no absolute / UNC / drive paths from renderer)
  if (isAbsoluteOrUnc(hint)) {
    const err = new Error('absolute_local_path_rejected');
    err.code = 'PATH_TRAVERSAL';
    throw err;
  }

  if (hint.startsWith('Documents/') || hint.startsWith('Documents\\')) {
    const rest = hint.replace(/^Documents[/\\]/, '');
    return resolveInside(documentsRoot, rest);
  }

  return resolveInside(documentsRoot, hint);
}

async function saveLocal(payload, filename, localPathHint) {
  try {
    const dir = resolveLocalBackupDir(localPathHint);
    fs.mkdirSync(dir, { recursive: true });
    const safeName = safeFilename(filename, `backup-${Date.now()}.json`);
    const target = resolveInside(dir, safeName);
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    fs.writeFileSync(target, data, 'utf8');
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, error: err.code || err.message, message: err.message };
  }
}

async function connectGoogle(email, provider) {
  if (email && String(email).includes('@')) {
    return cloud.registerCloudAccount(email, provider || 'google');
  }
  return cloud.connectProvider(provider || 'google');
}

async function registerCloudAccount(email, provider) {
  return cloud.registerCloudAccount(email, provider || 'google');
}

async function uploadCloud(payload, filename, provider, meta) {
  return cloud.uploadCloud(payload, filename, provider || 'google', meta);
}

async function uploadSyncFile(payload, filename, provider, folder) {
  return cloud.uploadSyncFile(payload, filename, provider || 'google', folder);
}

async function downloadSyncFile(filename, provider, folder) {
  return cloud.downloadSyncFile(filename, provider || 'google', folder);
}

async function disconnectCloud(provider) {
  return cloud.disconnectProvider(provider || 'google');
}

async function listCloudBackups(provider, prefix) {
  return cloud.listCloudBackups(provider || 'google', prefix);
}

async function discoverCloudRestorePoints(options) {
  const discovery = require('./cloud-data-discovery');
  return discovery.discoverCloudRestorePoints(options || {});
}

async function downloadCloudBackup(remotePath, provider) {
  return cloud.downloadCloudBackup(remotePath, provider || 'google');
}

async function downloadCloudBackupByFileId(fileId, provider, options) {
  return cloud.downloadCloudBackupByFileId(fileId, provider || 'google', options || {});
}

async function deleteCloudBackup(remotePath, provider) {
  return cloud.deleteCloudBackup(remotePath, provider || 'google');
}

async function verifyCloudBackup(remotePath, expectedHash, provider) {
  return cloud.verifyCloudBackup(remotePath, expectedHash, provider || 'google');
}

async function startOAuth(provider, opts) {
  return cloud.connectProvider(provider || 'google', opts);
}

async function getCloudStatus(provider) {
  return cloud.getProviderStatus(provider || 'google');
}

async function listCloudProviders() {
  return cloud.listProviders();
}

async function pickLocalFolder() {
  const { connectProvider } = require('./cloud-providers/cloud-service');
  return connectProvider('local-folder');
}

const cloudDbBackup = require('./cloud-db-backup');
const { isBackupV1RuntimeDisabled, denyBackupV1, denyBackupV1Restore } = require('./backup-v1-gate');

async function uploadDbBackup(password, meta) {
  if (isBackupV1RuntimeDisabled()) return denyBackupV1('uploadDbBackup');
  return cloudDbBackup.uploadDbBackup(password, meta);
}

async function listDbBackups(meta) {
  if (isBackupV1RuntimeDisabled()) return { ...denyBackupV1('listDbBackups'), items: [] };
  return cloudDbBackup.listDbBackups(meta);
}

async function restoreDbBackup(_remotePath, _password) {
  return denyBackupV1Restore('restoreDbBackup');
}

async function syncDbBackup(password, meta) {
  if (isBackupV1RuntimeDisabled()) return denyBackupV1('syncDbBackup');
  return cloudDbBackup.syncDbBackup(password, meta);
}

async function verifyDbBackup(remotePath, expectedHash) {
  if (isBackupV1RuntimeDisabled()) return denyBackupV1('verifyDbBackup');
  return cloudDbBackup.verifyDbBackup(remotePath, expectedHash);
}

async function createDbBackupPackage(password, meta) {
  if (isBackupV1RuntimeDisabled()) return denyBackupV1('createDbBackupPackage');
  return cloudDbBackup.createEncryptedBackupPackage(password, meta);
}

module.exports = {
  saveLocal,
  connectGoogle,
  registerCloudAccount,
  uploadCloud,
  uploadSyncFile,
  downloadSyncFile,
  disconnectCloud,
  listCloudBackups,
  discoverCloudRestorePoints,
  downloadCloudBackup,
  downloadCloudBackupByFileId,
  deleteCloudBackup,
  verifyCloudBackup,
  startOAuth,
  getCloudStatus,
  listCloudProviders,
  pickLocalFolder,
  resolveLocalBackupDir,
  cloudVaultRoot: () => path.join(app.getPath('userData'), 'CloudVault'),
  uploadDbBackup,
  listDbBackups,
  restoreDbBackup,
  syncDbBackup,
  verifyDbBackup,
  createDbBackupPackage,
  isBackupV1RuntimeDisabled,
  denyBackupV1,
};
