'use strict';

/**
 * Attachment metadata authority — canonical `attachments_meta` records (Node helpers + tests).
 */
const { sha256Buffer } = require('./attachment-sync');

const META_TABLE = 'attachments_meta';
const LEGACY_MANIFEST_KEY = '__tdw_attachment_manifest__';

function itemToMetaRecord(item) {
  if (!item || !item.sha256) return null;
  const state = item.state || 'PENDING';
  return {
    id: item.id || `att-${String(item.sha256).slice(0, 16)}`,
    branchId: item.branchId || 'BR-MAIN',
    centerId: item.centerId || '',
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
    deletedAt: state === 'DELETED' ? (item.deletedAt || item.updatedAt || new Date().toISOString()) : (item.deletedAt || null),
    attempts: Number(item.attempts || 0),
    lastError: item.lastError || null,
    syncedAt: item.syncedAt || null,
    revision: Number(item.revision || 1),
    deviceId: item.deviceId || '',
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

function migrateLegacyManifest(legacy) {
  if (!legacy || !Array.isArray(legacy.items)) return [];
  return legacy.items.map(itemToMetaRecord).filter(Boolean);
}

function mergeBranchSlice(allRecords, branchRecords, branchId) {
  const bid = String(branchId || 'BR-MAIN');
  const other = (allRecords || []).filter((r) => r && r.branchId && r.branchId !== bid);
  const slice = (branchRecords || []).filter((r) => r && (!r.branchId || r.branchId === bid));
  return other.concat(slice);
}

function assertBranchWrite(item, branchId) {
  const bid = String(branchId || 'BR-MAIN');
  if (!item) return { ok: false, error: 'item_required' };
  if (item.branchId && String(item.branchId) !== bid) {
    return { ok: false, error: 'branch_authority_denied', branchId: item.branchId, wanted: bid };
  }
  return { ok: true };
}

function verifyContentHash(buffer, expectedSha256) {
  const expected = String(expectedSha256 || '').toLowerCase();
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
    return { ok: false, error: 'hash_invalid' };
  }
  if (!buffer) return { ok: false, error: 'buffer_required' };
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const actual = sha256Buffer(buf);
  if (actual !== expected) {
    return { ok: false, error: 'hash_mismatch', expected, actual };
  }
  return { ok: true, sha256: actual };
}

function filterForBranch(records, branchId) {
  const bid = String(branchId || '');
  if (!bid) return (records || []).slice();
  return (records || []).filter((r) => !r?.branchId || r.branchId === bid);
}

function findByHash(records, sha256, branchId) {
  const h = String(sha256 || '').toLowerCase();
  return (records || []).find(
    (r) => r && String(r.sha256).toLowerCase() === h && (!branchId || r.branchId === branchId)
  ) || null;
}

module.exports = {
  META_TABLE,
  LEGACY_MANIFEST_KEY,
  itemToMetaRecord,
  metaRecordToItem,
  migrateLegacyManifest,
  mergeBranchSlice,
  assertBranchWrite,
  verifyContentHash,
  filterForBranch,
  findByHash,
};
