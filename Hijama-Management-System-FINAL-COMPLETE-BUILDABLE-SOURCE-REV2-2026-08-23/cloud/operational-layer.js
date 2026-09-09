/**
 * Operational Layer — per-branch table export/import (Cloud V2 Sprint 4).
 * Phase 1: record-level merge via RecordMerger (includes inventory).
 */
(function (global) {
  'use strict';

  const TABLE_FILES = {
    cases: 'cases.json',
    clientsRegistry: 'clients.json',
    bookings: 'bookings.json',
    expenses: 'expenses.json',
    attendance: 'attendance.json',
    doctors: 'doctors.json',
    inventoryItems: 'inventory-items.json',
    inventorySuppliers: 'inventory-suppliers.json',
    inventoryMovements: 'inventory-movements.json',
    attachments_meta: 'attachments-meta.json',
    messageLog: 'message-log.json',
    activityLog: 'activity-log.json',
    nextSessions: 'next-sessions.json',
    otRecords: 'ot-records.json',
    employeeLeaveRequests: 'employee-leave-requests.json',
    employeeLedgerAccruals: 'employee-ledger-accruals.json',
    employeeLedgerPayments: 'employee-ledger-payments.json',
    employeeLedgerEntries: 'employee-ledger-entries.json',
    importHistory: 'import-history.json',
    communicationWebhookLog: 'communication-webhook-log.json',
    cashDrawerSession: 'cash-drawer-session.json',
    systemLogs: 'system-logs.json',
    opsKv: 'ops-kv.json',
  };

  const OPERATIONAL_TABLES = Object.keys(TABLE_FILES);
  const OBJECT_PACKS = new Set(['opsKv', 'cashDrawerSession']);

  function getCenterId() {
    return global.ConfigLayer?.getCenterId?.() || '';
  }

  function drivePathForTable(centerId, branchId, table) {
    const file = TABLE_FILES[table] || `${table}.json`;
    const base = String(file).replace(/\.json$/i, '');
    // V2-4: prefer identity-stable path (centerId/branchId) so rename does not move sync root
    if (global.DriveLayout?.idBranchRoot) {
      return `${global.DriveLayout.idBranchRoot(centerId, branchId)}/Operational/${base}.json`;
    }
    return global.DriveLayout?.operationalBranchFile?.(centerId, branchId, base)
      || `${centerId}/Operational/branches/${branchId}/${file}`;
  }

  function readScalar(key, fallback) {
    try {
      const fromWin = global[key];
      if (fromWin != null && fromWin !== '') {
        const n = Number(fromWin);
        if (Number.isFinite(n)) return n;
      }
    } catch { /* empty */ }
    try {
      const fromDb = global.DB?.get?.(key, fallback);
      const n = Number(fromDb);
      if (Number.isFinite(n)) return n;
    } catch { /* empty */ }
    return fallback;
  }

  function todayIsoDate() {
    return new Date().toISOString().split('T')[0];
  }

  function scanMaxLogCounter() {
    let max = 0;
    const logs = Array.isArray(global.systemLogs)
      ? global.systemLogs
      : (global.DB?.get?.('systemLogs', []) || []);
    (Array.isArray(logs) ? logs : []).forEach((entry) => {
      const m = String(entry && entry.id || '').match(/(\d+)\s*$/);
      if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
    });
    return max;
  }

  function exportOpsKvRecords() {
    return [
      { id: 'invoiceCounter', value: Math.max(1, readScalar('invoiceCounter', 1)) },
      { id: 'clientFileCounter', value: Math.max(1, readScalar('clientFileCounter', 1)) },
      { id: 'budget', value: readScalar('budget', 0) },
      { id: 'logCounter', value: Math.max(0, readScalar('logCounter', 0), scanMaxLogCounter()) },
    ];
  }

  function applyOpsKvRecords(records, branchId) {
    const byId = {};
    (Array.isArray(records) ? records : []).forEach((r) => {
      if (r && r.id) byId[r.id] = r;
    });
    const invoiceCounter = Math.max(
      1,
      readScalar('invoiceCounter', 1),
      Number(byId.invoiceCounter && byId.invoiceCounter.value) || 1
    );
    const clientFileCounter = Math.max(
      1,
      readScalar('clientFileCounter', 1),
      Number(byId.clientFileCounter && byId.clientFileCounter.value) || 1
    );
    const budget = Math.max(
      0,
      readScalar('budget', 0),
      Number(byId.budget && byId.budget.value) || 0
    );
    const logCounter = Math.max(
      0,
      readScalar('logCounter', 0),
      Number(byId.logCounter && byId.logCounter.value) || 0,
      scanMaxLogCounter()
    );
    global.invoiceCounter = invoiceCounter;
    global.clientFileCounter = clientFileCounter;
    try { global.DB?.set?.('invoiceCounter', invoiceCounter); } catch { /* empty */ }
    try { global.DB?.set?.('clientFileCounter', clientFileCounter); } catch { /* empty */ }
    try { global.DB?.set?.('budget', budget); } catch { /* empty */ }
    try { global.DB?.set?.('logCounter', logCounter); } catch { /* empty */ }
    try { global.logCounter = logCounter; } catch { /* empty */ }
    try { global.BranchDataIsolation?.persistActiveBranchCounters?.(branchId); } catch { /* empty */ }
    try { global.DocumentSequences?.reconcileDocumentSequences?.(); } catch { /* empty */ }
    return { invoiceCounter: global.invoiceCounter, clientFileCounter: global.clientFileCounter, budget, logCounter };
  }

  function readCashDrawerSession() {
    try {
      if (global.cashDrawerSession && typeof global.cashDrawerSession === 'object') {
        return global.cashDrawerSession;
      }
    } catch { /* empty */ }
    try {
      const fromDb = global.DB?.get?.('cashDrawerSession', null);
      if (fromDb && typeof fromDb === 'object') return fromDb;
    } catch { /* empty */ }
    return null;
  }

  function recomputeForeignFromMovements(movements) {
    const foreign = {};
    (Array.isArray(movements) ? movements : []).forEach((m) => {
      if (!m || !m.foreignAmount || !m.foreignCurrency) return;
      const code = String(m.foreignCurrency);
      foreign[code] = (Number(foreign[code]) || 0) + Number(m.foreignAmount);
    });
    return foreign;
  }

  function sessionToRecords(session, branchId) {
    if (!session || typeof session !== 'object') return [];
    const date = session.date || todayIsoDate();
    const header = {
      id: `session:${date}`,
      kind: 'session',
      date,
      openingFloat: Number(session.openingFloat) || 0,
      denominations: session.denominations && typeof session.denominations === 'object' ? session.denominations : {},
      foreign: session.foreign && typeof session.foreign === 'object' ? session.foreign : {},
      openedAt: session.openedAt || '',
      openedBy: session.openedBy || '',
      updatedAt: session.updatedAt || session.openedAt || '',
      branchId: session.branchId || branchId || 'BR-MAIN',
    };
    const movements = (Array.isArray(session.movements) ? session.movements : []).map((m, idx) => ({
      ...(m && typeof m === 'object' ? m : {}),
      id: (m && m.id) || `mov:${date}:${idx}`,
      kind: 'movement',
      date,
      branchId: (m && m.branchId) || header.branchId,
    }));
    return [header].concat(movements);
  }

  function recordsToSession(records) {
    const list = Array.isArray(records) ? records : [];
    const headers = list.filter((r) => r && (r.kind === 'session' || (r.id && String(r.id).indexOf('session:') === 0)));
    const movements = list.filter((r) => r && r.kind === 'movement');
    let header = headers[0] || null;
    headers.forEach((h) => {
      if (!header) header = h;
      else if (String(h.date || '') > String(header.date || '')) header = h;
      else if (String(h.date || '') === String(header.date || '')
        && String(h.updatedAt || h.openedAt || '') > String(header.updatedAt || header.openedAt || '')) {
        header = h;
      }
    });
    if (!header && !movements.length) return null;
    const date = (header && header.date) || (movements[0] && movements[0].date) || todayIsoDate();
    const dateMoves = movements.filter((m) => !m.date || m.date === date);
    return {
      date,
      openingFloat: Number(header && header.openingFloat) || 0,
      denominations: (header && header.denominations) || {},
      foreign: (header && header.foreign) || recomputeForeignFromMovements(dateMoves),
      movements: dateMoves,
      openedAt: (header && header.openedAt) || '',
      openedBy: (header && header.openedBy) || '',
      updatedAt: (header && header.updatedAt) || '',
      branchId: (header && header.branchId) || '',
    };
  }

  function mergeCashSessions(local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    const today = todayIsoDate();
    if (local.date !== remote.date) {
      if (local.date === today) return local;
      if (remote.date === today) return remote;
      return String(remote.date || '') > String(local.date || '') ? remote : local;
    }
    const byId = new Map();
    (Array.isArray(local.movements) ? local.movements : []).forEach((m) => {
      if (m && m.id) byId.set(String(m.id), m);
    });
    (Array.isArray(remote.movements) ? remote.movements : []).forEach((m) => {
      if (m && m.id && !byId.has(String(m.id))) byId.set(String(m.id), m);
    });
    const localStamp = String(local.updatedAt || local.openedAt || '');
    const remoteStamp = String(remote.updatedAt || remote.openedAt || '');
    const headerSrc = remoteStamp > localStamp ? remote : local;
    const movements = Array.from(byId.values()).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    return {
      date: local.date,
      openingFloat: Number(headerSrc.openingFloat) || 0,
      denominations: headerSrc.denominations && typeof headerSrc.denominations === 'object' ? headerSrc.denominations : {},
      foreign: recomputeForeignFromMovements(movements),
      movements,
      openedAt: local.openedAt || remote.openedAt || '',
      openedBy: local.openedBy || remote.openedBy || '',
      updatedAt: localStamp >= remoteStamp ? localStamp : remoteStamp,
      branchId: local.branchId || remote.branchId || '',
    };
  }

  function persistCashDrawerSession(session) {
    global.cashDrawerSession = session;
    try { global.DB?.set?.('cashDrawerSession', session); } catch { /* empty */ }
    return session;
  }

  function exportCashDrawerRecords() {
    return sessionToRecords(readCashDrawerSession(), global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN');
  }

  function applyCashDrawerRecords(records, branchId) {
    const remote = recordsToSession(records);
    const local = readCashDrawerSession();
    const merged = mergeCashSessions(local, remote);
    if (merged && branchId && !merged.branchId) merged.branchId = branchId;
    persistCashDrawerSession(merged);
    return merged;
  }

  function packPayload(table, branchId, records) {
    return {
      centerId: getCenterId(),
      branchId,
      table,
      exportedAt: new Date().toISOString(),
      revision: global.Repository?.getRevision?.(table) || 0,
      records: Array.isArray(records) ? records : [],
    };
  }

  function exportTable(table, branchId) {
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    if (table === 'opsKv') return packPayload(table, branchId, exportOpsKvRecords());
    if (table === 'cashDrawerSession') return packPayload(table, branchId, exportCashDrawerRecords());
    const repo = global.Repository;
    let rows = repo?.get?.(table) || global.DB?.get?.(repo?.tableKey?.(table) || table, []);
    if (global.SettingsSplit?.filterRecordsForBranch) {
      rows = global.SettingsSplit.filterRecordsForBranch(rows, branchId);
    } else if (global.BranchScope?.filterByBranch) {
      rows = global.BranchScope.filterByBranch(rows, branchId);
    }
    if (Array.isArray(rows)) {
      rows = rows.map(r => global.BranchScope?.ensureRecordBranch?.({ ...r }, branchId) || r);
    }
    return packPayload(table, branchId, Array.isArray(rows) ? rows : []);
  }

  function importTable(table, payload, branchId, options) {
    options = options || {};
    branchId = branchId || payload?.branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    const records = Array.isArray(payload?.records) ? payload.records : (Array.isArray(payload) ? payload : []);
    if (table === 'opsKv') {
      const applied = applyOpsKvRecords(records, branchId);
      return { ok: true, table, branchId, count: records.length, merged: true, opsKv: applied };
    }
    if (table === 'cashDrawerSession') {
      const applied = applyCashDrawerRecords(records, branchId);
      return { ok: true, table, branchId, count: records.length, merged: true, cashDrawerSession: applied };
    }
    const repo = global.Repository;

    const incoming = records.map(r => {
      const row = { ...r, branchId: r.branchId || branchId };
      return global.BranchScope?.ensureRecordBranch?.(row, branchId) || row;
    });

    const existing = repo?.get?.(table) || global.DB?.get?.(repo?.tableKey?.(table) || table, []) || [];

    if (global.RecordMerger?.mergeRecords && options.skipMerge !== true) {
      const mergeResult = global.RecordMerger.mergeRecords(existing, incoming, {
        table,
        branchId,
        enqueueConflicts: options.enqueueConflicts !== false,
        preserveOtherBranches: true
      });

      if (mergeResult.hasConflict) {
        global.SyncGuard?.pause?.('conflict', { table, conflicts: mergeResult.conflicts });
        return {
          ok: false,
          blocked: true,
          hasConflict: true,
          table,
          branchId,
          conflicts: mergeResult.conflicts,
          stats: mergeResult.stats
        };
      }

      if (repo?.setAll) {
        repo.setAll(table, mergeResult.merged, { branchId, source: options.source || 'import' });
      } else {
        global.DB?.set?.(repo?.tableKey?.(table) || table, mergeResult.merged);
      }

      if (table === 'systemLogs') {
        try { applyOpsKvRecords([], branchId); } catch { /* lift logCounter from merged logs */ }
      }

      return {
        ok: true,
        table,
        branchId,
        count: incoming.length,
        merged: true,
        stats: mergeResult.stats
      };
    }

    const otherBranches = Array.isArray(existing)
      ? existing.filter(r => r && r.branchId && r.branchId !== branchId)
      : [];
    const merged = otherBranches.concat(incoming);

    if (repo?.setAll) repo.setAll(table, merged, { branchId, source: options.source || 'import_legacy' });
    else global.DB?.set?.(repo?.tableKey?.(table) || table, merged);

    global.AuditLogger?.logSyncEvent?.('SYSTEM_ERROR', {
      entity: table,
      summary: 'importTable بدون RecordMerger — مسار legacy',
      meta: { branchId, count: records.length }
    });

    return { ok: true, table, branchId, count: records.length, legacy: true };
  }

  function exportAllOperational(branchId) {
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    const out = {};
    OPERATIONAL_TABLES.forEach(t => { out[t] = exportTable(t, branchId); });
    return out;
  }

  global.OperationalLayer = {
    TABLE_FILES,
    OPERATIONAL_TABLES,
    OBJECT_PACKS,
    drivePathForTable,
    exportTable,
    importTable,
    exportAllOperational,
    exportOpsKvRecords,
    applyOpsKvRecords,
    exportCashDrawerRecords,
    applyCashDrawerRecords,
    mergeCashSessions
  };
})(typeof window !== 'undefined' ? window : globalThis);
