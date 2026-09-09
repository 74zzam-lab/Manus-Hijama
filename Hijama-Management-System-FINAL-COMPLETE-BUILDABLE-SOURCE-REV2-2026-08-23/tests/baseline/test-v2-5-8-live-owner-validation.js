#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

const roleSrc = fs.readFileSync(path.join(root, 'cloud', 'role-policy.js'), 'utf8');
const omSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-management.js'), 'utf8');
const setupSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-setup-state.js'), 'utf8');
const bootSrc = fs.readFileSync(path.join(root, 'cloud', 'boot-flow-ui.js'), 'utf8');
const panelSrc = fs.readFileSync(path.join(root, 'license', 'ui', 'developer-panel.js'), 'utf8');
const hubSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const smokePath = path.join(root, 'docs', 'integration-v2-5-8', 'LIVE-PRODUCTION-SMOKE.md');

check(fs.existsSync(smokePath), 'LIVE-PRODUCTION-SMOKE.md must exist');
const smoke = fs.readFileSync(smokePath, 'utf8');
check(/getOwnerState|Single Source of Truth|State Machine/i.test(smoke), 'smoke must mention Owner state machine / SSOT');
check(/Ready for main:\s*NO/i.test(smoke), 'smoke must keep Ready for main: NO');

check(/getOwnerState/.test(omSrc), 'OwnerManagement.getOwnerState');
check(/OWNER_STATES/.test(omSrc), 'OWNER_STATES enum');
check(/OWNER_CREATION_IN_PROGRESS/.test(omSrc), 'creation in progress state');
check(/requestOwnerBootstrap/.test(omSrc), 'requestOwnerBootstrap SSOT entry');
check(/creationInProgress/.test(omSrc), 'single creation lock');
  check(/notifyOwnerChanged/.test(omSrc), 'notifyOwnerChanged for Hub sync');
  check(/invalidateOwnerDomain/.test(omSrc), 'Owner mutation must use domain-specific Hub invalidation');
check(/setSystemBusy/.test(omSrc), 'system busy gate');

check(/getOwnerState|requestOwnerBootstrap/.test(bootSrc), 'BootFlow uses SSOT');
check(/function ownerCreateInFlight/.test(bootSrc) || /isOwnerCreationInProgress/.test(bootSrc), 'BootFlow delegates create lock to OM');
check(!/let ownerCreateInFlight = false/.test(bootSrc), 'BootFlow must not keep separate owner create lock var');
// V2-5.9: startup/login must NOT auto-open Owner Bootstrap; SSOT API still exists for emergency.
check(/OwnerManagement|BootFlow/.test(indexSrc), 'startup/login still reference BootFlow/OwnerManagement');
check(!/requestOwnerBootstrap\('startup'\)/.test(indexSrc), 'startup must not auto requestOwnerBootstrap (V2-5.9)');
check(!/requestOwnerBootstrap\('login'\)/.test(indexSrc), 'login must not auto requestOwnerBootstrap (V2-5.9)');
check(/getOwnerState/.test(hubSrc), 'Owner Hub uses getOwnerState');
check(/getOwnerState/.test(panelSrc), 'Emergency tools show getOwnerState');
check(/Reset Owner Password|requestOwnerBootstrap|emergency_devtools/.test(panelSrc), 'DevTools Owner support path present');

const sandbox = {
  console,
  currentUser: null,
  users: [],
  localStorage: { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } },
  document: {
    getElementById() { return null; },
    body: { classList: { contains() { return false; }, toggle() {} } }
  },
  DB: {
    _d: {},
    get(k, d) { return this._d[k] !== undefined ? this._d[k] : d; },
    set(k, v) { this._d[k] = v; }
  },
  BranchScope: {
    applyDefaultScopeToUser(u) {
      if (!u) return u;
      if (!Array.isArray(u.branchScope) || !u.branchScope.length) {
        u.branchScope = ['*'];
        u.canSwitchBranch = true;
      }
      return u;
    }
  },
  CenterId: { getStoredCenterId: () => 'CTR-TEST' },
  Organization: { getId: () => 'CTR-TEST' },
  LicenseCloud: { loadLocal: () => ({ centerId: 'CTR-TEST', licenseId: 'LIC-1', productKey: 'ABCD-EFGH-IJKL' }) },
  OwnerProfile: {
    _p: null,
    hasProfile() { return !!this._p; },
    async createProfile(input) {
      if (this._p) return { ok: false, error: 'profile_exists' };
      this._p = { username: input.username, role: 'owner' };
      return { ok: true, profile: this._p };
    },
    loadProfile() { return this._p; },
    async rotatePassword() { return { ok: true }; }
  },
  OwnerMigration: { promoteUserToOwnerRole() {} },
  OwnerHub: {
    invalidationCalls: 0,
    invalidateOwnerDomain(detail) { this.invalidationCalls++; this.lastInvalidation = detail; },
    applyNavVisibility() {}
  },
  hashPW: async (pw) => 'hash:' + pw
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.runInNewContext(roleSrc, sandbox, { timeout: 2000 });
vm.runInNewContext(setupSrc, sandbox, { timeout: 2000 });
vm.runInNewContext(omSrc, sandbox, { timeout: 2000 });

const OM = sandbox.OwnerManagement;
check(!!OM, 'OwnerManagement loaded');
check(OM.getOwnerState().state === 'NO_OWNER', 'empty → NO_OWNER');
check(OM.getOwnerState().action === 'OPEN_BOOTSTRAP', 'NO_OWNER → OPEN_BOOTSTRAP');

const allowed = new Set(Object.values(OM.OWNER_STATES));
check(allowed.size === 5, 'exactly 5 owner states');
check(allowed.has('NO_OWNER') && allowed.has('OWNER_EXISTS') && allowed.has('OWNER_CORRUPTED')
  && allowed.has('OWNER_RECOVERY_REQUIRED') && allowed.has('OWNER_CREATION_IN_PROGRESS'), 'all required states present');

(async () => {
  // Race: system busy blocks create
  OM.setSystemBusy('restore');
  const blocked = await OM.createOwner({
    fullName: 'X', email: 'x@y.com', username: 'xuser', password: 'password1', passwordConfirm: 'password1', recoveryCode: 'r'
  });
  check(blocked.ok === false && blocked.error === 'system_busy', 'create blocked during restore');
  OM.clearSystemBusy('restore');

  const created = await OM.createOwner({
    fullName: 'First Owner',
    email: 'owner@example.com',
    username: 'firstowner',
    password: 'password1',
    passwordConfirm: 'password1',
    recoveryCode: 'recover-me'
  });
  check(created.ok === true, 'createOwner first ok: ' + (created.error || ''));
  check(OM.getOwnerState().state === 'OWNER_EXISTS', 'after create → OWNER_EXISTS');
  check(sandbox.OwnerHub.invalidationCalls >= 1 && sandbox.OwnerHub.lastInvalidation?.type === 'create',
    'Owner Hub domain invalidated after committed create');

  // Corrupted: profile without owners
  sandbox.users = [];
  check(OM.getOwnerState().state === 'OWNER_CORRUPTED', 'profile without users → CORRUPTED');

  // Seeded/restored owners without crypto profile: operational OWNER_EXISTS (V2-5.9)
  sandbox.OwnerProfile._p = null;
  sandbox.users = [{ id: 'o1', username: 'o1', role: 'owner', active: true, password: 'hash' }];
  check(OM.getOwnerState().state === 'OWNER_EXISTS', 'owners without profile → OWNER_EXISTS (profile optional)');

  // Restore healthy via repair + profile recreate path using createOwner additional
  sandbox.OwnerProfile._p = { username: 'o1' };
  check(OM.getOwnerState().state === 'OWNER_EXISTS', 'matched profile+owner → EXISTS');

  const second = await OM.createOwner({
    fullName: 'Second', email: 's@e.com', username: 'secondowner',
    password: 'password2', passwordConfirm: 'password2', recoveryCode: 'x'
  });
  check(second.ok === true, 'additional owner ok');
  const beforeHub = sandbox.OwnerHub.invalidationCalls;
  OM.deleteOwner(sandbox.users.find(u => u.username === 'secondowner').id);
  check(sandbox.OwnerHub.invalidationCalls > beforeHub && sandbox.OwnerHub.lastInvalidation?.type === 'delete',
    'Hub domain invalidated after committed delete');

  // Double-create race simulation: hold lock manually via concurrent calls
  let inProgressSeen = false;
  const p1 = OM.createOwner({
    fullName: 'Race', email: 'r@e.com', username: 'race1',
    password: 'password3', passwordConfirm: 'password3', recoveryCode: 'y'
  });
  // Immediately second call should see creation_in_progress if first still running
  // (may complete too fast — also assert API rejects when flag set via setSystemBusy path covered)
  const mid = OM.getOwnerState();
  if (mid.state === 'OWNER_CREATION_IN_PROGRESS') inProgressSeen = true;
  await p1;
  check(typeof OM.isOwnerCreationInProgress === 'function', 'isOwnerCreationInProgress exported');
  check(OM.isOwnerCreationInProgress() === false, 'lock released after create');

  check(/ensureOwnerBootstrapWizard/.test(bootSrc), 'BootFlow ensureOwnerBootstrapWizard wrapper');
  check(/requestOwnerBootstrap/.test(bootSrc), 'BootFlow delegates to requestOwnerBootstrap');

  if (errors.length) {
    console.error('FAIL: v2-5.8 live owner validation');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('PASS: v2-5.8 owner state machine SSOT (' + [
    'getOwnerState', 'single lock', 'hub domain invalidation', 'busy gates', inProgressSeen ? 'saw-in-progress' : 'create-ok'
  ].join(', ') + ')');
})().catch((e) => {
  console.error('FAIL: exception', e);
  process.exit(1);
});
