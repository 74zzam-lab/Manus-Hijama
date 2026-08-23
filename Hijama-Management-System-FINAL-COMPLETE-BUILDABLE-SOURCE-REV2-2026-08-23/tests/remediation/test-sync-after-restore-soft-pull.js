#!/usr/bin/env node
'use strict';

/**
 * Regression: post-backup-restore initial sync must not fail with remote_pull_failed
 * when cloud JSON pulls conflict or operational tables differ — local backup is authoritative.
 */
const assert = require('assert');
const path = require('path');

const modulePath = path.join(__dirname, '..', '..', 'cloud', 'sync-engine.js');

let saves = 0;
global.CloudMeta = { isCloudV2Enabled: () => true };
global.ConfigLayer = {
  getCenterId: () => 'CENTER-A',
  drivePathForFile: () => 'Centers/CENTER-A/BR-A/settings.json',
  importBranchPack: () => ({ ok: false, blocked: true, error: 'simulated_conflict' }),
};
global.DriveLayout = { configBranchFileCandidates: () => ['Centers/CENTER-A/BR-A/settings.json'] };
global.DriveAdapter = { downloadJsonFirst: async () => ({ ok: true, data: { currency: 'SAR' } }) };
global.VersionsIndex = {
  loadLocal: () => ({ centerId: 'CENTER-A', branches: { 'BR-A': { settingsVersion: 1 } } }),
  diff: () => [{ layer: 'branch', field: 'settingsVersion', branchId: 'BR-A' }],
  saveLocal: () => { saves += 1; },
};
global.SyncGuard = { canSync: () => ({ ok: true }) };
global.SyncState = { setError: () => {} };
global.DeviceConfig = { getLockedBranchId: () => 'BR-A', isBranchLocked: () => true };
global.BranchScope = { getActiveBranchId: () => 'BR-A' };

delete require.cache[require.resolve(modulePath)];
require(modulePath);

(async () => {
  const strict = await global.SyncEngine.applyRemoteVersions({ centerId: 'CENTER-A' }, { branchId: 'BR-A' });
  assert.strictEqual(strict.ok, false, 'normal pull must still fail closed on blocked import');
  assert.strictEqual(strict.error, 'remote_pull_failed');

  saves = 0;
  const soft = await global.SyncEngine.applyRemoteVersions(
    { centerId: 'CENTER-A' },
    { branchId: 'BR-A', afterRestore: true }
  );
  assert.strictEqual(soft.ok, true, 'afterRestore must recover from blocked config pull');
  assert.ok(Array.isArray(soft.skipped) && soft.skipped.length > 0, 'afterRestore must record skipped pulls');
  assert.strictEqual(saves, 1, 'versions index may advance after soft recover');

  global.VersionsIndex.diff = () => [{ layer: 'branch', field: 'databaseVersion', branchId: 'BR-A' }];

  const skipDb = await global.SyncEngine.applyRemoteVersions(
    { centerId: 'CENTER-A' },
    { branchId: 'BR-A', afterRestore: true }
  );
  assert.strictEqual(skipDb.ok, true, 'afterRestore must skip operational databaseVersion pulls');
  assert.ok(
    skipDb.skipped.some((s) => s.reason === 'after_restore_local_authoritative'),
    'databaseVersion pull must be skipped after restore'
  );

  console.log('PASS remediation:sync-after-restore-soft-pull');
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
