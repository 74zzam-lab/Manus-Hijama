'use strict';

/**
 * Migrate a Tadawi backup / localStorage snapshot JSON into SQLite.
 * Never deletes source data. Re-runnable (replaceAll inside a transaction).
 */
const fs = require('fs');
const path = require('path');
const { openDatabase, integrityCheck, getSchemaVersion } = require('./connection');
const { createRepositories } = require('./repositories');
const migrationSafety = require('./migration-safety');

const TABLE_KEY_MAP = {
  clientsRegistry: 'clients',
  cases: 'visits',
  bookings: 'bookings',
  doctors: 'employees',
  attendance: 'attendance',
  expenses: 'expenses',
};

const KV_KEYS = [
  'users', 'settings', 'packages', 'services', 'otRecords', 'budget', 'invoiceCounter',
  'clientFileCounter', 'messageLog', 'backupLog', 'backupRegistry', 'activityLog',
  'nextSessions', 'employeeLeaveRequests', 'employeeLedgerAccruals', 'employeeLedgerPayments',
  'employeeLedgerEntries', 'importHistory', 'hardwareLog', 'inventoryItems',
  'inventorySuppliers', 'inventoryMovements', 'attachments_meta',
  'systemLogs', 'cashDrawerSession', 'communicationWebhookLog', 'communicationQueue',
  '__tdw_conflict_queue__', '__tdw_conflict_archive__', '__tdw_attachment_manifest__',
  '__tdw_branch_settings_store__', '__tdw_branch_counters_store__',
  '__tdw_owner_profile__', '__tdw_owner_setup__', '__tdw_owner_migration__',
  '__tdw_owner_lifecycle__', '__tdw_owner_lifecycle_commit__',
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function dedupeById(list) {
  const map = new Map();
  for (const item of list || []) {
    if (!item || item.id == null) continue;
    map.set(String(item.id), item);
  }
  return [...map.values()];
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { ok: false, error: 'invalid_json' };
  }
  return { ok: true };
}

// JSON snapshots used to silently drop malformed/duplicate records and unmodelled
// operational keys. Analyse every potentially lossy input first so migration either
// stops before mutating SQLite or records an operator-approved quarantine.
function analyzeSnapshotForLoss(snapshot) {
  const quarantine = [];
  const coreKeys = Object.keys(TABLE_KEY_MAP);
  const known = new Set([...coreKeys, ...KV_KEYS, '_meta', 'meta', 'version', 'date', 'app']);
  const validIds = new Map();

  for (const key of coreKeys) {
    const seen = new Set();
    const valid = new Set();
    for (const item of asArray(snapshot[key])) {
      if (!item || typeof item !== 'object' || item.id == null || String(item.id).trim() === '') {
        quarantine.push({ key, reason: 'invalid_missing_id', id: item?.id ?? null });
        continue;
      }
      const id = String(item.id);
      if (seen.has(id)) {
        quarantine.push({ key, reason: 'duplicate_id', id });
        continue;
      }
      seen.add(id);
      valid.add(id);
    }
    validIds.set(key, valid);
  }

  const clientIds = validIds.get('clientsRegistry') || new Set();
  for (const visit of asArray(snapshot.cases)) {
    if (!visit || visit.id == null || !visit.clientRegistryId) continue;
    if (!clientIds.has(String(visit.clientRegistryId))) {
      quarantine.push({ key: 'cases', reason: 'orphan_visit_client', id: String(visit.id), reference: String(visit.clientRegistryId) });
    }
  }
  const employeeIds = validIds.get('doctors') || new Set();
  for (const row of asArray(snapshot.attendance)) {
    if (!row || row.id == null) continue;
    if (!employeeIds.has(String(row.doctorId || ''))) {
      quarantine.push({ key: 'attendance', reason: 'orphan_attendance_employee', id: String(row.id), reference: row.doctorId ?? null });
    }
  }

  for (const [key, value] of Object.entries(snapshot || {})) {
    if (known.has(key)) continue;
    if (value != null && (Array.isArray(value) || typeof value === 'object')) {
      quarantine.push({ key, reason: 'unknown_operational_key', id: null });
    }
  }

  return {
    ok: quarantine.length === 0,
    quarantine,
    counts: { quarantined: quarantine.length },
  };
}

function summarizeSource(snapshot) {
  const clients = dedupeById(asArray(snapshot.clientsRegistry));
  const visits = dedupeById(asArray(snapshot.cases));
  const bookings = dedupeById(asArray(snapshot.bookings));
  const employees = dedupeById(asArray(snapshot.doctors));
  const attendance = dedupeById(asArray(snapshot.attendance));
  const expenses = dedupeById(asArray(snapshot.expenses));
  return {
    clients: clients.length,
    visits: visits.length,
    bookings: bookings.length,
    employees: employees.length,
    attendance: attendance.length,
    expenses: expenses.length,
    visitTotalSum: visits.reduce((a, c) => a + (Number(c.total) || 0), 0),
    expenseSum: expenses.reduce((a, c) => a + (Number(c.amount) || 0), 0),
    invoiceCounter: snapshot.invoiceCounter || 0,
  };
}

/**
 * @param {object} options
 * @param {object} options.snapshot - backup object / localStorage export
 * @param {string} options.dbPath
 * @param {string} [options.backupPath] - write pre-migration copy of existing db if present
 * @param {boolean} [options.dryRun]
 */
function executeImportTransaction(snapshot, dbPath, opts, report) {
  let db;
  try {
    db = openDatabase(dbPath);
    const repos = createRepositories(db);

    // Ensure employees exist before attendance FK
    const employees = dedupeById(asArray(snapshot.doctors));
    const clients = dedupeById(asArray(snapshot.clientsRegistry));
    const visits = dedupeById(asArray(snapshot.cases));
    // Drop visits that reference missing clients? Keep visit but null client_id if missing
    const clientIds = new Set(clients.map((c) => String(c.id)));
    const safeVisits = visits.map((v) => {
      if (v.clientRegistryId && !clientIds.has(String(v.clientRegistryId))) {
        return { ...v, clientRegistryId: null, _orphanedClient: true };
      }
      return v;
    });
    const employeeIds = new Set(employees.map((e) => String(e.id)));
    const attendance = dedupeById(asArray(snapshot.attendance)).filter((a) => employeeIds.has(String(a.doctorId)));
    const skippedAttendance = dedupeById(asArray(snapshot.attendance)).length - attendance.length;

    const tx = db.transaction(() => {
      // Clear in FK-safe order before reload (re-runnable migration)
      db.prepare('DELETE FROM visit_cups').run();
      db.prepare('DELETE FROM invoice_items').run();
      db.prepare('DELETE FROM payments').run();
      db.prepare('DELETE FROM invoices').run();
      db.prepare('DELETE FROM commissions').run();
      db.prepare('DELETE FROM payroll_entries').run();
      db.prepare('DELETE FROM visits').run();
      db.prepare('DELETE FROM appointments').run();
      db.prepare('DELETE FROM attendance').run();
      db.prepare('DELETE FROM expenses').run();
      db.prepare('DELETE FROM clients').run();
      db.prepare('DELETE FROM employees').run();

      for (const item of employees) repos.employees.upsert(item);
      for (const item of clients) repos.clients.upsert(item);
      for (const item of safeVisits) repos.visits.upsert(item);
      for (const item of dedupeById(asArray(snapshot.bookings))) repos.bookings.upsert(item);
      for (const item of attendance) repos.attendance.upsert(item);
      for (const item of dedupeById(asArray(snapshot.expenses))) repos.expenses.upsert(item);

      for (const key of KV_KEYS) {
        if (snapshot[key] !== undefined) repos.kv.set(key, snapshot[key]);
      }
      if (snapshot.invoiceCounter !== undefined) repos.kv.set('invoiceCounter', snapshot.invoiceCounter);
      if (snapshot.clientFileCounter !== undefined) repos.kv.set('clientFileCounter', snapshot.clientFileCounter);
      if (report.quarantine?.length) {
        repos.kv.set('__tdw_migration_quarantine__', {
          acceptedAt: new Date().toISOString(),
          sourceLabel: String(opts.sourceLabel || 'snapshot'),
          entries: report.quarantine,
        });
        repos.kv.set('__tdw_migration_requires_review__', true);
      }

      db.prepare(
        `INSERT INTO meta(key, value) VALUES('migratedAt', ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`
      ).run(new Date().toISOString());
      db.prepare(
        `INSERT INTO meta(key, value) VALUES('migrationSource', ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`
      ).run(String(opts.sourceLabel || 'snapshot'));
      db.prepare(
        `INSERT INTO meta(key, value) VALUES('localStorageRetained', ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`
      ).run('true');
      db.prepare(
        `INSERT INTO meta(key, value) VALUES('sqlitePrimary', ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`
      ).run('true');
    });

    tx();
    report.steps.push({ step: 'import_transaction', ok: true, skippedAttendance });

    const integrity = integrityCheck(db);
    report.integrity = integrity;
    if (!integrity.ok) {
      report.ok = false;
      report.error = 'integrity_failed';
      report.finishedAt = new Date().toISOString();
      return report;
    }

    const target = {
      clients: repos.clients.count(),
      visits: repos.visits.count(),
      bookings: repos.bookings.count(),
      employees: repos.employees.count(),
      attendance: repos.attendance.count(),
      expenses: repos.expenses.count(),
      visitTotalSum: repos.visits.sumTotal(),
      expenseSum: repos.expenses.sumAmount(),
      invoiceCounter: repos.kv.get('invoiceCounter', 0),
      schemaVersion: getSchemaVersion(db),
    };
    report.target = target;

    const source = report.source || summarizeSource(snapshot);
    const countOk =
      target.clients === source.clients &&
      target.visits === source.visits &&
      target.bookings === source.bookings &&
      target.employees === source.employees &&
      target.expenses === source.expenses &&
      target.attendance === source.attendance - skippedAttendance;

    const totalsOk =
      Math.abs(target.visitTotalSum - source.visitTotalSum) < 0.02 &&
      Math.abs(target.expenseSum - source.expenseSum) < 0.02;

    report.comparison = { countOk, totalsOk, skippedAttendance };
    report.ok = countOk && totalsOk;
    if (!report.ok) report.error = 'comparison_mismatch';
    report.finishedAt = new Date().toISOString();
    return report;
  } catch (err) {
    report.ok = false;
    report.error = err.code || 'migration_failed';
    report.message = err.message;
    report.finishedAt = new Date().toISOString();
    return report;
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

function migrateFromSnapshot(options) {
  const opts = options || {};
  const snapshot = opts.snapshot;
  const validation = validateSnapshot(snapshot);
  if (!validation.ok) return { ok: false, error: validation.error };

  const source = summarizeSource(snapshot);
  const loss = analyzeSnapshotForLoss(snapshot);
  if (!loss.ok && opts.allowQuarantine !== true) {
    return {
      ok: false,
      error: 'migration_quarantine_required',
      source,
      quarantine: loss.quarantine,
      quarantineCounts: loss.counts,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
  }
  const dbPath = opts.dbPath || ':memory:';
  const safetyCtx = migrationSafety.prepareMigrationRun({
    dbPath,
    backupPath: opts.backupPath,
    dryRun: opts.dryRun,
    skipBackup: opts.skipBackup,
  });

  if (!safetyCtx.ok) {
    return migrationSafety.finalizeMigrationRun(
      { ok: true, dryRun: !!opts.dryRun, originalDbPath: dbPath, existed: false },
      { ok: false, error: safetyCtx.error, source, startedAt: new Date().toISOString() }
    );
  }

  const report = {
    startedAt: new Date().toISOString(),
    source,
    quarantine: loss.quarantine,
    quarantineCounts: loss.counts,
    quarantineAccepted: loss.quarantine.length > 0 && opts.allowQuarantine === true,
    steps: [],
    ok: false,
  };

  if (safetyCtx.backup) {
    report.steps.push({
      step: 'backup_existing_db',
      path: safetyCtx.backup.path,
      sha256: safetyCtx.backup.sha256,
    });
  }

  const core = executeImportTransaction(snapshot, safetyCtx.targetDbPath, opts, report);
  return migrationSafety.finalizeMigrationRun(safetyCtx, core);
}

function migrateFromFile(jsonPath, dbPath, options = {}) {
  const raw = fs.readFileSync(jsonPath, 'utf8');
  let snapshot;
  try {
    snapshot = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  return migrateFromSnapshot({
    ...options,
    snapshot,
    dbPath,
    sourceLabel: path.basename(jsonPath),
  });
}

/**
 * Export SQLite core tables back to a backup-like object (for dual-run / verify).
 */
function exportSnapshot(dbPath) {
  const db = openDatabase(dbPath);
  try {
    const repos = createRepositories(db);
    const kv = repos.kv.exportAll();
    return {
      _meta: {
        version: 3,
        date: new Date().toISOString(),
        app: 'Hijama Management System',
        source: 'sqlite',
        schemaVersion: getSchemaVersion(db),
      },
      clientsRegistry: repos.clients.getAll(),
      cases: repos.visits.getAll(),
      bookings: repos.bookings.getAll(),
      doctors: repos.employees.getAll(),
      attendance: repos.attendance.getAll(),
      expenses: repos.expenses.getAll(),
      ...kv,
    };
  } finally {
    db.close();
  }
}

module.exports = {
  TABLE_KEY_MAP,
  KV_KEYS,
  migrateFromSnapshot,
  migrateFromFile,
  exportSnapshot,
  summarizeSource,
  dedupeById,
  analyzeSnapshotForLoss,
};
