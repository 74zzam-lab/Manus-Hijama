#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const runner = fs.readFileSync(path.join(root, 'tests', 'run-all.js'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'cloud', 'boot-flow-ui.js'), 'utf8');
const login = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ownerHub = fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8');
const errors = [];
function check(ok, msg) { if (!ok) errors.push(msg); }

// Ensure old critical suites remain in matrix.
[
  'test-phase6-permissions.js',
  'test-phase7-backup.js',
  'test-phase18-multibranch-cloud.js',
  'test-phase19-owner-hub.js',
  'test-phase20-production-release.js',
  'test-login-license-ux.js'
].forEach((name) => check(runner.includes(name), `compat matrix missing ${name}`));

// Ensure boot/login core functions still exist (V2-5.8 unified activation steps).
check(boot.includes('function validateStep(step)'), 'boot validateStep missing');
check(
  /NEW_STEPS\s*=\s*\[[^\]]*language[^\]]*google[^\]]*license[^\]]*organization[^\]]*branch/.test(boot.replace(/\s+/g, ' '))
    && /restore[^\]]*sync[^\]]*ready/.test(boot.replace(/\s+/g, ' ')),
  'boot NEW_STEPS must keep activation core (V2-5.8/V2-5.9)'
);
check(boot.includes('branch_select'), 'boot EXISTING path must support branch_select');
check(login.includes('async function doLogin()'), 'doLogin missing');
check(login.includes('function buildFullBackupObject()'), 'buildFullBackupObject missing');
check(ownerHub.includes('function renderOwnerHubPage()'), 'owner hub render missing');

if (errors.length) {
  console.error('FAIL: phase36 compatibility matrix');
  for (const err of errors) console.error(' -', err);
  process.exit(1);
}
console.log('OK: phase36 compatibility matrix checks');
