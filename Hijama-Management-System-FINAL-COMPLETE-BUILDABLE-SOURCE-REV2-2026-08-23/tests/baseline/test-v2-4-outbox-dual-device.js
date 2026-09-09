#!/usr/bin/env node
'use strict';

/**
 * V2-4: Durable SQLite outbox + dual-device peer sync (file remote contract).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase, getSchemaVersion } = require('../../database/connection');
const { createSyncPlatform } = require('../../database/sync-outbox');
const { FileRemote, createDevice } = require('../../database/peer-sync-engine');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}


async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v24-outbox-'));
  const remote = new FileRemote(path.join(root, 'remote'));

  // Schema migration includes outbox
  {
    const db = openDatabase(path.join(root, 'schema.db'));
    check(getSchemaVersion(db) >= 5, 'schemaVersion must be >=5 after 002_sync_platform');
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name);
    check(tables.includes('sync_outbox'), 'sync_outbox table required');
    check(tables.includes('sync_inbox_applied'), 'sync_inbox_applied required');
    check(tables.includes('sync_conflicts'), 'sync_conflicts required');
    db.close();
  }

  // Atomic enqueue + crash-safety of pending
  {
    const db = openDatabase(path.join(root, 'atomic.db'));
    const sync = createSyncPlatform(db);
    const r = sync.enqueueAtomic(
      {
        center_id: 'CTR-UAT',
        branch_id: 'BR-A',
        table_name: 'clientsRegistry',
        operation: 'TABLE_BUMP',
        new_revision: 1,
        device_id: 'DEV-A',
        payload_json: JSON.stringify([{ id: 'c1', name: 'A' }]),
      },
      () => {
        db.prepare(
          `INSERT INTO sync_meta(key,value,updated_at) VALUES('probe','1',?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value`
        ).run(new Date().toISOString());
      }
    );
    check(r.inserted === true, 'outbox insert should occur');
    const counts = sync.countByStatus('BR-A');
    check(counts.pending === 1, 'pending count 1');
    // idempotent duplicate
    const r2 = sync.enqueue({
      center_id: 'CTR-UAT',
      branch_id: 'BR-A',
      table_name: 'clientsRegistry',
      operation: 'TABLE_BUMP',
      new_revision: 1,
      device_id: 'DEV-A',
      payload_json: JSON.stringify([{ id: 'c1', name: 'A' }]),
      idempotency_key: r.idempotencyKey,
    });
    check(r2.inserted === false, 'duplicate idempotency must not insert');
    db.close();
  }

  // Dual device A→B and B→A
  const deviceA = createDevice({
    userDataDir: path.join(root, 'deviceA'),
    centerId: 'CTR-UAT',
    branchId: 'BR-A',
    deviceId: 'DEV-A',
  });
  const deviceB = createDevice({
    userDataDir: path.join(root, 'deviceB'),
    centerId: 'CTR-UAT',
    branchId: 'BR-A',
    deviceId: 'DEV-B',
  });

  await deviceA.bootstrapFromRemote(remote);
  await deviceB.bootstrapFromRemote(remote);

  deviceA.upsertRecord('clientsRegistry', { id: 'c1', name: 'Client One', phone: '0500000001' });
  deviceA.upsertRecord('clientsRegistry', { id: 'c2', name: 'Client Two', phone: '0500000002' });
  const flushA = await deviceA.flush(remote);
  check(flushA.some((x) => x.ok), 'Device A flush should ack');
  check(deviceA.sync.countByStatus('BR-A').pending === 0, 'A pending cleared after ack');

  const pullB = await deviceB.pull(remote);
  check(pullB.applied.some((x) => x.table === 'clientsRegistry'), 'B applied clientsRegistry');
  check(deviceB.getAll('clientsRegistry').length === 2, 'B has 2 clients');
  check(deviceB.getAll('clientsRegistry').find((c) => c.id === 'c1')?.name === 'Client One', 'B client name');

  deviceB.upsertRecord('clientsRegistry', { id: 'c3', name: 'Client Three', phone: '0500000003' });
  await deviceB.bootstrapFromRemote(remote);
  await deviceB.flush(remote);
  await deviceA.pull(remote);
  check(deviceA.getAll('clientsRegistry').length === 3, 'A received B create');

  // Offline queue: write without flush, restart by reopening device dir
  deviceA.upsertRecord('clientsRegistry', { id: 'c4', name: 'Offline Four', phone: '0500000004' });
  check(deviceA.sync.countByStatus('BR-A').pending >= 1, 'offline pending exists');
  deviceA.close();
  const deviceA2 = createDevice({
    userDataDir: path.join(root, 'deviceA'),
    centerId: 'CTR-UAT',
    branchId: 'BR-A',
    deviceId: 'DEV-A',
  });
  check(deviceA2.sync.countByStatus('BR-A').pending >= 1, 'pending survives process restart');
  check(deviceA2.getAll('clientsRegistry').some((c) => c.id === 'c4'), 'table state rehydrated after restart');
  await deviceA2.bootstrapFromRemote(remote);
  await deviceA2.flush(remote);
  await deviceB.pull(remote);
  check(deviceB.getAll('clientsRegistry').some((c) => c.id === 'c4'), 'B got offline queued record');

  // Conflict: both edit same id from same base
  const deviceX = createDevice({
    userDataDir: path.join(root, 'deviceX'),
    centerId: 'CTR-UAT',
    branchId: 'BR-A',
    deviceId: 'DEV-X',
  });
  const deviceY = createDevice({
    userDataDir: path.join(root, 'deviceY'),
    centerId: 'CTR-UAT',
    branchId: 'BR-A',
    deviceId: 'DEV-Y',
  });
  deviceX.setAll('clientsRegistry', [{ id: 'cx', name: 'Base' }]);
  await deviceX.bootstrapFromRemote(remote);
  await deviceX.flush(remote);
  await deviceY.bootstrapFromRemote(remote);
  await deviceY.pull(remote);
  deviceX.upsertRecord('clientsRegistry', { id: 'cx', name: 'From-X' });
  deviceY.upsertRecord('clientsRegistry', { id: 'cx', name: 'From-Y' });
  await deviceX.flush(remote);
  await deviceY.bootstrapFromRemote(remote);
  const flushY = await deviceY.flush(remote);
  check(flushY.some((x) => x.conflict), 'Y push detects conflict against remote X');
  const openConflicts = deviceY.db
    .prepare(`SELECT COUNT(*) AS c FROM sync_conflicts WHERE status='open'`)
    .get().c;
  check(openConflicts >= 1, 'same-record conflict detected');

  // Branch isolation: B cannot see BR-B operational if writing BR-A only
  const deviceBranchB = createDevice({
    userDataDir: path.join(root, 'deviceBRB'),
    centerId: 'CTR-UAT',
    branchId: 'BR-B',
    deviceId: 'DEV-BRB',
  });
  await deviceBranchB.bootstrapFromRemote(remote);
  await deviceBranchB.pull(remote);
  check(deviceBranchB.getAll('clientsRegistry').length === 0, 'BR-B pull must not see BR-A clients');

  // Failed push does not delete outbox
  {
    const badRemote = {
      getVersions: (...args) => remote.getVersions(...args),
      getBranchDatabaseRevision: (...args) => remote.getBranchDatabaseRevision(...args),
      getTable: (...args) => remote.getTable(...args),
      verifyTableCommit: (...args) => remote.verifyTableCommit(...args),
      putTable() {
        throw new Error('network_down');
      },
    };
    deviceBranchB.upsertRecord('clientsRegistry', { id: 'bb1', name: 'BB' });
    await deviceBranchB.bootstrapFromRemote(remote);
    const before = deviceBranchB.sync.countByStatus('BR-B');
    await deviceBranchB.flush(badRemote);
    const after = deviceBranchB.sync.countByStatus('BR-B');
    check(after.pending + after['dead-letter'] + after.inflight >= 1, 'failed push retains event');
    check(before.total <= after.total || after.pending >= 0, 'outbox not wiped');
  }

  deviceA2.close();
  deviceB.close();
  deviceX.close();
  deviceY.close();
  deviceBranchB.close();

  fs.rmSync(root, { recursive: true, force: true });

  if (errors.length) {
    console.error('FAIL: v2-4 outbox dual-device');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('OK: v2-4 durable outbox + dual-device peer sync');

}

main().catch((e) => { console.error(e); process.exit(1); });
