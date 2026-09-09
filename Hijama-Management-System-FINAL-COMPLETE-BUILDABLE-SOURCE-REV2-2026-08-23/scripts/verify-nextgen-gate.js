#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const errors = [];

function mustExist(relPath, label) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) errors.push(`${label} missing: ${relPath}`);
}

const requiredDocs = [
  'docs/PHASE-ZERO-NEXTGEN-ARCHITECTURE.md',
  'docs/PHASE-21-RESULTS.md',
  'docs/PHASE-22-RESULTS.md',
  'docs/PHASE-23-RESULTS.md',
  'docs/PHASE-24-RESULTS.md',
  'docs/PHASE-25-RESULTS.md',
  'docs/PHASE-26-RESULTS.md',
  'docs/PHASE-27-RESULTS.md',
  'docs/PHASE-28-RESULTS.md',
  'docs/PHASE-30-RESULTS.md',
  'docs/PHASE-31-RESULTS.md',
  'docs/PHASE-32-RESULTS.md',
  'docs/PHASE-33-RESULTS.md',
  'docs/PHASE-34-RESULTS.md',
  'docs/PHASE-35-RESULTS.md',
  'docs/PHASE-36-RESULTS.md',
  'docs/PHASE-37-RESULTS.md',
  'docs/PHASE-38-RESULTS.md',
  'docs/PHASE-39-RESULTS.md',
  'docs/PHASE-40-RESULTS.md',
  'docs/UAT-CHECKLIST-NEXTGEN.md'
];

const requiredModules = [
  'cloud/organization.js',
  'cloud/owner-profile.js',
  'cloud/owner-setup-state.js',
  'cloud/owner-branch-mode.js',
  'cloud/branch-summary.js',
  'cloud/owner-migration.js'
];

const requiredTests = [
  'tests/baseline/test-phase21-organization-facade.js',
  'tests/baseline/test-phase22-owner-policy.js',
  'tests/baseline/test-phase23-owner-profile-store.js',
  'tests/baseline/test-phase24-owner-activation-flag.js',
  'tests/baseline/test-phase25-owner-setup-gate.js',
  'tests/baseline/test-phase26-device-limits.js',
  'tests/baseline/test-phase27-owner-hub-device-branch-controls.js',
  'tests/baseline/test-phase28-branch-gate.js',
  'tests/baseline/test-phase30-owner-branch-mode.js',
  'tests/baseline/test-phase31-owner-audit-expansion.js',
  'tests/baseline/test-phase32-ownerhub-licensing-panel.js',
  'tests/baseline/test-phase33-branch-summary-contract.js',
  'tests/baseline/test-phase34-nextgen-freeze-gate.js',
  'tests/baseline/test-phase35-backup-org-branch-metadata.js',
  'tests/baseline/test-phase36-compat-matrix.js',
  'tests/baseline/test-phase37-legacy-owner-migration.js',
  'tests/baseline/test-phase38-nextgen-final-gate.js',
  'tests/baseline/test-phase40-handover-gate.js'
];

requiredDocs.forEach((p) => mustExist(p, 'doc'));
requiredModules.forEach((p) => mustExist(p, 'module'));
requiredTests.forEach((p) => mustExist(p, 'test'));

const runnerSrc = fs.readFileSync(path.join(root, 'tests', 'run-all.js'), 'utf8');
for (const testPath of requiredTests) {
  const base = path.basename(testPath);
  if (!runnerSrc.includes(base)) errors.push(`run-all.js missing entry for ${base}`);
}

if (errors.length) {
  console.error('FAIL: nextgen gate');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('OK: nextgen gate');
