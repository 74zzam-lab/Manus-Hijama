#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'cloud', 'role-policy.js'), 'utf8');

const sandbox = {
  console,
  currentUser: null,
  DB: { get: () => [] },
  users: []
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

try {
  vm.runInNewContext(src, sandbox, { timeout: 1000 });
} catch (e) {
  errors.push('role-policy eval failed: ' + e.message);
}

const RP = sandbox.RolePolicy || {};
check(typeof RP.isOrganizationOwner === 'function', 'isOrganizationOwner missing');
check(typeof RP.isBranchAdmin === 'function', 'isBranchAdmin missing');
check(typeof RP.canManageOrganization === 'function', 'canManageOrganization missing');
check(typeof RP.canAccessOwnerHubCore === 'function', 'canAccessOwnerHubCore missing');
check(typeof RP.hasOrganizationOwnerAccount === 'function', 'hasOrganizationOwnerAccount missing');
check(typeof RP.canBootstrapOwner === 'function', 'canBootstrapOwner missing');
check(typeof RP.countActiveOwners === 'function', 'countActiveOwners missing');
check(typeof RP.listOwnerUsers === 'function', 'listOwnerUsers missing');
check(typeof RP.canRemoveOwnerUser === 'function', 'canRemoveOwnerUser missing');
check(RP.countActiveOwners([{ role: 'owner', active: true }, { role: 'owner', active: false }]) === 1, 'countActiveOwners counts active only');
check(RP.canRemoveOwnerUser('o1', [{ id: 'o1', role: 'owner', active: true }]).ok === false, 'cannot remove last active owner');
check(RP.canRemoveOwnerUser('o2', [
  { id: 'o1', role: 'owner', active: true },
  { id: 'o2', role: 'owner', active: true }
]).ok === true, 'can remove non-last owner');

const owner = { role: 'owner', active: true };
const hq = { role: 'hq_admin', active: true };
const admin = { role: 'admin', active: true };
const employee = { role: 'employee', active: true };
const dev = { role: 'employee', isDev: true, active: true };

check(RP.isOrganizationOwner(owner) === true, 'owner must be organization owner');
check(RP.isOrganizationOwner(hq) === true, 'hq_admin must be organization owner');
check(RP.isOrganizationOwner(admin) === false, 'admin must not be organization owner');
check(RP.isBranchAdmin(admin) === true, 'admin must be branch admin');
check(RP.isBranchAdmin(owner) === false, 'owner must not be branch admin');
check(RP.canManageOrganization(owner) === true, 'owner should manage organization');
check(RP.canManageOrganization(admin) === false, 'admin should not manage organization');
check(RP.canManageBranches(admin) === true, 'manager compatibility must remain for admin');
check(RP.canManageBranches(owner) === true, 'manager compatibility must remain for owner');
check(typeof RP.canCreateBranches === 'function', 'canCreateBranches missing');
check(RP.canCreateBranches(owner) === true, 'owner can create branches');
check(RP.canCreateBranches(admin) === false, 'branch admin cannot create branches');
check(RP.canCreateBranches(employee) === false, 'employee cannot create branches');
check(RP.canAccessOwnerHubCore(hq) === true, 'hq owner should access owner hub core');
check(RP.canAccessOwnerHubCore(employee) === false, 'employee should not access owner hub core');
check(RP.isOrganizationOwner(dev) === true, 'dev override should be organization owner');

check(RP.canBootstrapOwner(owner) === true, 'owner can bootstrap');
check(RP.canBootstrapOwner(admin) === true, 'admin can bootstrap when no Owner Profile');
check(RP.canBootstrapOwner(employee) === false, 'employee cannot bootstrap Owner');
sandbox.OwnerProfile = { hasProfile: () => true };
check(RP.canBootstrapOwner(admin) === false, 'admin cannot bootstrap after Owner Profile exists');
sandbox.OwnerProfile = { hasProfile: () => false };

check(
  RP.hasOrganizationOwnerAccount([employee, admin, owner]) === true,
  'hasOrganizationOwnerAccount should detect owner'
);
check(
  RP.hasOrganizationOwnerAccount([employee, admin]) === false,
  'hasOrganizationOwnerAccount should be false without owner'
);

if (errors.length) {
  console.error('FAIL: phase22 owner policy');
  for (const err of errors) console.error(' -', err);
  process.exit(1);
}

console.log('OK: phase22 owner policy checks');
