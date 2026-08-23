'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const coordinator = require('../../electron/backup-restore-coordinator');

(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-restore-postcommit-'));
  let rollbackCalls = 0;
  let reopenCalls = 0;
  coordinator.configure({
    getUserDataPath: () => userData,
    runLocalRestore: async () => ({
      ok: true,
      rollbackPath: path.join(userData, '.rollback'),
      rowCounts: { clientsRegistry: 1, cases: 1, bookings: 0 },
      manifest: { recordCounts: { clients: 1, visits: 1, bookings: 0 } },
    }),
    rollbackLocalRestore: async () => { rollbackCalls += 1; return { ok: true, rolledBack: true }; },
    reopenDatabase: async () => { reopenCalls += 1; },
    countDatabaseRows: () => ({ ok: true, counts: { clientsRegistry: 1, cases: 1, bookings: 0 } }),
    rehydrateRuntime: async () => ({ ok: false, error: 'simulated_rehydrate_failure' }),
  });
  const result = await coordinator.restore({ source: 'local', localPath: path.join(userData, 'restore.tdw') });
  assert.strictEqual(result.ok, false, 'post-commit rehydrate failure must fail the operation');
  assert.strictEqual(result.truthfulState, 'ROLLED_BACK_AFTER_POST_COMMIT_FAILURE', 'result must state that rollback occurred');
  assert.strictEqual(result.committed, false, 'rolled-back data must not be reported as committed');
  assert.strictEqual(result.rolledBack, true, 'rollback result must be explicit');
  assert.strictEqual(rollbackCalls, 1, 'rollback must run exactly once');
  assert.strictEqual(reopenCalls, 2, 'database must reopen once after swap and once after rollback');

  let releaseRestore;
  const restoreGate = new Promise((resolve) => { releaseRestore = resolve; });
  coordinator.configure({
    runLocalRestore: async () => {
      await restoreGate;
      return {
        ok: true,
        rollbackPath: path.join(userData, '.rollback-two'),
        rowCounts: { clientsRegistry: 1, cases: 1, bookings: 0 },
        manifest: { recordCounts: { clients: 1, visits: 1, bookings: 0 } },
      };
    },
  });
  const first = coordinator.restore({ source: 'local', localPath: path.join(userData, 'restore-two.tdw') });
  await Promise.resolve();
  const second = await coordinator.restore({ source: 'local', localPath: path.join(userData, 'restore-three.tdw') });
  assert.strictEqual(second.ok, false, 'second concurrent restore must be rejected');
  assert.strictEqual(second.error, 'restore_in_progress', 'single-flight rejection must be explicit');
  assert.strictEqual(coordinator._getRestoreInFlight(), true, 'restore lock must remain held while first operation is active');
  releaseRestore();
  await first;
  assert.strictEqual(coordinator._getRestoreInFlight(), false, 'restore lock must release when operation settles');

  fs.rmSync(userData, { recursive: true, force: true });
  console.log('PASS remediation:restore-postcommit-truth');
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
