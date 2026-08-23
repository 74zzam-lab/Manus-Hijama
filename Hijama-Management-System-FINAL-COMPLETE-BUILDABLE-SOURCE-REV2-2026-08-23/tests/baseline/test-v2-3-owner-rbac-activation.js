#!/usr/bin/env node
'use strict';

/**
 * V2-3: Owner bootstrap + activation must not create branches;
 * Branch Admin cannot create branches; Google ≠ Owner.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const errors = [];
function check(ok, msg) { if (!ok) errors.push(msg); }

const blSrc = fs.readFileSync(path.join(root, 'cloud', 'branch-lock-ui.js'), 'utf8');
const enrollSrc = fs.readFileSync(path.join(root, 'cloud', 'branch-enrollment.js'), 'utf8');
const hubSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8');
const bootSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-bootstrap.js'), 'utf8');
const roleSrc = fs.readFileSync(path.join(root, 'cloud', 'role-policy.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const csUi = fs.readFileSync(path.join(root, 'cloud', 'center-setup-ui.js'), 'utf8');

check(!blSrc.includes('data-bl-mode="new"'), 'BranchLock must not offer new-branch tab');
check(!blSrc.includes('فرع جديد'), 'BranchLock must not offer فرع جديد tab');
check(!blSrc.includes('bl-panel-new'), 'BranchLock must not have new-branch panel');
check(!blSrc.includes('enrollBranch'), 'BranchLock must not call enrollBranch');
check(blSrc.includes('no_authorized_branches'), 'BranchLock empty-state must point to Owner Hub');
check(hubSrc.includes("source: 'owner_hub'"), 'OwnerHub.addBranch must pass owner_hub source');
check(hubSrc.includes('BranchEnrollment.enrollBranch'), 'OwnerHub.addBranch must use enrollment');
check(html.includes('owner-bootstrap.js'), 'index.html must load owner-bootstrap.js');
check(html.includes('no_authorized_branches'), 'drive bootstrap errors must include no_authorized_branches');
check(html.includes('V2-3: never auto-create'), 'applyDriveBootstrapDeviceLock must not auto-enroll');
check(!/BranchEnrollment\.enrollBranch\(lic,\s*\{\s*branchName,\s*isFirst:\s*true/.test(html), 'must not auto-enroll first branch in activation');
check(csUi.includes('Owner Hub'), 'CenterSetup manage must route create to Owner Hub');
check(csUi.includes('canManageOrganization'), 'CenterSetup mutate actions must gate on owner');

const sandbox = {
  console,
  currentUser: null,
  DB: {
    _m: Object.create(null),
    get(k, d) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : d; },
    set(k, v) { this._m[k] = v; }
  },
  users: [],
  LicenseCloud: {
    _doc: {
      centerId: 'NJR-1',
      branches: [],
      ownerBootstrap: {
        tokenHash: '',
        emails: ['owner@clinic.test'],
        consumed: false
      }
    },
    loadLocal() { return this._doc; },
    saveLocal(doc) { this._doc = doc; }
  },
  OwnerProfile: { hasProfile: () => false },
  CommercialLicense: {
    crypto: {
      canonicalJson: (x) => JSON.stringify(x),
      async hmacSha256Hex(s) { return 'hash:' + String(s); }
    }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.runInNewContext(roleSrc, sandbox, { timeout: 1000 });
vm.runInNewContext(bootSrc, sandbox, { timeout: 1000 });
vm.runInNewContext(enrollSrc, sandbox, { timeout: 1000 });

const RP = sandbox.RolePolicy;
check(RP.googleLoginImpliesOwner == null, 'RolePolicy must not claim Google=Owner');
check(sandbox.OwnerBootstrap.googleLoginImpliesOwner() === false, 'OwnerBootstrap: Google must never imply Owner');
check(RP.canCreateBranches({ role: 'admin', active: true }) === false, 'admin cannot create branches');
check(RP.canCreateBranches({ role: 'owner', active: true }) === true, 'owner can create branches');

(async () => {
  sandbox.LicenseLimits = { getMaxBranches: () => 3 };
  const blocked = await sandbox.BranchEnrollment.enrollBranch(sandbox.LicenseCloud._doc, { branchName: 'X' });
  check(blocked.ok === false && blocked.error === 'owner_hub_required', 'enrollment without owner_hub blocked');

  const match = sandbox.OwnerBootstrap.matchPreProvisionedEmail('owner@clinic.test');
  check(match.ok === true, 'pre-provisioned email should match');
  const bad = sandbox.OwnerBootstrap.matchPreProvisionedEmail('other@clinic.test');
  check(bad.ok === false, 'non-allowlisted email must fail');
  check(sandbox.OwnerBootstrap.describeAvailableMethods().googleLoginImpliesOwner === false,
    'describeAvailableMethods must reject Google=Owner');

  if (errors.length) {
    console.error('FAIL: v2-3 owner rbac activation');
    for (const err of errors) console.error(' -', err);
    process.exit(1);
  }
  console.log('OK: v2-3 owner rbac activation checks');
})().catch((e) => {
  console.error('FAIL: v2-3 owner rbac activation');
  console.error(' -', e.message || e);
  process.exit(1);
});
