#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const code = fs.readFileSync(path.join(root, 'cloud', 'organization.js'), 'utf8');

const mem = new Map();
const sandbox = {
  settings: { centerName: 'مركز المدينة' },
  LicenseCloud: {
    loadLocal() {
      return { centerName: 'Center From License' };
    }
  },
  CenterId: {
    getStoredCenterId() {
      return 'NJR-CLINIC-ABCDEF12';
    }
  },
  CloudMeta: {
    loadMeta() {
      return { centerId: 'NJR-CLINIC-EEEEEEEE' };
    }
  },
  DB: {
    get(k, def) {
      return mem.has(k) ? mem.get(k) : def;
    },
    set(k, v) {
      mem.set(k, v);
    }
  },
  console,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

try {
  vm.runInNewContext(code, sandbox, { timeout: 1000 });
} catch (e) {
  errors.push('organization.js eval failed: ' + e.message);
}

check(!!sandbox.Organization, 'Organization facade missing');
check(sandbox.Organization.getId() === 'NJR-CLINIC-ABCDEF12', 'Organization ID must map to CenterId');
check(sandbox.Organization.hasIdentity() === true, 'Organization.hasIdentity must be true');
check(sandbox.Organization.getDisplayName() === 'مركز المدينة', 'Display name should prefer settings.centerName');
sandbox.Organization.saveDisplayName('   Org One  ');
check(sandbox.DB.get('__tdw_org_name__', '') === 'Org One', 'saveDisplayName should trim and persist');
check(sandbox.Organization.getDisplayName() === 'Org One', 'Display name should prefer explicit org name');
const summary = sandbox.Organization.getSummary();
check(summary.id === summary.centerId, 'Summary id and centerId must match');
check(summary.hasIdentity === true, 'Summary hasIdentity mismatch');

if (errors.length) {
  console.error('FAIL: phase21 organization facade');
  for (const err of errors) console.error(' -', err);
  process.exit(1);
}

console.log('OK: phase21 organization facade');
