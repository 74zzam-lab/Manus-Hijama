/**
 * Attachment Authority — `attachments_meta` is canonical; legacy manifest migrated on read.
 */
(function (global) {
  'use strict';

  const META_TABLE = 'attachments_meta';
  const LEGACY_MANIFEST_KEY = '__tdw_attachment_manifest__';

  function itemToMetaRecord(item) {
    if (!item || !item.sha256) return null;
    const state = item.state || 'PENDING';
    return {
      id: item.id || `att-${String(item.sha256).slice(0, 16)}`,
      branchId: item.branchId || branchId(),
      centerId: item.centerId || centerId(),
      recordId: item.recordId || null,
      recordTable: item.recordTable || null,
      filename: item.filename || 'file',
      sha256: String(item.sha256).toLowerCase(),
      size: Number(item.size || 0),
      mime: item.mime || 'application/octet-stream',
      remotePath: item.remotePath || '',
      state,
      localPath: item.localPath || null,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
      deletedAt: state === 'DELETED'
        ? (item.deletedAt || item.updatedAt || new Date().toISOString())
        : (item.deletedAt || null),
      attempts: Number(item.attempts || 0),
      lastError: item.lastError || null,
      syncedAt: item.syncedAt || null,
      revision: Number(item.revision || 1),
      deviceId: item.deviceId || global.RecordMetadata?.getDeviceId?.() || '',
    };
  }

  function metaRecordToItem(record) {
    if (!record || !record.sha256) return null;
    return {
      id: record.id,
      state: record.state || 'PENDING',
      centerId: record.centerId || '',
      branchId: record.branchId || 'BR-MAIN',
      recordId: record.recordId || null,
      recordTable: record.recordTable || null,
      filename: record.filename || 'file',
      sha256: record.sha256,
      size: record.size || 0,
      mime: record.mime || 'application/octet-stream',
      remotePath: record.remotePath || '',
      localPath: record.localPath || null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      deletedAt: record.deletedAt || null,
      attempts: record.attempts || 0,
      lastError: record.lastError || null,
      syncedAt: record.syncedAt || null,
      revision: record.revision || 1,
      deviceId: record.deviceId || '',
    };
  }

  function centerId() {
    return global.CenterId?.getStoredCenterId?.()
      || global.LicenseCloud?.loadLocal?.()?.centerId
      || '';
  }

  function branchId(explicit) {
    return explicit
      || global.BranchContexts?.getOperationalWriteBranch?.()
      || global.BranchScope?.getActiveBranchId?.()
      || 'BR-MAIN';
  }

  function readRawRecords() {
    let rows = null;
    try {
      if (global.Repository?.get) rows = global.Repository.get(META_TABLE);
    } catch { /* empty */ }
    if (!Array.isArray(rows)) {
      try { rows = global.DB?.get?.(META_TABLE, []); } catch { rows = []; }
    }
    return Array.isArray(rows) ? rows : [];
  }

  function migrateLegacyIfNeeded() {
    const existing = readRawRecords();
    if (existing.length) return { migrated: false, count: 0 };
    let legacy = null;
    try { legacy = global.DB?.get?.(LEGACY_MANIFEST_KEY, null); } catch { legacy = null; }
    if (!legacy?.items?.length) return { migrated: false, count: 0 };
    const records = legacy.items.map(itemToMetaRecord).filter(Boolean);
    if (!records.length) return { migrated: false, count: 0 };
    void saveRecords(records, { source: 'legacy_manifest_migrate', skipBranchMerge: true, skipBranchGate: true }).catch(() => {});
    return { migrated: true, count: records.length };
  }

  function loadRecords(options) {
    options = options || {};
    migrateLegacyIfNeeded();
    let rows = readRawRecords();
    if (options.branchId) {
      rows = rows.filter((r) => !r?.branchId || r.branchId === options.branchId);
    }
    if (options.activeOnly) {
      rows = rows.filter((r) => r && r.state !== 'DELETED' && !r.deletedAt);
    }
    return rows;
  }

  function loadItems(options) {
    return loadRecords(options).map(metaRecordToItem).filter(Boolean);
  }

  function assertBranchWrite(item, wantedBranchId) {
    const bid = String(wantedBranchId || branchId());
    if (!item) return { ok: false, error: 'item_required' };
    if (item.branchId && String(item.branchId) !== bid) {
      return { ok: false, error: 'branch_authority_denied', branchId: item.branchId, wanted: bid };
    }
    return { ok: true };
  }

  async function saveRecords(records, options) {
    options = options || {};
    const bid = branchId(options.branchId);
    const normalized = (records || []).map((r) => {
      if (r.sha256 && !r.state) return itemToMetaRecord(r);
      return r;
    }).filter(Boolean);

    for (const rec of normalized) {
      if (options.skipBranchGate) continue;
      const gate = assertBranchWrite(
        { branchId: rec.branchId || bid },
        bid
      );
      if (!gate.ok) return gate;
    }

    let merged = normalized;
    if (!options.skipBranchMerge) {
      const all = readRawRecords();
      const branchSlice = normalized.filter((r) => !r.branchId || r.branchId === bid);
      merged = all.filter((r) => r && r.branchId && r.branchId !== bid).concat(branchSlice);
    }

    if (global.Repository?.setAll && global.Repository.isSyncedTable?.(META_TABLE)) {
      const write = await global.Repository.setAll(META_TABLE, merged, {
        branchId: bid,
        source: options.source || 'attachment_authority',
      });
      if (write?.ok === false) return { ok: false, error: write.error || 'attachment_commit_failed', via: 'repository' };
      return { ok: true, count: merged.length, via: 'repository', write };
    }

    if (global.SqliteBridge?.setAuthoritative) {
      const write = await global.SqliteBridge.setAuthoritative(META_TABLE, merged);
      return write?.ok === false
        ? { ok: false, error: write.error || 'attachment_commit_failed', via: 'sqlite_bridge' }
        : { ok: true, count: merged.length, via: 'sqlite_bridge', res: write };
    }

    try {
      const write = await Promise.resolve(global.DB?.set?.(META_TABLE, merged));
      if (write?.ok === false) return { ok: false, error: write.error || 'attachment_commit_failed', via: 'db_fallback' };
    } catch (error) {
      return { ok: false, error: error?.code || 'attachment_commit_failed', via: 'db_fallback' };
    }
    return { ok: true, count: merged.length, via: 'db_fallback' };
  }

  async function saveItems(items, options) {
    const records = (items || []).map(itemToMetaRecord).filter(Boolean);
    return saveRecords(records, options);
  }

  async function upsertItem(item, options) {
    options = options || {};
    const bid = branchId(options.branchId);
    const gate = assertBranchWrite(item, bid);
    if (!gate.ok) return gate;
    const rec = itemToMetaRecord({ ...item, branchId: item.branchId || bid });
    if (!rec) return { ok: false, error: 'invalid_item' };

    const all = readRawRecords();
    const idx = all.findIndex((r) => r && r.id === rec.id);
    if (idx >= 0) all[idx] = { ...all[idx], ...rec, updatedAt: new Date().toISOString() };
    else all.push(rec);

    return saveRecords(all, { branchId: bid, source: options.source || 'attachment_upsert' });
  }

  async function verifyContentHash(buffer, expectedSha256) {
    const expected = String(expectedSha256 || '').toLowerCase();
    if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
      return { ok: false, error: 'hash_invalid' };
    }
    if (!buffer) return { ok: false, error: 'buffer_required' };
    try {
      const api = global.cuppingElectron?.attachments || global.tadawi?.attachments;
      if (api?.hashBuffer) {
        const actual = String(await api.hashBuffer(buffer)).toLowerCase();
        if (actual !== expected) return { ok: false, error: 'hash_mismatch', expected, actual };
        return { ok: true, sha256: actual };
      }
      if (global.crypto?.subtle) {
        const ab = buffer instanceof ArrayBuffer ? buffer : (buffer.buffer || buffer);
        const dig = await crypto.subtle.digest('SHA-256', ab);
        const actual = Array.from(new Uint8Array(dig)).map((b) => b.toString(16).padStart(2, '0')).join('');
        if (actual !== expected) return { ok: false, error: 'hash_mismatch', expected, actual };
        return { ok: true, sha256: actual };
      }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
    return { ok: false, error: 'hash_unavailable' };
  }

  function findById(attachmentId) {
    const id = String(attachmentId || '');
    const rec = readRawRecords().find((r) => r && r.id === id);
    return rec ? metaRecordToItem(rec) : null;
  }

  function findByHash(sha256, wantedBranchId) {
    const h = String(sha256 || '').toLowerCase();
    const bid = wantedBranchId || branchId();
    const rec = readRawRecords().find(
      (r) => r && String(r.sha256).toLowerCase() === h && (!bid || r.branchId === bid)
    );
    return rec ? metaRecordToItem(rec) : null;
  }

  function verifyBranchIsolation(branchIdWanted) {
    const bid = branchId(branchIdWanted);
    const leaks = loadItems({ branchId: bid }).filter(
      (i) => i.state !== 'DELETED' && i.branchId && i.branchId !== bid
    );
    return { ok: leaks.length === 0, leaks };
  }

  global.AttachmentAuthority = {
    META_TABLE,
    LEGACY_MANIFEST_KEY,
    itemToMetaRecord,
    metaRecordToItem,
    centerId,
    branchId,
    migrateLegacyIfNeeded,
    loadRecords,
    loadItems,
    saveRecords,
    saveItems,
    upsertItem,
    assertBranchWrite,
    verifyContentHash,
    findById,
    findByHash,
    verifyBranchIsolation,
  };
})(typeof window !== 'undefined' ? window : globalThis);
