/**
 * Conflict Queue — conflicts held for manager resolution; closed after resolve with audit trail.
 */
(function (global) {
  'use strict';

  const QUEUE_KEY = '__tdw_conflict_queue__';
  const ARCHIVE_KEY = '__tdw_conflict_archive__';
  const MAX_ARCHIVE = 300;

  /** Telemetry-only: mirror failures must not block queue UX. */
  function logBenignMirrorFailure(stage, err) {
    try {
      global.AuditLogger?.logSyncEvent?.('CONFLICT_MIRROR_BENIGN', {
        entity: 'conflict_queue',
        entityId: stage,
        summary: String(err?.message || err || 'mirror_failed').slice(0, 120),
        meta: { stage, code: err?.code || 'sqlite_mirror_fallback' },
      });
    } catch { /* telemetry only */ }
  }

  const TABLE_LABELS = {
    cases: 'فاتورة',
    clientsRegistry: 'عميل',
    bookings: 'حجز',
    attendance: 'حضور',
    expenses: 'مصروف',
    settings: 'إعدادات',
    users: 'مستخدم',
    services: 'خدمة',
    packages: 'باقة',
    inventoryItems: 'صنف مخزون',
    inventoryMovements: 'حركة مخزون',
    doctors: 'موظف'
  };

  function recordLabel(table) {
    return TABLE_LABELS[table] || 'سجل';
  }

  function friendlySummary(item) {
    const label = recordLabel(item.table);
    const num = item.recordId || item.local?.invoiceNo || item.local?.number || item.recordId || '';
    const devices = [item.local?.deviceId, item.remote?.deviceId].filter(Boolean);
    const deviceNote = devices.length >= 2 && devices[0] !== devices[1]
      ? ' — تم تعديلها على جهازين مختلفين'
      : '';
    return `تم العثور على تعديلين مختلفين على ${label} رقم ${num}${deviceNote}`;
  }

  function dbApi() {
    return global.cuppingElectron?.database || global.tadawi?.database || null;
  }

  function loadQueue() {
    return global.DB?.get?.(QUEUE_KEY, []) || [];
  }

  function saveQueue(list) {
    // V2-5.10: prefer authoritative SQLite KV when bridge is primary
    if (typeof global.SqliteBridge?.setAuthoritative === 'function' && global.SqliteBridge?.isPrimary?.()) {
      Promise.resolve(global.SqliteBridge.setAuthoritative(QUEUE_KEY, list)).catch((err) => {
        logBenignMirrorFailure('saveQueue_sqlite', err);
        try { global.DB?.set?.(QUEUE_KEY, list); } catch (lsErr) { logBenignMirrorFailure('saveQueue_ls_fallback', lsErr); }
      });
      try { global.DB?.__rawSet?.(QUEUE_KEY, list); } catch {
        try { global.DB?.set?.(QUEUE_KEY, list); } catch { /* empty */ }
      }
      return list;
    }
    global.DB?.set?.(QUEUE_KEY, list);
    return list;
  }

  function loadArchive() {
    return global.DB?.get?.(ARCHIVE_KEY, []) || [];
  }

  function saveArchive(list) {
    const trimmed = list.slice(0, MAX_ARCHIVE);
    if (typeof global.SqliteBridge?.setAuthoritative === 'function' && global.SqliteBridge?.isPrimary?.()) {
      Promise.resolve(global.SqliteBridge.setAuthoritative(ARCHIVE_KEY, trimmed)).catch((err) => {
        logBenignMirrorFailure('saveArchive_sqlite', err);
        try { global.DB?.set?.(ARCHIVE_KEY, trimmed); } catch (lsErr) { logBenignMirrorFailure('saveArchive_ls_fallback', lsErr); }
      });
      try { global.DB?.__rawSet?.(ARCHIVE_KEY, trimmed); } catch {
        try { global.DB?.set?.(ARCHIVE_KEY, trimmed); } catch { /* empty */ }
      }
      return trimmed;
    }
    global.DB?.set?.(ARCHIVE_KEY, trimmed);
    return trimmed;
  }

  function centerIdForConflict() {
    return global.CenterId?.getStoredCenterId?.()
      || global.Organization?.getId?.()
      || global.LicenseCloud?.loadLocal?.()?.centerId
      || 'CTR';
  }

  function isSqliteAuthority() {
    return typeof global.SqliteBridge?.isPrimary === 'function' && global.SqliteBridge.isPrimary();
  }

  function stableConflictId(entry) {
    const built = global.ConflictKeys?.buildConflictId?.({
      center_id: centerIdForConflict(),
      branch_id: entry.branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN',
      table_name: entry.table || entry.table_name,
      record_id: entry.recordId || entry.record_id,
    });
    if (built) return built;
    return entry.id || entry.sqliteConflictId || `cf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function cacheQueueItem(item) {
    if (!item?.id) return;
    const list = loadQueue().filter((x) => x.id !== item.id);
    list.unshift(item);
    saveQueue(list.slice(0, 200));
  }

  function openConflictSqlite(item) {
    const api = dbApi();
    if (!api?.syncOp || !item?.id || !item.table || !item.recordId) return null;
    try {
      const result = api.syncOp({
        op: 'openConflict',
        entry: {
          conflict_id: item.id,
          center_id: centerIdForConflict(),
          branch_id: item.branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN',
          table_name: item.table,
          record_id: String(item.recordId),
          local_json: item.local || {},
          remote_json: item.remote || {},
          device_id: item.deviceId || null,
          actor_id: item.detectedBy || null,
        },
      });
      if (result?.ok) {
        item.sqliteConflictId = result.conflictId || item.id;
        return item;
      }
    } catch (err) { logBenignMirrorFailure('openConflictSqlite', err); }
    return null;
  }

  function listOpenFromSqlite(options) {
    options = options || {};
    const api = dbApi();
    if (!api?.syncOp) return [];
    try {
      const res = api.syncOp({
        op: 'listOpenConflicts',
        options: { branchId: options.branchId, table: options.table, limit: 200 },
      });
      const rows = res?.ok && Array.isArray(res.rows) ? res.rows : [];
      return rows.map(rowToQueueItem).filter((item) => {
        if (options.status && item.status !== options.status) return false;
        return true;
      });
    } catch (err) {
      logBenignMirrorFailure('listOpenFromSqlite', err);
      return [];
    }
  }

  /** @deprecated alias — use openConflictSqlite */
  function mirrorOpenToSqlite(item) {
    return openConflictSqlite(item);
  }

  function mirrorResolveToSqlite(item, resolution) {
    const api = dbApi();
    const conflictId = item.sqliteConflictId || item.id;
    if (!api?.syncOp || !conflictId) return;
    try {
      const result = api.syncOp({
        op: 'resolveConflict',
        conflictId,
        resolution: resolution.choice || item.resolution || 'manual',
        actorId: item.resolvedBy || null,
      });
      if (result && typeof result.then === 'function') result.catch(() => { /* empty */ });
    } catch { /* non-blocking */ }
  }

  function enqueue(entry) {
    entry = entry || {};
    const id = stableConflictId(entry);
    const item = {
      id,
      status: 'pending',
      table: entry.table || '',
      recordId: entry.recordId || entry.id || '',
      branchId: entry.branchId || global.BranchScope?.getActiveBranchId?.() || '',
      local: entry.local || null,
      remote: entry.remote || null,
      fields: entry.fields || [],
      reason: entry.reason || 'diverged',
      detectedAt: new Date().toISOString(),
      deviceId: global.RecordMetadata?.getDeviceId?.() || '',
      detectedBy: global.RecordMetadata?.getUserLabel?.() || 'system',
      summary: '',
      sqliteConflictId: entry.sqliteConflictId || id,
      source: isSqliteAuthority() ? 'sync_conflicts' : 'local_cache',
    };
    item.summary = friendlySummary(item);

    if (isSqliteAuthority()) {
      openConflictSqlite(item);
      cacheQueueItem(item);
    } else {
      const list = loadQueue();
      const existing = list.findIndex(x => x.status === 'pending' && x.table === item.table && x.recordId === item.recordId);
      if (existing >= 0) list[existing] = { ...list[existing], ...item, updatedAt: new Date().toISOString() };
      else list.unshift(item);
      saveQueue(list.slice(0, 200));
      openConflictSqlite(item);
    }

    global.AuditLogger?.logSyncEvent?.('CONFLICT_DETECTED', {
      entity: item.table,
      entityId: item.recordId,
      summary: item.summary,
      fields: item.fields
    });

    if (global.RolePolicy?.isManager?.(global.currentUser)) {
      global.ConflictManagerUI?.notifyPending?.();
    }

    return item;
  }

  function enqueueMany(conflicts, table, branchId) {
    return (conflicts || []).map(c => enqueue({
      table,
      branchId,
      recordId: c.id,
      local: c.local,
      remote: c.remote,
      fields: c.fields,
      reason: c.reason
    }));
  }

  function rowToQueueItem(row) {
    if (!row) return null;
    let local = {};
    let remote = {};
    try { local = typeof row.local_json === 'string' ? JSON.parse(row.local_json) : (row.local_json || {}); } catch { local = {}; }
    try { remote = typeof row.remote_json === 'string' ? JSON.parse(row.remote_json) : (row.remote_json || {}); } catch { remote = {}; }
    const item = {
      id: row.conflict_id,
      sqliteConflictId: row.conflict_id,
      status: row.status === 'open' ? 'pending' : String(row.status || 'pending'),
      table: row.table_name || '',
      recordId: String(row.record_id || ''),
      branchId: row.branch_id || '',
      local,
      remote,
      fields: [],
      reason: 'sqlite_sync_conflicts',
      detectedAt: row.created_at || new Date().toISOString(),
      deviceId: row.device_id || '',
      detectedBy: row.actor_id || 'system',
      summary: '',
      source: 'sync_conflicts',
    };
    item.summary = friendlySummary(item);
    return item;
  }

  /** SQLite-first when bridge is primary; LS is read-only cache. */
  function listMerged(options) {
    options = options || {};
    if (isSqliteAuthority()) {
      return listOpenFromSqlite(options);
    }
    const fromQueue = list(options);
    const byId = new Map(fromQueue.map((x) => [x.id, x]));
    try {
      listOpenFromSqlite(options).forEach((item) => {
        if (!byId.has(item.id)) byId.set(item.id, item);
      });
    } catch { /* non-blocking */ }
    return Array.from(byId.values());
  }

  function list(options) {
    options = options || {};
    if (isSqliteAuthority()) {
      return listOpenFromSqlite(options);
    }
    let q = loadQueue();
    if (options.status) q = q.filter(x => x.status === options.status);
    if (options.table) q = q.filter(x => x.table === options.table);
    if (options.branchId) q = q.filter(x => x.branchId === options.branchId);
    return q;
  }

  function getHistory(options) {
    options = options || {};
    let archive = loadArchive();
    if (options.table) archive = archive.filter(x => x.table === options.table);
    if (options.branchId) archive = archive.filter(x => x.branchId === options.branchId);
    if (options.since) {
      const since = new Date(options.since).getTime();
      archive = archive.filter(x => new Date(x.resolvedAt || x.detectedAt).getTime() >= since);
    }
    return archive;
  }

  function countPending(options) {
    return listMerged({ status: 'pending', ...(options || {}) }).length;
  }

  function listForUser(user, options) {
    options = options || {};
    let q = listMerged(options);
    if (!user || !global.BranchScope?.getUserBranchScope) return q;
    const scope = global.BranchScope.getUserBranchScope(user);
    if (!scope.length || scope.includes('*')) return q;
    return q.filter((item) => !item.branchId || scope.includes(item.branchId));
  }

  function applyResolutionToRepo(item, resolution) {
    const table = item.table;
    const repo = global.Repository;
    if (!repo?.get || !repo?.upsert) return { ok: false, error: 'no_repository' };
    const choice = resolution.choice || 'local';
    let record = null;

    if (choice === 'local') record = { ...item.local };
    else if (choice === 'cloud' || choice === 'remote') record = { ...item.remote };
    else if ((choice === 'manual' || choice === 'merge') && resolution.record) record = { ...resolution.record };
    else return { ok: false, error: 'invalid_resolution' };

    if (!record.id) record.id = item.recordId;
    repo.upsert(table, record, { branchId: item.branchId, source: 'conflict_resolve' });
    return { ok: true, record };
  }

  function resolve(conflictId, resolution) {
    resolution = resolution || {};
    let item = null;
    let list = loadQueue();
    let idx = list.findIndex(x => x.id === conflictId);

    if (isSqliteAuthority()) {
      const pending = listOpenFromSqlite({ status: 'pending' });
      item = pending.find((x) => x.id === conflictId) || null;
      if (!item && idx >= 0) item = list[idx];
    } else if (idx >= 0) {
      item = list[idx];
    }

    if (!item) return { ok: false, error: 'not_found' };
    if (item.status !== 'pending') return { ok: false, error: 'already_resolved' };
    if (!global.OperationalRbacGuard?.canResolveConflicts?.()
      && !global.RolePolicy?.canResolveConflicts?.()) {
      return { ok: false, error: 'manager_only' };
    }
    const mgrGate = global.OperationalRbacGuard?.requireConflictResolve?.({ notify: false });
    if (mgrGate && !mgrGate.ok) return { ok: false, error: mgrGate.error || 'manager_only' };
    if (item.branchId && global.BranchScope?.userCanAccessBranch
      && !global.BranchScope.userCanAccessBranch(global.currentUser, item.branchId)) {
      return { ok: false, error: 'branch_access_denied', branchId: item.branchId };
    }

    const applied = applyResolutionToRepo(item, resolution);
    if (!applied.ok && resolution.choice !== 'defer') return applied;

    item.status = 'resolved';
    item.resolvedAt = new Date().toISOString();
    item.resolvedBy = global.RecordMetadata?.getUserLabel?.() || 'manager';
    item.resolution = resolution.choice || 'manual';
    item.resolvedRecord = applied.record || resolution.record || null;
    if (idx >= 0) list.splice(idx, 1);
    else list = list.filter((x) => x.id !== conflictId);
    saveQueue(list);
    mirrorResolveToSqlite(item, resolution);

    const archive = loadArchive();
    archive.unshift({ ...item });
    saveArchive(archive);

    global.AuditLogger?.logSyncEvent?.('CONFLICT_RESOLVED', {
      entity: item.table,
      entityId: item.recordId,
      summary: `تم حل التعارض على ${recordLabel(item.table)} ${item.recordId} — ${resolution.choice === 'local' ? 'النسخة المحلية' : resolution.choice === 'cloud' ? 'نسخة السحابة' : 'دمج يدوي'}`,
      resolution: item.resolution,
      before: item.local,
      after: item.resolvedRecord
    });

    if (countPending() === 0) global.SyncGuard?.resume?.({ state: 'conflicts_resolved' });

    return { ok: true, item };
  }

  function getFieldDiff(item) {
    const fields = item.fields || [];
    const diff = [];
    fields.forEach(f => {
      diff.push({
        field: f,
        local: item.local?.[f],
        remote: item.remote?.[f]
      });
    });
    return diff;
  }

  global.ConflictQueue = {
    QUEUE_KEY,
    ARCHIVE_KEY,
    TABLE_LABELS,
    recordLabel,
    friendlySummary,
    loadQueue,
    enqueue,
    enqueueMany,
    list,
    listMerged,
    listForUser,
    getHistory,
    countPending,
    resolve,
    getFieldDiff,
    applyResolutionToRepo,
    mirrorOpenToSqlite,
    mirrorResolveToSqlite,
    rowToQueueItem,
    isSqliteAuthority,
    stableConflictId,
    listOpenFromSqlite,
  };
})(typeof window !== 'undefined' ? window : globalThis);
