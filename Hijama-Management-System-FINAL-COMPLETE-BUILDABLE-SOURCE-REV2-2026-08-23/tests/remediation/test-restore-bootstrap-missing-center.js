#!/usr/bin/env node
'use strict';

/**
 * Regression: Bootstrap Backup V2 restore failed at `checking_identity` with
 * `restore_center_missing` when the licensed device already bound a centerId but
 * the cloud backup manifest omitted `source.centerId` / `organizationId` (legacy builds).
 *
 * Bootstrap restore must pass `allowMissingSourceMetadata` and skip scopeTruth so
 * license-bound identity is authoritative.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { MIGRATIONS } = require('../../database/connection');
const backupV2 = require('../../electron/backup-v2-core');
const hybridSchema = require('../../database/hybrid-schema');

const CURRENT = hybridSchema.CURRENT_SCHEMA_VERSION;

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

function seedMinimalDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);');
  for (const migration of MIGRATIONS) {
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
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO clients (id, name, phone, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('legacy-client', 'Legacy Client', '0500000001', '{}', now, now);
  db.close();
}

function expectCode(fn, expectedCode, label) {
  let thrown = null;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      throw new Error('expectCode does not support async callbacks; await before calling');
    }
  } catch (error) { thrown = error; }
  assert.ok(thrown, `${label}: expected a failure`);
  const code = String(thrown.code || thrown.message);
  assert.strictEqual(code, expectedCode, `${label}: expected ${expectedCode} got ${code}`);
}

async function expectCodeAsync(fn, expectedCode, label) {
  let thrown = null;
  try { await fn(); } catch (error) { thrown = error; }
  assert.ok(thrown, `${label}: expected a failure`);
  const code = String(thrown.code || thrown.message);
  assert.strictEqual(code, expectedCode, `${label}: expected ${expectedCode} got ${code}`);
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-bootstrap-center-'));
  const legacyManifest = { source: {}, scope: {} };
  const licensedCenter = 'CTR-BOOT-001';
  const licensedBranch = 'BR-BOOT-001';

  // ── 1. Identity gate: fail closed without bootstrap override ──
  expectCode(
    () => backupV2.assertRestoreIdentityAllowed(legacyManifest, {
      centerId: licensedCenter,
      branchId: licensedBranch,
      authorizedBranchIds: [licensedBranch],
    }),
    'restore_center_missing',
    'missing backup center metadata must reject authenticated restore'
  );

  const allowed = backupV2.assertRestoreIdentityAllowed(legacyManifest, {
    centerId: licensedCenter,
    branchId: licensedBranch,
    authorizedBranchIds: [licensedBranch],
    allowMissingSourceMetadata: true,
  });
  assert.strictEqual(allowed.ok, true, 'bootstrap override must allow legacy manifests');
  assert.strictEqual(allowed.skipped, 'allow_missing_source_metadata');

  // ── 2. Full restore path: legacy backup without source metadata ──
  const sourceUserData = makeUserDataDir(root, 'source');
  const sourceDbPath = path.join(sourceUserData, 'database', 'tadawi.db');
  seedMinimalDb(sourceDbPath);

  const legacyBackupPath = path.join(root, 'legacy-no-center.tdw');
  const created = await backupV2.createBackupFile({
    userDataDir: sourceUserData,
    outputPath: legacyBackupPath,
    appVersion: '2.0.0',
    backupType: 'manual',
    // Intentionally omit center/org/branch — simulates pre-identity backups.
  });
  assert.strictEqual(created.ok, true, 'fixture backup must be created');
  assert.strictEqual(String(created.manifest?.source?.centerId || ''), '', 'fixture must omit centerId');

  await expectCodeAsync(
    () => backupV2.restoreBackupFile({
      userDataDir: makeUserDataDir(root, 'reject-target'),
      filePath: legacyBackupPath,
      expectedIdentity: {
        centerId: licensedCenter,
        branchId: licensedBranch,
        authorizedBranchIds: [licensedBranch],
      },
      skipScopeTruth: true,
    }),
    'restore_center_missing',
    'restore without bootstrap override must fail at identity gate'
  );

  const restoreTarget = makeUserDataDir(root, 'restore-target');
  const restored = await backupV2.restoreBackupFile({
    userDataDir: restoreTarget,
    filePath: legacyBackupPath,
    expectedIdentity: {
      centerId: licensedCenter,
      organizationId: licensedCenter,
      branchId: licensedBranch,
      authorizedBranchIds: [licensedBranch],
      allowMissingSourceMetadata: true,
    },
    skipScopeTruth: true,
    requireScopeTruth: false,
  });
  assert.strictEqual(restored.ok, true, 'bootstrap restore must succeed without manifest centerId');
  assert.strictEqual(Number(restored.rowCounts?.clients || 0), 1, 'restored rows must be present');

  const restoredDbPath = path.join(restoreTarget, 'database', 'tadawi.db');
  const strictHealth = backupV2.databaseHealth(restoredDbPath, { mode: 'strict' });
  assert.strictEqual(strictHealth.ok, true, 'restored database must pass strict health');

  // ── 3. Static wiring: bootstrap context sets allowMissingSourceMetadata ──
  const ipcSrc = fs.readFileSync(path.join(__dirname, '../../electron/backup-v2-ipc.js'), 'utf8');
  const coordinatorSrc = fs.readFileSync(path.join(__dirname, '../../electron/backup-restore-coordinator.js'), 'utf8');
  const bootSrc = fs.readFileSync(path.join(__dirname, '../../cloud/boot-flow-ui.js'), 'utf8');
  assert.match(
    ipcSrc,
    /allowMissingSourceMetadata:\s*context\s*===\s*'bootstrap'/,
    'invokeRestoreUnified must set allowMissingSourceMetadata for bootstrap'
  );
  assert.match(
    coordinatorSrc,
    /allowMissingSourceMetadata:\s*context\s*===\s*'bootstrap'/,
    'coordinator must forward allowMissingSourceMetadata for bootstrap'
  );
  assert.match(
    coordinatorSrc,
    /requireScopeTruth:\s*context\s*===\s*'bootstrap'\s*\?\s*false/,
    'bootstrap restore must not require scopeTruth on legacy manifests'
  );
  assert.match(
    coordinatorSrc,
    /context === 'bootstrap'[\s\S]*bootstrap_deferred/,
    'bootstrap restore must defer blocking renderer rehydrate IPC'
  );
  assert.match(
    coordinatorSrc,
    /never roll back for renderer rehydrate-only failures/,
    'bootstrap restore must not rollback SQLite on rehydrate-only failure'
  );
  assert.match(bootSrc, /prepareBootSyncPrerequisites/, 'BootFlow must prepare sync prerequisites before readiness');
  assert.match(bootSrc, /hasBlockingSyncPrerequisites/, 'BootFlow must not hard-fail google_not_connected when settings show Google');
  assert.match(bootSrc, /installRestoreRehydrateListener/, 'BootFlow must install restore rehydrate listener before cloud restore');

  const discoverySrc = fs.readFileSync(path.join(__dirname, '../../cloud/cloud-data-discovery.js'), 'utf8');
  assert.match(discoverySrc, /createRestoreProgressEmitter/, 'restore progress watchdog must not regress to download_db stage');

  fs.rmSync(root, { recursive: true, force: true });
  console.log('PASS: restore-bootstrap-missing-center (identity gate, full restore, bootstrap wiring)');
}

main().catch((err) => {
  console.error('FAIL: restore-bootstrap-missing-center', err);
  process.exit(1);
});
