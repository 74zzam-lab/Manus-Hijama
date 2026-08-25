#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const hub = fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8');
const gate = fs.readFileSync(path.join(root, 'cloud', 'license-activation-gate.js'), 'utf8');
const errors = [];
function check(ok, msg) { if (!ok) errors.push(msg); }

const expectedActions = [
  'DEVICE_RENAMED',
  'DEVICE_DISABLED',
  'DEVICE_DELETED',
  'BRANCH_ADDED',
  'BRANCH_RENAMED',
  'BRANCH_DISABLED',
  'BRANCH_DELETED',
  'LICENSE_ACTIVATED'
];

for (const action of expectedActions) {
  const src = action === 'LICENSE_ACTIVATED' ? gate : hub;
  check(src.includes(`action: '${action}'`), `missing audit action ${action}`);
}

if (errors.length) {
  console.error('FAIL: phase31 owner audit expansion');
  for (const err of errors) console.error(' -', err);
  process.exit(1);
}
console.log('OK: phase31 owner audit expansion checks');
