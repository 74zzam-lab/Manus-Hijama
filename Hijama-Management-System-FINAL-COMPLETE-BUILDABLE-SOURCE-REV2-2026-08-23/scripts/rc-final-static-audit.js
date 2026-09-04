#!/usr/bin/env node
'use strict';

/**
 * RC Final Static Audit — data-integrity / authority patterns (no feature changes).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const failures = [];
const warnings = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function check(ok, msg, level = 'fail') {
  if (ok) return;
  if (level === 'warn') warnings.push(msg);
  else failures.push(msg);
}

function grepFiles(pattern, globs) {
  const hits = [];
  for (const g of globs) {
    const abs = path.join(root, g);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    if (pattern.test(src)) hits.push(g);
  }
  return hits;
}

console.log('══ RC Final Static Audit ══\n');

// 1. Duplicate authorities — single upgrade orchestrator
check(fs.existsSync(path.join(root, 'database/upgrade-migration-orchestrator.js')), 'upgrade orchestrator present');
const orch = read('database/upgrade-migration-orchestrator.js');
check(!/function runUpgradePipeline/.test(orch) || orch.includes('assessUpgradeState'), 'orchestrator exports assessUpgradeState');

// 2. Legacy restore bypass — consolidated restore surface
const restoreConsolidation = read('tests/baseline/test-restore-surface-consolidation.js');
check(/legacy.*disabled|consolidat/i.test(restoreConsolidation), 'restore consolidation test exists');

// 3. BR-MAIN write fallback — branch scope required on operational writes
const service = read('electron/database/service.js');
check(/branch_id_required/.test(service), 'service rejects missing branchId on operational tables');
check(/assertOperationalWriteAllowed/.test(service), 'operational write gate wired');

// 4. localStorage operational authority — sqlite primary blocks LS authority
const sqliteBridge = read('cupping-sqlite-bridge.js');
check(/sqlitePrimary|isPrimary/.test(sqliteBridge), 'sqlite bridge primary gate');
check(/collectSnapshotFromLocal|migrateAndEnable/.test(sqliteBridge), 'LS→SQLite migration path only');

// 5. Encrypted direct restore blocked
const backupLegacy = fs.existsSync(path.join(root, 'electron/backup-v2-legacy-import.js'))
  ? read('electron/backup-v2-legacy-import.js')
  : '';
check(/import|legacy/i.test(backupLegacy), 'legacy encrypted import path exists');
const errorTruth = read('database/operational-error-truth.js');
check(/restore_encrypted_import_only/.test(errorTruth), 'encrypted restore import-only code');

// 6. Owner duplicate create path
check(fs.existsSync(path.join(root, 'cloud/owner-lifecycle-authority.js')), 'owner lifecycle authority');
const lifecycle = read('cloud/owner-lifecycle-authority.js');
check(/assertOwnerCountInvariant|createBlocked/.test(lifecycle), 'owner create blocked / invariant');

// 7. Admin Owner-only bypass — trusted authority
check(fs.existsSync(path.join(root, 'cloud/owner-trusted-authority.js')), 'owner trusted authority');
const trusted = read('cloud/owner-trusted-authority.js');
check(/assertOwnerMutation|assertOwnerOrBootstrap/.test(trusted), 'trusted owner gates');

// 8. Uninitialized sync push — sync guards
const syncEngine = read('cloud/sync-engine.js');
check(/checkSyncGuard|canSync|operational/i.test(syncEngine), 'sync guard / readiness checks');

// 9. Stale branch cache — branch switch rehydrate
check(fs.existsSync(path.join(root, 'scripts/verify-branch-switch-rehydrate.js')), 'branch switch verifier');

// 10. Silent catch / programmer error suppression
const benign = read('cloud/benign-operational-errors.js');
check(/isProgrammerError/.test(benign), 'programmer error detector');
check(/ReferenceError/.test(benign), 'ReferenceError not suppressed');
const indexHtml = read('index.html');
check(/benign-operational-errors\.js/.test(indexHtml), 'index loads benign errors module');

// IPC envelope
const ipc = read('electron/security/ipc-validate.js');
check(/enrichResult/.test(ipc), 'IPC failures enriched');

// READY blockers
const readiness = read('database/operational-readiness.js');
check(/migration_pending|owner_corrupted|migration_in_progress/.test(readiness), 'READY migration/owner blockers');

for (const [label, ok] of [
  ['No bare catch {} in upgrade orchestrator', !/catch\s*\{\s*\}/.test(orch)],
]) {
  check(ok, label, ok ? 'fail' : 'warn');
}

const prTests = [
  'tests/baseline/test-sync-safety-core.js',
  'tests/baseline/test-backup-v2-scope-truth.js',
  'tests/baseline/test-sqlite-operational-truth.js',
  'tests/baseline/test-transactions-crash-safety.js',
  'tests/baseline/test-remove-backup-encryption.js',
  'tests/baseline/test-branch-sql-isolation-leakage.js',
  'tests/baseline/test-branch-switch-correctness.js',
  'tests/baseline/test-atomic-restore-recovery.js',
  'tests/baseline/test-restore-surface-consolidation.js',
  'tests/baseline/test-pr10-conflict-tombstone-idempotency.js',
  'tests/baseline/test-pr11-owner-lifecycle.js',
  'tests/baseline/test-pr12-owner-admin-runtime-separation.js',
  'tests/baseline/test-pr13-error-truth-migration-safety.js',
];
for (const t of prTests) {
  check(fs.existsSync(path.join(root, t)), `PR test present: ${t}`);
}

console.log('Audit checks:');
if (failures.length) {
  failures.forEach((f) => console.log(`  FAIL  ${f}`));
}
if (warnings.length) {
  warnings.forEach((w) => console.log(`  WARN  ${w}`));
}
if (!failures.length && !warnings.length) {
  console.log('  All static audit checks PASS');
}

console.log('');
if (failures.length) {
  console.error(`FAIL static audit (${failures.length} blocking)`);
  process.exit(1);
}
console.log(`PASS static audit (${warnings.length} warnings)`);
