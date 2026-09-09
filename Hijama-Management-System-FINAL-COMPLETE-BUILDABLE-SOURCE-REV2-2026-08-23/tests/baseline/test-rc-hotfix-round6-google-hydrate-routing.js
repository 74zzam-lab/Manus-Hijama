#!/usr/bin/env node
'use strict';

/**
 * RC Hotfix Round 6 — Google status contract + Sync Hydrate routing.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const auth = fs.readFileSync(path.join(root, 'electron/cloud-provider-auth.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'electron/bootstrap-restore-capability.js'), 'utf8');
const discoveryMain = fs.readFileSync(path.join(root, 'electron/cloud-data-discovery.js'), 'utf8');
const discovery = fs.readFileSync(path.join(root, 'cloud/cloud-data-discovery.js'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8');
const kinds = fs.readFileSync(path.join(root, 'electron/restore-point-kinds.js'), 'utf8');

check(/isCloudProviderAuthenticated/.test(auth), 'shared isCloudProviderAuthenticated');
check(/assertCloudProviderAuthenticated/.test(auth), 'shared assertCloudProviderAuthenticated');
check(/connected !== true/.test(auth), 'auth checks connected not ok');
check(/needsReauth === true/.test(auth), 'auth rejects needsReauth');

check(/assertCloudProviderAuthenticated/.test(bootstrap), 'bootstrap uses shared auth helper');
check(!/if \(!google\?\.ok\)/.test(bootstrap), 'bootstrap does not check google.ok');
check(/assertDriveReadable/.test(bootstrap), 'bootstrap optional drive assertion');

check(/assertDrivePathReadable/.test(discoveryMain), 'main discovery drive assert helper');
check(/newestBackup/.test(discoveryMain) && /newestSyncCheckpoint/.test(discoveryMain), 'discovery splits backup vs sync');
check(/kind: 'backup_v2'/.test(discoveryMain), 'discovery tags backup_v2 kind');

check(/isSyncHydrateRestorePoint/.test(discovery), 'renderer sync hydrate point guard');
check(/sync_hydrate_point_required/.test(discovery), 'cloud restore rejects non-sync points');

check(/newestSyncCheckpoint/.test(boot), 'bootflow uses newestSyncCheckpoint for hydrate');
check(/runCloudSyncHydrate\(newestSyncCheckpoint\)/.test(boot), 'hydrate button uses sync checkpoint only');
check(!/runCloudSyncHydrate\(newest\)/.test(boot), 'hydrate no longer passes newest backup');
check(/الحجم/.test(boot) && !/الحج<\/th>/.test(boot), 'table header size typo fixed');
check(/assertDriveReadable/.test(main), 'main wires drive assert for bootstrap');

check(/isBackupV2Kind/.test(kinds) && /isSyncHydrateKind/.test(kinds), 'restore point kind helpers');

const cloudAuth = require(path.join(root, 'electron/cloud-provider-auth'));
const bootstrapMod = require(path.join(root, 'electron/bootstrap-restore-capability'));
const restoreKinds = require(path.join(root, 'electron/restore-point-kinds'));
const discoveryMainMod = require(path.join(root, 'electron/cloud-data-discovery'));

check(cloudAuth.isCloudProviderAuthenticated({ connected: true }), 'connected:true allowed');
check(cloudAuth.isCloudProviderAuthenticated({ connected: true, ok: undefined }), 'ok undefined still allowed via connected');
check(!cloudAuth.isCloudProviderAuthenticated({ connected: false }), 'connected:false denied');
check(!cloudAuth.isCloudProviderAuthenticated({ connected: true, needsReauth: true }), 'needsReauth denied');

check(restoreKinds.isBackupRestorePoint({ kind: 'backup_v2' }), 'backup_v2 is backup point');
check(restoreKinds.isBackupRestorePoint({ kind: 'backup_file' }), 'legacy backup_file still backup');
check(restoreKinds.isSyncHydratePoint({ kind: 'sync_checkpoint' }), 'sync_checkpoint is hydrate point');
check(!restoreKinds.isSyncHydratePoint({ kind: 'backup_v2' }), 'backup_v2 not sync hydrate');

bootstrapMod.configure({
  getUserDataPath: () => '/tmp',
  readKv: () => ({ syncDone: false }),
  getCloudStatus: async () => ({ connected: true, email: 'a@b.com', oauth: true }),
  assertDriveReadable: async () => ({ ok: true, item: { path: 'Backups/V2/x.tdw' } }),
  readLicense: () => ({ ok: true, data: { centerId: 'C1', branches: [{ id: 'B1', active: true }] } }),
  getSession: () => null,
});

(async () => {
  const issued = await bootstrapMod.issueRestoreCapability(
    { sender: { id: 99 } },
    {
      bootFlow: true,
      centerId: 'C1',
      branchId: 'B1',
      remotePath: 'Backups/V2/Tadawi-Backup-V2-a.tdw',
      backupId: 'Backups/V2/Tadawi-Backup-V2-a.tdw',
    }
  );
  check(issued.ok && issued.capabilityId, 'bootstrap issues cap with connected:true contract');

  bootstrapMod.configure({
    getCloudStatus: async () => ({ connected: true, email: 'a@b.com' }),
    assertDriveReadable: async () => ({ ok: false, error: 'drive_download_auth_failed' }),
  });
  const noDrive = await bootstrapMod.issueRestoreCapability(
    { sender: { id: 100 } },
    {
      bootFlow: true,
      centerId: 'C1',
      remotePath: 'Backups/V2/missing.tdw',
      backupId: 'Backups/V2/missing.tdw',
    }
  );
  check(!noDrive.ok && noDrive.error === 'backup_remote_probe_failed', 'drive assert blocks capability');

  check(typeof discoveryMainMod.assertDrivePathReadable === 'function', 'assertDrivePathReadable exported');

  if (errors.length) {
    console.error('RC Hotfix Round 6 tests FAILED:\n' + errors.map((e) => '  - ' + e).join('\n'));
    process.exit(1);
  }
  console.log('All RC Hotfix Round 6 google contract + hydrate routing checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
