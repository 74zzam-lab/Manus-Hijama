#!/usr/bin/env node
'use strict';

/**
 * After Backup V2 restore, BootFlow initial sync must complete locally.
 * It must not wait on Drive pull / mutex / SQLite write-branch.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const bootSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'cloud', 'boot-flow-ui.js'), 'utf8');
assert.match(bootSrc, /skippedCloudCycle: true/, 'runBootInitialSync after restore skips cloud');
assert.match(bootSrc, /markBootSyncDoneInWizard\(true\)/, 'wizard records syncDone after restore');
assert.match(bootSrc, /waitForSyncMutexIdle/, 'mutex wait is bounded');
assert.doesNotMatch(
  bootSrc,
  /applyDefaults\?\.\(\{\s*startSync:\s*true\s*\}\).*local/,
  'local restore must not auto-start the sync engine'
);

const baselineSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'cloud', 'sync-baseline.js'), 'utf8');
let remoteCalls = 0;
const sandbox = {
  console,
  globalThis: {
    DeviceConfig: { getLockedBranchId: () => 'BR-A' },
    BranchScope: { getActiveBranchId: () => 'BR-A' },
    CenterId: { getStoredCenterId: () => 'CENTER-A' },
    VersionsIndex: { loadLocal: () => ({ databaseVersion: 3, branches: { 'BR-A': { databaseVersion: 3 } } }) },
    SyncEngine: {
      getRemoteBranchDatabaseRevision: async () => {
        remoteCalls += 1;
        throw new Error('drive_unreachable');
      },
    },
    DB: {
      get: () => null,
      setAuthoritative: async () => ({ ok: false, error: 'operational_write_branch_required' }),
    },
  },
};
sandbox.window = sandbox.globalThis;
vm.runInNewContext(baselineSrc, sandbox, { filename: 'sync-baseline.js' });

(async () => {
  const result = await sandbox.globalThis.SyncBaseline.establishFromLocalState({
    localOnly: true,
    persistBestEffort: true,
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(remoteCalls, 0, 'localOnly must not touch Drive');
  assert.strictEqual(sandbox.globalThis.SyncBaseline.load().baselineKnown, true);
  assert.strictEqual(sandbox.globalThis.SyncBaseline.load().lifecycle, 'READY');
  console.log('PASS remediation:boot-after-restore-local-sync');
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
