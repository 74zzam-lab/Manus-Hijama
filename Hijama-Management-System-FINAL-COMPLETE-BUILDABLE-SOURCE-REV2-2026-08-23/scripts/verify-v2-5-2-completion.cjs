#!/usr/bin/env node
'use strict';

/**
 * V2-5.2 Release Gate verifier (Backup & Cloud Sync Hardening).
 * Fails unless every Requirement Result is PASS and required reports exist.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const phaseDir = path.join(root, 'docs', 'integration-v2-5-2');
const tracePath = path.join(phaseDir, 'REQUIREMENTS-TRACEABILITY.md');
const evidenceDir = path.join(phaseDir, 'evidence');

const REQUIRED_IDS = [
  ...Array.from({ length: 24 }, (_, i) => `BACK-252-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 28 }, (_, i) => `SYNC-252-${String(i + 1).padStart(3, '0')}`),
  'OBS-252-001',
  'OBS-252-002',
  'OBS-252-003',
  'UAT-252-001',
  'UAT-252-002',
  'REG-252-001',
  'REL-252-001',
];

const forbiddenInResult = [
  'FAIL', 'UNVERIFIED', 'PENDING', 'PARTIAL', 'TODO', 'SKIPPED',
  'EXPECTED PASS', 'NOT COMPLETED', 'NOT_STARTED', 'IN_PROGRESS', 'MISSING',
  'DEFERRED', 'OUT OF SCOPE',
];

const requiredReports = [
  '00-CURRENT-REALITY.md',
  '01-TARGET-DESIGN.md',
  '02-MODULE-WIRING-MATRIX.md',
  '03-TEST-MATRIX.md',
  '04-WINDOWS-UAT.md',
  '05-FAILURE-RECOVERY-UAT.md',
  '06-PERFORMANCE-OR-TIMING.md',
  '07-REGRESSION-REPORT.md',
  '08-EVIDENCE-INDEX.md',
  '09-RELEASE-READINESS.md',
  'REQUIREMENTS-TRACEABILITY.md',
];

const errors = [];
function fail(msg) { errors.push(msg); }

if (!fs.existsSync(tracePath)) {
  console.error('Missing docs/integration-v2-5-2/REQUIREMENTS-TRACEABILITY.md');
  process.exit(1);
}

const text = fs.readFileSync(tracePath, 'utf8');
const rows = [];
for (const line of text.split('\n')) {
  if (!/^\|\s*[A-Z]+-252-\d+\s*\|/.test(line)) continue;
  const cells = line.split('|').map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
  if (cells.length < 6) continue;
  const id = cells[0];
  if (!/^(BACK|SYNC|OBS|UAT|REG|REL)-252-\d+$/.test(id)) continue;
  rows.push({ id, result: cells[cells.length - 1], cells });
}

if (!rows.length) fail('No V2-5.2 requirement rows parsed');

const seen = new Set();
for (const r of rows) {
  if (seen.has(r.id)) fail(`Duplicate requirement row: ${r.id}`);
  seen.add(r.id);
  const upper = String(r.result || '').toUpperCase().trim();
  if (upper !== 'PASS') fail(`${r.id} result is "${r.result}" (must be PASS)`);
  for (const word of forbiddenInResult) {
    if (upper === word || upper.includes(word)) fail(`${r.id} Result contains forbidden token: ${word}`);
  }
  for (let i = 3; i < r.cells.length - 1; i++) {
    const cell = String(r.cells[i] || '').trim();
    if (!cell || cell === '...' || /^NOT_STARTED$/i.test(cell) || /^(TBD|TODO|pending)$/i.test(cell)) {
      fail(`${r.id} empty/placeholder evidence column index ${i}: "${cell}"`);
      break;
    }
  }
}

for (const id of REQUIRED_IDS) {
  if (!seen.has(id)) fail(`Missing required requirement row: ${id}`);
}
if (rows.length !== REQUIRED_IDS.length) {
  fail(`Expected ${REQUIRED_IDS.length} requirement rows, parsed ${rows.length}`);
}

for (const name of requiredReports) {
  const p = path.join(phaseDir, name);
  if (!fs.existsSync(p)) fail(`Missing report: ${name}`);
  else {
    const body = fs.readFileSync(p, 'utf8');
    if (/PLACEHOLDER_ONLY|DO_NOT_USE|EXPECTED PASS/i.test(body)) {
      fail(`Report ${name} contains forbidden placeholder tokens`);
    }
  }
}

if (!fs.existsSync(evidenceDir)) fail('Missing docs/integration-v2-5-2/evidence');

console.log(`Parsed ${rows.length} V2-5.2 requirements`);
if (errors.length) {
  console.error('V2-5.2 RELEASE GATE FAIL');
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log('V2-5.2 RELEASE GATE PASS');
process.exit(0);
