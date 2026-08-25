#!/usr/bin/env node
'use strict';

/**
 * RC Hotfix Round 4 — Backup V2 routing + Sync cycle truth (Windows UAT).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const discovery = fs.readFileSync(path.join(root, 'cloud/cloud-data-discovery.js'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
const lifecycle = fs.readFileSync(path.join(root, 'cloud/sync-lifecycle.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'cloud/sync-engine.js'), 'utf8');
const coordinator = fs.readFileSync(path.join(root, 'cloud/sync-coordinator.js'), 'utf8');
const verify = fs.readFileSync(path.join(root, 'cloud/restore-verification.js'), 'utf8');
const electronDiscovery = fs.readFileSync(path.join(root, 'electron/cloud-data-discovery.js'), 'utf8');
const ipc = fs.readFileSync(path.join(root, 'electron/backup-v2-ipc.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron/preload.js'), 'utf8');
const rbac = fs.readFileSync(path.join(root, 'electron/rbac-session.js'), 'utf8');

// P0-1 — Backup V2 routing separated from cloud hydrate
check(/confirmedBackupV2Restore/.test(discovery), 'confirmedBackupV2Restore exists');
check(/isBackupV2RestorePoint/.test(discovery), 'isBackupV2RestorePoint helper');
check(/backup_v2_requires_atomic_restore/.test(discovery), 'confirmedCloudRestore rejects backup_file');
check(/point\.kind === 'backup_file'|isBackupV2RestorePoint/.test(discovery), 'cloud restore guards backup points');
check(/v2RestoreFromCloudRemote/.test(discovery), 'backup restore uses cloud remote IPC');
check(/mode: 'backup_v2'/.test(discovery), 'backup restore result mode backup_v2');
check(!/confirmedCloudRestore\(point/.test(boot.replace(/runCloudSyncHydrate[\s\S]*?confirmedCloudRestore\(point/, ''))
  || /runCloudBackupV2Restore/.test(boot), 'bootflow has dedicated backup restore handler');
check(/runCloudBackupV2Restore/.test(boot), 'bootflow runCloudBackupV2Restore');
check(/confirmedBackupV2Restore/.test(boot), 'bootflow calls confirmedBackupV2Restore');
check(/استعادة Backup V2/.test(boot), 'backup table button label');
check(/runCloudSyncHydrate/.test(boot), 'separate sync hydrate handler');
check(/markRestore\('backup_v2'/.test(boot), 'restore choice backup_v2');

check(/backup:v2:restoreFromCloudRemote/.test(ipc), 'IPC restoreFromCloudRemote handler');
check(/v2RestoreFromCloudRemote/.test(preload), 'preload v2RestoreFromCloudRemote');
check(/backup:v2:restoreFromCloudRemote/.test(rbac), 'RBAC for cloud backup restore');

// P0-2 — Restore verification for backup_v2
check(/kind: 'backup_v2'/.test(discovery), 'verifyPostRestore kind backup_v2');
check(/تم استعادة Backup V2 والتحقق منه/.test(verify), 'backup_v2 success message in verify HTML');

// P0-3 — SyncLifecycle engine vs cycle
check(/cycleInFlight/.test(lifecycle), 'lifecycle tracks cycleInFlight');
check(/engineEnabled/.test(lifecycle), 'lifecycle tracks engineEnabled');
check(/readiness\?\.ready && !cycleInFlight/.test(lifecycle), 'READY when cycle not in flight');
check(/isCycleInFlight/.test(coordinator), 'coordinator isCycleInFlight');
check(/lastCycleResult/.test(coordinator), 'coordinator lastCycleResult');
check(/cycleInFlight/.test(engine) && /engineEnabled/.test(engine), 'sync engine exposes cycle vs engine');
check(!/isRunning\(\).*PREPARING/.test(lifecycle.replace(/\s+/g, ' ')), 'lifecycle does not map isRunning alone to PREPARING');

// P0-4 — Initial sync button awaits cycle
check(/waitForSyncLifecycleReady/.test(boot), 'bootflow waits for lifecycle READY');
check(/finalizeBootSyncAfterRestore/.test(boot), 'bootflow finalizes after-restore sync without double-wait');
check(/afterRestoreChoice/.test(boot) && /!afterRestoreChoice/.test(boot), 'bootstrap hydrate skipped after backup restore');
check(/shouldMarkBootSyncDone/.test(boot), 'bootflow marks syncDone from lifecycle not baseline alone');
check(/lockToBranch/.test(boot), 'bootflow locks branch via lockToBranch alias');
check(/SyncCoordinator\?\.isCycleInFlight/.test(boot), 'wait helper respects cycle mutex');
check(/afterRestore/.test(boot) && /runOnce/.test(boot), 'initial sync runOnce with afterRestore');

// P1 — Discovery backup breakdown
check(/classifyBackupFile/.test(electronDiscovery), 'classifyBackupFile for breakdown');
check(/backupsBreakdown|breakdownParts/.test(electronDiscovery), 'discovery breakdown parts');

// Behavioral: SyncLifecycle READY with engine running but cycle idle
const sandbox = {
  console,
  module: { exports: {} },
  globalThis: {},
  window: {},
};
sandbox.window = sandbox.globalThis;
sandbox.global = sandbox.globalThis;

sandbox.globalThis.SyncEngine = {
  getReadiness: () => ({
    ready: true,
    engineEnabled: true,
    cycleInFlight: false,
    missing: [],
  }),
  getStatus: () => ({
    engineEnabled: true,
    running: true,
    cycleInFlight: false,
    lastCycleResult: 'success',
  }),
};
sandbox.globalThis.SyncCoordinator = {
  isCycleInFlight: () => false,
  getLastCycleResult: () => ({ result: 'success', completedAt: new Date().toISOString() }),
};
sandbox.globalThis.SyncBaseline = { load: () => ({ baselineKnown: true }) };
sandbox.globalThis.DriveAdapter = { isConnected: () => true };
sandbox.globalThis.settings = { backup: { providers: { google: { connected: true } } } };
sandbox.globalThis.DB = { get: () => [] };
sandbox.globalThis.ConflictQueue = { listOpenFromSqlite: () => [] };
sandbox.globalThis.SyncState = { getPendingCount: () => 0 };

vm.runInNewContext(lifecycle, sandbox);
const SyncLifecycle = sandbox.globalThis.SyncLifecycle || sandbox.module.exports;
const snap = SyncLifecycle.resolveLifecycle({ relaxedBaseline: true });
check(snap.lifecycle === 'READY', 'READY when engine running but cycle idle and last success');
check(snap.engineEnabled === true, 'engineEnabled reported');
check(snap.cycleInFlight === false, 'cycleInFlight false');

// Behavioral: backup_file rejected by confirmedCloudRestore (sync path)
const discSandbox = {
  console,
  module: { exports: {} },
  globalThis: {},
  window: {},
  AbortController: class { abort() {} },
};
discSandbox.window = discSandbox.globalThis;
discSandbox.global = discSandbox.globalThis;
discSandbox.globalThis.LicenseCloud = { loadLocal: () => null };
discSandbox.globalThis.DeviceConfig = { load: () => ({}) };
discSandbox.globalThis.CenterId = { get: () => 'C1' };
discSandbox.globalThis.BranchScope = { getActiveBranchId: () => 'B1' };
discSandbox.globalThis.cuppingElectron = { backup: {} };
discSandbox.globalThis.BackupBridge = null;
discSandbox.globalThis.SyncEngine = { isRunning: () => false, stop: () => {} };
discSandbox.globalThis.OperationalErrorTruth = { labelsForCodes: (c) => c };

vm.runInNewContext(discovery, discSandbox);
const CloudDataDiscovery = discSandbox.globalThis.CloudDataDiscovery || discSandbox.module.exports;

(async () => {
  const rejected = await CloudDataDiscovery.confirmedCloudRestore(
    { kind: 'backup_file', path: 'Backups/V2/x.tdw', validation: 'metadata_ok' },
    {}
  );
  check(!rejected.ok && rejected.error === 'backup_v2_requires_atomic_restore',
    'confirmedCloudRestore rejects backup_file point');

  check(
    CloudDataDiscovery.isBackupV2RestorePoint({ kind: 'backup_file' })
    && CloudDataDiscovery.isBackupV2RestorePoint({ source: 'cloud_backup' }),
    'isBackupV2RestorePoint detects backup kinds'
  );

  if (errors.length) {
    console.error('RC Hotfix Round 4 tests FAILED:\n' + errors.map((e) => '  - ' + e).join('\n'));
    process.exit(1);
  }
  console.log('All RC Hotfix Round 4 backup routing + sync truth checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
