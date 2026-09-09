#!/usr/bin/env node
/**
 * Phase 9 — operational RBAC hardening (authoritative user + main syncOp gates).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const errors = [];

function assert(c, m) {
  if (!c) errors.push(m);
}

const policy = require('../database/operational-rbac-policy');
assert(policy.SYNC_OP_MIN_RANK.resolveConflict === policy.MANAGER_MIN_RANK, 'resolveConflict needs manager rank');
assert(policy.isManagerRole('admin'), 'admin is manager');
assert(!policy.isManagerRole('reception'), 'reception not manager');
assert(policy.isOwnerRole('owner'), 'owner role');

const users = [
  { id: '2', role: 'admin', active: true, branchScope: ['*'] },
  { id: '3', role: 'reception', active: true, branchScope: ['BR-MAIN'] },
];
const lookupUsers = () => users;

const rbacSession = require('../electron/rbac-session');
const fakeEvent = { sender: { id: 9001 } };
rbacSession.bindSession(fakeEvent, {
  userId: '3',
  role: 'reception',
  branchScope: ['BR-MAIN'],
  lookupUsers,
});
try {
  rbacSession.assertSyncOpAllowed(fakeEvent, 'resolveConflict');
  errors.push('reception should not resolveConflict');
} catch (e) {
  assert(e.code === 'rbac_rank_denied', 'reception blocked with rank_denied');
}
rbacSession.assertSyncOpAllowed(fakeEvent, 'listOpenConflicts');

rbacSession.bindSession({ sender: { id: 9002 } }, {
  userId: '2',
  role: 'admin',
  branchScope: ['*'],
  lookupUsers,
});
rbacSession.assertSyncOpAllowed({ sender: { id: 9002 } }, 'resolveConflict');

// Renderer operational guard
const context = {
  window: {},
  globalThis: {},
  console,
  notify: () => {},
  currentUser: { id: '3', username: 'rec1', role: 'owner' }, // forged owner
  users: [{ id: '3', username: 'rec1', role: 'reception', active: true, branchScope: ['BR-MAIN'] }],
  DB: {
    _d: {},
    get(k, d) {
      try {
        const v = context.DB._d[k];
        return v !== undefined ? v : d;
      } catch { return d; }
    },
    set(k, v) { context.DB._d[k] = v; },
  },
  OwnerProfile: { hasProfile: () => true },
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

vm.runInContext(fs.readFileSync(path.join(root, 'cloud/role-policy.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'cloud/rbac-guard.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'cloud/operational-rbac-guard.js'), 'utf8'), context);

const tamper = context.RbacGuard.rejectTamperedRole(context.currentUser);
assert(!tamper.ok && tamper.error === 'tampered_role', 'tampered role rejected');

const mgr = context.OperationalRbacGuard.requireManager({ action: 'test', notify: false });
assert(!mgr.ok && mgr.error === 'manager_only', 'forged owner not manager after auth resolve');

context.currentUser.role = 'reception';
const ownerGate = context.OperationalRbacGuard.requireOwner({ action: 'hub', notify: false });
assert(!ownerGate.ok, 'reception cannot owner mutate');

context.users[0].role = 'admin';
context.currentUser = { id: '3', username: 'rec1', role: 'admin' };
const adminMgr = context.OperationalRbacGuard.requireManager({ notify: false });
assert(adminMgr.ok, 'real admin passes manager gate');

const mainSrc = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8');
assert(mainSrc.includes('assertSyncOpAllowed'), 'main wires syncOp RBAC');

const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(indexSrc.includes('operational-rbac-guard.js'), 'index loads operational RBAC guard');
assert(indexSrc.includes('await completeAuthenticatedLogin'), 'login awaits RBAC before init');
assert(indexSrc.includes('value="hq_admin"'), 'hq_admin login role option');
assert(indexSrc.includes('refreshAllBranchScopedViews'), 'central branch refresh hook');
assert(indexSrc.includes('branch-data-isolation.js'), 'branch data isolation module loaded');

const isoSrc = fs.readFileSync(path.join(root, 'cloud/branch-data-isolation.js'), 'utf8');
assert(isoSrc.includes('BRANCH_SCOPED_ARRAY_KEYS'), 'branch scoped kv keys defined');
assert(isoSrc.includes('filterUsersForView'), 'users filtered per branch view');
assert(isoSrc.includes("'users'"), 'users in branch scoped kv keys');
assert(isoSrc.includes('getUsersForAuth'), 'login uses branch auth user list');
assert(isoSrc.includes('usernameTakenInBranch'), 'username unique per branch');

const bridgeSrc = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');
assert(bridgeSrc.includes('BranchDataIsolation'), 'sqlite bridge uses branch data isolation');

vm.runInContext(fs.readFileSync(path.join(root, 'cloud/owner-hub.js'), 'utf8'), context);
context.currentUser = { id: '1', role: 'owner', active: true };
assert(context.OwnerHub.canAccess(), 'owner hub for organization owner');
context.currentUser = { id: '2', role: 'admin', active: true };
assert(!context.OwnerHub.canAccess(), 'owner hub blocked for branch admin');

const extCtx = {
  ...context,
  DB: context.DB,
  settings: {},
  RolePolicy: context.RolePolicy,
  currentUser: { role: 'admin' },
};
extCtx.window = extCtx;
extCtx.globalThis = extCtx;
vm.createContext(extCtx);
vm.runInContext(fs.readFileSync(path.join(root, 'cloud/role-policy.js'), 'utf8'), extCtx);
vm.runInContext(fs.readFileSync(path.join(root, 'cupping-ext-modules.js'), 'utf8'), extCtx);
const adminPerms = extCtx.getUserPermissions({ role: 'admin' });
const ownerPerms = extCtx.getUserPermissions({ role: 'owner' });
const recPerms = extCtx.getUserPermissions({ role: 'reception' });
assert(!adminPerms._all, 'admin uses explicit preset not _all');
assert(ownerPerms._all, 'owner keeps _all permissions');
assert(recPerms['cash.view'], 'reception preset includes cash');
assert(!recPerms['ledger.view'], 'reception preset excludes employee ledger');

const truth = require('../database/operational-error-truth');
assert(truth.CATALOG.rbac_session_required, 'rbac_session_required catalog entry');

const branchCtx = {
  window: {},
  globalThis: {},
  console,
  DeviceConfig: {
    getLockedBranchId: () => 'BR-RYD',
    load: () => ({ lockedBranchId: 'BR-RYD' }),
    isBranchLocked: () => true,
  },
  RolePolicy: null,
  BranchContexts: { setOperationalWriteBranch: () => ({ ok: true }) },
  sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } },
};
branchCtx.window = branchCtx;
branchCtx.globalThis = branchCtx;
vm.createContext(branchCtx);
vm.runInContext(fs.readFileSync(path.join(root, 'cloud/role-policy.js'), 'utf8'), branchCtx);
vm.runInContext(fs.readFileSync(path.join(root, 'cloud/branch-scope.js'), 'utf8'), branchCtx);

const adminUser = { id: '2', role: 'admin', branchScope: ['*'], canSwitchBranch: true };
const ownerUser = { id: '1', role: 'owner', branchScope: ['*'], canSwitchBranch: true };
assert(!branchCtx.BranchScope.canUserSwitchBranch(adminUser), 'admin cannot switch branches');
assert(branchCtx.BranchScope.canUserSwitchBranch(ownerUser), 'owner can switch branches');
assert(branchCtx.BranchScope.getUserBranchScope(adminUser).join(',') === 'BR-RYD', 'admin scoped to device branch');
assert(branchCtx.BranchScope.getUserBranchScope(ownerUser).includes('*'), 'owner keeps wildcard scope');

branchCtx.currentUser = { id: '1', role: 'owner', branchScope: ['*'] };
branchCtx.BranchScope.setActiveBranchId('BR-RYD');
branchCtx.BranchContexts = { getOperationalWriteBranch: () => 'BR-RYD' };
const mixedRecords = [{ id: '1', branchId: 'BR-RYD' }, { id: '2', branchId: 'BR-MAIN' }];
const ownerView = branchCtx.BranchScope.filterForActiveView(mixedRecords);
assert(ownerView.length === 1 && ownerView[0].branchId === 'BR-RYD', 'owner branch switch overrides device lock in view filter');

branchCtx.currentUser = { id: '3', role: 'reception' };
const staffView = branchCtx.BranchScope.filterForActiveView(mixedRecords);
assert(staffView.length === 1 && staffView[0].branchId === 'BR-RYD', 'staff still scoped to device lock');

const isoCtx = {
  window: {},
  globalThis: {},
  console,
  DB: { _d: {}, get(k, d) { return this._d[k] !== undefined ? this._d[k] : d; }, set(k, v) { this._d[k] = v; } },
  DeviceConfig: { getLockedBranchId: () => 'BR-MAIN', isBranchLocked: () => true },
  BranchScope: null,
};
isoCtx.window = isoCtx;
isoCtx.globalThis = isoCtx;
vm.createContext(isoCtx);
vm.runInContext(fs.readFileSync(path.join(root, 'cloud/branch-scope.js'), 'utf8'), isoCtx);
vm.runInContext(fs.readFileSync(path.join(root, 'cloud/branch-data-isolation.js'), 'utf8'), isoCtx);
const branchUsers = [
  { id: 'a1', username: 'admin', role: 'admin', active: true, branchId: 'BR-MAIN' },
  { id: 'a2', username: 'admin', role: 'admin', active: true, branchId: 'BR-JED' },
];
assert(isoCtx.BranchDataIsolation.usernameTakenInBranch(branchUsers, 'admin', 'BR-MAIN', 'a1') === false, 'same username allowed other branch');
assert(isoCtx.BranchDataIsolation.usernameTakenInBranch(branchUsers, 'admin', 'BR-MAIN', 'x') === true, 'username blocked same branch');
assert(isoCtx.BranchDataIsolation.getUsersForAuth(branchUsers).length === 1, 'login lists device branch users only');

const displaySrc = fs.readFileSync(path.join(root, 'cloud/branch-display.js'), 'utf8');
assert(displaySrc.includes('resolveBranchName'), 'branch display resolver exists');
const displayCtx = {
  window: {},
  globalThis: {},
  console,
  LicenseCloud: { loadLocal: () => ({ branches: [{ id: 'BR-MAIN', name: 'فرع الرياض', active: true }] }) },
  DB: { get: () => ({}) },
};
displayCtx.window = displayCtx;
displayCtx.globalThis = displayCtx;
vm.createContext(displayCtx);
vm.runInContext(displaySrc, displayCtx);
assert(displayCtx.BranchDisplay.resolveBranchName('BR-MAIN') === 'فرع الرياض', 'branch name shown instead of BR-MAIN');

const indexSrc2 = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(indexSrc2.includes('ensureBranchStaffAccounts'), 'default admin/reception seed per branch');
assert(indexSrc2.includes('branch-display.js'), 'branch display script loaded');

const ownerHubSrc = fs.readFileSync(path.join(root, 'cloud/owner-hub.js'), 'utf8');
assert(ownerHubSrc.includes('BranchDisplay?.resolveBranchName'), 'owner hub shows branch name not id');
const switcherSrc = fs.readFileSync(path.join(root, 'cloud/branch-switcher.js'), 'utf8');
assert(switcherSrc.includes('topbar-branch-label'), 'read-only branch label for device-bound users');
assert(switcherSrc.includes('BRANCH_SESSION_SWITCHED'), 'branch switch audit event');

const deviceCtx = {
  window: {},
  globalThis: {},
  console,
  currentUser: null,
  DB: {
    _d: {},
    get(k, d) { return this._d[k] !== undefined ? this._d[k] : d; },
    set(k, v) { this._d[k] = v; },
  },
  BranchScope: { setActiveBranchId: () => {} },
  AuditLogger: { logSyncEvent: () => {} },
};
deviceCtx.window = deviceCtx;
deviceCtx.globalThis = deviceCtx;
vm.createContext(deviceCtx);
vm.runInContext(fs.readFileSync(path.join(root, 'cloud/role-policy.js'), 'utf8'), deviceCtx);
vm.runInContext(fs.readFileSync(path.join(root, 'cloud/device-config.js'), 'utf8'), deviceCtx);

const firstLock = deviceCtx.DeviceConfig.setBranchLock('BR-MAIN', true, 'PC-1', { activation: true });
assert(firstLock.branchLocked && firstLock.lockedBranchId === 'BR-MAIN', 'initial branch lock during activation');

deviceCtx.currentUser = { id: '2', role: 'admin' };
const denied = deviceCtx.DeviceConfig.trySetBranchLock('BR-JED', true, 'PC-1');
assert(denied.ok === false && denied.error === 'owner_required', 'admin cannot change device branch lock');

deviceCtx.currentUser = { id: '1', role: 'owner' };
const ownerChange = deviceCtx.DeviceConfig.trySetBranchLock('BR-JED', true, 'PC-1');
assert(ownerChange.ok && ownerChange.cfg.lockedBranchId === 'BR-JED', 'owner can change device branch lock');

const bootSrc = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
assert(bootSrc.includes('activation: true'), 'boot flow uses activation branch lock');

const deviceCfgSrc = fs.readFileSync(path.join(root, 'cloud/device-config.js'), 'utf8');
assert(deviceCfgSrc.includes('owner_required'), 'device config guards branch lock changes');

const centerSrc = fs.readFileSync(path.join(root, 'cloud/center-setup.js'), 'utf8');
assert(centerSrc.includes('owner_required'), 'center setup removeBranch owner guard');

if (errors.length) {
  console.error('FAIL verify-operational-rbac:');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('OK: Phase 9 operational RBAC verified');
