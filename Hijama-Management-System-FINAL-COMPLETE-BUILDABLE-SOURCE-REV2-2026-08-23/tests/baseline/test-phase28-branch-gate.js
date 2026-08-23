#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'cloud', 'branch-enrollment.js'), 'utf8');
const errors = [];
function check(ok, msg) { if (!ok) errors.push(msg); }

const sandbox = {
  console,
  LicenseCloud: {
    _doc: null,
    loadLocal() { return this._doc; },
    saveLocal(doc) { this._doc = doc; },
    async pushToDrive() { return { ok: true }; },
    verifyLicenseDoc: false
  },
  DeviceConfig: { load: () => ({ deviceUuid: 'dev-1' }) },
  LicenseLimits: { getMaxBranches: () => 5 },
  CommercialLicense: { crypto: { canonicalJson: (x) => JSON.stringify(x), async hmacSha256Hex() { return 'sig'; } } }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

try { vm.runInNewContext(src, sandbox, { timeout: 1000 }); } catch (e) { errors.push('branch-enrollment eval failed: ' + e.message); }

const doc0 = { centerId: 'NJR-CLINIC-1', branches: [], limits: { maxBranches: 5 } };
sandbox.LicenseCloud._doc = doc0;

async function run() {
  // V2-3: even the first branch requires Owner Hub source.
  const firstBlocked = await sandbox.BranchEnrollment.enrollBranch(doc0, { branchName: 'Main Setup' });
  check(firstBlocked.ok === false && firstBlocked.error === 'owner_hub_required', 'first branch without owner_hub must be blocked');

  const firstHub = await sandbox.BranchEnrollment.enrollBranch(doc0, { branchName: 'Main Setup', source: 'owner_hub' });
  check(firstHub.ok === true, 'first branch from owner hub source should be allowed');

  const doc1 = sandbox.LicenseCloud._doc;
  const secondBlocked = await sandbox.BranchEnrollment.enrollBranch(doc1, { branchName: 'Second from setup' });
  check(secondBlocked.ok === false && secondBlocked.error === 'owner_hub_required', 'second branch should require owner hub source');

  const secondHub = await sandbox.BranchEnrollment.enrollBranch(doc1, { branchName: 'Second from hub', source: 'owner_hub' });
  check(secondHub.ok === true, 'second branch from owner hub source should be allowed');

  if (errors.length) {
    console.error('FAIL: phase28 branch gate');
    for (const err of errors) console.error(' -', err);
    process.exit(1);
  }
  console.log('OK: phase28 branch gate checks');
}

run();
