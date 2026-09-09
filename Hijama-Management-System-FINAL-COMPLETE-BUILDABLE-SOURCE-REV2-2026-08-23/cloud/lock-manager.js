/**
 * Record Locks — prevent concurrent edits on same entity (Cloud V2 Sprint 4).
 */
(function (global) {
  'use strict';

  const LOCKS_KEY = '__tdw_record_locks__';
  const DEFAULT_TTL_MS = 3 * 60 * 1000;

  function nowIso() {
    return new Date().toISOString();
  }

  function loadAll() {
    return global.DB?.get?.(LOCKS_KEY, {}) || {};
  }

  function saveAll(all) {
    global.DB?.set?.(LOCKS_KEY, all);
    return all;
  }

  function branchDoc(branchId) {
    const all = loadAll();
    if (!all[branchId]) all[branchId] = { locks: [] };
    return all[branchId];
  }

  function saveBranch(branchId, doc) {
    const all = loadAll();
    all[branchId] = doc;
    return saveAll(all);
  }

  function getActor() {
    const cfg = global.DeviceConfig?.load?.() || {};
    const user = global.currentUser || {};
    return {
      deviceUuid: cfg.deviceUuid || '',
      deviceName: cfg.deviceName || global.settings?.backup?.deviceName || 'Device',
      userId: user.id || '',
      userName: user.fullName || user.username || ''
    };
  }

  function purgeExpired(branchId) {
    const doc = branchDoc(branchId);
    const now = Date.now();
    doc.locks = (doc.locks || []).filter(l => {
      if (!l?.until) return false;
      return new Date(l.until).getTime() > now;
    });
    saveBranch(branchId, doc);
    return doc;
  }

  function findLock(branchId, entity, entityId) {
    const doc = purgeExpired(branchId);
    return (doc.locks || []).find(l => l.entity === entity && l.entityId === entityId) || null;
  }

  function isOwnedByThisDevice(lock) {
    if (!lock?.lockedBy) return false;
    const uuid = global.DeviceConfig?.load?.()?.deviceUuid;
    return !!(uuid && lock.lockedBy.deviceUuid === uuid);
  }

  function acquire(branchId, entity, entityId, options) {
    options = options || {};
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    if (!entity || entityId == null) return { ok: false, error: 'invalid_lock_target' };

    const doc = purgeExpired(branchId);
    const existing = findLock(branchId, entity, entityId);
    if (existing && !isOwnedByThisDevice(existing)) {
      return { ok: false, locked: true, lock: existing, lockedBy: existing.lockedBy };
    }

    const ttl = Number(options.ttlMs) || DEFAULT_TTL_MS;
    const lock = {
      entity,
      entityId: String(entityId),
      lockedBy: getActor(),
      acquiredAt: nowIso(),
      until: new Date(Date.now() + ttl).toISOString()
    };

    doc.locks = (doc.locks || []).filter(l => !(l.entity === entity && l.entityId === String(entityId)));
    doc.locks.push(lock);
    saveBranch(branchId, doc);

    if (typeof global.AuditLogger?.log === 'function') {
      global.AuditLogger.log({
        action: 'RECORD_LOCK_ACQUIRED',
        entity,
        entityId: String(entityId),
        branchId,
        summary: `Lock ${entity}:${entityId}`
      });
    }

    return { ok: true, lock };
  }

  function release(branchId, entity, entityId) {
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    const doc = branchDoc(branchId);
    const before = (doc.locks || []).length;
    doc.locks = (doc.locks || []).filter(l => !(l.entity === entity && l.entityId === String(entityId)));
    if (doc.locks.length !== before) {
      saveBranch(branchId, doc);
      if (typeof global.AuditLogger?.log === 'function') {
        global.AuditLogger.log({
          action: 'RECORD_LOCK_RELEASED',
          entity,
          entityId: String(entityId),
          branchId,
          summary: `Unlock ${entity}:${entityId}`
        });
      }
    }
    return { ok: true };
  }

  function forceRelease(branchId, entity, entityId, reason) {
    const res = release(branchId, entity, entityId);
    if (typeof global.AuditLogger?.log === 'function') {
      global.AuditLogger.log({
        action: 'RECORD_LOCK_FORCE_RELEASED',
        entity,
        entityId: String(entityId),
        branchId,
        summary: reason || 'Owner force unlock'
      });
    }
    return res;
  }

  function isLocked(branchId, entity, entityId) {
    const lock = findLock(branchId, entity, entityId);
    if (!lock) return { locked: false };
    if (isOwnedByThisDevice(lock)) return { locked: false, owned: true, lock };
    return { locked: true, lock, lockedBy: lock.lockedBy };
  }

  function toDriveJson(branchId) {
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    return { locks: purgeExpired(branchId).locks || [] };
  }

  function drivePath(centerId, branchId) {
    return global.DriveLayout?.syncLocksJson?.(centerId, branchId) || '';
  }

  function guardEdit(branchId, entity, entityId, actionLabel) {
    const st = isLocked(branchId, entity, entityId);
    if (!st.locked) return true;
    const who = st.lockedBy?.deviceName || st.lock?.lockedBy?.deviceName || 'جهاز آخر';
    const user = st.lockedBy?.userName || st.lock?.lockedBy?.userName || '';
    const msg = actionLabel
      ? `${actionLabel} — السجل قيد التعديل على ${who}${user ? ' — ' + user : ''}`
      : `السجل قيد التعديل على ${who}${user ? ' — ' + user : ''}`;
    global.notify?.('🔒 ' + msg, 'warning');
    return false;
  }

  global.LockManager = {
    LOCKS_KEY,
    DEFAULT_TTL_MS,
    acquire,
    release,
    forceRelease,
    isLocked,
    findLock,
    purgeExpired,
    toDriveJson,
    drivePath,
    guardEdit
  };

  global.guardRecordEdit = function (entity, entityId, actionLabel) {
    return guardEdit(global.BranchScope?.getActiveBranchId?.(), entity, entityId, actionLabel);
  };
})(typeof window !== 'undefined' ? window : globalThis);
