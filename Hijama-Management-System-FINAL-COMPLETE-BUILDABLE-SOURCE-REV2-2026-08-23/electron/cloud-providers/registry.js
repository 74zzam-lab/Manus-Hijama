/**
 * Cloud Backup Provider registry — add new providers here without touching the app core.
 */
const googleDrive = require('./google-drive');
const localVault = require('./local-vault');
const localFolder = require('./local-folder');
const stubs = require('./stub-providers');

const PROVIDERS = {
  none: {
    id: 'none',
    name: 'Disabled',
    nameAr: 'غير مفعّل',
    oauth: false,
    async connect() { return { ok: true, provider: 'none' }; },
    async disconnect() { return { ok: true }; },
    async getStatus() { return { connected: false, provider: 'none' }; },
    async uploadBackup() { return { ok: false, message: 'النسخ السحابي معطّل' }; },
    async uploadSyncFile() { return { ok: false, message: 'النسخ السحابي معطّل' }; },
    async downloadSyncFile() { return { ok: false, message: 'النسخ السحابي معطّل' }; },
    async downloadBackup() { return { ok: false, message: 'النسخ السحابي معطّل' }; },
    async listBackups() { return { ok: true, items: [] }; },
    async deleteBackup() { return { ok: false, message: 'النسخ السحابي معطّل' }; }
  },
  google: googleDrive,
  onedrive: stubs.onedrive,
  dropbox: stubs.dropbox,
  'local-folder': localFolder,
  'local-vault': localVault,
  'network-folder': stubs['network-folder'],
  webdav: stubs.webdav
};

/** Map legacy provider id "google" with local-vault fallback when OAuth not configured */
function resolveProviderId(id) {
  const key = String(id || 'none').replace(/[^a-z0-9_-]/gi, '');
  if (key === 'google') return 'google';
  return PROVIDERS[key] ? key : 'none';
}

async function resolveActiveProviderKey(id) {
  if (id === 'google') {
    const oauthStatus = await googleDrive.getStatus();
    if (oauthStatus.connected) return 'google';
    if (localVault.getAccount('google')?.email) return 'local-vault';
    return 'google';
  }
  return id;
}

function getProvider(id) {
  return PROVIDERS[resolveProviderId(id)] || PROVIDERS.none;
}

function listProviders() {
  return Object.values(PROVIDERS)
    .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
    .map(p => ({
      id: p.id,
      name: p.name,
      nameAr: p.nameAr || p.name,
      oauth: !!p.oauth,
      available: p.available !== false && p.id !== 'none'
    }));
}

module.exports = { getProvider, listProviders, PROVIDERS, resolveProviderId, resolveActiveProviderKey };
