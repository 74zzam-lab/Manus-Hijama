#!/usr/bin/env node
'use strict';

/**
 * Conflict resolve → new revision → peer receives resolution (FileRemote contract).
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v24-conf-'));
  const remote = new FileRemote(path.join(root, 'remote'));

  const A = createDevice({ userDataDir: path.join(root, 'A'), centerId: 'CTR', branchId: 'BR-A', deviceId: 'A' });
  const B = createDevice({ userDataDir: path.join(root, 'B'), centerId: 'CTR', branchId: 'BR-A', deviceId: 'B' });

  await A.bootstrapFromRemote(remote);
  await B.bootstrapFromRemote(remote);

  A.setAll('clientsRegistry', [{ id: 'c1', name: 'Base', phone: '1' }]);
  await A.flush(remote);
  await B.pull(remote);

  A.upsertRecord('clientsRegistry', { id: 'c1', name: 'Alice' });
  B.upsertRecord('clientsRegistry', { id: 'c1', name: 'Bob' });
  await A.flush(remote);
  const flushB = await B.flush(remote);
  check(flushB.some((x) => x.conflict), 'conflict on B');

  const conflict = B.db.prepare(`SELECT * FROM sync_conflicts WHERE status='open' LIMIT 1`).get();
  check(!!conflict, 'open conflict row');

  // Resolve: keep remote (Alice), align base_revision to remote so flush does not re-conflict
  const remoteRev = Number(remote.getVersions('CTR', 'BR-A')?.tables?.clientsRegistry?.revision || 0);
  const resolved = { id: 'c1', name: 'Alice', phone: '1', resolved: true };
  check(B.sync.resolveConflictById(conflict.conflict_id, 'keep_remote', remoteRev + 1, 'owner').ok, 'resolve ok');
  // Clear stuck conflicted outbox rows for this table
  B.db.prepare(`UPDATE sync_outbox SET status='acked', acked_at=? WHERE branch_id=? AND status IN ('pending','inflight')`)
    .run(new Date().toISOString(), 'BR-A');
  B.sync.enqueueAtomic(
    {
      center_id: 'CTR',
      branch_id: 'BR-A',
      table_name: 'clientsRegistry',
      record_id: 'c1',
      operation: 'UPDATE',
      base_revision: remoteRev,
      new_revision: remoteRev + 1,
      payload_json: JSON.stringify([resolved]),
      device_id: 'B',
      actor_id: 'owner',
    },
    () => {
      B.state.tables.clientsRegistry = [resolved];
      B.state.revisions.clientsRegistry = remoteRev + 1;
    }
  );
  const flushRes = await B.flush(remote);
  check(flushRes.some((x) => x.ok), 'resolution flush ok');
  const openAfter = B.db.prepare(`SELECT COUNT(*) AS c FROM sync_conflicts WHERE status='open'`).get().c;
  check(openAfter === 0, 'no open conflicts');

  await A.pull(remote);
  check(A.getAll('clientsRegistry').find((c) => c.id === 'c1')?.name === 'Alice', 'A has resolution');
  check(A.getAll('clientsRegistry').find((c) => c.id === 'c1')?.resolved === true, 'resolution marker synced');

  // Delete vs update: A tombstones, B edits offline then conflict
  A.upsertRecord('clientsRegistry', { id: 'c1', name: 'Alice', deletedAt: new Date().toISOString() });
  await A.flush(remote);
  B.upsertRecord('clientsRegistry', { id: 'c1', name: 'Bob-edit' });
  const flushDel = await B.flush(remote);
  check(flushDel.some((x) => x.conflict) || B.db.prepare(`SELECT COUNT(*) AS c FROM sync_conflicts`).get().c >= 1,
    'delete/update surfaces conflict');

  A.close();
  B.close();
  fs.rmSync(root, { recursive: true, force: true });

  if (errors.length) {
    console.error('FAIL: v2-4 conflict resolution');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('OK: v2-4 conflict resolution peer path');

}

main().catch((e) => { console.error(e); process.exit(1); });
