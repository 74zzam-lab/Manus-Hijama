#!/usr/bin/env node
'use strict';

/**
 * RC Hotfix Round 5 — Bootstrap restore authorization + backup retention truth.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const bootstrap = fs.readFileSync(path.join(root, 'electron/bootstrap-restore-capability.js'), 'utf8');
const rbac = fs.readFileSync(path.join(root, 'electron/rbac-session.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron/preload.js'), 'utf8');
const discovery = fs.readFileSync(path.join(root, 'cloud/cloud-data-discovery.js'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
const classify = fs.readFileSync(path.join(root, 'electron/backup-v2-classify.js'), 'utf8');
const cloudDiscovery = fs.readFileSync(path.join(root, 'electron/cloud-data-discovery.js'), 'utf8');
const ipc = fs.readFileSync(path.join(root, 'electron/backup-v2-ipc.js'), 'utf8');
const coordinator = fs.readFileSync(path.join(root, 'electron/backup-restore-coordinator.js'), 'utf8');
const dbSvc = fs.readFileSync(path.join(root, 'electron/database/service.js'), 'utf8');

check(/issueRestoreCapability/.test(bootstrap), 'bootstrap issueRestoreCapability');
check(/tryAuthorizeChannel/.test(bootstrap), 'bootstrap tryAuthorizeChannel');
check(/consumeCapability/.test(bootstrap), 'bootstrap consume single-use');
check(/restore_scope_mismatch/.test(bootstrap), 'bootstrap scope mismatch');
check(/isActivationBootstrapPhase/.test(bootstrap), 'activation bootstrap lasts until boot complete');
check(/isActivationBootstrapPhase/.test(main), 'main RBAC uses activation bootstrap phase');
check(/BOOTSTRAP_RESTORE_CHANNELS/.test(bootstrap), 'bootstrap restore channel set');

check(/bootstrap:issueRestoreCapability/.test(rbac) && /bootstrapOnly:\s*true/.test(rbac), 'bootstrap issue has an explicit bounded RBAC policy');
check(/rbacSession\.assertChannelAllowed\(event, channel, trustedRbacOpts\)/.test(main), 'main IPC guard passes main-issued trusted context to capability-aware RBAC');
check(/bootstrap:issueRestoreCapability/.test(main), 'main registers bootstrap issue IPC');
check(/readKv/.test(dbSvc), 'db service readKv for boot wizard state');

check(/bootstrapRestoreCapabilityId/.test(discovery), 'renderer passes bootstrap capability to restore');
check(/issueRestoreCapability/.test(discovery), 'renderer issues bootstrap capability');
check(/cuppingElectron\?\.bootstrap/.test(discovery), 'uses bootstrap bridge');

check(/bootstrap:\s*\{/.test(preload) && /issueRestoreCapability/.test(preload), 'preload bootstrap bridge');
check(/bootstrap:issueRestoreCapability/.test(preload), 'preload allowlist bootstrap issue');

check(/backupClassLabel|metadata_suspicious_small/.test(cloudDiscovery), 'discovery backup metadata enrichment');
check(/backup-v2-classify/.test(cloudDiscovery), 'discovery uses shared classify module');
check(/النوع \/ النطاق/.test(boot), 'bootflow table shows type/scope');

check(/return 'manual'/.test(classify), 'classify defaults unknown to manual not automatic');
check(/isPrunableAutomaticBackup/.test(classify), 'prunable automatic helper');

check(/bootstrapRestoreCap\.getCapability/.test(ipc), 'restore validates manifest against capability');
check(/requireScopeTruth: bootstrapRestoreCapabilityId/.test(coordinator), 'bootstrap restore requires scope truth via coordinator');

// Behavioral: bootstrap capability module
const bootstrapMod = require(path.join(root, 'electron/bootstrap-restore-capability'));
const classifyMod = require(path.join(root, 'electron/backup-v2-classify'));
const cloud = require(path.join(root, 'electron/backup-v2-cloud'));

bootstrapMod.configure({
  getUserDataPath: () => '/tmp/test-userdata',
  readKv: (key) => (key === '__tdw_boot_wizard__' ? { syncDone: false } : null),
  getCloudStatus: async () => ({ connected: true, email: 'test@clinic.test', oauth: true }),
  readLicense: (centerId) => ({
    ok: true,
    data: { centerId, branches: [{ id: 'B1', active: true }] },
  }),
  getSession: () => null,
});

const fakeEvent = { sender: { id: 42 } };

(async () => {
  const issued = await bootstrapMod.issueRestoreCapability(fakeEvent, {
    bootFlow: true,
    centerId: 'C1',
    branchId: 'B1',
    remotePath: 'Backups/V2/Tadawi-Backup-V2-scheduled-1.tdw',
    backupId: 'Backups/V2/Tadawi-Backup-V2-scheduled-1.tdw',
  });
  check(issued.ok && issued.capabilityId, 'issue capability during bootstrap');

  const authOk = bootstrapMod.tryAuthorizeChannel(fakeEvent, 'backup:v2:restoreFromCloudRemote', {
    bootstrapRestoreCapabilityId: issued.capabilityId,
    remotePath: 'Backups/V2/Tadawi-Backup-V2-scheduled-1.tdw',
    centerId: 'C1',
    branchId: 'B1',
  });
  check(authOk.ok, 'capability authorizes bound restore channel');

  const wrongBackup = bootstrapMod.tryAuthorizeChannel(fakeEvent, 'backup:v2:restoreFromCloudRemote', {
    bootstrapRestoreCapabilityId: issued.capabilityId,
    remotePath: 'Backups/V2/other-backup.tdw',
    centerId: 'C1',
  });
  check(!wrongBackup.ok && wrongBackup.error === 'restore_scope_mismatch', 'capability bound to backup path');

  bootstrapMod.consumeCapability(issued.capabilityId);
  const reused = bootstrapMod.tryAuthorizeChannel(fakeEvent, 'backup:v2:restoreFromCloudRemote', {
    bootstrapRestoreCapabilityId: issued.capabilityId,
    remotePath: 'Backups/V2/Tadawi-Backup-V2-scheduled-1.tdw',
    centerId: 'C1',
  });
  check(!reused.ok, 'consumed capability cannot be reused');

  bootstrapMod.configure({
    readKv: () => ({ syncDone: true }),
  });
  const afterReady = await bootstrapMod.issueRestoreCapability(fakeEvent, {
    bootFlow: true,
    centerId: 'C1',
    remotePath: 'Backups/V2/x.tdw',
    backupId: 'Backups/V2/x.tdw',
  });
  check(!afterReady.ok && afterReady.error === 'bootstrap_restore_not_allowed_app_ready', 'deny issue when syncDone');

  assert.strictEqual(classifyMod.classifyBackupFile('Tadawi-Backup-V2-2026-08-22T12-00-00.tdw'), 'manual');
  assert.strictEqual(classifyMod.classifyBackupFile('Tadawi-Backup-V2-scheduled-2026.tdw'), 'automatic');
  assert.strictEqual(classifyMod.isPrunableAutomaticBackup('Tadawi-Backup-V2-scheduled-1.tdw'), true);
  assert.strictEqual(classifyMod.isPrunableAutomaticBackup('Tadawi-Backup-V2-2026-08-22.tdw'), false);

  const deleted = [];
  await cloud.pruneCloudV2Backups(
    async () => ({
      ok: true,
      items: [
        { name: 'Tadawi-Backup-V2-scheduled-7.tdw', path: 'Backups/V2/s7.tdw', modifiedAt: '2026-08-22T00:00:00Z' },
        { name: 'Tadawi-Backup-V2-scheduled-6.tdw', path: 'Backups/V2/s6.tdw', modifiedAt: '2026-08-21T00:00:00Z' },
        { name: 'Tadawi-Backup-V2-scheduled-5.tdw', path: 'Backups/V2/s5.tdw', modifiedAt: '2026-08-20T00:00:00Z' },
        { name: 'Tadawi-Backup-V2-scheduled-4.tdw', path: 'Backups/V2/s4.tdw', modifiedAt: '2026-08-19T00:00:00Z' },
        { name: 'Tadawi-Backup-V2-2026-08-18.tdw', path: 'Backups/V2/manual.tdw', modifiedAt: '2026-08-18T00:00:00Z' },
        { name: 'Tadawi-Backup-V2-pre-restore.tdw', path: 'Backups/V2/safety.tdw', modifiedAt: '2026-08-17T00:00:00Z' },
      ],
    }),
    async (remotePath) => { deleted.push(remotePath); return { ok: true }; },
    3,
    'Backups/V2/s7.tdw'
  );
  check(deleted.length === 1 && deleted[0] === 'Backups/V2/s4.tdw', 'prune only periodic; keep manual/safety');
  check(!deleted.includes('Backups/V2/manual.tdw'), 'manual backup not pruned');

  if (errors.length) {
    console.error('RC Hotfix Round 5 tests FAILED:\n' + errors.map((e) => '  - ' + e).join('\n'));
    process.exit(1);
  }
  console.log('All RC Hotfix Round 5 bootstrap auth + retention checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
