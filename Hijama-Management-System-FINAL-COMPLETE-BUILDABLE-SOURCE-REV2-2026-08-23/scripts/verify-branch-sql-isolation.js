#!/usr/bin/env node
/**
 * Phase 4 / PR7: branch-scoped SQLite isolation — writes, reads, IPC enforcement.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../database/connection');
const { createRepositories } = require('../database/repositories');

const root = path.join(__dirname, '..');
const bridge = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');
const service = fs.readFileSync(path.join(root, 'electron', 'database', 'service.js'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
const scopeMod = fs.readFileSync(path.join(root, 'database', 'operational-scope.js'), 'utf8');

const checks = [
  { name: 'operational-scope module exists', ok: fs.existsSync(path.join(root, 'database', 'operational-scope.js')) },
  { name: 'branch-slice listForBranch exported', ok: /function listForBranch/.test(fs.readFileSync(path.join(root, 'database/repositories/branch-slice.js'), 'utf8')) },
  { name: 'repos getAllForBranch', ok: /getAllForBranch/.test(fs.readFileSync(path.join(root, 'database/repositories/index.js'), 'utf8')) },
  { name: 'service persistTable requires branchId', ok: /branch_id_required/.test(service) && /isOperationalTable/.test(service) },
  { name: 'querySafe listForBranch op', ok: /case 'listForBranch'/.test(service) },
  { name: 'querySafe sumVisits branch scoped', ok: /sumTotalForBranch/.test(service) },
  { name: 'main IPC branch_id_required', ok: /branch_id_required/.test(mainJs) },
  { name: 'main querySafe passes session', ok: /querySafe\(req, session\)/.test(mainJs) },
  { name: 'bridge assertOperationalWriteBranch', ok: /assertOperationalWriteBranch/.test(bridge) },
  { name: 'operational-scope owner aggregate read', ok: /aggregateRead/.test(scopeMod) },
  { name: 'leakage test file exists', ok: fs.existsSync(path.join(root, 'tests/baseline/test-branch-sql-isolation-leakage.js')) },
  { name: 'UI search scoped', ok: /getUiScopedRecords\(clientsRegistry/.test(fs.readFileSync(path.join(root, 'index.html'), 'utf8')) },
];

let failed = 0;
for (const c of checks) {
  console.log((c.ok ? 'PASS' : 'FAIL') + '  ' + c.name);
  if (!c.ok) failed += 1;
}

async function runtimeSliceTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-slice-'));
  const dbPath = path.join(tmp, 'tadawi.db');
  const db = openDatabase(dbPath);
  const repos = createRepositories(db);

  repos.clients.upsert({ id: 'c-a', name: 'A', branchId: 'BR-A' });
  repos.clients.upsert({ id: 'c-b', name: 'B', branchId: 'BR-B' });

  repos.clients.replaceBranchSlice([
    { id: 'c-a2', name: 'A2', branchId: 'BR-A' },
  ], 'BR-A');

  const all = repos.clients.getAll();
  const ids = all.map((r) => r.id).sort();
  const ok = ids.includes('c-a2') && ids.includes('c-b') && !ids.includes('c-a');
  console.log((ok ? 'PASS' : 'FAIL') + '  runtime replaceBranchSlice keeps other branch');
  if (!ok) failed += 1;

  let tamperFailed = false;
  try {
    repos.clients.replaceBranchSlice([{ id: 'x', name: 'X', branchId: 'BR-B' }], 'BR-A');
  } catch (e) {
    tamperFailed = e.code === 'branch_id_tamper';
  }
  console.log((tamperFailed ? 'PASS' : 'FAIL') + '  branch_id tamper rejected');
  if (!tamperFailed) failed += 1;

  const scoped = repos.clients.getByIdScoped('c-b', 'BR-A');
  console.log((scoped === null ? 'PASS' : 'FAIL') + '  getByIdScoped denies cross-branch');
  if (scoped !== null) failed += 1;

  const listA = repos.clients.getAllForBranch('BR-A');
  console.log((listA.length === 1 && listA[0].id === 'c-a2' ? 'PASS' : 'FAIL') + '  getAllForBranch returns branch slice only');
  if (!(listA.length === 1 && listA[0].id === 'c-a2')) failed += 1;

  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

runtimeSliceTest().then(() => {
  if (failed) process.exit(1);
  console.log('\nAll branch SQL isolation checks passed.');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
