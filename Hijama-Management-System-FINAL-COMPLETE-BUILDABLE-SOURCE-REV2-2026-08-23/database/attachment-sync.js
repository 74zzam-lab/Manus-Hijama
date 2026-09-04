'use strict';

/**
 * Content-addressed attachment helpers (V2-4). Blobs stay outside JSON payloads.
 */
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const ALLOWED_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.txt', '.csv', '.json',
]);
const BLOCKED_EXT = new Set([
  '.exe', '.bat', '.cmd', '.ps1', '.js', '.mjs', '.vbs', '.scr', '.dll', '.com',
]);
const MAX_BYTES = 25 * 1024 * 1024;

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sanitizeFilename(name) {
  const base = path.basename(String(name || 'file')).replace(/[<>:"|?*\\/]/g, '_');
  if (!base || base === '.' || base === '..') return 'file';
  return base.slice(0, 180);
}

function validateAttachment(meta, buffer) {
  const errors = [];
  const filename = sanitizeFilename(meta?.filename || meta?.name || 'file');
  const ext = path.extname(filename).toLowerCase();
  if (BLOCKED_EXT.has(ext)) errors.push('executable_extension_blocked');
  if (ext && !ALLOWED_EXT.has(ext)) errors.push('extension_not_allowed');
  const size = Buffer.isBuffer(buffer) ? buffer.length : Number(meta?.size || 0);
  if (size === 0) errors.push('zero_byte');
  if (size > MAX_BYTES) errors.push('oversized');
  if (String(meta?.filename || '').includes('..') || String(meta?.remotePath || '').includes('..')) {
    errors.push('path_traversal');
  }
  const hash = Buffer.isBuffer(buffer) ? sha256Buffer(buffer) : String(meta?.sha256 || '');
  if (Buffer.isBuffer(buffer) && meta?.sha256 && meta.sha256 !== hash) {
    errors.push('checksum_mismatch');
  }
  return {
    ok: errors.length === 0,
    errors,
    filename,
    ext,
    size,
    sha256: hash,
    mime: meta?.mime || 'application/octet-stream',
  };
}

function attachmentRemotePath(centerId, branchId, sha256) {
  const c = String(centerId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const b = String(branchId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const h = String(sha256 || '').toLowerCase();
  if (!c || !b || !/^[a-f0-9]{64}$/.test(h)) {
    throw new Error('attachment_path_invalid');
  }
  return `NajjarTech/centers/${c}/branches/${b}/attachments/${h}`;
}

function writeLocalBlob(rootDir, sha256, buffer) {
  const dir = path.join(rootDir, 'attachments', sha256.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, sha256);
  const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, buffer);
  const verify = sha256Buffer(fs.readFileSync(tmp));
  if (verify !== sha256) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw new Error('local_blob_checksum_mismatch');
  }
  fs.renameSync(tmp, dest);
  return dest;
}

function readLocalBlob(rootDir, sha256) {
  const dest = path.join(rootDir, 'attachments', sha256.slice(0, 2), sha256);
  if (!fs.existsSync(dest)) return null;
  const buf = fs.readFileSync(dest);
  if (sha256Buffer(buf) !== sha256) throw new Error('local_blob_corrupt');
  return buf;
}

module.exports = {
  ALLOWED_EXT,
  BLOCKED_EXT,
  MAX_BYTES,
  sha256Buffer,
  sanitizeFilename,
  validateAttachment,
  attachmentRemotePath,
  writeLocalBlob,
  readLocalBlob,
};
