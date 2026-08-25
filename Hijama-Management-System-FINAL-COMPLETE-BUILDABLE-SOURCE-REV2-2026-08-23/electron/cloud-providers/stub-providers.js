/**
 * Placeholder OAuth providers — ready for future implementation.
 */
function stubProvider(id, name, nameAr) {
  return {
    id,
    name,
    nameAr,
    oauth: true,
    available: false,
    async connect() {
      return {
        ok: false,
        message: `${nameAr} — OAuth قيد التطوير. استخدم Google Drive في الإصدار الأول.`
      };
    },
    async disconnect() { return { ok: true }; },
    async getStatus() { return { connected: false, provider: id, oauth: true, available: false }; },
    async uploadBackup() { return { ok: false, message: `${nameAr} غير مفعّل بعد` }; },
    async uploadSyncFile() { return { ok: false, message: `${nameAr} غير مفعّل بعد` }; },
    async downloadSyncFile() { return { ok: false, message: `${nameAr} غير مفعّل بعد` }; },
    async downloadBackup() { return { ok: false, message: `${nameAr} غير مفعّل بعد` }; },
    async listBackups() { return { ok: true, items: [] }; },
    async deleteBackup() { return { ok: false, message: `${nameAr} غير مفعّل بعد` }; }
  };
}

module.exports = {
  onedrive: stubProvider('onedrive', 'OneDrive', 'OneDrive (OAuth)'),
  dropbox: stubProvider('dropbox', 'Dropbox', 'Dropbox (OAuth)'),
  webdav: {
    id: 'webdav',
    name: 'WebDAV',
    nameAr: 'WebDAV',
    oauth: false,
    available: false,
    async connect() { return { ok: false, message: 'WebDAV — قريباً' }; },
    async disconnect() { return { ok: true }; },
    async getStatus() { return { connected: false, provider: 'webdav' }; },
    async uploadBackup() { return { ok: false, message: 'WebDAV غير مفعّل' }; },
    async uploadSyncFile() { return { ok: false, message: 'WebDAV غير مفعّل' }; },
    async downloadSyncFile() { return { ok: false, message: 'WebDAV غير مفعّل' }; },
    async downloadBackup() { return { ok: false, message: 'WebDAV غير مفعّل' }; },
    async listBackups() { return { ok: true, items: [] }; },
    async deleteBackup() { return { ok: false, message: 'WebDAV غير مفعّل' }; }
  },
  'network-folder': {
    id: 'network-folder',
    name: 'Network Folder (NAS)',
    nameAr: 'مجلد شبكة (NAS)',
    oauth: false,
    available: false,
    async connect() { return { ok: false, message: 'NAS — استخدم «مجلد محلي» مع مسار UNC مثل \\\\NAS\\Backups' }; },
    async disconnect() { return { ok: true }; },
    async getStatus() { return { connected: false, provider: 'network-folder' }; },
    async uploadBackup() { return { ok: false, message: 'NAS — استخدم مجلد محلي' }; },
    async uploadSyncFile() { return { ok: false, message: 'NAS — استخدم مجلد محلي' }; },
    async downloadSyncFile() { return { ok: false, message: 'NAS — استخدم مجلد محلي' }; },
    async downloadBackup() { return { ok: false, message: 'NAS — استخدم مجلد محلي' }; },
    async listBackups() { return { ok: true, items: [] }; },
    async deleteBackup() { return { ok: false, message: 'NAS — استخدم مجلد محلي' }; }
  }
};
