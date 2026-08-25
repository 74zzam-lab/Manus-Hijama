'use strict';

/**
 * V2-5.9 Attachment IPC — local blob store + validate/hash for renderer lifecycle.
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const attach = require('../database/attachment-sync');
const V = require('./security/ipc-validate');

function attachmentsRoot() {
  return path.join(app.getPath('userData'), 'attachments');
}

function registerAttachmentsIpc(handle) {
  const ATTACH_MAX = 25 * 1024 * 1024;

  handle('attachments:validate', (_e, meta, bufferish) => {
    const buf = bufferish == null ? null : V.asBufferish(bufferish, { name: 'buffer', max: ATTACH_MAX, required: false });
    return attach.validateAttachment(meta || {}, buf);
  });

  handle('attachments:hashBuffer', (_e, bufferish) => {
    const buf = V.asBufferish(bufferish, { name: 'buffer', required: true, max: ATTACH_MAX });
    return { ok: true, sha256: attach.sha256Buffer(buf) };
  });

  handle('attachments:writeLocal', (_e, sha256, bufferish) => {
    const hash = V.asString(sha256, { name: 'sha256', required: true, max: 64, allowEmpty: false });
    const buf = V.asBufferish(bufferish, { name: 'buffer', required: true, max: ATTACH_MAX });
    if (!/^[a-f0-9]{64}$/i.test(hash)) V.fail('IPC_TYPE', 'sha256_invalid');
    const expected = attach.sha256Buffer(buf);
    if (expected !== hash.toLowerCase()) return { ok: false, error: 'hash_mismatch' };
    const dest = attach.writeLocalBlob(attachmentsRoot(), hash.toLowerCase(), buf);
    return { ok: true, path: dest };
  });

  handle('attachments:readLocal', (_e, sha256) => {
    const hash = V.asString(sha256, { name: 'sha256', required: true, max: 64, allowEmpty: false });
    try {
      const buf = attach.readLocalBlob(attachmentsRoot(), hash.toLowerCase());
      if (!buf) return { ok: false, error: 'file_missing_locally' };
      return { ok: true, buffer: buf, sha256: hash.toLowerCase(), size: buf.length };
    } catch (e) {
      return { ok: false, error: e.message || 'read_failed' };
    }
  });

  handle('attachments:existsLocal', (_e, sha256) => {
    const hash = V.asString(sha256, { name: 'sha256', required: true, max: 64, allowEmpty: false });
    const p = path.join(attachmentsRoot(), hash.slice(0, 2), hash.toLowerCase());
    return { ok: true, exists: fs.existsSync(p) };
  });
}

module.exports = { registerAttachmentsIpc, attachmentsRoot };
