#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const phaseDir = path.join(root, 'docs', 'integration-v2-5-8');
const tracePath = path.join(phaseDir, 'REQUIREMENTS-TRACEABILITY.md');
const evidenceDir = path.join(phaseDir, 'evidence');

const REQUIRED_IDS = [
  ...Array.from({ length: 12 }, (_, i) => `UI-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 8 }, (_, i) => `DS-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 12 }, (_, i) => `OWN-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 12 }, (_, i) => `WIZ-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 10 }, (_, i) => `GOOG-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 10 }, (_, i) => `LIC-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 8 }, (_, i) => `BR-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 8 }, (_, i) => `DED-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 8 }, (_, i) => `ERR-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 8 }, (_, i) => `REG-258-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 10 }, (_, i) => `WIN-258-${String(i + 1).padStart(3, '0')}`),
];

const forbidden = [
  'FAIL', 'UNVERIFIED', 'PENDING', 'PARTIAL', 'TODO', 'SKIPPED',
  'EXPECTED PASS', 'NOT COMPLETED', 'NOT_STARTED', 'IN_PROGRESS',
  'MISSING', 'DEFERRED', 'OUT OF SCOPE', 'LIKELY FIXED', 'COVERED BY CODE',
  'READY PENDING UAT', 'SHOULD WORK', 'NOT NEEDED',
];

const requiredReports = [
  '00-CURRENT-REALITY.md', '01-TARGET-DESIGN.md', '02-MODULE-WIRING-MATRIX.md',
  '03-TEST-MATRIX.md', '04-WINDOWS-UAT.md', '05-FAILURE-RECOVERY-UAT.md',
  '06-PERFORMANCE-OR-TIMING.md', '07-REGRESSION-REPORT.md', '08-EVIDENCE-INDEX.md',
  '09-RELEASE-READINESS.md', 'REQUIREMENTS-TRACEABILITY.md',
];

const requiredEvidence = [
  'activation-unit.json', 'scenarios-all.json', 'screen-inventory.json',
  'windows-build.json', 'responsive-matrix.json', 'journeys.json',
  'device-a-uat.json', 'device-b-uat.json', 'failure-recovery.json',
];

const errors = [];
const fail = (m) => errors.push(m);

function run(rel) {
  return spawnSync(process.execPath, [path.join(root, rel)], { cwd: root, encoding: 'utf8', timeout: 300000 });
}

// Fresh evidence from this gate run
for (const rel of [
  'tests/baseline/test-v2-5-8-auth-activation-ui.js',
  'scripts/v2-5-8-scenarios-all.cjs',
  'scripts/windows-uat/v2-5-8-activation-runtime.cjs',
]) {
  const r = run(rel);
  if (r.status !== 0) fail(`${rel} exit ${r.status}: ${(r.stderr || r.stdout || '').slice(0, 300)}`);
}

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
  if (!/^(UI|DS|OWN|WIZ|GOOG|LIC|BR|DED|ERR|REG|WIN)-258-\d+$/.test(id)) continue;
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
}
for (const id of REQUIRED_IDS) if (!seen.has(id)) fail('missing ' + id);
if (rows.length !== REQUIRED_IDS.length) fail(`expected ${REQUIRED_IDS.length} got ${rows.length}`);

for (const name of requiredReports) {
  const p = path.join(phaseDir, name);
  if (!fs.existsSync(p)) fail('missing ' + name);
  else if (/PLACEHOLDER_ONLY|DO_NOT_USE|EXPECTED PASS/i.test(fs.readFileSync(p, 'utf8'))) fail('bad ' + name);
}

const liveSmoke = path.join(phaseDir, 'LIVE-PRODUCTION-SMOKE.md');
if (!fs.existsSync(liveSmoke)) fail('missing LIVE-PRODUCTION-SMOKE.md');
else {
  const liveText = fs.readFileSync(liveSmoke, 'utf8');
  if (!/Clean Install/i.test(liveText)) fail('LIVE-PRODUCTION-SMOKE missing Clean Install');
  if (!/Owner Management|Owner Hub|getOwnerState|Emergency Recovery/i.test(liveText)) fail('LIVE-PRODUCTION-SMOKE missing Owner architecture coverage');
  if (!/Ready for main:\s*NO/i.test(liveText)) fail('LIVE-PRODUCTION-SMOKE must state Ready for main: NO');
}

const liveOwnerTest = path.join(root, 'tests', 'baseline', 'test-v2-5-8-live-owner-validation.js');
if (!fs.existsSync(liveOwnerTest)) fail('missing test-v2-5-8-live-owner-validation.js');
else {
  const r = run('tests/baseline/test-v2-5-8-live-owner-validation.js');
  if (r.status !== 0) fail(`live-owner-validation exit ${r.status}: ${(r.stderr || r.stdout || '').slice(0, 300)}`);
}

if (!fs.existsSync(path.join(root, 'cloud', 'owner-management.js'))) fail('missing cloud/owner-management.js');
const om = fs.readFileSync(path.join(root, 'cloud', 'owner-management.js'), 'utf8');
if (!/getOwnerState/.test(om)) fail('owner-management missing getOwnerState SSOT');
if (!/OWNER_CREATION_IN_PROGRESS/.test(om)) fail('owner-management missing OWNER_CREATION_IN_PROGRESS');
if (!/requestOwnerBootstrap/.test(om)) fail('owner-management missing requestOwnerBootstrap');
const panel = fs.readFileSync(path.join(root, 'license', 'ui', 'developer-panel.js'), 'utf8');
if (!/Owner Emergency Recovery|Owner Support \(Developer Mode\)|renderOwnerManagementSection/.test(panel)) fail('developer-panel missing Owner Support/Emergency section');
if (!/License Recovery|renderLicenseRecoverySection|Pull License from Google Drive/.test(panel)) fail('developer-panel missing License Recovery Drive pull');
const boot = fs.readFileSync(path.join(root, 'cloud', 'boot-flow-ui.js'), 'utf8');
if (!/ensureOwnerBootstrapWizard/.test(boot)) fail('boot-flow missing ensureOwnerBootstrapWizard self-heal');
if (!/requestOwnerBootstrap|getOwnerState/.test(boot)) fail('boot-flow must use OwnerManagement SSOT');
const hub = fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8');
if (!/createAdditionalOwnerInteractive|oh-owner-accounts/.test(hub)) fail('owner-hub missing day-to-day Owner accounts');
if (!/getOwnerState/.test(hub)) fail('owner-hub must use getOwnerState');
const liveSmokeText = fs.readFileSync(liveSmoke, 'utf8');
if (!/getOwnerState|State Machine|Single Source of Truth/i.test(liveSmokeText)) fail('LIVE-PRODUCTION-SMOKE missing Owner state machine SSOT');
if (!/License Pull Recovery|Pull License from Google Drive/i.test(liveSmokeText)) fail('LIVE-PRODUCTION-SMOKE missing License Pull Recovery');

const drivePullTest = path.join(root, 'tests', 'baseline', 'test-v2-5-8-drive-license-pull-recovery.js');
if (!fs.existsSync(drivePullTest)) fail('missing test-v2-5-8-drive-license-pull-recovery.js');
else {
  const r = run('tests/baseline/test-v2-5-8-drive-license-pull-recovery.js');
  if (r.status !== 0) fail(`drive-license-pull-recovery exit ${r.status}: ${(r.stderr || r.stdout || '').slice(0, 300)}`);
}

const bootstrapJs = fs.readFileSync(path.join(root, 'cloud', 'bootstrap.js'), 'utf8');
if (!/listLicensesFromDrive|multiple_licenses|persistPulledLicense/.test(bootstrapJs)) fail('bootstrap missing multi-license recovery APIs');
const css = fs.readFileSync(path.join(root, 'renderer', 'styles', 'design-system.css'), 'utf8');
if (/#login-drive-bootstrap-panel\s*,\s*#lic-drive-bootstrap-panel\s*\{[^}]*display:\s*none/.test(css)) {
  fail('CSS must not globally hide #lic-drive-bootstrap-panel with login panel');
}

for (const name of requiredEvidence) {
  const p = path.join(evidenceDir, name);
  if (!fs.existsSync(p)) fail('missing evidence ' + name);
  else {
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j.ok === false) fail('evidence not ok: ' + name);
    } catch { /* ignore non-json */ }
  }
}

const readiness = fs.readFileSync(path.join(phaseDir, '09-RELEASE-READINESS.md'), 'utf8');
if (/Ready for main\s*:\s*YES/i.test(readiness)) fail('must not claim Ready for main: YES');
if (!/Ready for main\s*:\s*NO/i.test(readiness)) fail('must state Ready for main: NO');

console.log(`Parsed ${rows.length} V2-5.8 requirements`);
if (errors.length) {
  console.error('V2-5.8 RELEASE GATE FAIL');
  errors.forEach((e) => console.error(' - ' + e));
  process.exit(1);
}
console.log('V2-5.8 RELEASE GATE PASS');
console.log('Ready for independent review: YES');
console.log('Ready for main: NO');
