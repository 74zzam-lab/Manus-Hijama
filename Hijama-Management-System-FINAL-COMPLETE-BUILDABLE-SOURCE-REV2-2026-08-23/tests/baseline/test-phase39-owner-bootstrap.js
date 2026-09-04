#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const roleSrc = fs.readFileSync(path.join(root, 'cloud', 'role-policy.js'), 'utf8');
const migrationSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-migration.js'), 'utf8');
const hubSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8');
const bootSrc = fs.readFileSync(path.join(root, 'cloud', 'boot-flow-ui.js'), 'utf8');

const errors = [];
function check(ok, msg) { if (!ok) errors.push(msg); }

const mem = new Map();
const admin = { id: 'u1', username: 'admin', role: 'admin', active: true };
const sandbox = {
  console,
  currentUser: admin,
  users: [admin],
  DB: {
    get(k, d) { return mem.has(k) ? mem.get(k) : d; },
    set(k, v) { mem.set(k, v); }
  },
  OwnerProfile: {
    hasProfile: () => false,
    async createProfile({ username }) { return { ok: true, profile: { username } }; },
    loadProfile: () => null
  },
  OwnerSetupState: {
    isRequired: () => true,
    clearRequired() { mem.set('cleared', true); }
  },
  LicenseCloud: { loadLocal: () => ({ activation: { consumed: true } }) },
  licLoadMeta: () => ({ activationConsumed: true }),
  prompt: (() => {
    const q = ['owner1', 'password1', 'pin-code'];
    return () => q.shift() || '';
  })(),
  async tdwAskText({ message } = {}) {
    if (/Recovery|PIN/i.test(String(message || ''))) return 'pin-code';
    if (/كلمة مرور|password/i.test(String(message || ''))) return 'password1';
    return 'owner1';
  },
  async tdwAskPassword() { return 'password1'; },
  AuditLogger: { log() {} },
  notify() {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.runInNewContext(roleSrc, sandbox, { timeout: 1000 });
vm.runInNewContext(migrationSrc, sandbox, { timeout: 1000 });

const RP = sandbox.RolePolicy;
check(typeof RP.canBootstrapOwner === 'function', 'canBootstrapOwner missing');
check(RP.canBootstrapOwner(admin) === true, 'admin may bootstrap Owner when no profile');
check(RP.canManageOrganization(admin) === false, 'admin is not organization owner yet');
check(RP.canBootstrapOwner({ role: 'employee', active: true }) === false, 'employee cannot bootstrap Owner');

check(hubSrc.includes('requireOwnerBootstrap'), 'OwnerHub must use requireOwnerBootstrap');
check(hubSrc.includes('pushLicenseToDriveNow'), 'OwnerHub must expose pushLicenseToDriveNow');
check(!hubSrc.includes("requireOwnerManage('تخطي ترقية Owner legacy')"), 'skip must not require existing Owner role');
check(hubSrc.includes("requireOwnerBootstrap('تخطي إعداد Owner')"), 'skip must use bootstrap gate');
check(
  bootSrc.includes('OwnerCreateForm') || bootSrc.includes('promoteUserToOwnerRole'),
  'boot flow must create/promote Owner via OwnerCreateForm'
);
const formSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-create-form.js'), 'utf8');
check(formSrc.includes('promoteUserToOwnerRole'), 'OwnerCreateForm must promote user to owner role');
check(formSrc.includes('MIN_PASSWORD_LENGTH'), 'OwnerCreateForm must enforce password length');

async function run() {
  const res = await sandbox.OwnerMigration.runInteractiveMigration();
  check(res.ok === true, 'migration should succeed for admin bootstrap');
  const promoted = sandbox.users.find((u) => u.id === 'u1');
  check(promoted?.role === 'owner', 'admin user must be promoted to role=owner');
  check(sandbox.currentUser.role === 'owner', 'currentUser role must become owner');
  check(mem.get('cleared') === true, 'OwnerSetupState must clear after create');

  // After profile exists, admin bootstrap should be denied (profile gate).
  sandbox.OwnerProfile.hasProfile = () => true;
  sandbox.currentUser = { id: 'u2', username: 'admin2', role: 'admin', active: true };
  check(RP.canBootstrapOwner(sandbox.currentUser) === false, 'cannot bootstrap when Owner Profile already exists');

  if (errors.length) {
    console.error('FAIL: phase39 owner bootstrap');
    for (const err of errors) console.error(' -', err);
    process.exit(1);
  }
  console.log('OK: phase39 owner bootstrap checks');
}

run().catch((e) => {
  console.error('FAIL: phase39 owner bootstrap');
  console.error(' -', e.message || e);
  process.exit(1);
});
