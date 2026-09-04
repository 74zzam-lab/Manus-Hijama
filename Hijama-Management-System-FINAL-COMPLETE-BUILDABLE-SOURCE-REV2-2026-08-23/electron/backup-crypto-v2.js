/**
 * Authenticated backup encryption.
 * v2 format: CDB2 + salt(16) + nonce(12) + tag(16) + length(4 BE) + ciphertext
 * KDF: scrypt N=32768,r=8,p=1. Legacy CDBK/PBKDF2 files remain readable.
 */
'use strict';

const crypto = require('crypto');

const MAGIC_V2 = Buffer.from('CDB2');
const MAGIC_LEGACY = Buffer.from('CDBK');
const HEADER_SIZE = 52;
const LEGACY_PBKDF2_ITERS = 210000;
const SCRYPT_OPTIONS = Object.freeze({ N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

function deriveScryptKey(password, salt) {
  return crypto.scryptSync(String(password), salt, 32, SCRYPT_OPTIONS);
}

function encryptBuffer(plainBuf, password) {
  if (!password || String(password).length < 8) throw new Error('password_too_short');
  const plain = Buffer.isBuffer(plainBuf) ? plainBuf : Buffer.from(plainBuf);
  const salt = crypto.randomBytes(16);
  const nonce = crypto.randomBytes(12);
  const key = deriveScryptKey(password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(MAGIC_V2);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const len = Buffer.alloc(4);
  len.writeUInt32BE(ciphertext.length, 0);
  return Buffer.concat([MAGIC_V2, salt, nonce, tag, len, ciphertext]);
}

function parseEnvelope(encBuf) {
  const input = Buffer.isBuffer(encBuf) ? encBuf : Buffer.from(encBuf);
  if (input.length < HEADER_SIZE) throw new Error('invalid_backup_format');
  const magic = input.subarray(0, 4);
  if (!magic.equals(MAGIC_V2) && !magic.equals(MAGIC_LEGACY)) throw new Error('invalid_backup_format');
  const dataLen = input.readUInt32BE(48);
  if (dataLen !== input.length - HEADER_SIZE) throw new Error('invalid_backup_length');
  return {
    input,
    magic,
    salt: input.subarray(4, 20),
    nonce: input.subarray(20, 32),
    tag: input.subarray(32, 48),
    data: input.subarray(HEADER_SIZE)
  };
}

function decryptBuffer(encBuf, password) {
  const parsed = parseEnvelope(encBuf);
  const legacy = parsed.magic.equals(MAGIC_LEGACY);
  const key = legacy
    ? crypto.pbkdf2Sync(String(password), parsed.salt, LEGACY_PBKDF2_ITERS, 32, 'sha256')
    : deriveScryptKey(password, parsed.salt);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, parsed.nonce);
    if (!legacy) decipher.setAAD(MAGIC_V2);
    decipher.setAuthTag(parsed.tag);
    return Buffer.concat([decipher.update(parsed.data), decipher.final()]);
  } catch {
    throw new Error('backup_authentication_failed');
  }
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

module.exports = {
  encryptBuffer,
  decryptBuffer,
  parseEnvelope,
  sha256Hex,
  MAGIC_V2,
  MAGIC_LEGACY,
  SCRYPT_OPTIONS
};
