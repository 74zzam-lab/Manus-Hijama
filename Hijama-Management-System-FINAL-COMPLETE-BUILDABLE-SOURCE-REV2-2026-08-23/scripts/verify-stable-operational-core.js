#!/usr/bin/env node
/**
 * Stable Operational Core — master verifier (phases 1–14 independent scripts).
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const failures = [];

const STEPS = [
  { phase: 1, script: 'scripts/verify-sqlite-operational-truth.js' },
  { phase: 2, script: 'scripts/verify-transactions-crash-safety.js' },
  { phase: 3, script: 'scripts/verify-backup-v2-plain.js' },
  { phase: 4, script: 'scripts/verify-branch-sql-isolation.js' },
  { phase: 5, script: 'scripts/verify-branch-switch-rehydrate.js' },
  { phase: 6, script: 'scripts/verify-sync-guards.js' },
  { phase: 7, script: 'scripts/verify-tombstone-idempotency.js' },
  { phase: 8, script: 'scripts/verify-attachment-authority.js' },
  { phase: 9, script: 'scripts/verify-operational-rbac.js' },
  { phase: 10, script: 'scripts/verify-error-truthfulness.js' },
  { phase: 11, script: 'scripts/verify-migration-safety.js' },
  { phase: 12, script: 'scripts/verify-operational-db-health.js' },
  { phase: 13, script: 'scripts/verify-operational-readiness.js' },
  { phase: 14, script: 'scripts/verify-build-reliability-gates.js' },
  { phase: 15, script: 'scripts/verify-oauth-build-packaging.js' },
];

console.log('══ Stable Operational Core verification (phases 1–15) ══\n');

for (const step of STEPS) {
  const abs = path.join(root, step.script);
  const label = `phase-${step.phase}`;
  const r = spawnSync(process.execPath, [abs], { cwd: root, encoding: 'utf8' });
  const ok = r.status === 0;
  const tail = ok
    ? (r.stdout || '').trim().split('\n').pop()
    : ((r.stderr || r.stdout || '') + '').trim().split('\n').slice(-3).join(' | ');
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${tail || `exit ${r.status}`}`);
  if (!ok) failures.push({ phase: step.phase, script: step.script, detail: tail });
}

console.log('');
if (failures.length) {
  console.error(`FAIL stable-operational-core (${failures.length}/${STEPS.length} phases)`);
  failures.forEach((f) => console.error(` - phase ${f.phase}: ${f.script} — ${f.detail}`));
  process.exit(1);
}
console.log(`PASS stable-operational-core (${STEPS.length}/${STEPS.length} phases)`);
