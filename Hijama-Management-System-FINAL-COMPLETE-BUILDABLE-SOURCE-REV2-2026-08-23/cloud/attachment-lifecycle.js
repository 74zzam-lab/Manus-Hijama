/**
 * V2-5.9 Attachment Lifecycle — wired operational path (not helpers-only).
 * Phase 8: metadata authority via `attachments_meta` (legacy manifest migrated on read).
 * States: PENDING | UPLOADING | SYNCED | FAILED | MISSING_REMOTE | QUARANTINED | DELETED
 */
(function (global) {
  'use strict';

  const STATES = Object.freeze({
    PENDING: 'PENDING',
    UPLOADING: 'UPLOADING',
    SYNCED: 'SYNCED',
    FAILED: 'FAILED',
    MISSING_REMOTE: 'MISSING_REMOTE',
    QUARANTINED: 'QUARANTINED',
    DELETED: 'DELETED',
  });

  const MANIFEST_KEY = global.AttachmentAuthority?.LEGACY_MANIFEST_KEY || '__tdw_attachment_manifest__';

  function auth() {
    return global.AttachmentAuthority || null;
  }

  function loadManifest() {
    const AA = auth();
    if (AA?.loadItems) {
      const items = AA.loadItems();
      return { version: 2, items, updatedAt: new Date().toISOString(), source: 'attachments_meta' };
    }
    try {
      const m = global.DB?.get?.(MANIFEST_KEY, null);
      if (m && typeof m === 'object' && Array.isArray(m.items)) return m;
    } catch { /* empty */ }
    return { version: 1, items: [], updatedAt: null };
  }

  async function saveManifest(m) {
    const items = Array.isArray(m?.items) ? m.items : [];
    const AA = auth();
    if (AA?.saveItems) {
      const res = await AA.saveItems(items, { source: 'attachment_lifecycle' });
      if (res?.ok === false) {
        try { global.DB?.__rawSet?.(MANIFEST_KEY, m); } catch {
          try { global.DB?.set?.(MANIFEST_KEY, m); } catch { /* empty */ }
        }
        return m;
      }
      return { version: 2, items, updatedAt: new Date().toISOString(), source: 'attachments_meta' };
    }
    if (global.SqliteBridge?.setAuthoritative) {
      return global.SqliteBridge.setAuthoritative(MANIFEST_KEY, m).then((r) => {
        if (!r?.ok) {
          try { global.DB?.__rawSet?.(MANIFEST_KEY, m); } catch { /* empty */ }
        }
        return m;
      });
    }
    try { global.DB?.set?.(MANIFEST_KEY, m); } catch { /* empty */ }
    return Promise.resolve(m);
  }

  function centerId() {
    return auth()?.centerId?.() || global.CenterId?.getStoredCenterId?.()
      || global.LicenseCloud?.loadLocal?.()?.centerId || '';
  }

  function branchId(explicit) {
    return auth()?.branchId?.(explicit)
      || explicit
      || global.BranchContexts?.getOperationalWriteBranch?.()
      || global.BranchScope?.getActiveBranchId?.()
      || 'BR-MAIN';
  }

  function sha256Hex(buffer) {
    const AA = auth();
    if (AA?.verifyContentHash && buffer) {
      return Promise.resolve().then(async () => {
        const api = global.cuppingElectron?.attachments || global.tadawi?.attachments;
        if (api?.hashBuffer) return api.hashBuffer(buffer);
        if (global.crypto?.subtle && buffer) {
          const ab = buffer instanceof ArrayBuffer ? buffer : (buffer.buffer || buffer);
          const dig = await crypto.subtle.digest('SHA-256', ab);
          return Array.from(new Uint8Array(dig)).map((b) => b.toString(16).padStart(2, '0')).join('');
        }
        throw new Error('hash_unavailable');
      });
    }
    return Promise.resolve().then(async () => {
      const api = global.cuppingElectron?.attachments || global.tadawi?.attachments;
      if (api?.hashBuffer) return api.hashBuffer(buffer);
      if (global.crypto?.subtle && buffer) {
        const ab = buffer instanceof ArrayBuffer ? buffer : (buffer.buffer || buffer);
        const dig = await crypto.subtle.digest('SHA-256', ab);
        return Array.from(new Uint8Array(dig)).map((b) => b.toString(16).padStart(2, '0')).join('');
      }
      throw new Error('hash_unavailable');
    });
  }

  function findById(manifest, id) {
    if (auth()?.findById) {
      const hit = auth().findById(id);
      if (hit) return hit;
    }
    return (manifest.items || []).find((x) => x && x.id === id) || null;
  }

  async function createAttachment(meta, buffer, options) {
    options = options || {};
    const bid = branchId(options.branchId);
    const cid = centerId();
    if (!cid) return { ok: false, error: 'no_center_id' };
    if (global.LegacyBranchMigration?.isPushBlocked?.()) {
      return { ok: false, error: 'legacy_branch_migration_required' };
    }
    const writeCtx = global.BranchContexts?.assertOperationalWriteContext?.();
    if (writeCtx && writeCtx.ok === false) return writeCtx;

    const api = global.cuppingElectron?.attachments || global.tadawi?.attachments;
    let validated = { ok: true, filename: meta?.filename || 'file', sha256: meta?.sha256, size: meta?.size || 0 };
    if (api?.validate) {
      validated = await api.validate(meta, buffer);
      if (!validated?.ok) return { ok: false, error: 'validation_failed', errors: validated.errors };
    } else if (buffer) {
      validated.sha256 = await sha256Hex(buffer);
      validated.size = buffer.byteLength || buffer.length || 0;
    }
    if (!validated.sha256) return { ok: false, error: 'hash_required' };

    const AA = auth();
    if (AA?.findByHash) {
      const dup = AA.findByHash(validated.sha256, bid);
      if (dup && dup.state !== STATES.DELETED) {
        return { ok: true, item: dup, state: dup.state, duplicate: true };
      }
    }

    const id = 'att-' + validated.sha256.slice(0, 16) + '-' + Date.now().toString(36);
    const remotePath = global.DriveLayout?.attachmentBlobPath?.(cid, bid, validated.sha256)
      || `NajjarTech/centers/${cid}/branches/${bid}/attachments/${validated.sha256}`;

    const item = {
      id,
      state: STATES.PENDING,
      centerId: cid,
      branchId: bid,
      recordId: meta?.recordId || null,
      recordTable: meta?.recordTable || null,
      filename: validated.filename || meta?.filename || 'file',
      sha256: validated.sha256,
      size: validated.size || 0,
      mime: meta?.mime || 'application/octet-stream',
      remotePath,
      localPath: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    };

    if (AA?.assertBranchWrite) {
      const gate = AA.assertBranchWrite(item, bid);
      if (!gate.ok) return gate;
    }

    if (api?.writeLocal) {
      const local = await api.writeLocal(validated.sha256, buffer);
      if (!local?.ok) return { ok: false, error: local?.error || 'local_write_failed' };
      item.localPath = local.path || null;
    }

    const manifest = loadManifest();
    manifest.items.push(item);
    await saveManifest(manifest);
    return { ok: true, item, state: item.state };
  }

  async function uploadAttachment(attachmentId, options) {
    options = options || {};
    const manifest = loadManifest();
    const item = findById(manifest, attachmentId);
    if (!item) return { ok: false, error: 'not_found' };
    if (item.state === STATES.DELETED || item.state === STATES.QUARANTINED) {
      return { ok: false, error: 'not_uploadable', state: item.state };
    }
    if (item.centerId !== centerId()) return { ok: false, error: 'wrong_center' };

    const AA = auth();
    if (AA?.assertBranchWrite) {
      const gate = AA.assertBranchWrite(item, branchId());
      if (!gate.ok) return gate;
    }

    item.state = STATES.UPLOADING;
    item.attempts = (item.attempts || 0) + 1;
    item.updatedAt = new Date().toISOString();
    await saveManifest(manifest);

    try {
      const api = global.cuppingElectron?.attachments || global.tadawi?.attachments;
      let buffer = options.buffer || null;
      if (!buffer && api?.readLocal) {
        const read = await api.readLocal(item.sha256);
        if (!read?.ok || !read.buffer) {
          item.state = STATES.FAILED;
          item.lastError = 'file_missing_locally';
          await saveManifest(manifest);
          return { ok: false, error: 'file_missing_locally', item };
        }
        buffer = read.buffer;
      }
      if (!buffer) {
        item.state = STATES.FAILED;
        item.lastError = 'no_buffer';
        await saveManifest(manifest);
        return { ok: false, error: 'no_buffer', item };
      }

      const hashCheck = AA?.verifyContentHash
        ? await AA.verifyContentHash(buffer, item.sha256)
        : { ok: (await sha256Hex(buffer)) === item.sha256 };
      if (!hashCheck.ok) {
        item.state = STATES.QUARANTINED;
        item.lastError = hashCheck.error || 'hash_mismatch';
        await saveManifest(manifest);
        return { ok: false, error: 'hash_mismatch', item };
      }

      const up = await global.DriveAdapter?.uploadBinary?.(item.remotePath, buffer, {
        contentType: item.mime,
        sha256: item.sha256,
        resume: options.resume !== false,
      });
      if (!up || up.ok === false) {
        const up2 = await global.BackupBridge?.uploadSyncFile?.(buffer, item.sha256, 'google', item.remotePath);
        if (!up2?.ok) {
          item.state = STATES.FAILED;
          item.lastError = up?.error || up2?.error || 'upload_failed';
          await saveManifest(manifest);
          return { ok: false, error: item.lastError, item };
        }
      }

      item.state = STATES.SYNCED;
      item.lastError = null;
      item.syncedAt = new Date().toISOString();
      item.updatedAt = item.syncedAt;
      await saveManifest(manifest);
      return { ok: true, item, state: STATES.SYNCED };
    } catch (e) {
      item.state = STATES.FAILED;
      item.lastError = String(e?.message || e);
      item.updatedAt = new Date().toISOString();
      await saveManifest(manifest);
      return { ok: false, error: item.lastError, item };
    }
  }

  async function markMissingRemote(attachmentId) {
    const manifest = loadManifest();
    const item = findById(manifest, attachmentId);
    if (!item) return { ok: false, error: 'not_found' };
    item.state = STATES.MISSING_REMOTE;
    item.updatedAt = new Date().toISOString();
    await saveManifest(manifest);
    return { ok: true, item };
  }

  async function deleteAttachment(attachmentId, options) {
    options = options || {};
    const manifest = loadManifest();
    const item = findById(manifest, attachmentId);
    if (!item) return { ok: false, error: 'not_found' };
    item.state = STATES.DELETED;
    item.deletedAt = new Date().toISOString();
    item.updatedAt = item.deletedAt;
    await saveManifest(manifest);
    if (options.propagate !== false && item.remotePath && global.DriveAdapter?.deleteFile) {
      try { await global.DriveAdapter.deleteFile(item.remotePath); } catch { /* empty */ }
    }
    return { ok: true, item, state: STATES.DELETED };
  }

  async function retryFailed(limit) {
    const manifest = loadManifest();
    const failed = (manifest.items || []).filter((i) => i && i.state === STATES.FAILED).slice(0, limit || 20);
    const results = [];
    for (const item of failed) {
      results.push(await uploadAttachment(item.id, { resume: true }));
    }
    return { ok: true, results };
  }

  function list(filter) {
    const items = loadManifest().items || [];
    if (!filter) return items.slice();
    return items.filter((i) => {
      if (filter.state && i.state !== filter.state) return false;
      if (filter.branchId && i.branchId !== filter.branchId) return false;
      if (filter.recordId && i.recordId !== filter.recordId) return false;
      return true;
    });
  }

  function verifyBranchIsolation(branchIdWanted) {
    const AA = auth();
    if (AA?.verifyBranchIsolation) return AA.verifyBranchIsolation(branchIdWanted);
    const leaks = list().filter((i) => i.state !== STATES.DELETED && i.branchId && i.branchId !== branchIdWanted);
    return { ok: leaks.length === 0, leaks };
  }

  global.AttachmentLifecycle = {
    MANIFEST_KEY,
    STATES,
    loadManifest,
    createAttachment,
    uploadAttachment,
    markMissingRemote,
    deleteAttachment,
    retryFailed,
    list,
    verifyBranchIsolation,
  };
})(typeof window !== 'undefined' ? window : globalThis);
