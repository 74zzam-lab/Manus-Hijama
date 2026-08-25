#!/usr/bin/env node
'use strict';

/**
 * PR13 — Error truthfulness + upgrade/migration safety behavioral suite.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

const truth = require('../../database/operational-error-truth');
const { openDatabase, getSchemaVersion } = require('../../database/connection');
const { createRepositories } = require('../../database/repositories');
const { createSyncPlatform } = require('../../database/sync-outbox');
const upgrade = require('../../database/upgrade-migration-orchestrator');
const operationalReadiness = require('../../database/operational-readiness');
const V = require('../../electron/security/ipc-validate');

const REQUIRED_CODES = [
  'rbac_session_required',
  'branch_context_missing',
  'branch_access_denied',
  'database_unhealthy',
  'sqlite_busy',
  'sync_baseline_required',
  'remote_revision_mismatch',
  'restore_failed',
  'restore_encrypted_import_only',
  'owner_corrupted',
  'migration_pending',
  'migration_in_progress',
  'migration_failed',
];

for (const code of REQUIRED_CODES) {
  check(truth.CATALOG[code], `catalog missing ${code}`);
}

check(truth.normalizeCode('owner_count_invariant_violation') === 'owner_corrupted', 'owner alias maps');
check(truth.normalizeCode('branch_id_required') === 'branch_context_missing', 'branch alias maps');

const envelope = truth.buildEnvelope({ error: 'sqlite_busy', stage: 'sync_push' });
check(envelope.ok === false && envelope.code === 'sqlite_busy', 'buildEnvelope code');
check(envelope.stage === 'sync_push', 'buildEnvelope stage');
check(envelope.retryable === true, 'sqlite_busy retryable');
check(envelope.userMessageAr && !envelope.diagnostic?.includes('ya29'), 'envelope leak-safe');

const ipcFail = truth.enrichResult({ ok: false, error: 'rbac_session_required' }, { stage: 'ipc' });
check(ipcFail.requiresAction === true, 'rbac_session_required requiresAction');

// IPC guard enrichment
(async () => {
  const guarded = V.guard(async () => ({ ok: false, error: 'branch_access_denied' }), { stage: 'ipc_test' });
  const res = await guarded(null);
  check(res.code === 'branch_access_denied' && res.stage === 'ipc_test', 'IPC guard enrichResult');

  // Benign operational errors module
  const benignCtx = { window: {}, globalThis: {}, console };
  benignCtx.window = benignCtx;
  benignCtx.globalThis = benignCtx;
  vm.createContext(benignCtx);
  vm.runInContext(fs.readFileSync(path.join(root, 'cloud/benign-operational-errors.js'), 'utf8'), benignCtx);
  const BO = benignCtx.BenignOperationalErrors;
  check(BO.isBenignOperationalError('offline'), 'offline is benign');
  check(!BO.isBenignOperationalError('ReferenceError: foo is not defined'), 'ReferenceError not benign');
  check(!BO.isBenignOperationalError('someRandomVar is not defined'), 'generic undefined not benign');
  check(BO.isBenignOperationalError('SyncEngine is not defined'), 'optional module boot benign');

  const rendererCtx = {
    window: {},
    globalThis: {},
    console,
    notify: () => {},
    AuditLogger: { logSyncEvent: () => {} },
  };
  rendererCtx.window = rendererCtx;
  rendererCtx.globalThis = rendererCtx;
  vm.createContext(rendererCtx);
  vm.runInContext(fs.readFileSync(path.join(root, 'cloud/benign-operational-errors.js'), 'utf8'), rendererCtx);
  vm.runInContext(fs.readFileSync(path.join(root, 'cloud/operational-error-truth.js'), 'utf8'), rendererCtx);
  const nodeKeys = Object.keys(truth.CATALOG).sort();
  const rendererKeys = Object.keys(rendererCtx.OperationalErrorTruth.CATALOG).sort();
  check(JSON.stringify(nodeKeys) === JSON.stringify(rendererKeys), 'node/renderer catalog parity');

  const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  check(/benign-operational-errors\.js/.test(indexSrc), 'index loads benign-operational-errors.js');
  check(/ReferenceError\|TypeError/.test(indexSrc), 'index isBenignCloudErr rejects ReferenceError');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr13-'));
  const dbPath = path.join(tmp, 'upgrade.db');
  const db = openDatabase(dbPath);
  check(getSchemaVersion(db) === 8, 'schema v8 after migration 005 sync outbox leases');
  check(
    db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='upgrade_migration_runs'`).get(),
    'upgrade_migration_runs table exists'
  );
  const repos = createRepositories(db);
  const syncPlatform = createSyncPlatform(db);

  // Owner legacy — same ID preserved
  repos.kv.set('users', [
    { id: 'owner-1', username: 'owner1', role: 'owner', active: true },
  ]);
  const ownerRes = upgrade.migrateOwnerLegacy(db, repos);
  check(ownerRes.ok && ownerRes.ownerId === 'owner-1', 'owner ID preserved');

  // Duplicate owner fail-closed
  repos.kv.set('users', [
    { id: 'o1', username: 'a', role: 'owner', active: true },
    { id: 'o2', username: 'b', role: 'owner', active: true },
  ]);
  const dup = upgrade.detectOwnerCorruption(repos);
  check(!dup.ok && dup.error === 'owner_corrupted', 'duplicate owner detected');

  // Reset owner for further tests
  repos.kv.set('users', [{ id: 'owner-1', username: 'owner1', role: 'owner', active: true }]);

  // Null branch single-branch migration
  db.prepare(`INSERT INTO clients (id, name, payload_json, branch_id) VALUES ('c1','Test','{}', NULL)`).run();
  const branchRes = upgrade.migrateNullBranchRows(db, { defaultBranchId: 'BR-MAIN', multiBranch: false });
  check(branchRes.ok && branchRes.assigned >= 1, 'null branch assigned BR-MAIN');
  const row = db.prepare(`SELECT branch_id FROM clients WHERE id='c1'`).get();
  check(row.branch_id === 'BR-MAIN', 'client branch_id set');

  // LS conflict queue → SQLite (dedupe)
  repos.kv.set('__tdw_conflict_queue__', [
    { table: 'cases', recordId: 'r1', status: 'open', local: { a: 1 }, remote: { a: 2 } },
    { table: 'cases', recordId: 'r1', status: 'open', local: { a: 1 }, remote: { a: 3 } },
  ]);
  const cq = upgrade.migrateLsConflictQueue(db, repos, syncPlatform);
  check(cq.ok && cq.migrated === 1, 'conflict queue deduped to one SQLite conflict');
  const conflicts = db.prepare(`SELECT COUNT(*) AS c FROM sync_conflicts WHERE status='open'`).get();
  check(Number(conflicts.c) === 1, 'one open conflict in SQLite');

  // Encryption settings strip (legacy import marker retained)
  repos.kv.set('settings', { backupEncryptionPassword: 'secret', backupEncryptionEnabled: true });
  const enc = upgrade.stripEncryptionSettings(db, repos);
  check(enc.ok && enc.stripped, 'encryption settings stripped');
  const settings = repos.kv.get('settings', {});
  check(!settings.backupEncryptionPassword, 'password removed from active settings');
  check(db.prepare(`SELECT value FROM meta WHERE key='legacyEncryptionImportSupported'`).get()?.value === 'true', 'legacy import marker');

  // Encrypted backup → import-only semantics via restore settings
  repos.kv.set('backupRegistry', [{ id: 'b1', format: 'CDB2', encrypted: true }]);
  upgrade.migrateRestoreSettingsV2(db, repos);
  const reg = repos.kv.get('backupRegistry', []);
  check(reg[0].encryptedDirectRestoreBlocked === true, 'encrypted backup import-only flag');

  // Full pipeline idempotent second run
  repos.kv.set('__tdw_attachment_manifest__', { a: { id: 'a1' } });
  const backupPath = path.join(tmp, 'pre-upgrade.db');
  const pipe1 = upgrade.runUpgradePipeline(db, repos, {
    dbPath,
    backupPath,
    syncPlatform,
    skipBackup: false,
  });
  check(pipe1.ok, 'upgrade pipeline first run ok');
  const pipe2 = upgrade.runUpgradePipeline(db, repos, { dbPath, syncPlatform, skipBackup: true });
  check(pipe2.ok && pipe2.skipped, 'upgrade pipeline idempotent skip');

  const assess = upgrade.assessUpgradeState(db, repos);
  check(assess.ok, 'assessUpgradeState ready after migration');

  const readiness = operationalReadiness.assessOperationalReadiness({
    health: { ok: true, reasons: [] },
    migrationPending: false,
    ownerCorrupted: false,
  });
  check(readiness.ok, 'operational readiness ok after upgrade');

  // Crash mid-migration simulation — in_progress run then resume
  db.prepare(`DELETE FROM meta WHERE key='upgradeMigrationVersion'`).run();
  db.prepare(`DELETE FROM meta WHERE key LIKE 'upgradeStep:%'`).run();
  repos.kv.set('__tdw_attachment_manifest__', [{ id: 'x1' }]);
  const runId = `crash-${Date.now()}`;
  // A resumed migration must retain the durable pre-upgrade backup captured for its original run.
  // Requiring it is a safety invariant, not an optional test convenience.
  db.prepare(
    `INSERT INTO upgrade_migration_runs (id, source_version, status, started_at, backup_path) VALUES (?, 'legacy', 'in_progress', ?, ?)`
  ).run(runId, new Date().toISOString(), backupPath);
  const resumed = upgrade.resumeInProgressRun(db, repos, { dbPath, syncPlatform, skipBackup: true });
  check(resumed.ok, 'crash mid-migration resume completes');

  const integ = db.prepare('PRAGMA integrity_check').get();
  check(String(Object.values(integ)[0]).toLowerCase() === 'ok', 'integrity_check ok post-migration');

  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  if (errors.length) {
    console.error('FAIL: pr13 error truth + migration safety');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('PASS: pr13 error truth + migration safety (catalog, envelope, benign, upgrade matrix, crash-resume)');
})().catch((e) => {
  console.error('FAIL: exception', e);
  process.exit(1);
});
