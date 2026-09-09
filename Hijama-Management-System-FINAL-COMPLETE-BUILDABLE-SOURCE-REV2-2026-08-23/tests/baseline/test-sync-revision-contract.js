#!/usr/bin/env node
'use strict';

/**
 * Revision contract — branch head vs per-table revision (SOURCE VERIFIED).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FileRemote, createDevice } = require('../../database/peer-sync-engine');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

async function seedBranchHead(remote, centerId, branchId, head, deviceId) {
  const versions = remote.getVersions(centerId, branchId);
  versions.databaseVersion = head;
  versions.branches = versions.branches || {};
  versions.branches[branchId] = { ...(versions.branches[branchId] || {}), databaseVersion: head };
  remote.writeAtomic(remote.versionsPath(centerId, branchId), versions);
  for (const [table, rev] of [['cases', 7], ['clientsRegistry', 4]]) {
    remote.writeAtomic(remote.tablePath(centerId, branchId, table), {
      centerId,
      branchId,
      table,
      revision: rev,
      records: [{ id: `${table}-base`, name: 'Base' }],
      updatedAt: new Date().toISOString(),
    });
    versions.tables = versions.tables || {};
    versions.tables[table] = { revision: rev };
  }
  remote.writeAtomic(remote.versionsPath(centerId, branchId), versions);
}

async function testConcurrentDifferentTablesSameBranch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-rev-contract-'));
  const remote = new FileRemote(path.join(root, 'remote'));
  const centerId = 'CTR-DT';
  const branchId = 'BR-MAD';
  await seedBranchHead(remote, centerId, branchId, 10, 'SEED');

  const deviceA = createDevice({
    userDataDir: path.join(root, 'a'),
    centerId,
    branchId,
    deviceId: 'DEV-A',
  });
  const deviceB = createDevice({
    userDataDir: path.join(root, 'b'),
    centerId,
    branchId,
    deviceId: 'DEV-B',
  });
  await deviceA.bootstrapFromRemote(remote);
  await deviceB.bootstrapFromRemote(remote);

  deviceA.upsertRecord('cases', { id: 'case-a', name: 'Case A' });
  deviceB.upsertRecord('clientsRegistry', { id: 'client-b', name: 'Client B' });

  const flushA = await deviceA.flush(remote);
  check(flushA.some((x) => x.ok), 'device A pushes cases');

  const headAfterA = remote.getBranchDatabaseRevision(remote.getVersions(centerId, branchId), branchId);
  check(headAfterA === 11, 'branch head bumped after A');

  const flushB = await deviceB.flush(remote);
  check(flushB.some((x) => x.ok), 'device B pushes different table without false table CAS reject');

  const cases = remote.getTable(centerId, branchId, 'cases');
  const clients = remote.getTable(centerId, branchId, 'clientsRegistry');
  check((cases?.records || []).some((r) => r.id === 'case-a'), 'cases keeps A change');
  check((clients?.records || []).some((r) => r.id === 'client-b'), 'clients keeps B change');

  const finalHead = remote.getBranchDatabaseRevision(remote.getVersions(centerId, branchId), branchId);
  check(finalHead === 12, 'branch head reflects both manifest bumps');

  deviceA.close();
  deviceB.close();
  fs.rmSync(root, { recursive: true, force: true });
}

async function testSameTableConcurrentCas() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-rev-same-table-'));
  const remote = new FileRemote(path.join(root, 'remote'));
  const centerId = 'CTR-ST';
  const branchId = 'BR-ST';
  const table = 'cases';
  await seedBranchHead(remote, centerId, branchId, 10, 'SEED');

  const currentTableRev = remote.getTableRevision(centerId, branchId, table);
  const currentManifest = remote.getBranchDatabaseRevision(remote.getVersions(centerId, branchId), branchId);

  try {
    await remote.putTable(centerId, branchId, table, currentTableRev + 1, [{ id: 'win', name: 'Win' }], 'DEV-1', {
      expectedTableRevision: currentTableRev,
      expectedManifestRevision: currentManifest,
    });
    await remote.putTable(centerId, branchId, table, currentTableRev + 1, [{ id: 'lose', name: 'Lose' }], 'DEV-2', {
      expectedTableRevision: currentTableRev,
      expectedManifestRevision: currentManifest,
    });
    check(false, 'second same-table writer should have failed table or manifest CAS');
  } catch (err) {
    check(err.code === 'remote_revision_mismatch' || err.code === 'manifest_revision_mismatch', 'same-table stale writer rejected');
  }

  const final = remote.getTable(centerId, branchId, table);
  check((final?.records || []).some((r) => r.id === 'win'), 'winner change preserved');
  check(!(final?.records || []).some((r) => r.id === 'lose'), 'loser did not overwrite');

  fs.rmSync(root, { recursive: true, force: true });
}

async function main() {
  await testConcurrentDifferentTablesSameBranch();
  await testSameTableConcurrentCas();
  if (errors.length) {
    console.error('FAIL: revision contract tests');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('PASS: revision contract (branch head vs table revision) — SOURCE VERIFIED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
