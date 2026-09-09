#!/usr/bin/env node
'use strict';

/**
 * V2-5 Final Stabilization release gate verifier.
 * Ready for independent review: YES (after evidence PASS)
 * Ready for main: NO
 * V2-5 complete: only when this gate + prior gates PASS and Windows evidence exists
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const phaseDir = path.join(root, 'docs', 'integration-v2-5-stabilization');
const tracePath = path.join(phaseDir, 'REQUIREMENTS-TRACEABILITY.md');
const evidenceDir = path.join(phaseDir, 'evidence');

const REQUIRED_IDS = [
  ...Array.from({ length: 12 }, (_, i) => `AUDIT-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 14 }, (_, i) => `GOOG-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 10 }, (_, i) => `LIC-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 10 }, (_, i) => `OWN-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 10 }, (_, i) => `SHEET-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 10 }, (_, i) => `SYNC-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 8 }, (_, i) => `REST-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 8 }, (_, i) => `ERR-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 8 }, (_, i) => `REG-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 10 }, (_, i) => `WIN-258-${String(i + 1).padStart(3, '0')}`),
];

const forbidden = [
  'FAIL', 'UNVERIFIED', 'PENDING', 'PARTIAL', 'TODO', 'SKIPPED',
  'EXPECTED PASS', 'NOT COMPLETED', 'NOT_STARTED', 'IN_PROGRESS',
  'MISSING', 'DEFERRED', 'OUT OF SCOPE',
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

const requiredEvidence = [
  'stabilization-unit.json',
  'scenarios-all.json',
  'windows-build.json',
  'device-a-uat.json',
  'device-b-uat.json',
  'device-c-uat.json',
  'failure-recovery.json',
  'full-cycle.json',
];

const errors = [];
const fail = (m) => errors.push(m);

function ensureEvidenceFresh() {
  const unit = spawnSync(process.execPath, [path.join(root, 'tests/baseline/test-v2-5-final-stabilization.js')], {
    cwd: root, encoding: 'utf8', timeout: 120000,
  });
  if (unit.status !== 0) fail('stabilization unit failed: ' + (unit.stderr || unit.stdout || '').slice(0, 400));
  const scen = spawnSync(process.execPath, [path.join(root, 'scripts/v2-5-stabilization-scenarios-all.cjs')], {
    cwd: root, encoding: 'utf8', timeout: 180000,
  });
  if (scen.status !== 0) fail('scenarios failed: ' + (scen.stderr || scen.stdout || '').slice(0, 400));
  const uat = spawnSync(process.execPath, [path.join(root, 'scripts/windows-uat/v2-5-stabilization-runtime.cjs')], {
    cwd: root, encoding: 'utf8', timeout: 300000,
  });
  if (uat.status !== 0) fail('windows-uat failed: ' + (uat.stderr || uat.stdout || '').slice(0, 400));
}

ensureEvidenceFresh();

if (!fs.existsSync(tracePath)) {
  console.error('Missing REQUIREMENTS-TRACEABILITY.md');
  process.exit(1);
}

const text = fs.readFileSync(tracePath, 'utf8');
const rows = [];
for (const line of text.split('\n')) {
  if (!/^\|\s*[A-Z]+-258-\d+\s*\|/.test(line)) continue;
  const cells = line.split('|').map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
  if (cells.length < 6) continue;
  const id = cells[0];
  if (!/^(AUDIT|GOOG|LIC|OWN|SHEET|SYNC|REST|ERR|REG|WIN)-258-\d+$/.test(id)) continue;
  rows.push({ id, result: cells[cells.length - 1], cells });
}

if (!rows.length) fail('No requirement rows parsed');
const seen = new Set();
for (const r of rows) {
  if (seen.has(r.id)) fail('dup ' + r.id);
  seen.add(r.id);
  const upper = String(r.result || '').toUpperCase().trim();
  if (upper !== 'PASS') fail(`${r.id} result is "${r.result}"`);
  for (const w of forbidden) {
    if (upper === w || upper.includes(w)) fail(`${r.id} forbidden ${w}`);
  }
  for (let i = 3; i < r.cells.length - 1; i++) {
    const cell = String(r.cells[i] || '').trim();
    if (!cell || cell === '...' || /^(NOT_STARTED|TBD|TODO|pending)$/i.test(cell)) {
      fail(`${r.id} placeholder col ${i}`);
      break;
    }
  }
}

for (const id of REQUIRED_IDS) if (!seen.has(id)) fail('missing ' + id);
if (rows.length !== REQUIRED_IDS.length) fail(`expected ${REQUIRED_IDS.length} got ${rows.length}`);

for (const name of requiredReports) {
  const p = path.join(phaseDir, name);
  if (!fs.existsSync(p)) fail('missing ' + name);
  else if (/PLACEHOLDER_ONLY|DO_NOT_USE|EXPECTED PASS/i.test(fs.readFileSync(p, 'utf8'))) fail('bad ' + name);
}

for (const name of requiredEvidence) {
  const p = path.join(evidenceDir, name);
  if (!fs.existsSync(p)) fail('missing evidence ' + name);
  else {
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j.ok === false) fail('evidence not ok: ' + name);
    } catch {
      /* non-json ok if exists */
    }
  }
}

const readiness = fs.readFileSync(path.join(phaseDir, '09-RELEASE-READINESS.md'), 'utf8');
if (/Ready for main\s*:\s*YES/i.test(readiness)) fail('must not claim Ready for main: YES');
if (!/Ready for main\s*:\s*NO/i.test(readiness)) fail('must state Ready for main: NO');

console.log(`Parsed ${rows.length} V2-5 stabilization requirements`);
if (errors.length) {
  console.error('V2-5 FINAL STABILIZATION GATE FAIL');
  errors.forEach((e) => console.error(' - ' + e));
  process.exit(1);
}
console.log('V2-5 FINAL STABILIZATION GATE PASS');
console.log('Ready for independent review: YES');
console.log('Ready for main: NO');
console.log('V2-5 complete claim: only after Windows Release GHA green + this gate PASS');
