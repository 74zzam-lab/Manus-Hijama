#!/usr/bin/env node
'use strict';

/**
 * After Backup V2 restore / app open:
 * 1. leftover PR13 upgrade steps auto-complete so migration_pending cannot block writes/sync
 * 2. manual sync surfaces a real code, never "Unknown"
 * 3. live sync engine is started after login / boot
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const { openDatabase } = require('../../database/connection');
const { createRepositories } = require('../../database/repositories');
const { createSyncPlatform } = require('../../database/sync-outbox');
const upgrade = require('../../database/upgrade-migration-orchestrator');
const operationalReadiness = require('../../database/operational-readiness');
const truth = require('../../database/operational-error-truth');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autosync-'));
const dbPath = path.join(tmp, 'clinic.db');
const db = openDatabase(dbPath);
const repos = createRepositories(db);
const syncPlatform = createSyncPlatform(db);

repos.kv.set('users', [{ id: 'owner-1', username: 'owner', role: 'owner', active: true }]);
repos.kv.set('backupRegistry', [{ id: 'b1', format: 'TDW2', restoreSurface: 'v2' }]);
repos.kv.set('__tdw_attachment_manifest__', { a1: { id: 'a1' } });
repos.kv.set('settings', { centerName: 'مركز', backupEncryptionEnabled: false });

const before = upgrade.assessUpgradeState(db, repos, { syncPlatform });
assert.strictEqual(before.ok, false, 'restore-shaped DB is pending before auto-complete');
assert.strictEqual(before.migration_pending, true, 'pending flag is migration_pending');
assert.ok(before.pending.includes('restore_settings_v2'), 'backupRegistry requires restore_settings_v2');

const auto = upgrade.autoCompletePendingUpgrade(db, repos, {
  dbPath,
  syncPlatform,
  skipBackup: true,
});
assert.ok(auto.ok, 'autoCompletePendingUpgrade succeeds: ' + (auto.error || ''));

const after = upgrade.assessUpgradeState(db, repos, { syncPlatform });
assert.ok(after.ok, 'assessUpgradeState ok after auto-complete');
assert.ok(!after.migration_pending, 'migration_pending cleared');

const readiness = operationalReadiness.assessOperationalReadiness({
  health: { ok: true, reasons: [] },
  migrationPending: !!after.migration_pending,
  ownerCorrupted: !!after.owner_corrupted,
});
assert.ok(readiness.ok && readiness.canWrite, 'operational writes allowed after auto-complete');

const again = upgrade.autoCompletePendingUpgrade(db, repos, {
  dbPath,
  syncPlatform,
  skipBackup: true,
});
assert.ok(again.ok && again.already, 'second auto-complete is idempotent');

db.close();
fs.rmSync(tmp, { recursive: true, force: true });

assert.strictEqual(truth.normalizeCode('Unknown'), 'sync_cycle_failed');
assert.ok(truth.present('Unknown').userMessageAr.includes('فشلت المزامنة'));
assert.ok(!/unknown/i.test(truth.present('Unknown').userMessageAr));

const serviceSrc = fs.readFileSync(path.join(root, 'electron/database/service.js'), 'utf8');
assert.match(serviceSrc, /autoCompleteUpgradeOnOpen\(\)/, 'ensureDb auto-runs leftover upgrade');
assert.match(serviceSrc, /upgradeAutoRan = false/, 'restore reopen retries auto-upgrade');
assert.match(serviceSrc, /UPGRADE_RETRY_MS/, 'failed auto-upgrade retries instead of running once');
assert.match(serviceSrc, /leftoverPendingIsSoft/, 'leftover restore metadata does not block clinic writes');
assert.match(serviceSrc, /systemLogs/, 'system log KV writes bypass the migration write gate');

const engineSrc = fs.readFileSync(path.join(root, 'cloud/sync-engine.js'), 'utf8');
assert.match(engineSrc, /function flattenCycleResult/, 'runOnce flattens coordinator errors');
assert.match(engineSrc, /error: 'cloud_v2_disabled'/, 'disabled Cloud V2 is a real code');
assert.match(engineSrc, /'google_not_connected'/, 'disconnected Google is a real code');

const coordSrc = fs.readFileSync(path.join(root, 'cloud/sync-coordinator.js'), 'utf8');
assert.match(coordSrc, /error: lastCycleError/, 'cycle result exposes error');

const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.doesNotMatch(
  indexSrc,
  /فشلت المزامنة: ' \+ \(res\?\.message \|\| res\?\.error \|\| \(res\?\.readiness/,
  'manual sync no longer falls back to unknown'
);
assert.match(indexSrc, /ensureLiveSyncEngine/, 'login starts live sync engine');
assert.match(indexSrc, /BootFlow\.formatSyncCycleError/, 'manual sync uses coded Arabic formatter');
assert.match(indexSrc, /st\?\.enabled/, 'legacy 15-min auto backup yields to Backup V2 scheduler');
assert.match(indexSrc, /function pruneLegacyAutomaticBackups/, 'legacy local\/cloud automatic backups are pruned');
assert.match(indexSrc, /Backup-\$\{backupKind\}-\$\{stamp\}/, 'automatic backups are named -auto- so they can be pruned');
assert.match(indexSrc, /logAudit\(op,/, 'toasts are written to the system log');

const actSrc = fs.readFileSync(path.join(root, 'cloud/activation-sync-defaults.js'), 'utf8');
assert.match(actSrc, /function ensureLiveSyncEngine/, 'activation helper starts poll engine');
assert.match(actSrc, /retentionCount: 5/, 'activation keeps 5 local automatic backups');
assert.match(actSrc, /cloudRetentionCount: 3/, 'activation keeps 3 cloud automatic backups');

const bootSrc = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
assert.match(bootSrc, /ensureLiveSyncEngine/, 'boot ready defers to live sync engine');
assert.match(bootSrc, /function formatSyncCycleError/, 'boot formatter exists');
assert.match(bootSrc, /رمز:/, 'unknown sync errors include a technical code');

const extSrc = fs.readFileSync(path.join(root, 'cupping-ext-modules.js'), 'utf8');
assert.match(extSrc, /SYNC_FAILED:/, 'system log catalogs sync failures');
assert.match(extSrc, /WRITE_DENIED:/, 'system log catalogs write denials');
assert.match(extSrc, /UI_TOAST:/, 'system log catalogs warning\/danger toasts');
assert.match(extSrc, /function persistSystemLogsBestEffort/, 'system log persist is best-effort');

const bridgeSrc = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');
assert.match(bridgeSrc, /SyncEngine\?\.schedulePush\?\.\(tableKey/, 'local table writes enqueue push');
assert.match(bridgeSrc, /SyncEngine\?\.schedulePush\?\.\(key/, 'local kv writes enqueue push');

const sandbox = { window: {}, globalThis: {}, console, setTimeout, clearTimeout };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.CloudMeta = { isCloudV2Enabled: () => true };
sandbox.DriveAdapter = {
  isConnected: () => true,
  downloadVersions: async () => ({ ok: false, skipped: true }),
};
sandbox.SyncEngine = {
  _pollInternal: async () => ({ ok: false, skipped: true }),
  _flushPendingInternal: async () => ({ ok: false, skipped: true }),
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'cloud/error-recovery-ux.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'cloud/operational-error-truth.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'cloud/sync-coordinator.js'), 'utf8'), sandbox);

const unexpected = sandbox.OperationalErrorTruth.present('weird_unmapped_code');
assert.ok(
  !/حدث خطأ غير متوقع/.test(unexpected.userMessageAr),
  'unknown sync codes must not use the opaque ErrorRecoveryUx generic toast'
);
assert.ok(/تعذّر إكمال العملية/.test(unexpected.userMessageAr), 'unknown codes stay on the catalog generic');

sandbox.SyncEngine._pollInternal = async () => ({ ok: false, skipped: true });
sandbox.SyncEngine._flushPendingInternal = async () => ({ ok: false, skipped: true });

(async () => {
  const cycle = await sandbox.SyncCoordinator.runCycle({ force: true });
  assert.strictEqual(cycle.ok, false, 'skipped pull/push fail the cycle');
  assert.ok(cycle.error, 'cycle error is populated, not blank/Unknown');
  assert.notStrictEqual(String(cycle.error).toLowerCase(), 'unknown');

  const flatSandbox = { window: {}, globalThis: {}, console, setTimeout, clearTimeout };
  flatSandbox.window = flatSandbox;
  flatSandbox.globalThis = flatSandbox;
  flatSandbox.CloudMeta = { isCloudV2Enabled: () => false };
  flatSandbox.DriveAdapter = { isConnected: () => false, isConnectedFromSettings: () => false };
  flatSandbox.OperationalReadiness = { canWrite: () => ({ ok: true }) };
  flatSandbox.SyncCoordinator = {
    runCycle: async () => ({ ok: false, pull: { ok: false, skipped: true }, push: { ok: false, skipped: true } }),
    isCycleInFlight: () => false,
  };
  vm.createContext(flatSandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'cloud/sync-engine.js'), 'utf8'), flatSandbox);
  const once = await flatSandbox.SyncEngine.runOnce({ force: true });
  assert.strictEqual(once.ok, false);
  assert.ok(once.error && String(once.error).toLowerCase() !== 'unknown', 'runOnce error is coded: ' + once.error);
  assert.ok(once.messageAr, 'runOnce has Arabic message');
  assert.ok(
    !/حدث خطأ غير متوقع/.test(String(once.messageAr)),
    'runOnce must not surface the opaque unexpected-error toast'
  );
  console.log('PASS remediation:post-restore-autosync');
})().catch((err) => {
  console.error('FAIL remediation:post-restore-autosync', err);
  process.exit(1);
});
