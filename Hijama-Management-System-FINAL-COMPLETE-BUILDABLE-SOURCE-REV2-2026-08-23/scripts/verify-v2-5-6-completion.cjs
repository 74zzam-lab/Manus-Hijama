#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const phaseDir = path.join(root, 'docs', 'integration-v2-5-6');
const tracePath = path.join(phaseDir, 'REQUIREMENTS-TRACEABILITY.md');
const evidenceDir = path.join(phaseDir, 'evidence');
const REQUIRED_IDS = [
  ...Array.from({ length: 40 }, (_, i) => `UX-256-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 4 }, (_, i) => `VIS-256-${String(i + 1).padStart(3, '0')}`),
  'UAT-256-001', 'UAT-256-002', 'REG-256-001', 'REL-256-001',
];
const forbidden = ['FAIL','UNVERIFIED','PENDING','PARTIAL','TODO','SKIPPED','EXPECTED PASS','NOT COMPLETED','NOT_STARTED','IN_PROGRESS','MISSING','DEFERRED','OUT OF SCOPE'];
const requiredReports = ['00-CURRENT-REALITY.md','01-TARGET-DESIGN.md','02-MODULE-WIRING-MATRIX.md','03-TEST-MATRIX.md','04-WINDOWS-UAT.md','05-FAILURE-RECOVERY-UAT.md','06-PERFORMANCE-OR-TIMING.md','07-REGRESSION-REPORT.md','08-EVIDENCE-INDEX.md','09-RELEASE-READINESS.md','REQUIREMENTS-TRACEABILITY.md'];
const errors = [];
const fail = (m) => errors.push(m);
if (!fs.existsSync(tracePath)) { console.error('Missing traceability'); process.exit(1); }
const text = fs.readFileSync(tracePath, 'utf8');
const rows = [];
for (const line of text.split('\n')) {
  if (!/^\|\s*[A-Z]+-256-\d+\s*\|/.test(line)) continue;
  const cells = line.split('|').map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
  if (cells.length < 6) continue;
  const id = cells[0];
  if (!/^(UX|VIS|UAT|REG|REL)-256-\d+$/.test(id)) continue;
  rows.push({ id, result: cells[cells.length - 1], cells });
}
if (!rows.length) fail('No rows');
const seen = new Set();
for (const r of rows) {
  if (seen.has(r.id)) fail('dup ' + r.id);
  seen.add(r.id);
  const upper = String(r.result || '').toUpperCase().trim();
  if (upper !== 'PASS') fail(`${r.id} result is "${r.result}"`);
  for (const w of forbidden) if (upper === w || upper.includes(w)) fail(`${r.id} forbidden ${w}`);
  for (let i = 3; i < r.cells.length - 1; i++) {
    const cell = String(r.cells[i] || '').trim();
    if (!cell || cell === '...' || /^(NOT_STARTED|TBD|TODO|pending)$/i.test(cell)) { fail(`${r.id} placeholder col ${i}`); break; }
  }
}
for (const id of REQUIRED_IDS) if (!seen.has(id)) fail('missing ' + id);
if (rows.length !== REQUIRED_IDS.length) fail(`expected ${REQUIRED_IDS.length} got ${rows.length}`);
for (const name of requiredReports) {
  const p = path.join(phaseDir, name);
  if (!fs.existsSync(p)) fail('missing ' + name);
  else if (/PLACEHOLDER_ONLY|DO_NOT_USE|EXPECTED PASS/i.test(fs.readFileSync(p, 'utf8'))) fail('bad ' + name);
}
if (!fs.existsSync(evidenceDir)) fail('missing evidence');
console.log(`Parsed ${rows.length} V2-5.6 requirements`);
if (errors.length) { console.error('V2-5.6 RELEASE GATE FAIL'); errors.forEach((e) => console.error(' - ' + e)); process.exit(1); }
console.log('V2-5.6 RELEASE GATE PASS');
