#!/usr/bin/env node
'use strict';

/**
 * Regression: Backup V2 restore failed at `verifying_archive` with
 * `backup_database_integrity_failed` whenever the packaged database was not already
 * at the running application's schema version, or carried orphan rows.
 *
 * A backup is by definition a snapshot of an older build, so the pre-migration
 * verification must accept a lower schema version and let `migrateStagedDatabase`
 * upgrade it. Only real corruption, or a schema newer than the application, may abort.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { MIGRATIONS } = require('../../database/connection');
const hybridSchema = require('../../database/hybrid-schema');
const backupV2 = require('../../electron/backup-v2-core');
const operationalDbHealth = require('../../database/operational-db-health');

const CURRENT = hybridSchema.CURRENT_SCHEMA_VERSION;

function seedClient(db, id) {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO clients (id, name, phone, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, `Client ${id}`, `05000000${id}`, '{}', now, now);
}

/** Build a database that stopped at `targetVersion` — what an older build left behind. */
function buildDatabaseAtSchemaVersion(dbPath, targetVersion) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);');
  for (const migration of MIGRATIONS) {
    if (Number(migration.version) > targetVersion) break;
    db.exec(migration.sql);
    db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(
      migration.id,
      new Date().toISOString()
    );
    db.prepare(
      `INSERT INTO meta(key, value) VALUES('schemaVersion', ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`
    ).run(String(migration.version));
  }
  return db;
}

function makeUserDataDir(root, name) {
  const userDataDir = path.join(root, name);
  fs.mkdirSync(path.join(userDataDir, 'database'), { recursive: true });
  fs.mkdirSync(path.join(userDataDir, 'settings'), { recursive: true });
  fs.mkdirSync(path.join(userDataDir, 'attachments'), { recursive: true });
  fs.writeFileSync(
    path.join(userDataDir, 'settings', 'app.json'),
    JSON.stringify({ theme: 'light' }, null, 2)
  );
  return userDataDir;
}

function expectCode(fn, expectedCode, label) {
  let thrown = null;
  try { fn(); } catch (error) { thrown = error; }
  assert.ok(thrown, `${label}: expected a failure`);
  const code = String(thrown.code || thrown.message);
  assert.strictEqual(code, expectedCode, `${label}: expected ${expectedCode} got ${code}`);
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-restore-legacy-'));
  const legacyVersion = MIGRATIONS.map((m) => Number(m.version)).filter((v) => v < CURRENT).pop();
  assert.ok(legacyVersion && legacyVersion < CURRENT, 'fixture needs at least two schema versions');

  // ── 1. A backup taken from an older build must be creatable and verifiable ──
  const legacyUserData = makeUserDataDir(root, 'legacy-userdata');
  const legacyDbPath = path.join(legacyUserData, 'database', 'tadawi.db');
  const legacyDb = buildDatabaseAtSchemaVersion(legacyDbPath, legacyVersion);
  seedClient(legacyDb, '1');
  seedClient(legacyDb, '2');
  legacyDb.close();

  assert.strictEqual(
    hybridSchema.readSchemaVersion(new Database(legacyDbPath, { readonly: true })),
    legacyVersion,
    'fixture database must sit on the older schema version'
  );

  const sourceHealth = backupV2.databaseHealth(legacyDbPath, { mode: 'source' });
  assert.strictEqual(sourceHealth.ok, true, 'a pending migration must not block snapshotting the live database');
  assert.ok(
    sourceHealth.warnings.includes('schema_version_mismatch'),
    'the pending migration must still be reported as a warning'
  );

  const legacyBackupPath = path.join(root, 'legacy-schema.tdw');
  const created = await backupV2.createBackupFile({
    userDataDir: legacyUserData,
    outputPath: legacyBackupPath,
    appVersion: '2.0.0',
    backupType: 'manual',
  });
  assert.strictEqual(created.ok, true, 'backup creation must succeed on an un-migrated database');
  assert.strictEqual(
    Number(created.manifest.databaseSchemaVersion),
    legacyVersion,
    'manifest must record the packaged schema version'
  );

  // This is the exact call the restore coordinator makes at the `verifying_archive` stage.
  const verified = backupV2.verifyBackupFile(legacyBackupPath, null);
  assert.strictEqual(verified.ok, true, 'verifying_archive must accept a backup with an older schema');

  // ── 2. Restoring it must migrate the staged database and land the rows ──
  const restoreTarget = makeUserDataDir(root, 'restore-target');
  const restored = await backupV2.restoreBackupFile({
    userDataDir: restoreTarget,
    filePath: legacyBackupPath,
  });
  assert.strictEqual(restored.ok, true, 'restore of an older-schema backup must succeed');
  assert.strictEqual(Number(restored.migration.before), legacyVersion, 'migration must start at the packaged version');
  assert.strictEqual(Number(restored.database.schemaVersion), CURRENT, 'restored database must end at the current schema');
  assert.strictEqual(Number(restored.rowCounts.clients), 2, 'restored rows must be present in SQLite');

  const restoredDbPath = path.join(restoreTarget, 'database', 'tadawi.db');
  const strictHealth = backupV2.databaseHealth(restoredDbPath, { mode: 'strict' });
  assert.strictEqual(strictHealth.ok, true, 'the swapped-in database must pass the strict gate');

  // ── 3. Orphan rows must not void an otherwise sound backup or restore ──
  const orphanUserData = makeUserDataDir(root, 'orphan-userdata');
  const orphanDbPath = path.join(orphanUserData, 'database', 'tadawi.db');
  const orphanDb = buildDatabaseAtSchemaVersion(orphanDbPath, CURRENT);
  seedClient(orphanDb, '3');
  const visitColumns = orphanDb.prepare('PRAGMA table_info(visits)').all();
  assert.ok(visitColumns.some((c) => c.name === 'client_id'), 'fixture expects visits.client_id to reference clients');
  // Only name the columns the fixture cares about so column defaults cover the rest.
  const now = new Date().toISOString();
  orphanDb.pragma('foreign_keys = OFF');
  orphanDb.prepare(
    'INSERT INTO visits (id, client_id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run('orphan-visit', 'client-that-was-deleted', '{}', now, now);
  const orphanCount = orphanDb.pragma('foreign_key_check').length;
  assert.ok(orphanCount > 0, 'fixture must actually contain a broken reference');
  orphanDb.close();

  const orphanHealth = backupV2.databaseHealth(orphanDbPath, { mode: 'source' });
  assert.strictEqual(orphanHealth.ok, true, 'orphan rows must not block backing up the live database');
  assert.ok(orphanHealth.warnings.includes('foreign_key_violation'), 'orphan rows must be reported');

  const orphanBackupPath = path.join(root, 'orphan-rows.tdw');
  const orphanCreated = await backupV2.createBackupFile({
    userDataDir: orphanUserData,
    outputPath: orphanBackupPath,
    appVersion: '2.0.0',
    backupType: 'manual',
  });
  assert.strictEqual(orphanCreated.ok, true, 'backup creation must survive orphan rows');

  const orphanTarget = makeUserDataDir(root, 'orphan-target');
  const orphanRestored = await backupV2.restoreBackupFile({
    userDataDir: orphanTarget,
    filePath: orphanBackupPath,
  });
  assert.strictEqual(orphanRestored.ok, true, 'restore must survive orphan rows inherited from the backup');
  assert.ok(
    Number(orphanRestored.migration.foreignKeyViolations) > 0,
    'inherited orphan rows must be surfaced for post-restore maintenance'
  );
  assert.ok(
    (orphanRestored.dataWarnings || []).some((w) => w.code === 'orphan_visit_client'),
    'the broken reference must be reported instead of silently dropped'
  );

  // Runtime gating must agree, otherwise the clinic restores data it cannot write to.
  const runtimeDb = new Database(path.join(orphanTarget, 'database', 'tadawi.db'), { readonly: true });
  const runtimeHealth = operationalDbHealth.assessHealth(runtimeDb, operationalDbHealth.RUNTIME_HEALTH_OPTIONS);
  runtimeDb.close();
  assert.strictEqual(runtimeHealth.ok, true, 'orphan rows must not permanently block writes and sync after restore');

  // ── 4. Genuine corruption and un-migratable schemas must still abort ──
  const corruptPath = path.join(root, 'corrupt.db');
  const corruptDb = buildDatabaseAtSchemaVersion(corruptPath, CURRENT);
  seedClient(corruptDb, '4');
  corruptDb.close();
  const corruptBuffer = fs.readFileSync(corruptPath);
  corruptBuffer.fill(0xff, 4096, 8192);
  fs.writeFileSync(corruptPath, corruptBuffer);
  expectCode(
    () => backupV2.databaseHealth(corruptPath, { mode: 'source' }),
    'backup_database_corrupted',
    'a corrupt database'
  );

  expectCode(
    () => backupV2.databaseHealth(restoredDbPath, { mode: 'archive', expectedSchemaVersion: CURRENT - 1 }),
    'backup_schema_newer_than_application',
    'a schema newer than the application'
  );

  fs.rmSync(root, { recursive: true, force: true });
  console.log('PASS remediation:restore-legacy-schema-integrity');
}

main().catch((error) => {
  console.error('FAIL remediation:restore-legacy-schema-integrity');
  console.error(error);
  process.exit(1);
});
