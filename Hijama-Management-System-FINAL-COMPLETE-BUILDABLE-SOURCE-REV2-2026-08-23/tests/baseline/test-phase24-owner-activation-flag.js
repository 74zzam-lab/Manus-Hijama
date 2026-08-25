#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const stateSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-setup-state.js'), 'utf8');
const gateSrc = fs.readFileSync(path.join(root, 'cloud', 'license-activation-gate.js'), 'utf8');
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

const mem = new Map();
const sandbox = {
  DB: {
    get(k, d) { return mem.has(k) ? mem.get(k) : d; },
    set(k, v) { mem.set(k, v); }
  },
  OwnerProfile: { hasProfile: () => false },
  console
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

try {
  vm.runInNewContext(stateSrc, sandbox, { timeout: 1000 });
} catch (e) {
  errors.push('owner-setup-state eval failed: ' + e.message);
}

check(!!sandbox.OwnerSetupState, 'OwnerSetupState missing');
check(sandbox.OwnerSetupState.isRequired() === false, 'default required must be false');
sandbox.OwnerSetupState.markRequired('activation');
check(sandbox.OwnerSetupState.isRequired() === true, 'markRequired should set required');
sandbox.OwnerSetupState.clearRequired();
check(sandbox.OwnerSetupState.isRequired() === false, 'clearRequired should unset required');
// V2-5.9: Google/license activation must NOT force Owner Bootstrap.
sandbox.OwnerSetupState.markRequired('activation');
sandbox.OwnerSetupState.ensureFromActivation();
check(sandbox.OwnerSetupState.isRequired() === false, 'ensureFromActivation clears requirement (V2-5.9)');
sandbox.OwnerProfile.hasProfile = () => true;
sandbox.OwnerSetupState.ensureFromActivation();
check(sandbox.OwnerSetupState.isRequired() === false, 'ensureFromActivation stays clear when profile exists');

check(
  gateSrc.includes('global.OwnerSetupState?.ensureFromActivation?.();'),
  'commitActivation still calls ensureFromActivation (now non-blocking)'
);

if (errors.length) {
  console.error('FAIL: phase24 owner activation flag');
  for (const err of errors) console.error(' -', err);
  process.exit(1);
}

console.log('OK: phase24 owner activation flag checks');
