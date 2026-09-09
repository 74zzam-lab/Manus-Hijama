#!/usr/bin/env node
'use strict';

/**
 * PR1 Sync Safety Core — behavioral tests (SOURCE VERIFIED).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FileRemote, createDevice } = require('../../database/peer-sync-engine');
const { createSyncBaseline, LIFECYCLE } = require('../../database/sync-baseline');
const { createSyncCoordinatorCore } = require('../../database/sync-coordinator-core');
const pushGuards = require('../../database/sync-push-guards');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

async function testBaselineGate() {
  let state = null;
  const baseline = createSyncBaseline({
    load: () => state,
    save: (s) => { state = s; },
  });
  check(!baseline.isPushAllowed().ok, 'uninitialized push blocked');
  check(baseline.isPushAllowed().code === 'sync_lifecycle_push_blocked', 'uninitialized code');

  baseline.markHydrating();
  check(!baseline.isPushAllowed().ok, 'hydrating push blocked');

  baseline.markBaselineKnown({ branchId: 'BR-A', remoteRevision: 10, integrityPass: true });
  check(baseline.isPushAllowed({ branchId: 'BR-A' }).ok, 'baseline known allows push');
  baseline.markReady();
  check(baseline.getLifecycle() === LIFECYCLE.READY, 'ready lifecycle');
}

async function testMutexSerialization() {
  const coordinator = createSyncCoordinatorCore();
  let concurrent = 0;
  let maxConcurrent = 0;

  const task = () => coordinator.withMutex(async () => {
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await new Promise((r) => setTimeout(r, 30));
    concurrent -= 1;
    return { ok: true };
  });

  await Promise.all([task(), task(), task()]);
  check(maxConcurrent === 1, 'local concurrent sync serialized');
}

async function testCasGuard() {
  const stale = pushGuards.evaluateCasPushGuard({
    expectedRemoteRevision: 10,
    actualRemoteRevision: 11,
  });
  check(!stale.ok && stale.code === 'remote_revision_mismatch' && stale.retry === true, 'CAS stale mismatch');

  const unknown = pushGuards.evaluateCasPushGuard({
    expectedRemoteRevision: NaN,
    actualRemoteRevision: 0,
  });
  check(!unknown.ok && unknown.code === 'baseline_revision_unknown', 'fail closed unknown baseline');
}

async function seedRemoteAtRevision(remote, centerId, branchId, table, revision, records, deviceId) {
  let currentManifest = remote.getBranchDatabaseRevision(remote.getVersions(centerId, branchId), branchId);
  let currentTable = remote.getTableRevision(centerId, branchId, table);
  while (currentManifest < revision || currentTable < revision) {
    await remote.putTable(centerId, branchId, table, currentTable + 1, records, deviceId, {
      expectedTableRevision: currentTable,
      expectedManifestRevision: currentManifest,
      operationId: 'seed-op',
    });
    currentManifest = remote.getBranchDatabaseRevision(remote.getVersions(centerId, branchId), branchId);
    currentTable = remote.getTableRevision(centerId, branchId, table);
  }
}

async function testAbConcurrentWrite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-safety-ab-'));
  const remote = new FileRemote(path.join(root, 'remote'));
  const centerId = 'CTR-AB';
  const branchId = 'BR-MAD';
  const table = 'clientsRegistry';

  await seedRemoteAtRevision(
    remote,
    centerId,
    branchId,
    table,
    10,
    [{ id: 'base', name: 'Base' }],
    'SEED'
  );

  const deviceA = createDevice({
    userDataDir: path.join(root, 'deviceA'),
    centerId,
    branchId,
    deviceId: 'DEV-A',
  });
  const deviceB = createDevice({
    userDataDir: path.join(root, 'deviceB'),
    centerId,
    branchId,
    deviceId: 'DEV-B',
  });

  await deviceA.bootstrapFromRemote(remote);
  await deviceB.bootstrapFromRemote(remote);

  deviceA.upsertRecord(table, { id: 'from-a', name: 'Patient A' });
  deviceB.upsertRecord(table, { id: 'from-b', name: 'Invoice B' });

  const flushA = await deviceA.flush(remote);
  check(flushA.some((x) => x.ok), 'device A push revision 11');

  const versionsAfterA = remote.getVersions(centerId, branchId);
  const revAfterA = remote.getBranchDatabaseRevision(versionsAfterA, branchId);
  check(revAfterA === 11, 'remote revision 11 after A');

  const flushBFirst = await deviceB.flush(remote);
  check(flushBFirst.some((x) => x.ok), 'device B stale push retried to success');

  const remoteTable = remote.getTable(centerId, branchId, table);
  const ids = (remoteTable?.records || []).map((r) => r.id).sort();
  check(ids.includes('from-a'), 'remote keeps A change');
  check(ids.includes('from-b'), 'remote keeps B change');

  const versionsFinal = remote.getVersions(centerId, branchId);
  const revFinal = remote.getBranchDatabaseRevision(versionsFinal, branchId);
  check(revFinal === 12, 'remote revision 12 after B merge push');

  deviceA.close();
  deviceB.close();
  fs.rmSync(root, { recursive: true, force: true });
}

async function testUninitializedCannotPush() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-safety-uninit-'));
  const remote = new FileRemote(path.join(root, 'remote'));
  const device = createDevice({
    userDataDir: path.join(root, 'device'),
    centerId: 'CTR-U',
    branchId: 'BR-U',
    deviceId: 'DEV-U',
  });
  device.upsertRecord('clientsRegistry', { id: 'x1', name: 'X' });
  const flush = await device.flush(remote);
  check(flush.some((x) => x.blocked && /baseline|lifecycle/i.test(String(x.reason || ''))), 'uninitialized flush blocked');
  device.close();
  fs.rmSync(root, { recursive: true, force: true });
}

async function testOutboxAckOnlyAfterVerify() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-safety-ack-'));
  const remote = new FileRemote(path.join(root, 'remote'));
  const device = createDevice({
    userDataDir: path.join(root, 'device'),
    centerId: 'CTR-ACK',
    branchId: 'BR-ACK',
    deviceId: 'DEV-ACK',
  });
  await device.bootstrapFromRemote(remote);
  device.upsertRecord('clientsRegistry', { id: 'ack1', name: 'Ack Test' });
  await device.flush(remote);
  check(device.sync.countByStatus('BR-ACK').pending === 0, 'outbox acked after verified push');

  const badRemote = {
    getVersions: (...args) => remote.getVersions(...args),
    getBranchDatabaseRevision: (...args) => remote.getBranchDatabaseRevision(...args),
    getTable: (...args) => remote.getTable(...args),
    putTable() {
      const err = new Error('remote_revision_mismatch');
      err.code = 'remote_revision_mismatch';
      err.retry = true;
      throw err;
    },
    verifyTableCommit: (...args) => remote.verifyTableCommit(...args),
  };
  device.upsertRecord('clientsRegistry', { id: 'ack2', name: 'Pending' });
  const failed = await device.flush(badRemote);
  check(failed.some((x) => !x.ok), 'failed verify path does not ack');
  check(device.sync.countByStatus('BR-ACK').pending + device.sync.countByStatus('BR-ACK').inflight >= 1, 'outbox remains pending without verified commit');
  device.close();
  fs.rmSync(root, { recursive: true, force: true });
}

async function testBranchIsolationRemoteWrite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-safety-branch-'));
  const remote = new FileRemote(path.join(root, 'remote'));
  const devA = createDevice({
    userDataDir: path.join(root, 'a'),
    centerId: 'CTR-BR',
    branchId: 'BR-A',
    deviceId: 'DEV-A',
  });
  const devB = createDevice({
    userDataDir: path.join(root, 'b'),
    centerId: 'CTR-BR',
    branchId: 'BR-B',
    deviceId: 'DEV-B',
  });
  await devA.bootstrapFromRemote(remote);
  await devB.bootstrapFromRemote(remote);
  devA.upsertRecord('clientsRegistry', { id: 'only-a', name: 'A' });
  await devA.flush(remote);
  const bTable = remote.getTable('CTR-BR', 'BR-B', 'clientsRegistry');
  check(!bTable || !(bTable.records || []).some((r) => r.id === 'only-a'), 'branch A sync never writes branch B remote');
  devA.close();
  devB.close();
  fs.rmSync(root, { recursive: true, force: true });
}

async function testIdempotencyDuplicateDelivery() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-safety-idem-'));
  const remote = new FileRemote(path.join(root, 'remote'));
  const device = createDevice({
    userDataDir: path.join(root, 'device'),
    centerId: 'CTR-ID',
    branchId: 'BR-ID',
    deviceId: 'DEV-ID',
  });
  await device.bootstrapFromRemote(remote);
  const first = device.sync.enqueue({
    center_id: 'CTR-ID',
    branch_id: 'BR-ID',
    table_name: 'clientsRegistry',
    operation: 'TABLE_BUMP',
    base_revision: 0,
    new_revision: 1,
    device_id: 'DEV-ID',
    payload_json: JSON.stringify([{ id: 'dup', name: 'Once' }]),
  });
  const second = device.sync.enqueue({
    center_id: 'CTR-ID',
    branch_id: 'BR-ID',
    table_name: 'clientsRegistry',
    operation: 'TABLE_BUMP',
    base_revision: 0,
    new_revision: 1,
    device_id: 'DEV-ID',
    payload_json: JSON.stringify([{ id: 'dup', name: 'Once' }]),
    idempotency_key: first.idempotencyKey,
  });
  check(second.inserted === false, 'duplicate operation delivery does not duplicate outbox row');
  device.close();
  fs.rmSync(root, { recursive: true, force: true });
}

async function testPostRestoreReconciliationGate() {
  let state = null;
  const baseline = createSyncBaseline({
    load: () => state,
    save: (s) => { state = s; },
  });
  baseline.markBaselineKnown({ branchId: 'BR-R', remoteRevision: 5, integrityPass: true });
  baseline.markReady();
  baseline.enterReconciliationRequired();
  check(!baseline.isPushAllowed({ branchId: 'BR-R' }).ok, 'post-restore push blocked until reconcile');
  baseline.completeReconciliation({ branchId: 'BR-R', remoteRevision: 8 });
  check(baseline.isPushAllowed({ branchId: 'BR-R' }).ok, 'push allowed after reconcile complete');
}

async function main() {
  await testBaselineGate();
  await testMutexSerialization();
  await testCasGuard();
  await testUninitializedCannotPush();
  await testAbConcurrentWrite();
  await testOutboxAckOnlyAfterVerify();
  await testBranchIsolationRemoteWrite();
  await testIdempotencyDuplicateDelivery();
  await testPostRestoreReconciliationGate();

  if (errors.length) {
    console.error('FAIL: sync safety core');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('OK: sync safety core behavioral tests (SOURCE VERIFIED)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
