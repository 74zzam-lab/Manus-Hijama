/**
 * Record metadata — required fields on every synced record.
 */
(function (global) {
  'use strict';

  const REQUIRED = ['id', 'createdAt', 'updatedAt', 'revision', 'deviceId', 'branchId'];

  function nowIso() {
    return new Date().toISOString();
  }

  function getDeviceId() {
    return global.DeviceConfig?.load?.()?.deviceUuid
      || global.DeviceConfig?.ensureDeviceUuid?.()
      || '';
  }

  function getBranchId(fallback) {
    return fallback
      || global.BranchScope?.getActiveBranchId?.()
      || global.DeviceConfig?.getLockedBranchId?.()
      || null;
  }

  function getUserId() {
    const u = global.currentUser;
    return u?.id || u?.userId || '';
  }

  function getUserLabel() {
    const u = global.currentUser;
    return u?.fullName || u?.username || u?.id || 'system';
  }

  function migrateLegacy(record, branchId) {
    if (!record || typeof record !== 'object') return record;
    const out = { ...record };
    const ts = nowIso();
    if (!out.createdAt) out.createdAt = out.date || out.savedAt || ts;
    if (!out.updatedAt) out.updatedAt = out.modifiedAt || out.createdAt || ts;
    if (out.revision == null) out.revision = 0;
    if (!out.deviceId) out.deviceId = getDeviceId() || 'legacy';
    if (!out.branchId) out.branchId = branchId || getBranchId(out.branchId);
    if (!out.createdBy) out.createdBy = out.createdById || out.userId || getUserLabel();
    if (!out.updatedBy) out.updatedBy = getUserLabel();
    return out;
  }

  function stampNew(record, ctx) {
    ctx = ctx || {};
    if (!record || typeof record !== 'object') return record;
    const ts = nowIso();
    const branchId = getBranchId(ctx.branchId || record.branchId);
    const deviceId = getDeviceId();
    const userLabel = getUserLabel();
    return migrateLegacy({
      ...record,
      createdAt: record.createdAt || ts,
      updatedAt: ts,
      revision: 1,
      deviceId: deviceId || record.deviceId || 'unknown',
      branchId,
      createdBy: record.createdBy || userLabel,
      updatedBy: userLabel
    }, branchId);
  }

  function stampUpdate(record, prev, ctx) {
    ctx = ctx || {};
    if (!record || typeof record !== 'object') return record;
    const prevRev = Number(prev?.revision) || Number(record.revision) || 0;
    const branchId = getBranchId(ctx.branchId || record.branchId || prev?.branchId);
    return migrateLegacy({
      ...record,
      createdAt: record.createdAt || prev?.createdAt || nowIso(),
      updatedAt: nowIso(),
      revision: prevRev + 1,
      deviceId: getDeviceId() || record.deviceId || prev?.deviceId || 'unknown',
      branchId,
      createdBy: record.createdBy || prev?.createdBy || getUserLabel(),
      updatedBy: getUserLabel()
    }, branchId);
  }

  function validate(record) {
    if (!record || typeof record !== 'object') return { ok: false, error: 'invalid_record' };
    const missing = REQUIRED.filter(k => record[k] == null || record[k] === '');
    if (missing.length) return { ok: false, error: 'missing_metadata', missing };
    return { ok: true };
  }

  function contentHash(record) {
    if (!record) return '';
    const { revision, updatedAt, ...rest } = record;
    try {
      return JSON.stringify(rest);
    } catch {
      return String(record.id || '');
    }
  }

  function isTombstone(record) {
    return global.TombstonePolicy?.isTombstone?.(record) || !!(record && record.deletedAt);
  }

  global.RecordMetadata = {
    REQUIRED,
    migrateLegacy,
    stampNew,
    stampUpdate,
    validate,
    contentHash,
    isTombstone,
    getDeviceId,
    getBranchId,
    getUserLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
