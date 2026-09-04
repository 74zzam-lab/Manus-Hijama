#!/usr/bin/env node
'use strict';

/**
 * PR12 — Owner/Admin runtime separation + forged IPC behavioral suite.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

function loadScripts(sandbox, files) {
  for (const rel of files) {
    vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { timeout: 5000, filename: rel });
  }
}

function buildSandbox() {
  const sandbox = {
    console,
    notify: () => {},
    currentUser: null,
    users: [],
    DB: {
      _d: {},
      get(k, d) { return this._d[k] !== undefined ? this._d[k] : d; },
      set(k, v) { this._d[k] = v; },
    },
    Organization: { getId: () => 'CTR-A' },
    CenterId: { getStoredCenterId: () => 'CTR-A' },
    LicenseCloud: {
      loadLocal: () => sandbox._license || { centerId: 'CTR-A', branches: [], devices: { registered: [] } },
      saveLocal(doc) { sandbox._license = doc; return doc; },
    },
    OwnerProfile: {
      _p: { username: 'owner1', sessionEpoch: 2 },
      hasProfile() { return !!this._p; },
      loadProfile() { return this._p; },
      getSessionEpoch() { return this._p?.sessionEpoch || 0; },
      isSessionEpochValid(epoch) { return Number(epoch) === Number(this._p?.sessionEpoch || 0); },
    },
    OwnerManagement: {
      getOwnerState: () => ({ state: 'OWNER_EXISTS' }),
    },
    OwnerLifecycleAuthority: {
      assertOwnerCountInvariant: () => ({ ok: true }),
    },
    DeviceRegistry: {
      findDevice: (doc, uuid) => (doc?.devices?.registered || []).find((d) => d.deviceUuid === uuid) || null,
    },
    BranchScope: {
      userCanAccessBranch: (u, bid) => {
        if (!u) return false;
        if (Array.isArray(u.branchScope) && u.branchScope.includes('*')) return true;
        return (u.branchScope || []).includes(bid);
      },
    },
    _license: { centerId: 'CTR-A', branches: [{ id: 'BR-MAIN', active: true }], devices: { registered: [] } },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

async function main() {
  const trustedSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-trusted-authority.js'), 'utf8');
  const omSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-management.js'), 'utf8');
  const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const mainSrc = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8');

  check(/owner-trusted-authority\.js/.test(indexSrc), 'index loads owner-trusted-authority.js');
  check(/assertOwnerKvWrite/.test(mainSrc), 'main wires owner KV IPC gate');
  check(/OwnerTrustedAuthority/.test(fs.readFileSync(path.join(root, 'cloud', 'branch-enrollment.js'), 'utf8')), 'branch enrollment trusted gate');

  const policy = require('../../database/operational-rbac-policy');
  check(policy.isOwnerKvKey('__tdw_cloud_license__'), 'owner kv key detected');
  check(!policy.isOwnerKvKey('settings'), 'settings not owner kv');

  const rbacSession = require('../../electron/rbac-session');
  const lookupUsers = () => [
    { id: '1', role: 'owner', active: true, branchScope: ['*'] },
    { id: '2', role: 'admin', active: true, branchScope: ['*'] },
    { id: '3', role: 'reception', active: true, branchScope: ['BR-MAIN'] },
  ];

  // Owner → owner IPC allowed
  rbacSession.bindSession({ sender: { id: 101 } }, {
    userId: '1', role: 'owner', branchScope: ['*'], lookupUsers,
  });
  check(rbacSession.assertChannelAllowed({ sender: { id: 101 } }, 'cache:writeLicense').ok, 'owner cache:writeLicense allowed');

  // Admin → same IPC denied
  rbacSession.bindSession({ sender: { id: 102 } }, {
    userId: '2', role: 'admin', branchScope: ['*'], lookupUsers,
  });
  let adminLicenseDenied = false;
  try {
    rbacSession.assertChannelAllowed({ sender: { id: 102 } }, 'cache:writeLicense');
  } catch (e) {
    adminLicenseDenied = e.code === 'rbac_role_denied' || e.code === 'rbac_rank_denied';
  }
  check(adminLicenseDenied, 'admin cache:writeLicense denied');

  // A pre-login renderer has no generic license-write bypass; owner session is required.
  let preLoginLicenseDenied = false;
  try {
    rbacSession.assertChannelAllowed({ sender: { id: 999 } }, 'cache:writeLicense');
  } catch (e) {
    preLoginLicenseDenied = e.code === 'rbac_session_required';
  }
  check(preLoginLicenseDenied, 'no-session cache:writeLicense denied');

  // Admin owner KV persist denied
  let adminKvDenied = false;
  try {
    rbacSession.assertOwnerKvWrite({ sender: { id: 102 } }, '__tdw_cloud_license__');
  } catch (e) {
    adminKvDenied = e.code === 'owner_kv_denied';
  }
  check(adminKvDenied, 'admin persist owner KV denied');

  rbacSession.bindSession({ sender: { id: 101 } }, {
    userId: '1', role: 'owner', branchScope: ['*'], lookupUsers,
  });
  check(rbacSession.assertOwnerKvWrite({ sender: { id: 101 } }, '__tdw_owner_profile__').ok, 'owner persist owner KV allowed');

  // Renderer trusted layer
  const sandbox = buildSandbox();
  loadScripts(sandbox, [
    'cloud/role-policy.js',
    'cloud/rbac-guard.js',
    'cloud/owner-trusted-authority.js',
    'cloud/operational-rbac-guard.js',
    'cloud/branch-enrollment.js',
    'cloud/device-registry.js',
    'cloud/license-cloud.js',
  ]);

  sandbox.users = [
    { id: '1', username: 'owner1', role: 'owner', active: true, branchScope: ['*'], sessionEpoch: 2 },
    { id: '2', username: 'admin1', role: 'admin', active: true, branchScope: ['*'], sessionEpoch: 1 },
  ];
  sandbox.currentUser = { id: '1', username: 'owner1', role: 'owner', sessionEpoch: 2, branchScope: ['*'] };

  const OTA = sandbox.OwnerTrustedAuthority;
  check(OTA.assertOwnerMutation({ action: 'test' }).ok, 'owner mutation allowed');

  sandbox.currentUser = { id: '2', username: 'admin1', role: 'owner', sessionEpoch: 1, branchScope: ['*'] };
  const forged = OTA.assertOwnerMutation({ action: 'forged' });
  check(!forged.ok && (forged.error === 'tampered_role' || forged.error === 'owner_required'), 'forged renderer owner with admin session denied');

  sandbox.currentUser = { id: '2', username: 'admin1', role: 'admin', sessionEpoch: 1, branchScope: ['*'] };
  check(!OTA.assertOwnerMutation({ action: 'admin_try' }).ok, 'admin owner mutation denied');

  sandbox.currentUser = { id: '3', username: 'rec1', role: 'reception', sessionEpoch: 1, branchScope: ['BR-MAIN'] };
  sandbox.users.push(sandbox.currentUser);
  check(!sandbox.OperationalRbacGuard.requireOwner({ action: 'hub', notify: false }).ok, 'reception owner denied');

  // Cross-org
  sandbox.currentUser = { id: '1', username: 'owner1', role: 'owner', sessionEpoch: 2, branchScope: ['*'] };
  const crossOrg = OTA.assertOwnerMutation({ action: 'cross', centerId: 'CTR-B' });
  check(!crossOrg.ok && crossOrg.error === 'org_scope_denied', 'owner org A cannot mutate org B');

  // Stale session epoch
  sandbox.currentUser = { id: '1', username: 'owner1', role: 'owner', sessionEpoch: 1, branchScope: ['*'] };
  const stale = OTA.assertOwnerMutation({ action: 'stale_epoch' });
  check(!stale.ok && stale.error === 'stale_session', 'stale session epoch denied');

  // Corrupted owner lifecycle fail-closed
  sandbox.currentUser = { id: '1', username: 'owner1', role: 'owner', sessionEpoch: 2, branchScope: ['*'] };
  sandbox.OwnerLifecycleAuthority.assertOwnerCountInvariant = () => ({
    ok: false, code: 'DUPLICATE_PRIMARY_OWNER', error: 'owner_count_invariant_violation',
  });
  const corrupted = OTA.assertOwnerMutation({ action: 'corrupted' });
  check(!corrupted.ok && corrupted.error === 'owner_corrupted', 'duplicate owner fail-closed');

  sandbox.OwnerLifecycleAuthority.assertOwnerCountInvariant = () => ({ ok: true });

  // Service: admin cannot enroll branch via owner_hub
  sandbox.currentUser = { id: '2', username: 'admin1', role: 'admin', sessionEpoch: 1, branchScope: ['*'] };
  const branchRes = await sandbox.BranchEnrollment.enrollBranch(sandbox._license, {
    source: 'owner_hub',
    branchName: 'X',
  });
  check(branchRes.ok === false, 'admin direct enrollBranch denied');

  // Service: admin cannot approve device
  sandbox._license.devices = { registered: [{ deviceUuid: 'd1', active: true, branchId: 'BR-MAIN', deviceName: 'X' }] };
  sandbox.currentUser = { id: '2', username: 'admin1', role: 'admin', sessionEpoch: 1, branchScope: ['*'] };
  const devRes = await sandbox.DeviceRegistry.approveDevice('d1', { branchId: 'BR-MAIN' });
  check(devRes && devRes.ok !== true, 'admin approveDevice denied (' + (devRes?.error || 'no error') + ')');

  // Owner valid session — not blocked as admin/reception
  sandbox.currentUser = { id: '1', username: 'owner1', role: 'owner', sessionEpoch: 2, branchScope: ['*'] };
  check(OTA.assertOwnerMutation({ action: 'approveDevice', branchId: 'BR-MAIN' }).ok, 'owner device mutation allowed');

  // Bootstrap: admin before profile exists
  sandbox.OwnerProfile._p = null;
  sandbox.currentUser = { id: '2', username: 'admin1', role: 'admin', sessionEpoch: 0, branchScope: ['*'] };
  const boot = OTA.assertOwnerOrBootstrap({ action: 'bootstrap_push' });
  check(boot.ok && boot.bootstrap === true, 'bootstrap admin allowed before profile');

  // Logout owner → login admin: no retained owner rights
  sandbox.OwnerProfile._p = { username: 'owner1', sessionEpoch: 2 };
  sandbox.currentUser = { id: '2', username: 'admin1', role: 'owner', sessionEpoch: 2, branchScope: ['*'] };
  check(!OTA.assertOwnerMutation({ action: 'after_logout_switch' }).ok, 'admin session cannot inherit forged owner role');

  if (errors.length) {
    console.error('FAIL: pr12 owner/admin runtime separation');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('PASS: pr12 owner/admin runtime separation (ipc-forged, service-gates, bootstrap, stale, cross-org)');
}

main().catch((e) => {
  console.error('FAIL: exception', e);
  process.exit(1);
});
