/**
 * User-selected local folder backup destination.
 */
const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');

function configFile() {
  return path.join(app.getPath('userData'), 'CloudVault', 'local-folder.json');
}

function loadFolderPath() {
  try {
    const data = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
    return data?.path && fs.existsSync(data.path) ? data.path : null;
  } catch {
    return null;
  }
}

function persistFolderPath(folderPath) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify({ path: folderPath, at: new Date().toISOString() }, null, 2), 'utf8');
}

let _folderPath = loadFolderPath();

function safeName(name) {
  return (name || 'backup.dat').replace(/[<>:"|?*\\]/g, '_');
}

async function pickFolder() {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  if (res.canceled || !res.filePaths?.[0]) return { ok: false, message: 'cancelled' };
  _folderPath = res.filePaths[0];
  return { ok: true, path: _folderPath };
}

function setFolder(folderPath) {
  if (!folderPath) return { ok: false };
  _folderPath = folderPath;
  fs.mkdirSync(_folderPath, { recursive: true });
  persistFolderPath(_folderPath);
  return { ok: true, path: _folderPath };
}

async function connect(opts) {
  if (opts?.folderPath) return setFolder(opts.folderPath);
  return pickFolder();
}

async function disconnect() {
  _folderPath = null;
  try {
    if (fs.existsSync(configFile())) fs.unlinkSync(configFile());
  } catch { /* ignore */ }
  return { ok: true };
}

async function getStatus() {
  return {
    connected: !!_folderPath && fs.existsSync(_folderPath),
    path: _folderPath || '',
    provider: 'local-folder',
    oauth: false
  };
}

function resolveTarget(remotePath) {
  if (!_folderPath) throw new Error('لم يُحدد مجلد محلي');
  return path.join(_folderPath, ...(remotePath || '').split('/').filter(Boolean).map(safeName));
}

async function uploadBackup(payload, filename, _p, _e, remotePath) {
  try {
    const rel = remotePath || filename;
    const target = resolveTarget(rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    fs.writeFileSync(target, data, 'utf8');
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function uploadSyncFile(payload, filename, _p, folder, _e) {
  const rel = `${folder || 'Sync'}/${safeName(filename)}`;
  return uploadBackup(payload, filename, null, null, rel);
}

async function downloadSyncFile(filename, _p, folder) {
  try {
    const target = resolveTarget(`${folder || 'Sync'}/${safeName(filename)}`);
    if (!fs.existsSync(target)) return { ok: false, message: 'الملف غير موجود' };
    const text = fs.readFileSync(target, 'utf8');
    return { ok: true, text, payload: text };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function downloadBackup(remotePath) {
  try {
    const target = resolveTarget(remotePath);
    if (!fs.existsSync(target)) return { ok: false, message: 'الملف غير موجود' };
    const text = fs.readFileSync(target, 'utf8');
    return { ok: true, text, payload: text };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function listBackups(_p, prefix) {
  try {
    const base = resolveTarget(prefix || '');
    if (!fs.existsSync(base)) return { ok: true, items: [] };
    const items = fs.readdirSync(base)
      .filter(f => !f.startsWith('.'))
      .map(f => {
        const st = fs.statSync(path.join(base, f));
        return { id: f, name: f, path: `${prefix || ''}/${f}`.replace(/^\//, ''), size: st.size, modifiedAt: st.mtime.toISOString() };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    return { ok: true, items };
  } catch (err) {
    return { ok: false, items: [], message: err.message };
  }
}

async function deleteBackup(remotePath) {
  try {
    const target = resolveTarget(remotePath);
    if (fs.existsSync(target)) fs.unlinkSync(target);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

module.exports = {
  id: 'local-folder',
  name: 'Local Folder',
  nameAr: 'مجلد محلي',
  oauth: false,
  connect,
  disconnect,
  getStatus,
  uploadBackup,
  uploadSyncFile,
  downloadSyncFile,
  downloadBackup,
  listBackups,
  deleteBackup,
  setFolder
};
