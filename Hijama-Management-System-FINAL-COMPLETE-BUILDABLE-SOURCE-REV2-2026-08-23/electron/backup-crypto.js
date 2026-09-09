/**
 * AES-256-GCM binary encryption for clinic DB backups (main process).
 * Format: magic(4) + salt(16) + iv(12) + tag(16) + dataLen(4 BE) + ciphertext
 */
const crypto = require('crypto');

const MAGIC = Buffer.from('CDBK');
const PBKDF2_ITERS = 210000;

function encryptBuffer(plainBuf, password) {
  if (!password || String(password).length < 6) throw new Error('password_too_short');
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(String(password), salt, PBKDF2_ITERS, 32, 'sha256');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plainBuf), cipher.final()]);
  const tag = cipher.getAuthTag();
  const len = Buffer.alloc(4);
  len.writeUInt32BE(enc.length, 0);
  return Buffer.concat([MAGIC, salt, iv, tag, len, enc]);
}

function decryptBuffer(encBuf, password) {
  if (!Buffer.isBuffer(encBuf)) encBuf = Buffer.from(encBuf);
  if (encBuf.length < 52 || !encBuf.subarray(0, 4).equals(MAGIC)) {
    throw new Error('invalid_backup_format');
  }
  const salt = encBuf.subarray(4, 20);
  const iv = encBuf.subarray(20, 32);
  const tag = encBuf.subarray(32, 48);
  const dataLen = encBuf.readUInt32BE(48);
  const data = encBuf.subarray(52, 52 + dataLen);
  const key = crypto.pbkdf2Sync(String(password), salt, PBKDF2_ITERS, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

module.exports = { encryptBuffer, decryptBuffer, sha256Hex };
