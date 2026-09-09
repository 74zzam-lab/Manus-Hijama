#!/usr/bin/env node
/**
 * Phase 11 — migration safety: pre-backup, dry-run, rollback on failure.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const errors = [];

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

const migrationSafety = require('../database/migration-safety');
const { migrateFromSnapshot } = require('../database/migrate-from-json');
const { openDatabase } = require('../database/connection');
const { createRepositories } = require('../database/repositories');
const truth = require('../database/operational-error-truth');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p11-mig-'));
const dbPath = path.join(tmpDir, 'clinic.db');
const backupPath = path.join(tmpDir, 'pre-migrate.db');

function seedDb() {
  const db = openDatabase(dbPath);
  const repos = createRepositories(db);
  repos.clients.upsert({
    id: 'C-SEED-1',
    name: 'عميل اختبار',
    phone: '0500000001',
    branchId: 'BR-MAIN',
  });
  db.close();
}

// Backup gate when DB exists
seedDb();
const beforeSha = migrationSafety.sha256File(dbPath);
const refused = migrateFromSnapshot({
  snapshot: { clientsRegistry: [], cases: [] },
  dbPath,
});
assert(!refused.ok && refused.error === 'migration_backup_required', 'refuse migrate without backup');
assert(beforeSha === migrationSafety.sha256File(dbPath), 'original untouched when backup refused');

// Rollback via finalizeMigrationRun after simulated failed import
seedDb();
const rollbackSha = migrationSafety.sha256File(dbPath);
const rollbackBackup = path.join(tmpDir, 'rollback.db');
const ctx = migrationSafety.prepareMigrationRun({ dbPath, backupPath: rollbackBackup });
assert(ctx.ok === true, 'prepare rollback ctx');
const wipeDb = openDatabase(dbPath);
wipeDb.prepare('DELETE FROM clients').run();
wipeDb.close();
const rolled = migrationSafety.finalizeMigrationRun(ctx, {
  ok: false,
  error: 'comparison_mismatch',
});
assert(rolled.rollbackApplied === true, 'rollback applied via finalize');
assert(rolled.rollback?.ok === true, 'rollback ok');
assert(migrationSafety.sha256File(dbPath) === rollbackSha, 'rollback restores pre-migrate bytes');

// Dry-run does not modify original
seedDb();
const drySha = migrationSafety.sha256File(dbPath);
const dry = migrateFromSnapshot({
  snapshot: {
    clientsRegistry: [
      { id: 'C-SEED-1', name: 'عميل اختبار', phone: '0500000001', branchId: 'BR-MAIN' },
    ],
    cases: [],
    bookings: [],
    doctors: [],
    attendance: [],
    expenses: [],
  },
  dbPath,
  dryRun: true,
});
assert(dry.ok === true && dry.dryRun === true, 'dry-run succeeds');
assert(drySha === migrationSafety.sha256File(dbPath), 'dry-run leaves original unchanged');

// Successful migration with backup
seedDb();
const goodSnapshot = {
  clientsRegistry: [{ id: 'C-SEED-1', name: 'عميل اختبار', phone: '0500000001', branchId: 'BR-MAIN' }],
  cases: [],
  bookings: [],
  doctors: [],
  attendance: [],
  expenses: [],
};
const ok = migrateFromSnapshot({
  snapshot: goodSnapshot,
  dbPath,
  backupPath: path.join(tmpDir, 'pre-migrate-ok.db'),
});
assert(ok.ok === true, 'successful migration');
assert(ok.preMigrationBackup?.sha256, 'pre-migration backup recorded');

// Error truth catalog
const backupMsg = truth.present('migration_backup_required');
assert(backupMsg.userMessageAr.includes('نسخة احتياطية'), 'migration_backup_required Arabic');
const mismatchMsg = truth.present('comparison_mismatch');
assert(mismatchMsg.userMessageAr.includes('استعادة'), 'comparison_mismatch Arabic');

// Row count helper
const preserved = migrationSafety.assertRowCountPreserved(5, 5, 'clients');
assert(preserved.ok === true, 'row count preserved');
const lost = migrationSafety.assertRowCountPreserved(5, 3, 'clients');
assert(lost.ok === false, 'row count mismatch detected');

try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* ignore */
}

if (errors.length) {
  console.error('FAIL verify-migration-safety');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS verify-migration-safety');
