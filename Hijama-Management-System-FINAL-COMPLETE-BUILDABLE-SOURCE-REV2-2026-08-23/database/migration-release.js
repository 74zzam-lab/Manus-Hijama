'use strict';

/**
 * V2-5.7 — Production release migration proofs (V2-4 → V2-5).
 * Seeds legacy-ish data, applies schema migrate, proves preserve + corrupt refuse + backup.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const {
  openDatabase,
  migrate,
  getSchemaVersion,
  integrityCheck,
  DatabaseOpenError,
  MIGRATIONS,
} = require('./connection');

const initial = require('./migrations/001_initial');
const syncPlatform = require('./migrations/002_sync_platform');

function nowIso() {
  return new Date().toISOString();
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function applyMigrationSql(db, migration) {
  db.exec(migration.sql);
  db.prepare(
    `INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)`
  ).run(migration.id, nowIso());
  db.prepare(
    `INSERT INTO meta(key, value) VALUES('schemaVersion', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run(String(migration.version));
}

/**
 * Build a V2-4-shaped DB: 001 only first (legacy core), seed records/attachments/owner/license,
 * then optionally leave outbox for post-002 insert, or apply 002 and seed outbox (full V2-4).
 */
function seedV24Database(dbPath, options = {}) {
  const withSyncPlatform = options.withSyncPlatform !== false;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  applyMigrationSql(db, initial);

  const ts = nowIso();
  db.prepare(
    `INSERT INTO clients (id, name, phone, branch_id, payload_json, created_at, updated_at, revision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('C-LEGACY-1', 'عميل ترحيل', '0500000001', 'BR-MAIN', JSON.stringify({ name: 'عميل ترحيل' }), ts, ts, 1);

  db.prepare(
    `INSERT INTO visits (id, invoice, client_id, total, date, payload_json, created_at, updated_at, revision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('V-LEGACY-1', 'INV-100', 'C-LEGACY-1', 150.5, '2026-07-01', JSON.stringify({ total: 150.5 }), ts, ts, 2);

  db.prepare(
    `INSERT INTO attachments (id, entity_type, entity_id, path, mime, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'ATT-LEGACY-1',
    'client',
    'C-LEGACY-1',
    'attachments/C-LEGACY-1/note.bin',
    'application/octet-stream',
    JSON.stringify({ bytes: 12 }),
    ts
  );

  db.prepare(
    `INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run('ownerUserId', 'OWNER-001');
  db.prepare(
    `INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run('branchId', 'BR-MAIN');
  db.prepare(
    `INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run('licenseId', 'LIC-V24-TEST');
  db.prepare(
    `INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run('deviceId', 'DEV-A-001');
  db.prepare(
    `INSERT INTO kv_store(key, value_json, updated_at) VALUES(?, ?, ?)`
  ).run(
    'users',
    JSON.stringify([{ id: 'OWNER-001', role: 'owner', name: 'Owner' }]),
    ts
  );

  if (withSyncPlatform) {
    applyMigrationSql(db, syncPlatform);
    db.prepare(
      `INSERT INTO sync_outbox (
        event_id, center_id, branch_id, table_name, record_id, operation,
        base_revision, new_revision, payload_json, payload_hash, device_id, actor_id,
        created_at, attempt_count, status, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'EVT-LEGACY-1',
      'CTR-001',
      'BR-MAIN',
      'clients',
      'C-LEGACY-1',
      'UPDATE',
      0,
      1,
      JSON.stringify({ id: 'C-LEGACY-1' }),
      crypto.createHash('sha256').update('C-LEGACY-1').digest('hex').slice(0, 16),
      'DEV-A-001',
      'OWNER-001',
      ts,
      0,
      'pending',
      'idem-legacy-1'
    );
  }

  const snapshot = capturePreserveSnapshot(db);
  db.close();
  return snapshot;
}

function capturePreserveSnapshot(db) {
  const count = (sql) => {
    try {
      return Number(db.prepare(sql).get().c || 0);
    } catch {
      return 0;
    }
  };
  const meta = {};
  for (const key of ['ownerUserId', 'branchId', 'licenseId', 'deviceId', 'schemaVersion']) {
    const row = db.prepare('SELECT value FROM meta WHERE key=?').get(key);
    meta[key] = row ? row.value : null;
  }
  let users = null;
  try {
    const row = db.prepare('SELECT value_json FROM kv_store WHERE key=?').get('users');
    users = row ? JSON.parse(row.value_json) : null;
  } catch {
    users = null;
  }
  let outbox = [];
  try {
    outbox = db.prepare('SELECT event_id, status, record_id FROM sync_outbox').all();
  } catch {
    outbox = [];
  }
  let attachments = [];
  try {
    attachments = db.prepare('SELECT id, path, entity_id FROM attachments').all();
  } catch {
    attachments = [];
  }
  return {
    schemaVersion: getSchemaVersion(db),
    clients: count('SELECT COUNT(*) AS c FROM clients'),
    visits: count('SELECT COUNT(*) AS c FROM visits'),
    attachments: count('SELECT COUNT(*) AS c FROM attachments'),
    outbox: count('SELECT COUNT(*) AS c FROM sync_outbox'),
    meta,
    users,
    attachmentRows: attachments,
    outboxRows: outbox,
  };
}

function createPreMigrationBackup(dbPath, backupPath) {
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(dbPath, backupPath);
  return {
    path: backupPath,
    size: fs.statSync(backupPath).size,
    sha256: sha256File(backupPath),
    at: nowIso(),
  };
}

/**
 * Open existing DB through production connection (applies pending migrations).
 */
function migrateReleaseOpen(dbPath, options = {}) {
  const db = openDatabase(dbPath, options);
  try {
    const version = migrate(db);
    const integrity = integrityCheck(db);
    const after = capturePreserveSnapshot(db);
    return { ok: integrity.ok, version, integrity, after };
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}

function assertPreserved(before, after, opts = {}) {
  const errors = [];
  if (before.clients !== after.clients) errors.push(`clients ${before.clients}→${after.clients}`);
  if (before.visits !== after.visits) errors.push(`visits ${before.visits}→${after.visits}`);
  if (before.attachments !== after.attachments) {
    errors.push(`attachments ${before.attachments}→${after.attachments}`);
  }
  if (opts.requireOutbox !== false && before.outbox > 0 && before.outbox !== after.outbox) {
    errors.push(`outbox ${before.outbox}→${after.outbox}`);
  }
  for (const key of ['ownerUserId', 'branchId', 'licenseId', 'deviceId']) {
    if (before.meta[key] !== after.meta[key]) {
      errors.push(`meta.${key} ${before.meta[key]}→${after.meta[key]}`);
    }
  }
  if (JSON.stringify(before.users) !== JSON.stringify(after.users)) {
    errors.push('users/owner RBAC mismatch');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Corrupt path: refuse empty replace via DatabaseOpenError; original preserved.
 */
function proveCorruptRefuse(tmpDir) {
  const badPath = path.join(tmpDir, 'corrupt.db');
  fs.writeFileSync(badPath, Buffer.from('NOT-A-SQLITE-DATABASE-CORRUPT'));
  const beforeHash = sha256File(badPath);
  let threw = null;
  try {
    openDatabase(badPath, { failOnCorrupt: true });
  } catch (err) {
    threw = err;
  }
  const stillExists = fs.existsSync(badPath);
  const afterHash = stillExists ? sha256File(badPath) : null;
  const size = stillExists ? fs.statSync(badPath).size : 0;
  const ok =
    threw instanceof DatabaseOpenError &&
    stillExists &&
    afterHash === beforeHash &&
    size > 0;
  return {
    ok,
    errorName: threw && threw.name,
    errorCode: threw && threw.code,
    message: threw && threw.message,
    preserved: stillExists && afterHash === beforeHash,
    refusedEmptyReplace: size > 0 && !/^SQLite format 3/.test(fs.readFileSync(badPath, 'utf8').slice(0, 16)),
  };
}

/**
 * Restore old backup into supported open path.
 */
function proveRestoreBackup(backupPath, restorePath) {
  fs.copyFileSync(backupPath, restorePath);
  const db = openDatabase(restorePath, { requireExisting: true });
  try {
    const integ = integrityCheck(db);
    const snap = capturePreserveSnapshot(db);
    return { ok: integ.ok && snap.clients >= 1, integrity: integ, snapshot: snap };
  } finally {
    db.close();
  }
}

/**
 * Full release migration suite used by harness + tests.
 */
function runMigrationReleaseProofs(options = {}) {
  const tmpDir = options.tmpDir || fs.mkdtempSync(path.join(os.tmpdir(), 'v257-mig-'));
  const cleanup = options.cleanup !== false;
  const report = {
    phase: 'V2-5.7',
    startedAt: nowIso(),
    tmpDir,
    proofs: {},
    ok: false,
  };

  try {
    // --- MIG: schema step 001 → 002 ---
    const stepDb = path.join(tmpDir, 'v24-core-only.db');
    const beforeStep = seedV24Database(stepDb, { withSyncPlatform: false });
    const stepBackup = createPreMigrationBackup(stepDb, path.join(tmpDir, 'backup-before-002.db'));
    const stepResult = migrateReleaseOpen(stepDb);
    const stepCompare = assertPreserved(beforeStep, stepResult.after, { requireOutbox: false });
    report.proofs.schemaStep001to002 = {
      ok: stepResult.ok && stepCompare.ok && Number(stepResult.after.schemaVersion) >= Number(syncPlatform.version),
      before: beforeStep,
      after: stepResult.after,
      compare: stepCompare,
      backup: stepBackup,
      migrations: MIGRATIONS.map((m) => m.id),
    };

    // --- MIG: full V2-4 preserve (records/attachments/outbox/owner/license) ---
    const fullDb = path.join(tmpDir, 'v24-full.db');
    const beforeFull = seedV24Database(fullDb, { withSyncPlatform: true });
    const fullBackup = createPreMigrationBackup(fullDb, path.join(tmpDir, 'backup-before-upgrade.db'));
    const fullResult = migrateReleaseOpen(fullDb);
    const fullCompare = assertPreserved(beforeFull, fullResult.after, { requireOutbox: true });
    report.proofs.preserveUpgrade = {
      ok: fullResult.ok && fullCompare.ok,
      before: beforeFull,
      after: fullResult.after,
      compare: fullCompare,
      backup: fullBackup,
    };

    // --- MIG: failure rollback / corrupt refuse ---
    report.proofs.corruptRefuse = proveCorruptRefuse(tmpDir);

    // --- MIG: backup before migration ---
    report.proofs.preMigrationBackup = {
      ok:
        fs.existsSync(fullBackup.path) &&
        fullBackup.size > 0 &&
        fullBackup.sha256.length === 64,
      backup: fullBackup,
    };

    // --- MIG: restore old backup ---
    const restoredPath = path.join(tmpDir, 'restored-from-backup.db');
    report.proofs.restoreOldBackup = proveRestoreBackup(fullBackup.path, restoredPath);

    report.ok = Object.values(report.proofs).every((p) => p && p.ok);
    report.finishedAt = nowIso();
    return report;
  } finally {
    if (cleanup) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

module.exports = {
  seedV24Database,
  capturePreserveSnapshot,
  createPreMigrationBackup,
  migrateReleaseOpen,
  assertPreserved,
  proveCorruptRefuse,
  proveRestoreBackup,
  runMigrationReleaseProofs,
  DatabaseOpenError,
};
