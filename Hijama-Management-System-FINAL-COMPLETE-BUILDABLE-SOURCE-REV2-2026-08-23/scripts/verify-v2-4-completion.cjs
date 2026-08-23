#!/usr/bin/env node
'use strict';

/**
 * V2-4 Release Gate verifier.
 * Fails unless every Requirement Result is PASS and Cloud Sync (SYNC-001) is PASS.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const tracePath = path.join(root, 'docs', 'integration-v2-4', 'REQUIREMENTS-TRACEABILITY.md');
const evidenceDir = path.join(root, 'docs', 'integration-v2-4', 'evidence');
const forbidden = [
  'FAIL',
  'UNVERIFIED',
  'PENDING',
  'PARTIAL',
  'TODO',
  'SKIPPED',
  'EXPECTED PASS',
  'NOT COMPLETED',
  'NOT_STARTED',
  'IN_PROGRESS',
  'MISSING',
];

const errors = [];
function fail(msg) {
  errors.push(msg);
}

if (!fs.existsSync(tracePath)) {
  console.error('Missing docs/integration-v2-4/REQUIREMENTS-TRACEABILITY.md');
  process.exit(1);
}

const text = fs.readFileSync(tracePath, 'utf8');
const rows = [];
for (const line of text.split('\n')) {
  if (!/^\|\s*[A-Z0-9]+(?:-\d+|-[A-Z0-9]+-\d+)\s*\|/.test(line) && !/^\|\s*[A-Z][A-Z0-9-]*-\d+\s*\|/.test(line)) {
    continue;
  }
  const cells = line.split('|').map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
  if (cells.length < 6) continue;
  const id = cells[0];
  if (!/^[A-Z0-9]+(?:-\d+)?-\d+$/.test(id) && !/^[A-Z][A-Z0-9]*-\d+$/.test(id) && !/^PROTO-4-\d+$/.test(id)) {
    continue;
  }
  const result = cells[cells.length - 1];
  rows.push({ id, result, line, cells });
}

if (!rows.length) fail('No requirement rows parsed');

let cloudSyncPass = false;
for (const r of rows) {
  const upper = String(r.result || '').toUpperCase();
  if (upper !== 'PASS') {
    fail(`${r.id} result is "${r.result}" (must be PASS)`);
  }
  for (const word of forbidden) {
    if (upper.includes(word)) fail(`${r.id} contains forbidden token: ${word}`);
  }
  // evidence columns must not be placeholders
  for (let i = 3; i <= 9 && i < r.cells.length - 1; i++) {
    const cell = r.cells[i] || '';
    if (!cell || cell === '...' || /^NOT_STARTED$/i.test(cell) || /TBD|TODO/i.test(cell)) {
      fail(`${r.id} empty/placeholder evidence column index ${i}`);
      break;
    }
  }
  if (r.id === 'SYNC-001' && upper === 'PASS') cloudSyncPass = true;
}

if (!cloudSyncPass) {
  // also accept any SYNC-* that defines end-to-end
  const syncRow = rows.find((r) => r.id === 'SYNC-001');
  if (!syncRow || String(syncRow.result).toUpperCase() !== 'PASS') {
    fail('Cloud Sync (SYNC-001) must be PASS — gap-status exemption is not allowed in V2-4');
  }
}

const requiredReports = [
  '00-CURRENT-CLOUD-REALITY.md',
  '01-TARGET-ARCHITECTURE.md',
  '02-MODULE-WIRING-MATRIX.md',
  '03-OAUTH-REAL-UAT.md',
  '04-OWNER-HUB-END-TO-END-UAT.md',
  '05-DATA-SYNC-CATALOG.md',
  '06-OUTBOX-INBOX-DESIGN.md',
  '07-CONFLICT-RESOLUTION-UAT.md',
  '08-BACKUP-RESTORE-CLOUD-UAT.md',
  '09-SECURITY-THREAT-MODEL-AND-UAT.md',
  '10-CLOUD-PERFORMANCE-PROFILE.md',
  '11-MULTI-DEVICE-WINDOWS-UAT.md',
  '12-BRANCH-ISOLATION-UAT.md',
  '13-OFFLINE-QUEUE-UAT.md',
  '14-ATTACHMENT-SYNC-UAT.md',
  '15-MIGRATION-COMPATIBILITY.md',
  '16-REAL-CLOUD-EVIDENCE-INDEX.md',
  '17-RELEASE-READINESS.md',
  'REQUIREMENTS-TRACEABILITY.md',
];
for (const name of requiredReports) {
  const p = path.join(root, 'docs', 'integration-v2-4', name);
  if (!fs.existsSync(p)) fail(`Missing report: ${name}`);
  else {
    const body = fs.readFileSync(p, 'utf8');
    if (/PLACEHOLDER_ONLY|DO_NOT_USE|EXPECTED PASS/i.test(body)) {
      fail(`Report ${name} contains forbidden placeholder tokens`);
    }
  }
}

if (!fs.existsSync(evidenceDir)) fail('Missing docs/integration-v2-4/evidence');

console.log(`Parsed ${rows.length} V2-4 requirements`);
if (errors.length) {
  console.error('V2-4 RELEASE GATE FAIL');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('V2-4 RELEASE GATE PASS');
