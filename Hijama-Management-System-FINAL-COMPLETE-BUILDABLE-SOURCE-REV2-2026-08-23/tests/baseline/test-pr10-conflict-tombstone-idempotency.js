#!/usr/bin/env node
'use strict';

/**
 * PR10 — Conflict / Tombstone / Idempotency behavioral suite (dual-device).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase, getSchemaVersion } = require('../../database/connection');
const { createSyncPlatform } = require('../../database/sync-outbox');
const conflictKeys = require('../../database/conflict-keys');
const idempotencyKeys = require('../../database/idempotency-keys');
const tombstone = require('../../database/tombstone-policy');
const { FileRemote, createDevice } = require('../../database/peer-sync-engine');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr10-conflict-'));
  const remote = new FileRemote(path.join(root, 'remote'));

  // --- Stable conflict identity ---
  const cid = conflictKeys.buildConflictId({
    center_id: 'CTR',
    branch_id: 'BR-A',
    table_name: 'clientsRegistry',
    record_id: 'c1',
  });
  check(cid === 'cf:CTR:BR-A:clientsRegistry:c1', 'stable conflict id');
  const db = openDatabase(path.join(root, 'schema.db'));
  check(getSchemaVersion(db) >= 6, 'schemaVersion >= 6 after conflict authority migration');
  const sync = createSyncPlatform(db);
  sync.openConflict({
    center_id: 'CTR',
    branch_id: 'BR-A',
    table_name: 'clientsRegistry',
    record_id: 'c1',
    local_json: { id: 'c1', name: 'Local' },
    remote_json: { id: 'c1', name: 'Remote' },
  });
  sync.openConflict({
    center_id: 'CTR',
    branch_id: 'BR-A',
    table_name: 'clientsRegistry',
    record_id: 'c1',
    local_json: { id: 'c1', name: 'Local2' },
    remote_json: { id: 'c1', name: 'Remote2' },
  });
  const openCount = db.prepare(`SELECT COUNT(*) AS c FROM sync_conflicts WHERE status='open'`).get().c;
  check(openCount === 1, 'retry/restart does not duplicate open conflict');
  check(sync.resolveConflictById(cid, 'keep_local', 2, 'mgr').ok, 'resolve idempotent by stable id');
  const resolvedAgain = sync.resolveConflictById(cid, 'keep_local', 2, 'mgr');
  check(resolvedAgain.ok === false, 'second resolve is no-op');
  db.close();

  // --- Tombstone wins over stale live (no resurrection) ---
  const staleWin = tombstone.decideTombstone(
    { id: 'r1', name: 'Stale edit', revision: 2, updatedAt: '2026-01-01T10:00:00Z' },
    { id: 'r1', deletedAt: '2026-01-02T12:00:00Z', revision: 3 },
    'clientsRegistry'
  );
  check(staleWin?.action === tombstone.ACTIONS.PULL, 'remote tombstone wins over stale live');
  check(staleWin?.reason === 'tombstone_wins_over_stale_live', 'tombstone_wins_over_stale_live reason');

  const resurrection = tombstone.assertNotResurrecting(
    { id: 'r1', deletedAt: '2026-01-02T12:00:00Z', revision: 3 },
    { id: 'r1', name: 'Revive' }
  );
  check(!resurrection.ok && resurrection.error === 'tombstone_resurrection_blocked', 'assertNotResurrecting blocks revive');

  // --- operationId idempotency ---
  const opId = 'pay-op-001';
  const keyA = idempotencyKeys.buildRecordOpKey({
    center_id: 'CTR',
    branch_id: 'BR-A',
    table_name: 'cases',
    record_id: 'inv-1',
    operation: 'UPDATE',
    operationId: opId,
    payload_json: JSON.stringify({ amount: 100 }),
  });
  const keyB = idempotencyKeys.buildRecordOpKey({
    center_id: 'CTR',
    branch_id: 'BR-A',
    table_name: 'cases',
    record_id: 'inv-1',
    operation: 'UPDATE',
    operationId: opId,
    payload_json: JSON.stringify({ amount: 999 }),
  });
  check(keyA === keyB, 'same operationId → same idempotency key regardless of payload drift');

  const outboxDb = openDatabase(path.join(root, 'outbox-idem.db'));
  const outSync = createSyncPlatform(outboxDb);
  const first = outSync.enqueue({
    center_id: 'CTR',
    branch_id: 'BR-A',
    table_name: 'cases',
    record_id: 'inv-1',
    operation: 'UPDATE',
    operationId: opId,
    new_revision: 5,
    device_id: 'DEV-A',
    payload_json: JSON.stringify({ amount: 100 }),
  });
  const dup = outSync.enqueue({
    center_id: 'CTR',
    branch_id: 'BR-A',
    table_name: 'cases',
    record_id: 'inv-1',
    operation: 'UPDATE',
    operationId: opId,
    new_revision: 5,
    device_id: 'DEV-A',
    payload_json: JSON.stringify({ amount: 100 }),
  });
  check(first.inserted === true && dup.inserted === false, 'duplicate operationId outbox delivery → one row');
  outboxDb.close();

  // --- A/B delete + offline stale edit + reconnect ---
  const A = createDevice({ userDataDir: path.join(root, 'A'), centerId: 'CTR', branchId: 'BR-A', deviceId: 'A' });
  const B = createDevice({ userDataDir: path.join(root, 'B'), centerId: 'CTR', branchId: 'BR-A', deviceId: 'B' });
  await A.bootstrapFromRemote(remote);
  await B.bootstrapFromRemote(remote);

  A.upsertRecord('clientsRegistry', { id: 'r-del', name: 'Record', revision: 1 });
  await A.flush(remote);
  await B.pull(remote);

  A.softDeleteRecord('clientsRegistry', 'r-del');
  await A.flush(remote);

  // B offline stale edit (simulated before pull)
  B.upsertRecord('clientsRegistry', { id: 'r-del', name: 'Stale B edit', revision: 2 });
  await B.pull(remote);

  const onB = B.getAll('clientsRegistry').find((r) => r.id === 'r-del');
  check(!!onB?.deletedAt, 'R remains deleted on B after reconnect (no resurrection)');
  check(onB?.name !== 'Stale B edit' || !!onB.deletedAt, 'stale edit did not resurrect deleted record');

  // --- Cross-branch isolation ---
  const branchB = createDevice({ userDataDir: path.join(root, 'BB'), centerId: 'CTR', branchId: 'BR-B', deviceId: 'BB' });
  await branchB.bootstrapFromRemote(remote);
  branchB.upsertRecord('clientsRegistry', { id: 'bb-only', name: 'Branch B only' });
  await branchB.flush(remote);
  const conflictB = branchB.db.prepare(`SELECT COUNT(*) AS c FROM sync_conflicts WHERE branch_id='BR-B'`).get().c;
  check(conflictB === 0, 'branch B conflict isolated from branch A');

  // --- Duplicate concurrent edit → deterministic conflict ---
  const X = createDevice({ userDataDir: path.join(root, 'X'), centerId: 'CTR', branchId: 'BR-A', deviceId: 'X' });
  const Y = createDevice({ userDataDir: path.join(root, 'Y'), centerId: 'CTR', branchId: 'BR-A', deviceId: 'Y' });
  X.setAll('clientsRegistry', [{ id: 'cx', name: 'Base', revision: 1 }]);
  await X.bootstrapFromRemote(remote);
  await X.flush(remote);
  await Y.bootstrapFromRemote(remote);
  await Y.pull(remote);
  X.upsertRecord('clientsRegistry', { id: 'cx', name: 'From-X', revision: 2 });
  Y.upsertRecord('clientsRegistry', { id: 'cx', name: 'From-Y', revision: 2 });
  await X.flush(remote);
  await Y.bootstrapFromRemote(remote);
  const flushY = await Y.flush(remote);
  check(flushY.some((x) => x.conflict), 'same revision edit → conflict');
  const stableId = conflictKeys.buildConflictId({
    center_id: 'CTR',
    branch_id: 'BR-A',
    table_name: 'clientsRegistry',
    record_id: 'cx',
  });
  const cxConflicts = Y.db.prepare(`SELECT COUNT(*) AS c FROM sync_conflicts WHERE conflict_id=? AND status='open'`).get(stableId).c;
  check(cxConflicts === 1, 'one open conflict row with stable id');

  A.close();
  B.close();
  branchB.close();
  X.close();
  Y.close();
  fs.rmSync(root, { recursive: true, force: true });

  if (errors.length) {
    console.error('FAIL pr10-conflict-tombstone-idempotency (' + errors.length + ')');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('PASS pr10-conflict-tombstone-idempotency (dual-device + authority checks)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
