'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'cloud', 'sync-baseline.js'), 'utf8');
let state = null;
let fail = false;
const sandbox = {
  globalThis: {
    DB: {
      get: (_key, fallback) => state || fallback,
      set: async (_key, next) => {
        if (fail) return { ok: false, error: 'simulated_sqlite_failure' };
        state = next;
        return { ok: true, authoritative: true };
      },
    },
  },
};
sandbox.window = sandbox.globalThis;
vm.runInNewContext(source, sandbox, { filename: 'sync-baseline.js' });
const baseline = sandbox.globalThis.SyncBaseline;

(async () => {
  fail = true;
  const failed = await baseline.markBaselineKnown({ branchId: 'BR-A', remoteRevision: 4, integrityPass: true });
  assert.strictEqual(failed.ok, false, 'baseline must expose failed authoritative commit');
  assert.strictEqual(baseline.isPushAllowed({ branchId: 'BR-A' }).ok, false, 'failed commit must leave push blocked');

  fail = false;
  const known = await baseline.markBaselineKnown({ branchId: 'BR-A', remoteRevision: 4, integrityPass: true });
  assert.strictEqual(known.ok, true);
  const ready = await baseline.markReady({ operationId: 'OP-1' });
  assert.strictEqual(ready.ok, true, 'READY must follow a persisted baseline');
  assert.strictEqual(baseline.isPushAllowed({ branchId: 'BR-A' }).ok, true);

  const bestEffortSandbox = {
    globalThis: {
      DB: {
        get: () => null,
        setAuthoritative: async () => ({ ok: false, error: 'operational_write_branch_required' }),
      },
      DeviceConfig: { getLockedBranchId: () => 'BR-A' },
      BranchScope: { getActiveBranchId: () => 'BR-A' },
    },
  };
  bestEffortSandbox.window = bestEffortSandbox.globalThis;
  vm.runInNewContext(source, bestEffortSandbox, { filename: 'sync-baseline-best-effort.js' });
  const local = await bestEffortSandbox.globalThis.SyncBaseline.establishFromLocalState({
    localOnly: true,
    persistBestEffort: true,
    branchId: 'BR-A',
  });
  assert.strictEqual(local.ok, true, 'boot/restore baseline must succeed without SQLite write branch');
  assert.strictEqual(
    bestEffortSandbox.globalThis.SyncBaseline.load().baselineKnown,
    true,
    'memory overlay must expose baselineKnown after persistBestEffort'
  );

  console.log('PASS remediation:sync-lifecycle-authoritative-commit');

  const legacySource = fs.readFileSync(path.join(__dirname, '..', '..', 'cloud', 'sync-baseline.js'), 'utf8');
  let legacyState = null;
  const legacySandbox = {
    globalThis: {
      DB: {
        get: (_key, fallback) => legacyState || fallback,
        set: async (_key, next) => {
          legacyState = next;
          return false;
        },
      },
    },
  };
  legacySandbox.window = legacySandbox.globalThis;
  vm.runInNewContext(legacySource, legacySandbox, { filename: 'sync-baseline-legacy.js' });
  const legacyBaseline = legacySandbox.globalThis.SyncBaseline;
  const legacyFail = await legacyBaseline.markBaselineKnown({ branchId: 'BR-B', remoteRevision: 1, integrityPass: true });
  assert.strictEqual(legacyFail.ok, false, 'legacy DB.set(false) must not report success');
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
