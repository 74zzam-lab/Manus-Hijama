/**
 * Legacy local filesystem vault (dev / offline fallback).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const BACKUP_ROOT = 'NajjarTech';

function cloudVaultRoot() {
  return path.join(app.getPath('userData'), 'CloudVault');
}

function accountHash(email) {
  return crypto.createHash('sha256').update(String(email || '').trim().toLowerCase()).digest('hex').slice(0, 16);
}

function providerDir(provider, email) {
  const prov = (provider || 'local-vault').replace(/[^a-z0-9_-]/gi, '');
  const dir = path.join(cloudVaultRoot(), prov, accountHash(email || 'default'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readAccounts() {
  const file = path.join(cloudVaultRoot(), 'accounts.json');
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

function writeAccounts(data) {
  fs.mkdirSync(cloudVaultRoot(), { recursive: true });
  fs.writeFileSync(path.join(cloudVaultRoot(), 'accounts.json'), JSON.stringify(data, null, 2), 'utf8');
}

function getAccount(provider) {
  return readAccounts()[provider] || null;
}

function setAccount(provider, data) {
  const accounts = readAccounts();
  accounts[provider] = data;
  writeAccounts(accounts);
}

function clearAccount(provider) {
  const accounts = readAccounts();
  delete accounts[provider];
  writeAccounts(accounts);
}

function safeName(name) {
  return (name || 'backup.dat').replace(/[<>:"|?*\\]/g, '_');
}

function resolvePath(provider, email, parts) {
  return path.join(providerDir(provider, email), ...parts);
}

async function connect() {
  return { ok: false, message: 'استخدم local-vault عبر registerCloudAccount(email)' };
}

async function registerEmail(email, provider = 'local-vault') {
  const trimmed = String(email || '').trim();
  if (!trimmed.includes('@')) return { ok: false, message: 'بريد غير صالح' };
  providerDir(provider, trimmed);
  setAccount(provider, { email: trimmed, connectedAt: new Date().toISOString(), mode: 'local-vault' });
  return { ok: true, email: trimmed, provider, mode: 'local-vault' };
}

async function disconnect(provider = 'local-vault') {
  clearAccount(provider);
  return { ok: true };
}

async function getStatus(provider = 'local-vault') {
  const acct = getAccount(provider);
  return {
    connected: !!acct?.email,
    email: acct?.email || '',
    provider,
    mode: 'local-vault',
    oauth: false
  };
}

async function uploadBackup(payload, filename, provider, email, remotePath) {
  const acct = email ? { email } : getAccount(provider);
  if (!acct?.email) return { ok: false, message: 'لا يوجد حساب مرتبط' };
  try {
    const parts = (remotePath || `Backups/${safeName(filename)}`).split('/').filter(Boolean);
    const target = resolvePath(provider, acct.email, parts);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    fs.writeFileSync(target, data, 'utf8');
    const meta = { filename: safeName(filename), at: new Date().toISOString(), size: data.length, path: remotePath };
    fs.writeFileSync(path.join(path.dirname(target), '_last.json'), JSON.stringify(meta, null, 2), 'utf8');
    return { ok: true, path: target, provider, email: acct.email };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function uploadSyncFile(payload, filename, provider, folder, email) {
  const acct = email ? { email } : getAccount(provider);
  if (!acct?.email) return { ok: false, message: 'لا يوجد حساب مرتبط' };
  try {
    const dir = path.join(providerDir(provider, acct.email), folder || 'CuppingCenter-Sync');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, safeName(filename));
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    fs.writeFileSync(target, data, 'utf8');
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function downloadSyncFile(filename, provider, folder, email) {
  const acct = email ? { email } : getAccount(provider);
  if (!acct?.email) return { ok: false, message: 'لا يوجد حساب مرتبط' };
  try {
    const target = path.join(providerDir(provider, acct.email), folder || 'CuppingCenter-Sync', safeName(filename));
    if (!fs.existsSync(target)) return { ok: false, message: 'الملف غير موجود' };
    const text = fs.readFileSync(target, 'utf8');
    return { ok: true, text, payload: text };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function downloadBackup(remotePath, provider, email) {
  const acct = email ? { email } : getAccount(provider);
  if (!acct?.email) return { ok: false, message: 'لا يوجد حساب مرتبط' };
  try {
    const parts = remotePath.split('/').filter(Boolean);
    const target = resolvePath(provider, acct.email, parts);
    if (!fs.existsSync(target)) return { ok: false, message: 'الملف غير موجود' };
    const text = fs.readFileSync(target, 'utf8');
    return { ok: true, text, payload: text, path: target };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function listBackups(provider, prefix, email) {
  const acct = email ? { email } : getAccount(provider);
  if (!acct?.email) return { ok: false, items: [], message: 'لا يوجد حساب' };
  const base = resolvePath(provider, acct.email, (prefix || 'Backups').split('/').filter(Boolean));
  if (!fs.existsSync(base)) return { ok: true, items: [] };
  const items = fs.readdirSync(base)
    .filter(f => f.endsWith('.tdw') || f.endsWith('.json'))
    .filter(f => !f.startsWith('_'))
    .map(f => {
      const st = fs.statSync(path.join(base, f));
      return { id: f, name: f, path: `${prefix || 'Backups'}/${f}`, size: st.size, modifiedAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return { ok: true, items };
}

async function deleteBackup(remotePath, provider, email) {
  const acct = email ? { email } : getAccount(provider);
  if (!acct?.email) return { ok: false, message: 'لا يوجد حساب' };
  try {
    const target = resolvePath(provider, acct.email, remotePath.split('/').filter(Boolean));
    if (fs.existsSync(target)) fs.unlinkSync(target);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

module.exports = {
  id: 'local-vault',
  name: 'Local Vault',
  nameAr: 'خزنة محلية (تطوير)',
  oauth: false,
  BACKUP_ROOT,
  connect,
  registerEmail,
  disconnect,
  getStatus,
  uploadBackup,
  uploadSyncFile,
  downloadSyncFile,
  downloadBackup,
  listBackups,
  deleteBackup,
  getAccount,
  providerDir
};
