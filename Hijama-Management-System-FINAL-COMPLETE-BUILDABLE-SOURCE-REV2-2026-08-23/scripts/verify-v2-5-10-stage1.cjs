#!/usr/bin/env node
'use strict';

/**
 * V2-5.10 Stage-1 checklist (code honesty + Backup V1 hide).
 * Does NOT flip Requirements PASS. Does NOT claim release ready.
 * Full Windows A–E still owned by verify:v2-5-9-release-gate.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const errors = [];
const fail = (m) => errors.push(m);

const docs = [
  '00-PROGRAM.md',
  'STAGE-1-RELEASE-SAFETY.md',
  'CURRENT-STATUS.md',
  'STAGE-1-REPORT.md',
  'PRODUCTION-CANDIDATE-CHECKLIST.md',
  'OPERATOR-LIVE-UAT.md',
  'CATEGORY-A-B.md',
  'FINAL-VISION-AND-STATUS-REPORT.md',
  'CATEGORY-B-COMPLETION-REPORT.md',
];
for (const name of docs) {
  const p = path.join(root, 'docs/integration-v2-5-10', name);
  if (!fs.existsSync(p)) fail('missing ' + name);
}
if (!fs.existsSync(path.join(root, 'electron/backup-v1-gate.js'))) fail('missing backup-v1-gate.js');
if (!fs.existsSync(path.join(root, 'docs/repository-transition/DEFERRED-UNTIL-PRODUCTION-CANDIDATE.md'))) {
  fail('repository transition must remain deferred');
}

const status = fs.readFileSync(path.join(root, 'docs/integration-v2-5-10/CURRENT-STATUS.md'), 'utf8');
if (!/Ready for production[\s\S]{0,40}\*\*NO\*\*/i.test(status)) fail('CURRENT-STATUS must say Ready for production NO');
if (!/Production Candidate[\s\S]{0,40}\*\*NO\*\*/i.test(status)) fail('Production Candidate must remain NO');
if (!/Category A[\s\S]{0,120}BLOCKED/i.test(status)) fail('Category A (live Windows) must remain BLOCKED');
if (/Overall\s*[≥>=]\s*90/.test(status)) fail('must not claim Overall ≥ 90 without evidence');

const program = fs.readFileSync(path.join(root, 'docs/integration-v2-5-10/00-PROGRAM.md'), 'utf8');
if (!/BLOCKED/.test(program)) fail('program must mark Category A / PC gates BLOCKED');
if (!/\b58\b/.test(program) || !/\b35\b/.test(program)) fail('program must retain inherited baseline scores');
const cat = fs.readFileSync(path.join(root, 'docs/integration-v2-5-10/CATEGORY-A-B.md'), 'utf8');
// Category B offline scope may be COMPLETE; Category A must stay blocked (checked above).
if (!/Category B/.test(cat)) fail('CATEGORY-A-B.md must document Category B');
if (!/COMPLETE|CONTINUE NOW|ACTIVE|SUBSTANTIALLY COMPLETE/i.test(cat + status)) {
  fail('Category B must be documented as complete or actively continuing');
}
if (!fs.existsSync(path.join(root, 'docs/integration-v2-5-10/END-OF-PROGRAM-VISION-REPORT.md'))) {
  fail('missing END-OF-PROGRAM-VISION-REPORT.md');
}

const unit = spawnSync(process.execPath, [path.join(root, 'tests/baseline/test-v2-5-10-stage1-backup-v1.js')], {
  encoding: 'utf8',
  cwd: root,
});
if (unit.status !== 0) {
  fail('stage1 backup-v1 unit failed:\n' + ((unit.stdout || '') + (unit.stderr || '')).trim());
}

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!/BACKUP_V1_CUSTOMER_UI_DISABLED\s*=\s*true/.test(index)) fail('Backup V1 disable flag missing');
if (!/runCloudV2SyncNow/.test(index)) fail('Cloud V2 sync entry missing');
const gate = require(path.join(root, 'electron/backup-v1-gate.js'));
if (gate.isBackupV1RuntimeDisabled() !== true) fail('Backup V1 runtime gate must default disabled');
const inv = spawnSync(process.execPath, [path.join(root, 'tests/baseline/test-v2-5-10-stage2-inventory.js')], {
  encoding: 'utf8',
  cwd: root,
});
if (inv.status !== 0) fail('stage2 inventory failed:\n' + ((inv.stdout || '') + (inv.stderr || '')).trim());
const pc = fs.readFileSync(path.join(root, 'docs/integration-v2-5-10/PRODUCTION-CANDIDATE-CHECKLIST.md'), 'utf8');
if (!/Production Candidate:\s*NO/i.test(pc)) fail('must not claim Production Candidate');
const catB = spawnSync(process.execPath, [path.join(root, 'tests/baseline/test-v2-5-10-category-b.js')], {
  encoding: 'utf8',
  cwd: root,
});
if (catB.status !== 0) fail('category-b unit failed:\n' + ((catB.stdout || '') + (catB.stderr || '')).trim());

if (errors.length) {
  console.error('FAIL verify:v2-5-10-stage1\n- ' + errors.join('\n- '));
  process.exit(1);
}

console.log('PASS verify:v2-5-10-stage1 (Backup V1 UI disabled + honesty markers)');
console.log('NOTE: Windows Requirements / Scenario A–E still UNVERIFIED — run verify:v2-5-9-release-gate for full release gate.');
process.exit(0);
