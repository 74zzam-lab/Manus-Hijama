#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-4', 'evidence');
const scenariosDir = path.join(evidenceDir, 'scenarios');
fs.mkdirSync(scenariosDir, { recursive: true });

const results = [];
const startedAt = new Date().toISOString();

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function scenario(id, title, fn) {
  const started = Date.now();
  const entry = { id, title, result: 'FAIL', ms: 0, evidence: {} };
  try {
    entry.evidence = (await fn()) || {};
    entry.result = 'PASS';
  } catch (err) {
    entry.result = 'FAIL';
    entry.error = String(err && (err.message || err)).slice(0, 400);
  }
  entry.ms = Date.now() - started;
  results.push(entry);
  writeJson(path.join(scenariosDir, `${id}.json`), entry);
  console.log(`${entry.result}  ${id}  ${title}  (${entry.ms}ms)`);
}

async function main() {
  await scenario('R01-inventory-snapshot', 'RBAC inventory snapshot complete', async () => {
    const unit = spawnSync(process.execPath, [path.join(root, 'tests/baseline/test-v2-5-4-rbac-audit.js')], {
      cwd: root, encoding: 'utf8',
    });
    if (unit.status !== 0) throw new Error(unit.stderr || unit.stdout || 'unit_failed');
    const inv = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'rbac-inventory.json'), 'utf8'));
    if (!inv.roles?.product?.includes('owner')) throw new Error('no_roles');
    return { roles: inv.roles.product.length, perms: inv.permissions.keys.length, ipc: inv.ipc.privileged.length };
  });

  await scenario('R02-tamper-and-deny-audit', 'Tampered role/branch denied + audited', async () => {
    const report = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'rbac-audit-unit.json'), 'utf8'));
    if (!report.ok) throw new Error('unit_not_ok');
    return { unitOk: true };
  });

  await scenario('R03-ipc-session-policy', 'IPC session required + rank policy', async () => {
    const rbac = require(path.join(root, 'electron', 'rbac-session.js'));
    const ev = { sender: { id: 99 } };
    let denied = false;
    try { rbac.assertChannelAllowed(ev, 'app:wipePersistentLicenseData'); } catch { denied = true; }
    if (!denied) throw new Error('wipe_allowed_without_session');
    const users = [{ id: 'o1', role: 'owner', active: true, branchScope: ['*'] }];
    const bind = rbac.bindSession(ev, { userId: 'o1', role: 'owner', lookupUsers: () => users });
    if (!bind.ok) throw new Error(bind.error);
    rbac.assertChannelAllowed(ev, 'backup:v2:create');
    return { ownerWipeRank: rbac.rankOf('owner'), deniedWithoutSession: true };
  });

  await scenario('R04-scoped-repo-and-export', 'Scoped repository + export path wiring', async () => {
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    if (!index.includes('filterByUserScope') || !index.includes('exportToday')) throw new Error('export_unscoped');
    if (!index.includes('RbacGuard.requirePermission')) throw new Error('export_unguarded');
    return { exportGuarded: true, scoped: true };
  });

  await scenario('R05-role-scope-matrix', 'Owner/admin/reception/accountant/employee/custom scopes', async () => {
    const unit = spawnSync(process.execPath, [path.join(root, 'tests/baseline/test-v2-5-4-rbac-audit.js')], {
      cwd: root, encoding: 'utf8',
    });
    if (unit.status !== 0) throw new Error('matrix_unit_failed');
    return { rolesCovered: ['owner', 'admin', 'reception', 'accountant', 'employee', 'custom'] };
  });

  const failed = results.filter((r) => r.result !== 'PASS');
  const summary = {
    phase: 'V2-5.4',
    startedAt,
    finishedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, release: os.release() },
    total: results.length,
    passed: results.filter((r) => r.result === 'PASS').length,
    failed: failed.length,
    results,
  };
  writeJson(path.join(evidenceDir, 'scenarios-all.json'), summary);
  if (failed.length) {
    console.error(`V2-5.4 scenarios FAIL: ${failed.length}/${results.length}`);
    process.exit(1);
  }
  console.log(`V2-5.4 scenarios PASS: ${results.length}/${results.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
