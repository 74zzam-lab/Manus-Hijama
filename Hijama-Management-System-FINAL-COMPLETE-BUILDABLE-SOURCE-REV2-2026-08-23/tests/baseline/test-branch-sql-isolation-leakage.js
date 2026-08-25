#!/usr/bin/env node
'use strict';

/**
 * PR7 — Branch A/B leakage behavioral suite (trusted SQL/IPC layer).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../../database/connection');
const { createRepositories } = require('../../database/repositories');
const operationalScope = require('../../database/operational-scope');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

function staffSession(branchId) {
  return { userId: 'u1', role: 'reception', branchScope: [branchId], rank: 2 };
}

function ownerSession() {
  return { userId: 'owner1', role: 'owner', branchScope: ['*'], rank: 6 };
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-leakage-'));
  const dbPath = path.join(tmp, 'tadawi.db');
  const db = openDatabase(dbPath);
  const repos = createRepositories(db);

  repos.clients.upsert({ id: 'c-a', name: 'Client A', branchId: 'BR-A' });
  repos.clients.upsert({ id: 'c-b', name: 'Client B', branchId: 'BR-B' });
  repos.visits.upsert({ id: 'v-a', name: 'Visit A', total: 100, branchId: 'BR-A', date: '2026-01-01' });
  repos.visits.upsert({ id: 'v-b', name: 'Visit B', total: 200, branchId: 'BR-B', date: '2026-01-01' });

  // Read isolation
  const aClients = repos.clients.getAllForBranch('BR-A');
  check(aClients.length === 1 && aClients[0].id === 'c-a', 'BR-A list excludes BR-B clients');
  check(repos.clients.getByIdScoped('c-b', 'BR-A') === null, 'BR-A cannot read BR-B client by id');

  // Write isolation / tamper
  let tamperRejected = false;
  try {
    repos.clients.replaceBranchSlice([{ id: 'c-x', name: 'X', branchId: 'BR-B' }], 'BR-A');
  } catch (e) {
    tamperRejected = e.code === 'branch_id_tamper';
  }
  check(tamperRejected, 'BR-A write with BR-B record rejected');

  let missingBranchRejected = false;
  try {
    operationalScope.assertOperationalRecordsBranch([{ id: 'c-y', name: 'Y' }], 'BR-A');
  } catch (e) {
    missingBranchRejected = e.code === 'record_branch_id_required';
  }
  check(missingBranchRejected, 'write without record branchId fail-closed');

  // IPC querySafe simulation via service module
  const dbServicePath = path.join(__dirname, '..', '..', 'electron', 'database', 'service.js');
  delete require.cache[require.resolve(dbServicePath)];
  // Use repositories + operational-scope directly for query semantics
  const branchBAccess = operationalScope.assertSessionBranchAccess(staffSession('BR-A'), 'BR-B');
  check(branchBAccess.ok === false && branchBAccess.error === 'branch_access_denied', 'staff session BR-A denied BR-B');

  check(repos.clients.getByIdScoped('c-b', 'BR-A') === null, 'cross-branch getById returns null');

  // Owner aggregate read allowed
  const ownerAggregate = operationalScope.resolveReadScope(ownerSession(), { aggregateRead: true, op: 'count' });
  check(ownerAggregate.ok === true && ownerAggregate.aggregate === true, 'owner aggregate read allowed');

  // Owner write without branch blocked
  let ownerWriteBlocked = false;
  try {
    operationalScope.assertOwnerOperationalWrite(ownerSession(), null);
  } catch (e) {
    ownerWriteBlocked = e.code === 'branch_id_required';
  }
  check(ownerWriteBlocked, 'owner write without branch blocked');

  // Owner write with explicit branch allowed
  let ownerWriteOk = false;
  try {
    operationalScope.assertOwnerOperationalWrite(ownerSession(), 'BR-A');
    ownerWriteOk = true;
  } catch {
    ownerWriteOk = false;
  }
  check(ownerWriteOk, 'owner write with explicit branch allowed');

  // Sum visits scoped
  check(Number(repos.visits.sumTotalForBranch('BR-A')) === 100, 'sumVisits scoped to BR-A');
  check(Number(repos.visits.sumTotalForBranch('BR-B')) === 200, 'sumVisits scoped to BR-B');

  // Slice write preserves other branch
  repos.clients.replaceBranchSlice([{ id: 'c-a2', name: 'A2', branchId: 'BR-A' }], 'BR-A');
  const afterSlice = repos.clients.getAll().map((r) => r.id).sort();
  check(afterSlice.includes('c-b') && afterSlice.includes('c-a2'), 'BR-A slice preserves BR-B rows');

  // Static: no silent BR-MAIN write fallback in bridge
  const bridge = fs.readFileSync(path.join(__dirname, '..', '..', 'cupping-sqlite-bridge.js'), 'utf8');
  check(/function assertOperationalWriteBranch/.test(bridge), 'bridge assertOperationalWriteBranch present');
  check(!/getOperationalWriteBranchId\(\)[\s\S]{0,120}\|\|\s*'BR-MAIN'/.test(bridge), 'bridge write path no BR-MAIN fallback');

  // Static: search/export scoped in UI layer
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  check(/getUiScopedRecords\(clientsRegistry/.test(html), 'topbar search scoped');
  check(/scopeBackupExportArray/.test(html), 'custom backup export scoped');

  const inv = fs.readFileSync(path.join(__dirname, '..', '..', 'cupping-ext-modules.js'), 'utf8');
  check(/getInventoryScopedItems/.test(inv), 'inventory view scoped');

  const invSearch = fs.readFileSync(path.join(__dirname, '..', '..', 'cupping-system-improvements.js'), 'utf8');
  check(/scopedCases/.test(invSearch), 'invoice search scoped');

  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  if (errors.length) {
    console.error('FAIL: branch-sql-isolation-leakage');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('OK: branch A/B isolation leakage suite (read/write/tamper/owner aggregate/IPC scope)');
}

main().catch((err) => {
  console.error('FAIL: branch-sql-isolation-leakage fatal', err);
  process.exit(1);
});
