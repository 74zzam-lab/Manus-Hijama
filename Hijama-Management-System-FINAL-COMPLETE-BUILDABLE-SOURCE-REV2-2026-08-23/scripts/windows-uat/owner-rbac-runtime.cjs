#!/usr/bin/env node
'use strict';

/**
 * Headless Owner/RBAC runtime checks (no GUI). Proves trusted-layer enforcement.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const root = path.join(__dirname, '..', '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const errors = [];
function check(ok, msg) { if (!ok) errors.push(msg); }

function load(file, sandbox) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInNewContext(src, sandbox, { timeout: 2000, filename: file });
}

const mem = Object.create(null);
const sandbox = {
  console,
  currentUser: null,
  users: [],
  DB: {
    get(k, d) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : d; },
    set(k, v) { mem[k] = v; },
  },
  LicenseCloud: {
    _doc: {
      centerId: 'NJR-UAT',
      branches: [],
      ownerBootstrap: {
        tokenHash: '',
        emails: ['owner@clinic.test'],
        consumed: false,
      },
      limits: { maxBranches: 3 },
    },
    loadLocal() { return this._doc; },
    saveLocal(doc) { this._doc = doc; },
    async pushToDrive() { return { ok: true }; },
  },
  LicenseLimits: { getMaxBranches: (doc) => (doc?.limits?.maxBranches || 3) },
  DeviceConfig: {
    ensureDeviceUuid: () => 'dev-uat-1',
    load: () => ({ deviceUuid: 'dev-uat-1' }),
  },
  OwnerProfile: {
    _has: false,
    hasProfile() { return this._has; },
    async createProfile() {
      this._has = true;
      return { ok: true, profile: { username: 'owner1' } };
    },
  },
  CommercialLicense: {
    crypto: {
      canonicalJson: (x) => JSON.stringify(x),
      async hmacSha256Hex(s) {
        return crypto.createHash('sha256').update(String(s)).digest('hex');
      },
    },
  },
  AuditLogger: { log() {} },
  notify() {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.OwnerMigration = {
  promoteUserToOwnerRole(username) {
    sandbox.users.push({ id: '1', username, role: 'owner', active: true });
    sandbox.currentUser = sandbox.users[0];
  },
};
sandbox.OwnerHub = {
  async saveLicenseDoc(doc) {
    sandbox.LicenseCloud.saveLocal(doc);
    return doc;
  },
};

load('cloud/role-policy.js', sandbox);
load('cloud/owner-bootstrap.js', sandbox);
load('cloud/branch-enrollment.js', sandbox);

(async () => {
  check(sandbox.OwnerBootstrap.googleLoginImpliesOwner() === false, 'Google ≠ Owner');

  // Token path
  const token = 'UAT-SETUP-TOKEN-ONCE';
  const hash = await sandbox.OwnerBootstrap.hashToken(token);
  sandbox.LicenseCloud._doc.ownerBootstrap.tokenHash = hash;
  const first = await sandbox.OwnerBootstrap.redeemSetupToken(token, {
    username: 'owner1',
    password: 'admin123',
    recoveryCode: '1234',
  });
  check(first.ok === true, 'valid token creates owner');
  const second = await sandbox.OwnerBootstrap.redeemSetupToken(token, {
    username: 'owner2',
    password: 'admin123',
    recoveryCode: '1234',
  });
  check(second.ok === false, 'token cannot be reused');

  // Branch create gates
  const blocked = await sandbox.BranchEnrollment.enrollBranch(sandbox.LicenseCloud._doc, {
    branchName: 'Should Fail',
  });
  check(blocked.error === 'owner_hub_required', 'enroll without owner_hub fails');

  sandbox.currentUser = { role: 'owner', active: true };
  check(sandbox.RolePolicy.canCreateBranches(sandbox.currentUser) === true, 'owner can create');
  const created = await sandbox.BranchEnrollment.enrollBranch(sandbox.LicenseCloud._doc, {
    branchName: 'Main',
    source: 'owner_hub',
  });
  check(created.ok === true, 'owner_hub enroll works');

  const admin = { role: 'admin', active: true };
  check(sandbox.RolePolicy.canCreateBranches(admin) === false, 'branch admin cannot create');
  check(sandbox.RolePolicy.canManageOrganization(admin) === false, 'admin cannot manage org');

  const employee = { role: 'employee', active: true };
  check(sandbox.RolePolicy.canCreateBranches(employee) === false, 'employee cannot create');
  check(sandbox.RolePolicy.canAccessOwnerHubCore(employee) === false, 'employee no hub core');

  const emailBad = sandbox.OwnerBootstrap.matchPreProvisionedEmail('Other@Clinic.TEST');
  // allowlist is owner@clinic.test only and bootstrap already consumed
  check(emailBad.ok === false, 'non-allowlisted / consumed bootstrap rejects');

  const report = {
    ok: errors.length === 0,
    errors,
    at: new Date().toISOString(),
    checks: {
      googleImpliesOwner: false,
      tokenOnce: first.ok === true && second.ok === false,
      ownerHubRequired: blocked.error === 'owner_hub_required',
      branchAdminDenied: sandbox.RolePolicy.canCreateBranches(admin) === false,
      employeeDenied: sandbox.RolePolicy.canCreateBranches(employee) === false,
    },
  };
  fs.writeFileSync(
    path.join(evidenceDir, 'owner-rbac-runtime.json'),
    JSON.stringify(report, null, 2)
  );
  if (errors.length) {
    console.error('FAIL owner-rbac-runtime');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('OK owner-rbac-runtime');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
