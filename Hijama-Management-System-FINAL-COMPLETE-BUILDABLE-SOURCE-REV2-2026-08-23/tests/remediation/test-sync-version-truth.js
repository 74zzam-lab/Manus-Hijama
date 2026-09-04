'use strict';

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

delete require.cache[require.resolve(modulePath)];
require(modulePath);

(async () => {
  const result = await global.SyncEngine.applyRemoteVersions({ centerId: 'CENTER-A' }, { branchId: 'BR-A' });
  assert.strictEqual(result.ok, false, 'failed table import must fail remote version application');
  assert.strictEqual(result.error, 'remote_pull_failed', 'failure must expose truthful aggregate code');
  assert.strictEqual(saves, 0, 'VersionsIndex must not advance after failed pull');
  console.log('PASS remediation:sync-version-truth');
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
