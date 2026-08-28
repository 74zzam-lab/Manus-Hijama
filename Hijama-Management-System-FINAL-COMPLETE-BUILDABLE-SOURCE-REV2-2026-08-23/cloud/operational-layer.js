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
    opsKv: 'ops-kv.json',
  };

  const OPERATIONAL_TABLES = Object.keys(TABLE_FILES);

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

  function exportOpsKvRecords() {
    return [
      { id: 'invoiceCounter', value: Math.max(1, readScalar('invoiceCounter', 1)) },
      { id: 'clientFileCounter', value: Math.max(1, readScalar('clientFileCounter', 1)) },
      { id: 'budget', value: readScalar('budget', 0) },
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
    global.invoiceCounter = invoiceCounter;
    global.clientFileCounter = clientFileCounter;
    try { global.DB?.set?.('invoiceCounter', invoiceCounter); } catch { /* empty */ }
    try { global.DB?.set?.('clientFileCounter', clientFileCounter); } catch { /* empty */ }
    try { global.DB?.set?.('budget', budget); } catch { /* empty */ }
    try { global.BranchDataIsolation?.persistActiveBranchCounters?.(branchId); } catch { /* empty */ }
    try { global.DocumentSequences?.reconcileDocumentSequences?.(); } catch { /* empty */ }
    return { invoiceCounter: global.invoiceCounter, clientFileCounter: global.clientFileCounter, budget };
  }

  function exportTable(table, branchId) {
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    if (table === 'opsKv') {
      return {
        centerId: getCenterId(),
        branchId,
        table,
        exportedAt: new Date().toISOString(),
        revision: global.Repository?.getRevision?.(table) || 0,
        records: exportOpsKvRecords(),
      };
    }
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
    return {
      centerId: getCenterId(),
      branchId,
      table,
      exportedAt: new Date().toISOString(),
      revision: repo?.getRevision?.(table) || 0,
      records: Array.isArray(rows) ? rows : []
    };
  }

  function importTable(table, payload, branchId, options) {
    options = options || {};
    branchId = branchId || payload?.branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    const records = Array.isArray(payload?.records) ? payload.records : (Array.isArray(payload) ? payload : []);
    if (table === 'opsKv') {
      const applied = applyOpsKvRecords(records, branchId);
      return { ok: true, table, branchId, count: records.length, merged: true, opsKv: applied };
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
    drivePathForTable,
    exportTable,
    importTable,
    exportAllOperational,
    exportOpsKvRecords,
    applyOpsKvRecords
  };
})(typeof window !== 'undefined' ? window : globalThis);
