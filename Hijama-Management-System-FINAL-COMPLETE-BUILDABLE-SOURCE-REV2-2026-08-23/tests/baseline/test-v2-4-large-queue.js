#!/usr/bin/env node
'use strict';

/**
 * Large queue flush + idempotent duplicate ACK (FileRemote).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FileRemote, createDevice } = require('../../database/peer-sync-engine');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}


async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v24-queue-'));
  const remote = new FileRemote(path.join(root, 'remote'));
  const A = createDevice({ userDataDir: path.join(root, 'A'), centerId: 'CTR', branchId: 'BR-A', deviceId: 'A' });
  const B = createDevice({ userDataDir: path.join(root, 'B'), centerId: 'CTR', branchId: 'BR-A', deviceId: 'B' });

  await A.bootstrapFromRemote(remote);
  await B.bootstrapFromRemote(remote);

  const N = 120;
  const records = [];
  for (let i = 0; i < N; i++) {
    records.push({ id: `c${i}`, name: `Client ${i}` });
  }
  A.setAll('clientsRegistry', records);
  const t0 = Date.now();
  const flush = await A.flush(remote);
  const dt = Date.now() - t0;
  check(flush.every((x) => x.ok), 'all flush ok');
  check(A.sync.countByStatus('BR-A').pending === 0, 'pending cleared');

  await B.pull(remote);
  check(B.getAll('clientsRegistry').length === N, `B has ${N}`);

  // Interrupted ACK simulation: push succeeds but re-claim same payload via duplicate idempotency
  const beforeAck = A.sync.enqueue({
    center_id: 'CTR',
    branch_id: 'BR-A',
    table_name: 'clientsRegistry',
    operation: 'TABLE_BUMP',
    new_revision: 999,
    device_id: 'A',
    payload_json: JSON.stringify(records),
    idempotency_key: 'dup-test-key',
  });
  check(beforeAck.inserted === true, 'queued');
  const dup = A.sync.enqueue({
    center_id: 'CTR',
    branch_id: 'BR-A',
    table_name: 'clientsRegistry',
    operation: 'TABLE_BUMP',
    new_revision: 999,
    device_id: 'A',
    payload_json: JSON.stringify(records),
    idempotency_key: 'dup-test-key',
  });
  check(dup.inserted === false, 'idempotent duplicate suppressed');

  console.log(JSON.stringify({ flushMs: dt, records: N, medianHint: dt }));

  A.close();
  B.close();
  fs.rmSync(root, { recursive: true, force: true });

  if (errors.length) {
    console.error('FAIL: v2-4 large queue');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('OK: v2-4 large queue + idempotency');

}

main().catch((e) => { console.error(e); process.exit(1); });
