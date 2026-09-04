/**
 * Cloud Backup Service — unified facade for all providers.
 */
const { getProvider, listProviders, resolveProviderId, resolveActiveProviderKey } = require('./registry');
const localVault = require('./local-vault');
const googleDrive = require('./google-drive');

function buildRemotePath(meta) {
  const brand = meta?.brand || 'NajjarTech';
  const center = (meta?.centerName || 'Center').replace(/[<>:"|?*\\/]/g, '_').trim() || 'Center';
  const year = meta?.year || new Date().getFullYear();
  const month = String(meta?.month || (new Date().getMonth() + 1)).padStart(2, '0');
  const filename = meta?.filename || `backup-${Date.now()}.tdw`;
  return `${brand}/${center}/${year}/${month}/${filename}`;
}

async function connectProvider(providerId, opts) {
  const id = resolveProviderId(providerId);
  if (id === 'google') {
    const cfg = googleDrive.loadConfig();
    if (!googleDrive.isOAuthConfigured(cfg)) {
      if (opts?.email) return localVault.registerEmail(opts.email, 'google');
      return { ok: false, message: googleDrive.oauthNotConfiguredMessage() };
    }
    return getProvider('google').connect(opts);
  }
  if (id === 'local-folder') return getProvider('local-folder').connect(opts);
  return getProvider(id).connect(opts);
}

async function disconnectProvider(providerId) {
  return getProvider(resolveProviderId(providerId)).disconnect();
}

async function getProviderStatus(providerId) {
  const id = resolveProviderId(providerId);
  if (id === 'google') {
    const oauthStatus = await googleDrive.getStatus();
    if (oauthStatus.connected) return oauthStatus;
    const vault = await localVault.getStatus('google');
    if (vault.connected) return { ...vault, oauth: false, mode: 'local-vault-fallback' };
    return oauthStatus;
  }
  return getProvider(id).getStatus();
}

async function uploadCloud(payload, filename, providerId, meta) {
  const id = resolveProviderId(providerId);
  const remotePath = meta?.remotePath || buildRemotePath({ ...meta, filename });
  const providerKey = await resolveActiveProviderKey(id);
  const p = getProvider(providerKey);
  const provArg = providerKey === 'local-vault' ? 'google' : id;

  // V2-4: atomic temp→verify→commit for sync JSON when supported
  if (meta?.atomicReplace && providerKey === 'google' && typeof googleDrive.atomicReplaceJson === 'function') {
    const atomic = await googleDrive.atomicReplaceJson(remotePath, payload, {
      ...meta,
      remotePath,
    });
    if (!atomic.ok) {
      return {
        ...atomic,
        remotePath,
        code: atomic.code || (atomic.retry ? 'remote_revision_mismatch' : undefined),
        error: atomic.code || atomic.message,
      };
    }
    return { ...atomic, remotePath, filename: filename || remotePath.split('/').pop() };
  }

  const result = await p.uploadBackup(payload, filename, provArg, meta?.email, remotePath, meta);
  const logicalPath = (typeof result.path === 'string' && result.path.startsWith('NajjarTech/'))
    ? result.path
    : remotePath;
  if (result.ok && meta?.hash) {
    const metaName = filename.replace(/\.(tdw|zip)$/i, '.meta.json');
    const metaPath = logicalPath.replace(/[^/]+$/, metaName);
    await p.uploadBackup(JSON.stringify({
      hash: meta.hash,
      size: meta.size,
      at: new Date().toISOString(),
      filename,
      encrypted: !!meta.encrypted
    }, null, 2), metaName, provArg, meta?.email, metaPath);
  }
  return { ...result, remotePath: logicalPath };
}

async function uploadSyncFile(payload, filename, providerId, folder) {
  const id = resolveProviderId(providerId);
  const providerKey = await resolveActiveProviderKey(id);
  const p = getProvider(providerKey);
  return p.uploadSyncFile(payload, filename, providerKey === 'local-vault' ? 'google' : id, folder || 'CuppingCenter-Sync');
}

async function downloadSyncFile(filename, providerId, folder) {
  const id = resolveProviderId(providerId);
  const providerKey = await resolveActiveProviderKey(id);
  const p = getProvider(providerKey);
  return p.downloadSyncFile(filename, providerKey === 'local-vault' ? 'google' : id, folder || 'CuppingCenter-Sync');
}

async function listCloudBackups(providerId, prefix) {
  const id = resolveProviderId(providerId);
  const providerKey = await resolveActiveProviderKey(id);
  const p = getProvider(providerKey);
  return p.listBackups(providerKey === 'local-vault' ? 'google' : id, prefix || googleDrive.BACKUP_ROOT);
}

async function downloadCloudBackup(remotePath, providerId) {
  const id = resolveProviderId(providerId);
  const providerKey = await resolveActiveProviderKey(id);
  return getProvider(providerKey).downloadBackup(remotePath, providerKey === 'local-vault' ? 'google' : id);
}

async function downloadCloudBackupByFileId(fileId, providerId, options = {}) {
  const id = resolveProviderId(providerId);
  const providerKey = await resolveActiveProviderKey(id);
  const p = getProvider(providerKey);
  if (typeof p.downloadBackupByFileId === 'function') {
    return p.downloadBackupByFileId(fileId, options);
  }
  return { ok: false, error: 'file_id_download_unsupported' };
}

async function deleteCloudBackup(remotePath, providerId) {
  const id = resolveProviderId(providerId);
  const providerKey = await resolveActiveProviderKey(id);
  return getProvider(providerKey).deleteBackup(remotePath, providerKey === 'local-vault' ? 'google' : id);
}

async function verifyCloudBackup(remotePath, expectedHash, providerId) {
  const id = resolveProviderId(providerId);
  const providerKey = await resolveActiveProviderKey(id);
  const p = getProvider(providerKey);
  if (typeof p.verifyRemote === 'function') return p.verifyRemote(remotePath, expectedHash);
  const dl = await p.downloadBackup(remotePath, providerKey === 'local-vault' ? 'google' : id);
  if (!dl.ok) return { ok: false, message: dl.message };
  const crypto = require('crypto');
  const buf = dl.buffer || Buffer.from(String(dl.text || ''), 'utf8');
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  return { ok: !expectedHash || hash === expectedHash, hash, size: buf.length };
}

async function registerCloudAccount(email, provider) {
  return localVault.registerEmail(email, provider || 'google');
}

module.exports = {
  listProviders,
  connectProvider,
  disconnectProvider,
  getProviderStatus,
  uploadCloud,
  uploadSyncFile,
  downloadSyncFile,
  listCloudBackups,
  downloadCloudBackup,
  downloadCloudBackupByFileId,
  deleteCloudBackup,
  verifyCloudBackup,
  registerCloudAccount,
  buildRemotePath
};
