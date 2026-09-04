/**
 * Audit Logger — commercial-grade append-only log (Cloud V2 Sprint 5).
 */
(function (global) {
  'use strict';

  const AUDIT_KEY = '__tdw_audit_log__';
  const PENDING_DRIVE_KEY = '__tdw_audit_pending_drive__';
  const MAX_LOCAL = 500;
  const FLUSH_BATCH = 50;

  const OP_ACTION_MAP = {
    USER_LOGIN: 'USER_LOGIN',
    USER_LOGOUT: 'USER_LOGOUT',
    USER_ADDED: 'USER_ADDED',
    USER_UPDATED: 'USER_UPDATED',
    USER_DELETED: 'USER_DELETED',
    SETTINGS_CHANGED: 'SETTINGS_CHANGED',
    PRICE_CHANGED: 'PRICE_CHANGED',
    PATIENT_ADDED: 'CASE_CREATED',
    PATIENT_UPDATED: 'PATIENT_UPDATED',
    PATIENT_DELETED: 'PATIENT_DELETED',
    CASE_CREATED: 'CASE_CREATED',
    CASE_UPDATED: 'CASE_UPDATED',
    CASE_DELETED: 'CASE_DELETED',
    INVOICE_CREATED: 'INVOICE_CREATED',
    BOOKING_CREATED: 'BOOKING_CREATED',
    BOOKING_UPDATED: 'BOOKING_UPDATED',
    BOOKING_CONFIRMED: 'BOOKING_UPDATED',
    BOOKING_CANCELLED: 'BOOKING_UPDATED',
    BACKUP_CREATED: 'BACKUP_CREATED',
    BACKUP_RESTORED: 'BACKUP_RESTORED',
    SYSTEM_ERROR: 'SYSTEM_ERROR',
    SCHEMA_MIGRATED: 'SCHEMA_MIGRATED',
    DEVICE_REGISTERED: 'DEVICE_REGISTERED',
    DEVICE_BRANCH_LOCKED: 'DEVICE_BRANCH_LOCKED',
    DEVICE_BRANCH_UNLOCKED: 'DEVICE_BRANCH_UNLOCKED',
    DEVICE_BRANCH_LOCK_DENIED: 'DEVICE_BRANCH_LOCK_DENIED',
    BRANCH_SESSION_SWITCHED: 'BRANCH_SESSION_SWITCHED',
    RECORD_LOCK_ACQUIRED: 'RECORD_LOCK_ACQUIRED',
    RECORD_LOCK_RELEASED: 'RECORD_LOCK_RELEASED',
    RECORD_LOCK_FORCE_RELEASED: 'RECORD_LOCK_FORCE_RELEASED',
    DATA_MERGE: 'DATA_MERGE',
    CONFLICT_DETECTED: 'CONFLICT_DETECTED',
    CONFLICT_RESOLVED: 'CONFLICT_RESOLVED',
    LOCAL_PUSH: 'LOCAL_PUSH',
    CLOUD_PULL: 'CLOUD_PULL',
    SAFE_AUTO_MERGE: 'SAFE_AUTO_MERGE',
    MANUAL_MERGE: 'MANUAL_MERGE',
    MANUAL_RESTORE: 'MANUAL_RESTORE',
    BOOTSTRAP: 'BOOTSTRAP',
    DATA_ANALYSIS: 'DATA_ANALYSIS'
  };

  function monthKey(date) {
    const d = date ? new Date(date) : new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function getCenterId() {
    return global.CloudMeta?.loadMeta?.()?.centerId
      || global.ConfigLayer?.getCenterId?.()
      || '';
  }

  function drivePathForMonth(centerId, ym) {
    return global.DriveLayout?.auditLogMonth?.(centerId, ym) || '';
  }

  function loadPending() {
    return global.DB?.get?.(PENDING_DRIVE_KEY, []) || [];
  }

  function savePending(list) {
    global.DB?.set?.(PENDING_DRIVE_KEY, list);
    return list;
  }

  function log(entry) {
    entry = {
      id: 'aud-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      ts: new Date().toISOString(),
      centerId: getCenterId(),
      branchId: entry?.branchId || global.activeBranchId || global.BranchScope?.getActiveBranchId?.() || '',
      userId: global.currentUser?.id || '',
      userName: global.currentUser?.fullName || '',
      deviceUuid: global.DeviceConfig?.load?.()?.deviceUuid || '',
      deviceName: global.DeviceConfig?.load?.()?.deviceName || global.settings?.backup?.deviceName || '',
      action: OP_ACTION_MAP[entry?.action] || entry?.action || 'UNKNOWN',
      entity: entry?.entity || '',
      entityId: entry?.entityId || '',
      before: entry?.before,
      after: entry?.after,
      summary: entry?.summary || '',
      ...entry
    };
    entry.action = OP_ACTION_MAP[entry.action] || entry.action;

    const list = global.DB?.get?.(AUDIT_KEY, []) || [];
    list.unshift(entry);
    if (list.length > MAX_LOCAL) list.length = MAX_LOCAL;
    global.DB?.set?.(AUDIT_KEY, list);

    if (global.CloudMeta?.isCloudV2Enabled?.()) {
      const pending = loadPending();
      pending.push(entry);
      if (pending.length > 200) pending.splice(0, pending.length - 200);
      savePending(pending);
      scheduleFlush();
    }

    return entry;
  }

  function logSyncEvent(action, details) {
    details = details || {};
    return log({
      action: OP_ACTION_MAP[action] || action,
      entity: details.entity || '',
      entityId: details.entityId || '',
      summary: details.summary || '',
      meta: details.meta || details
    });
  }

  let _flushTimer = null;

  function scheduleFlush() {
    if (_flushTimer) return;
    _flushTimer = setTimeout(() => {
      _flushTimer = null;
      flushToDrive().catch(() => {});
    }, 5000);
  }

  async function flushToDrive() {
    if (!global.CloudMeta?.isCloudV2Enabled?.()) return { ok: false, skipped: true };
    if (!global.DriveAdapter?.isConnected?.()) return { ok: false, offline: true };

    const centerId = getCenterId();
    if (!centerId) return { ok: false, error: 'no_center_id' };

    const pending = loadPending();
    if (!pending.length) return { ok: true, flushed: 0 };

    const byMonth = {};
    pending.forEach(e => {
      const ym = monthKey(e.ts);
      if (!byMonth[ym]) byMonth[ym] = [];
      byMonth[ym].push(e);
    });

    let flushed = 0;
    const flushedIds = new Set();
    for (const ym of Object.keys(byMonth)) {
      const remotePath = drivePathForMonth(centerId, ym);
      let existing = [];
      const dl = await global.DriveAdapter.downloadJson(remotePath);
      if (dl?.ok && Array.isArray(dl.data?.entries)) existing = dl.data.entries;
      else if (dl?.ok && Array.isArray(dl.data)) existing = dl.data;

      const merged = existing.concat(byMonth[ym]);
      const doc = {
        centerId,
        yearMonth: ym,
        updatedAt: new Date().toISOString(),
        entries: merged.slice(-5000)
      };
      const up = await global.DriveAdapter.uploadJson(remotePath, doc, { overwrite: true });
      if (up?.ok) {
        flushed += byMonth[ym].length;
        byMonth[ym].forEach(e => flushedIds.add(e.id));
      }
    }

    if (flushedIds.size) {
      savePending(pending.filter(e => !flushedIds.has(e.id)));
    }
    return { ok: true, flushed };
  }

  function logFromSystem(opType, description, extra) {
    extra = extra || {};
    return log({
      action: OP_ACTION_MAP[opType] || opType,
      entity: extra.entity || extra.legacyCategory || '',
      entityId: extra.entityId || extra.caseId || extra.invoice || '',
      summary: String(description || '').slice(0, 300),
      before: extra.before || extra.changes?.before,
      after: extra.after || extra.changes?.after,
      meta: extra
    });
  }

  function query(filter) {
    let list = global.DB?.get?.(AUDIT_KEY, []) || [];
    if (!filter) return list.slice();
    return list.filter(e => Object.keys(filter).every(k => e[k] === filter[k]));
  }

  function getRecent(limit) {
    return query().slice(0, limit || 50);
  }

  function querySyncEvents(filter) {
    const syncActions = new Set([
      'DATA_MERGE', 'CONFLICT_DETECTED', 'CONFLICT_RESOLVED', 'LOCAL_PUSH', 'CLOUD_PULL',
      'SAFE_AUTO_MERGE', 'MANUAL_MERGE', 'MANUAL_RESTORE', 'BOOTSTRAP', 'DATA_ANALYSIS'
    ]);
    return query(filter).filter(e => syncActions.has(e.action));
  }

  global.AuditLogger = {
    AUDIT_KEY,
    PENDING_DRIVE_KEY,
    OP_ACTION_MAP,
    log,
    logSyncEvent,
    logFromSystem,
    query,
    querySyncEvents,
    getRecent,
    flushToDrive,
    scheduleFlush,
    drivePathForMonth,
    monthKey
  };
})(typeof window !== 'undefined' ? window : globalThis);
