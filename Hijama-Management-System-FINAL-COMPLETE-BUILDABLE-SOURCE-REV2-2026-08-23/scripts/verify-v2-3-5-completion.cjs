#!/usr/bin/env node
'use strict';

/**
 * V2-3.5 Release Gate verifier.
 * Fails (exit 1) unless every Requirement row is PASS,
 * except CLOUD-001 which may be: MISSING — expected until V2-4
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const tracePath = path.join(root, 'docs', 'integration-v2', 'REQUIREMENTS-TRACEABILITY.md');
const evidenceDir = path.join(root, 'docs', 'integration-v2', 'evidence');
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
];

const errors = [];
function fail(msg) { errors.push(msg); }

if (!fs.existsSync(tracePath)) {
  console.error('Missing REQUIREMENTS-TRACEABILITY.md');
  process.exit(1);
}

const text = fs.readFileSync(tracePath, 'utf8');
const rows = [];
for (const line of text.split('\n')) {
  if (!/^\|\s*[A-Z][A-Z0-9]+-\d+\s*\|/.test(line)) continue;
  const cells = line.split('|').map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
  if (cells.length < 6) continue;
  const id = cells[0];
  const result = cells[cells.length - 1];
  rows.push({ id, result, line });
}

if (!rows.length) fail('No requirement rows parsed from traceability file');

const cloudOk = (r) =>
  r.id === 'CLOUD-001' && /MISSING\s*—\s*expected until V2-4/i.test(r.result);

for (const r of rows) {
  if (cloudOk(r)) continue;
  const upper = r.result.toUpperCase();
  if (upper !== 'PASS') {
    fail(`${r.id} result is "${r.result}" (must be PASS)`);
  }
  for (const word of forbidden) {
    if (upper.includes(word) && !(r.id === 'CLOUD-001')) {
      fail(`${r.id} contains forbidden status token: ${word}`);
    }
  }
  // Evidence cell must not be empty / placeholder
  const cells = r.line.split('|').map((c) => c.trim());
  const evidence = cells[5] || '';
  if (!evidence || evidence === '...' || /TBD|TODO|pending/i.test(evidence)) {
    fail(`${r.id} missing runtime evidence`);
  }
}

const requiredReports = [
  '10-WINDOWS-UAT-RESULTS.md',
  '11-INSTALL-LIFECYCLE-RESULTS.md',
  '12-INSTALL-PERFORMANCE-PROFILE.md',
  '13-ICON-ARTIFACT-VERIFICATION.md',
  '14-ELECTRON-UPGRADE-COMPATIBILITY.md',
  '15-OWNER-RUNTIME-UAT.md',
  '16-LICENSE-PERSISTENCE-UAT.md',
  '17-RELEASE-READINESS.md',
];
for (const name of requiredReports) {
  const p = path.join(root, 'docs', 'integration-v2', name);
  if (!fs.existsSync(p)) fail(`Missing report: ${name}`);
  else {
    const body = fs.readFileSync(p, 'utf8');
    if (/PLACEHOLDER_ONLY|DO_NOT_USE|EXPECTED PASS/i.test(body)) {
      fail(`Report ${name} still contains placeholder/forbidden tokens`);
    }
  }
}

// Artifact evidence expectations (filled by Windows UAT workflow)
const mustExistEvidenceHints = [
  'installer.sha256',
  'checksums',
  'performance',
  'lifecycle',
];
if (!fs.existsSync(evidenceDir)) {
  fail('Missing docs/integration-v2/evidence directory');
} else {
  const listing = fs.readdirSync(evidenceDir).join(' ').toLowerCase();
  for (const hint of mustExistEvidenceHints) {
    if (!listing.includes(hint.replace('.', ''))) {
      // soft: look for any sha256 file
      if (hint === 'installer.sha256' && !listing.includes('sha256')) {
        fail(`Evidence dir missing ${hint}`);
      } else if (hint !== 'installer.sha256' && !listing.includes(hint)) {
        fail(`Evidence dir missing files matching ${hint}`);
      }
    }
  }
}

console.log(`Parsed ${rows.length} requirements`);
if (errors.length) {
  console.error('RELEASE GATE FAIL');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('RELEASE GATE PASS');
process.exit(0);
