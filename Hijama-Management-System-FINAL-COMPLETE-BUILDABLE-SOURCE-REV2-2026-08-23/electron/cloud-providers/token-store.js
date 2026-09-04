/**
 * Secure OAuth token storage (safeStorage + encrypted file fallback).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');

function tokensRoot() {
  const dir = path.join(app.getPath('userData'), 'CloudVault', 'tokens');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function tokenPath(providerId) {
  return path.join(tokensRoot(), `${providerId.replace(/[^a-z0-9_-]/gi, '')}.json`);
}

function machineKey() {
  const seed = `${app.getPath('userData')}|${process.platform}|cloud-backup-v1`;
  return crypto.createHash('sha256').update(seed).digest();
}

function encryptPayload(obj) {
  const plain = JSON.stringify(obj);
  if (safeStorage.isEncryptionAvailable()) {
    return { v: 2, enc: safeStorage.encryptString(plain).toString('base64'), alg: 'safeStorage' };
  }
  const iv = crypto.randomBytes(12);
  const key = machineKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { v: 2, enc: enc.toString('base64'), iv: iv.toString('base64'), tag: tag.toString('base64'), alg: 'aes-256-gcm' };
}

function decryptPayload(wrapped) {
  if (!wrapped) return null;
  if (wrapped.alg === 'safeStorage' && safeStorage.isEncryptionAvailable()) {
    return JSON.parse(safeStorage.decryptString(Buffer.from(wrapped.enc, 'base64')));
  }
  const key = machineKey();
  const iv = Buffer.from(wrapped.iv, 'base64');
  const tag = Buffer.from(wrapped.tag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(Buffer.from(wrapped.enc, 'base64')), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

function saveTokens(providerId, tokens) {
  const file = tokenPath(providerId);
  fs.writeFileSync(file, JSON.stringify(encryptPayload(tokens), null, 2), 'utf8');
}

function loadTokens(providerId) {
  const file = tokenPath(providerId);
  if (!fs.existsSync(file)) return null;
  try {
    return decryptPayload(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

function deleteTokens(providerId) {
  const file = tokenPath(providerId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

module.exports = { saveTokens, loadTokens, deleteTokens };
