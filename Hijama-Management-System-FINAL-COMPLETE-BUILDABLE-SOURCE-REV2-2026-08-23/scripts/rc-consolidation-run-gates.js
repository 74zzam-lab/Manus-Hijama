#!/usr/bin/env node
'use strict';

/**
 * RC Consolidation — run all source gates and PR1→PR13 verifiers.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const results = [];

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', env: process.env });
  const ok = r.status === 0;
  const detail = ok
    ? (r.stdout || '').trim().split('\n').slice(-2).join(' | ')
    : ((r.stderr || r.stdout || '') + '').trim().split('\n').slice(-4).join('\n');
  results.push({ label, ok, detail });
  return ok;
}

console.log('══ RC Consolidation Source Gates ══\n');

run('npm', ['ci'], 'npm ci');
run('npm', ['run', 'lint'], 'npm run lint');
run('npm', ['test'], 'npm test');

if (fs.existsSync(path.join(root, 'package.json'))) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!pkg.scripts?.['test:e2e']) {
    results.push({ label: 'npm run test:e2e', ok: true, detail: 'N/A — script not defined in package.json' });
  } else {
    run('npm', ['run', 'test:e2e'], 'npm run test:e2e');
  }
}

run(process.execPath, [path.join(root, 'scripts/verify-stable-operational-core.js')], 'verify-stable-operational-core');
run(process.execPath, [path.join(root, 'scripts/rc-consolidation-verify-lineage.js')], 'rc-lineage');
run(process.execPath, [path.join(root, 'scripts/rc-final-static-audit.js')], 'rc-static-audit');

const prVerifiers = [
  ['PR1', 'tests/baseline/test-sync-safety-core.js'],
  ['PR2', 'tests/baseline/test-backup-v2-cloud-retention.js'],
  ['PR3', 'tests/baseline/test-backup-v2-scope-truth.js'],
  ['PR4', 'tests/baseline/test-sqlite-operational-truth.js'],
  ['PR5', 'tests/baseline/test-transactions-crash-safety.js'],
  ['PR6', 'tests/baseline/test-remove-backup-encryption.js'],
  ['PR7', 'tests/baseline/test-branch-sql-isolation-leakage.js'],
  ['PR8', 'tests/baseline/test-branch-switch-correctness.js'],
  ['PR9', 'tests/baseline/test-atomic-restore-recovery.js'],
  ['PR9.5', 'tests/baseline/test-restore-surface-consolidation.js'],
  ['PR10', 'tests/baseline/test-pr10-conflict-tombstone-idempotency.js'],
  ['PR11', 'tests/baseline/test-pr11-owner-lifecycle.js'],
  ['PR12', 'tests/baseline/test-pr12-owner-admin-runtime-separation.js'],
  ['PR13', 'tests/baseline/test-pr13-error-truth-migration-safety.js'],
];

for (const [pr, rel] of prVerifiers) {
  run(process.execPath, [path.join(root, rel)], `${pr} verifier`);
}

let failed = 0;
for (const row of results) {
  const mark = row.ok ? 'PASS' : 'FAIL';
  if (!row.ok) failed += 1;
  console.log(`${mark}  ${row.label}`);
  if (!row.ok && row.detail) {
    console.log(row.detail.split('\n').map((l) => '      ' + l).join('\n'));
  }
}

console.log(`\nSummary: ${results.length - failed}/${results.length} gates passed`);
process.exit(failed ? 1 : 0);
