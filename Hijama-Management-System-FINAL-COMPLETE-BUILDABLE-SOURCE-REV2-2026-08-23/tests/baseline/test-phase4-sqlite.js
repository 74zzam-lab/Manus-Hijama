#!/usr/bin/env node
'use strict';

/**
 * Phase 4 — SQLite migration tests.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

let openDatabase;
let integrityCheck;
let getSchemaVersion;
let createRepositories;
let migrateFromSnapshot;
let exportSnapshot;
let dedupeById;

try {
  ({ openDatabase, integrityCheck, getSchemaVersion } = require('../../database/connection'));
  ({ createRepositories } = require('../../database/repositories'));
  ({ migrateFromSnapshot, exportSnapshot, dedupeById } = require('../../database/migrate-from-json'));
} catch (err) {
  const msg = String(err && err.message || err);
  console.error('FAIL: phase4 sqlite');
  console.error(' - native module load failed:', msg);
  if (/better-sqlite3|NODE_MODULE_VERSION|could not locate the bindings|invalid ELF header|ERR_DLOPEN_FAILED/i.test(msg)) {
    console.error(' - fix on this host: npm rebuild better-sqlite3');
    console.error(' - or: npm install better-sqlite3 --build-from-source');
    console.error(' - note: npm run build:win can replace Linux .node bindings with Windows ones');
  }
  process.exit(1);
}

const errors = [];
function check(cond, msg) {
  if (!cond) errors.push(msg);
}

/**
 * Fail fast with actionable guidance when migrateFromSnapshot cannot open
 * better-sqlite3 (common after cross-platform rebuilds such as build:win).
 * Does not weaken assertions — it only replaces a cryptic TypeError on
 * report.target.clients with an explicit native-module failure.
 */
function ensureMigrationOk(report, label) {
  if (!report) {
    console.error('FAIL: phase4 sqlite');
    console.error(' - ' + label + ': missing migration report');
    process.exit(1);
  }
  if (report.ok !== true) {
    const err = String(report.error || '');
    const msg = String(report.message || '');
    console.error('FAIL: phase4 sqlite');
    console.error(' - ' + label + ': ' + (err || msg || 'migration_failed'));
    if (/ERR_DLOPEN_FAILED|invalid ELF header|better-sqlite3|NODE_MODULE_VERSION|could not locate the bindings/i.test(err + ' ' + msg)) {
      console.error(' - native module was likely rebuilt for another platform (e.g. after npm run build:win)');
      console.error(' - fix on this host: npm rebuild better-sqlite3');
    }
    process.exit(1);
  }
  if (!report.target) {
    console.error('FAIL: phase4 sqlite');
    console.error(' - ' + label + ': migration report missing target');
    process.exit(1);
  }
}

function makeSnapshot(overrides = {}) {
  return {
    _meta: { version: 3, date: '2026-07-27T00:00:00.000Z' },
    clientsRegistry: [
      { id: 'c1', name: 'محمد', phone: '0500000001', fileNo: 'F-1' },
      { id: 'c2', name: 'سارة', phone: '0500000002', fileNo: 'F-2' },
    ],
    doctors: [
      { id: 'd1', name: 'أحمد', salary: 5000, active: true },
      { id: 'd2', name: 'خالد', salary: 4000, active: true },
    ],
    cases: [
      { id: 'v1', invoice: 'TM-2026-0001', clientRegistryId: 'c1', doctorId: 'd1', date: '2026-07-01', total: 115, cash: 115, cups: 5 },
      { id: 'v2', invoice: 'TM-2026-0002', clientRegistryId: 'c2', doctorId: 'd2', date: '2026-07-02', total: 200, card: 200, cups: 8 },
    ],
    bookings: [
      { id: 'b1', name: 'محمد', date: '2026-07-10', time: '10:00', doctorId: 'd1', status: 'pending' },
    ],
    attendance: [
      { id: 'a1', doctorId: 'd1', date: '2026-07-01', type: 'normal', totalHours: 8 },
    ],
    expenses: [
      { id: 'e1', desc: 'مستلزمات', amount: 50, date: '2026-07-01', cat: 'تشغيل' },
    ],
    invoiceCounter: 3,
    settings: { vatRate: 15 },
    users: [{ id: 'u1', username: 'admin', role: 'admin' }],
    packages: [],
    services: [{ id: 's1', name: 'حجامة' }],
    ...overrides,
  };
}

function tmpDb() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-sqlite-')), 'tadawi.db');
}

async function main() {
  // Empty migration
  {
    const dbPath = tmpDb();
    const report = migrateFromSnapshot({ snapshot: makeSnapshot({
      clientsRegistry: [], cases: [], bookings: [], doctors: [], attendance: [], expenses: [],
    }), dbPath });
    ensureMigrationOk(report, 'empty migration');
    check(report.ok, 'empty migration ok');
    check(report.target.clients === 0 && report.target.visits === 0, 'empty counts');
  }

  // Happy path + financial totals
  {
    const dbPath = tmpDb();
    const snap = makeSnapshot();
    const report = migrateFromSnapshot({ snapshot: snap, dbPath });
    ensureMigrationOk(report, 'happy migration');
    check(report.ok, 'happy migration ok: ' + (report.error || ''));
    check(report.comparison.countOk, 'counts match');
    check(report.comparison.totalsOk, 'totals match');
    check(Math.abs(report.target.visitTotalSum - 315) < 0.01, 'visit sum 315');
    check(report.target.schemaVersion >= 4, 'schema v4+ (v5 includes V2-4 sync platform)');
    const db = openDatabase(dbPath);
    check(getSchemaVersion(db) >= 4, 'schema version >=4 reopen');
    check(getSchemaVersion(db) >= 5, 'schema version >=5 after 002_sync_platform');
    check(integrityCheck(db).ok, 'integrity ok');
    db.close();
  }

  // Duplicate IDs collapsed
  {
    const dbPath = tmpDb();
    const snap = makeSnapshot({
      clientsRegistry: [
        { id: 'c1', name: 'قديم' },
        { id: 'c1', name: 'جديد' },
      ],
    });
    const report = migrateFromSnapshot({ snapshot: snap, dbPath, allowQuarantine: true });
    ensureMigrationOk(report, 'dedupe migration');
    check(report.ok, 'dedupe migration accepted with quarantine');
    check(report.quarantineAccepted === true, 'duplicate legacy ID requires explicit quarantine acceptance');
    check(report.quarantine.some((row) => row.reason === 'duplicate_id' && row.key === 'clientsRegistry'),
      'duplicate legacy ID recorded in migration quarantine');
    check(report.target.clients === 1, 'deduped clients count 1');
    const exported = exportSnapshot(dbPath);
    check(exported.clientsRegistry[0].name === 'جديد', 'last duplicate wins');
  }

  // Incomplete / invalid JSON
  {
    const report = migrateFromSnapshot({ snapshot: null, dbPath: tmpDb() });
    check(report.ok === false && report.error === 'invalid_json', 'null snapshot rejected');
  }

  // Orphan visit client -> null client_id kept
  {
    const dbPath = tmpDb();
    const snap = makeSnapshot({
      cases: [
        { id: 'v9', invoice: 'TM-X', clientRegistryId: 'missing', doctorId: 'd1', date: '2026-07-01', total: 10 },
      ],
    });
    const report = migrateFromSnapshot({ snapshot: snap, dbPath, allowQuarantine: true });
    ensureMigrationOk(report, 'orphan client visit');
    check(report.ok && report.quarantineAccepted === true, 'orphan client visit migrates with accepted quarantine');
    check(report.quarantine.some((row) => row.reason === 'orphan_visit_client' && row.id === 'v9'),
      'orphan client reference recorded in migration quarantine');
    const db = openDatabase(dbPath);
    const row = db.prepare('SELECT client_id, total FROM visits WHERE id=?').get('v9');
    check(row.client_id == null, 'orphan client_id nulled');
    check(row.total === 10, 'orphan visit total kept');
    db.close();
  }

  // Attendance with missing employee skipped
  {
    const dbPath = tmpDb();
    const snap = makeSnapshot({
      attendance: [
        { id: 'a1', doctorId: 'd1', date: '2026-07-01', type: 'normal' },
        { id: 'a2', doctorId: 'missing', date: '2026-07-01', type: 'normal' },
      ],
    });
    const report = migrateFromSnapshot({ snapshot: snap, dbPath, allowQuarantine: true });
    ensureMigrationOk(report, 'attendance skip missing employee');
    check(report.ok && report.quarantineAccepted === true, 'attendance skip missing employee accepted with quarantine');
    check(report.quarantine.some((row) => row.reason === 'orphan_attendance_employee' && row.id === 'a2'),
      'missing attendance employee recorded in migration quarantine');
    check(report.target.attendance === 1, 'only valid attendance imported');
    check(report.comparison.skippedAttendance === 1, 'skippedAttendance recorded');
  }

  // Non-negative expense column (upsert clamps negatives)
  {
    const db = openDatabase(tmpDb());
    const repos = createRepositories(db);
    repos.expenses.upsert({ id: 'e0', amount: -5, date: '2026-07-01' });
    const row = db.prepare('SELECT amount FROM expenses WHERE id=?').get('e0');
    check(row.amount >= 0, 'expense column non-negative');
    db.close();
  }

  // Re-run migration safely
  {
    const dbPath = tmpDb();
    const snap = makeSnapshot();
    const r1 = migrateFromSnapshot({ snapshot: snap, dbPath });
    const r2 = migrateFromSnapshot({
      snapshot: snap,
      dbPath,
      backupPath: dbPath + '.pre-rerun.bak',
    });
    ensureMigrationOk(r1, 're-run migration first');
    ensureMigrationOk(r2, 're-run migration second');
    check(r1.ok && r2.ok, 're-runnable migration');
    check(r2.target.visits === r1.target.visits, 'stable counts after rerun');
  }

  // Transaction rollback on hard failure: inject bad employee then attendance without employee by bypassing filter
  {
    const dbPath = tmpDb();
    // Force failure inside open db by using repositories incorrectly
    const db = openDatabase(dbPath);
    const repos = createRepositories(db);
    let rolled = false;
    try {
      const tx = db.transaction(() => {
        repos.clients.upsert({ id: 'c1', name: 'X' });
        // invalid attendance FK
        db.prepare(`INSERT INTO attendance (id, employee_id, date, payload_json, created_at)
          VALUES ('a1','missing','2026-07-01','{}','2026-07-01')`).run();
      });
      tx();
    } catch {
      rolled = true;
    }
    check(rolled, 'fk violation throws');
    check(repos.clients.count() === 0, 'rollback left no clients');
    db.close();
  }

  // Large-ish dataset
  {
    const dbPath = tmpDb();
    const clients = [];
    const cases = [];
    const doctors = [{ id: 'd1', name: 'Doc', salary: 1, active: true }];
    for (let i = 0; i < 500; i++) {
      clients.push({ id: 'c' + i, name: 'Client ' + i, phone: '05' + String(i).padStart(8, '0') });
      cases.push({
        id: 'v' + i,
        invoice: 'TM-' + i,
        clientRegistryId: 'c' + i,
        doctorId: 'd1',
        date: '2026-07-01',
        total: 10,
      });
    }
    const report = migrateFromSnapshot({
      snapshot: makeSnapshot({ clientsRegistry: clients, cases, doctors, attendance: [], bookings: [], expenses: [] }),
      dbPath,
    });
    ensureMigrationOk(report, 'large migration');
    check(report.ok, 'large migration ok');
    check(report.target.clients === 500 && report.target.visits === 500, 'large counts');
    check(Math.abs(report.target.visitTotalSum - 5000) < 0.01, 'large totals');
  }

  // Pre-migration backup of existing db
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-bk-'));
    const dbPath = path.join(dir, 'tadawi.db');
    const backupPath = path.join(dir, 'pre.db');
    migrateFromSnapshot({ snapshot: makeSnapshot(), dbPath });
    const report = migrateFromSnapshot({
      snapshot: makeSnapshot({ expenses: [{ id: 'e2', amount: 9, date: '2026-07-03' }] }),
      dbPath,
      backupPath,
    });
    check(report.ok, 'backup+remigrate ok');
    check(fs.existsSync(backupPath), 'pre-migration backup created');
  }

  // Export roundtrip
  {
    const dbPath = tmpDb();
    migrateFromSnapshot({ snapshot: makeSnapshot(), dbPath });
    const exported = exportSnapshot(dbPath);
    check(exported.cases.length === 2, 'export visits');
    check(exported.invoiceCounter === 3, 'export counter');
  }

  // dedupe helper
  check(dedupeById([{ id: '1', a: 1 }, { id: '1', a: 2 }]).length === 1, 'dedupe helper');

  // No raw SQL API in preload placeholder replaced
  const preload = fs.readFileSync(path.join(__dirname, '..', '..', 'electron', 'preload.js'), 'utf8');
  check(preload.includes("database:querySafe"), 'querySafe channel present');
  check(preload.includes('op_not_allowed') === false, 'preload does not embed SQL');
  check(preload.includes('database:migrateFromBackup'), 'migrate IPC present');

  if (errors.length) {
    console.error('FAIL: phase-4 sqlite');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('OK: phase-4 sqlite migration (empty/large/dupes/orphan/fk-rollback/totals/rerun/backup)');
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
