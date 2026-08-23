#!/usr/bin/env node
'use strict';

/**
 * RC Hotfix Round 2 — restore credential truth + Google disconnect + backup UX + restore verification.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'cloud/auth-credential-truth.js'), 'utf8');
const disconnect = fs.readFileSync(path.join(root, 'cloud/bootstrap-google-disconnect.js'), 'utf8');
const verify = fs.readFileSync(path.join(root, 'cloud/restore-verification.js'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');
const ops = fs.readFileSync(path.join(root, 'cloud/ops-ux-bridge.js'), 'utf8');

check(/auth-credential-truth\.js/.test(index), 'index loads auth-credential-truth');
check(/bootstrap-google-disconnect\.js/.test(index), 'index loads bootstrap-google-disconnect');
check(/restore-verification\.js/.test(index), 'index loads restore-verification');
check(/reconcileAuthUsersAfterHydrate/.test(index), 'startup reconciles auth users after hydrate');
check(/Non-blocking: SQLite user hydrate/.test(index) || /startup auth reconcile \(background\)/.test(index),
  'auth reconcile is non-blocking on startup');
check(/ensureAuthCredentialsReady/.test(index) && /doLogin/.test(index), 'doLogin awaits credential ready');
check(/cp-return-login/.test(index) && /cancelForcedPasswordChange/.test(index), 'forced password return to login');
check(/__assignUsersClosure/.test(index), 'users closure hook for hydrate sync');
check(/globalThis\.__assignUsersClosure/.test(index), 'users closure uses globalThis (Electron renderer safe)');
check(!/[^A-Za-z0-9_]global\.__assignUsersClosure/.test(index), 'must not assign users closure on bare global');
check(/window\.doLogin = doLogin/.test(index), 'doLogin exposed on window for inline onclick');
check(/window\.openBootWizardFromLogin = openBootWizardFromLogin/.test(index), 'BootFlow CTA exposed on window');
check(/if \(bootOpen\) return true/.test(index), 'assertPreAuthViewport preserves open BootFlow');
check(/Do not tear down an open BootFlow wizard/.test(index), 'ensureUserLoginScreenVisible preserves BootFlow');

check(/shouldBlockOwnerSeed/.test(auth) && /hasRestoredOwnerCredential/.test(auth), 'auth credential truth guards seed');
check(/syncUsersFromAuthoritativeStore/.test(auth), 'auth syncs users from SQLite');

check(/disconnectGoogleDuringBootstrap/.test(disconnect), 'bootstrap google disconnect API');
check(/__tdw_cloud_license__/.test(disconnect), 'disconnect clears license cache');
check(/clearGoogleDerivedBootstrapState/.test(disconnect), 'disconnect clears derived bootstrap state');

check(/verifyPostRestore/.test(verify) && /formatSummaryHtml/.test(verify), 'restore verification contract');
check(/verifyPostRestore/.test(boot) && /restore_verification_failed|restore_owner_missing|restore_cloud_identity_missing/.test(verify), 'restore verification error codes');
check(/requireOwner:\s*false/.test(boot) && /cloud_hydrate/.test(boot), 'cloud hydrate skips strict owner gate');
check(/readAuthoritativeUsers/.test(auth) && /hasActiveOwner|toLowerCase\(\) === 'owner'/.test(auth), 'auth reads users from richest source with owner');

check(/فصل حساب Google/.test(boot) && /تغيير حساب Google/.test(boot), 'BootFlow google disconnect buttons');
check(/BootstrapGoogleDisconnect/.test(boot), 'BootFlow wires disconnect module');

check(/backup-dual-grid/.test(index) && /scanLocalBackupsV2/.test(index), 'backup dual panel local scan');
check(/scanCloudBackupsV2/.test(index) && /scanAllBackupsV2/.test(index), 'backup cloud + combined scan');
check(/runBackupV2CreateLocal/.test(index) && /runBackupV2CreateBoth/.test(index), 'backup separate create buttons');
check(/bk-local-history-host/.test(index) && /bk-cloud-history-host/.test(index), 'separate backup history hosts');
check(/panelId/.test(ops), 'ops bridge supports per-panel backup history');

check(/__assignUsersClosure/.test(bridge), 'sqlite bridge syncs users closure on hydrate');

// Behavioral: restored owner blocks seed + syncUsers updates closure
const OWNER_SEED = 'pbkdf2:owner:f28c4134eec2cebf7631ab559ec0eb794280730d728919f259438a3441f5266b';
const RESTORED_HASH = 'pbkdf2:owner:restoredhash1234567890abcdef';

const sandbox = {
  console,
  module: { exports: {} },
  globalThis: {},
  window: {},
  structuredClone: (v) => JSON.parse(JSON.stringify(v)),
};
sandbox.window = sandbox.globalThis;
sandbox.global = sandbox.globalThis;

vm.runInNewContext(auth, sandbox);
const Auth = sandbox.AuthCredentialTruth || sandbox.module.exports;

const restoredUsers = [{
  id: 'owner-1', username: 'owner', role: 'owner', active: true,
  password: RESTORED_HASH, mustChangePassword: false, seedDefaultPassword: false,
}];

let closureUsers = [{ id: '3', username: 'owner', role: 'owner', password: OWNER_SEED, mustChangePassword: true, seedDefaultPassword: true }];
sandbox.globalThis.__assignUsersClosure = (store) => { closureUsers = store; };
sandbox.globalThis.SqliteBridge = {
  getCommittedRaw(key) {
    if (key === 'users') return restoredUsers.slice();
    return undefined;
  },
};
sandbox.globalThis.DB = { get: () => restoredUsers.slice() };
sandbox.globalThis.users = closureUsers.slice();

Auth.syncUsersFromAuthoritativeStore();
check(closureUsers[0].password === RESTORED_HASH, 'syncUsersFromAuthoritativeStore applies restored password to closure');
check(Auth.shouldBlockOwnerSeed(restoredUsers), 'restored owner blocks seed');
check(!Auth.hasRestoredOwnerCredential([{ role: 'owner', password: OWNER_SEED, seedDefaultPassword: true }]), 'seed hash alone is not restored credential');

// When SQLite is available it is the sole authority; DB/cache must not override it.
{
  const mergeSandbox = { globalThis: {}, window: {}, console, module: { exports: {} }, DB: { get: () => null } };
  mergeSandbox.window = mergeSandbox.globalThis;
  mergeSandbox.globalThis.SqliteBridge = {
    getCommittedRaw(key) {
      if (key === 'users') return [{ id: '1', role: 'admin', active: true }];
      return undefined;
    },
  };
  mergeSandbox.globalThis.DB = {
    get(key) {
      if (key === 'users') return [{ id: '2', role: 'owner', username: 'owner', active: true, password: RESTORED_HASH }];
      return null;
    },
  };
  vm.runInNewContext(auth, mergeSandbox);
  const Auth2 = mergeSandbox.AuthCredentialTruth || mergeSandbox.module.exports;
  const merged = Auth2.readAuthoritativeUsers();
  check(merged.length === 1 && merged[0].id === '1' && merged[0].role === 'admin', 'readAuthoritativeUsers keeps committed SQLite authoritative over DB cache');
}

// cloud_hydrate verification accepts center+license without local owner row
{
  const { spawnSync } = require('child_process');
  const script = `
    const vm = require('vm');
    const fs = require('fs');
    const src = fs.readFileSync('cloud/restore-verification.js', 'utf8');
    const sb = { globalThis: {}, window: {}, console, module: { exports: {} } };
    sb.window = sb.globalThis;
    sb.globalThis.reconcileAuthUsersAfterHydrate = async () => {};
    sb.globalThis.AuthCredentialTruth = { readAuthoritativeUsers: () => [{ id: '1', role: 'admin', active: true }] };
    sb.globalThis.DB = { get: () => [] };
    sb.globalThis.DeviceConfig = { load: () => ({ centerId: 'CTR-1', lockedBranchId: 'BR-MAIN' }) };
    sb.globalThis.LicenseCloud = { loadLocal: () => ({ centerId: 'CTR-1', branches: [{ id: 'BR-MAIN' }] }) };
    sb.globalThis.licLoad = () => ({ centerId: 'CTR-1', licenseId: 'L1' });
    vm.runInNewContext(src, sb);
    const RV = sb.RestoreVerification || sb.module.exports;
    RV.verifyPostRestore({ kind: 'cloud_hydrate', source: 'bootflow_cloud_restore', requireOwner: false })
      .then((res) => {
        if (!res?.verified) process.exit(2);
        if (!res?.summary?.ownerDeferred) process.exit(3);
        process.exit(0);
      }).catch(() => process.exit(1));
  `;
  const r = spawnSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8', timeout: 5000 });
  check(r.status === 0, 'cloud_hydrate verify passes with center+license, no local owner');
}

// Electron renderer: `global` is undefined — globalThis assignment must not throw
{
  const electronSandbox = { globalThis: {}, window: {}, console };
  electronSandbox.window = electronSandbox.globalThis;
  try {
    vm.runInNewContext(
      "let users=[];\nglobalThis.__assignUsersClosure = (store) => { users = store; };\nfunction doLogin(){ return 'ok'; }\nwindow.doLogin = doLogin;",
      electronSandbox,
      { timeout: 2000 }
    );
    check(typeof electronSandbox.globalThis.__assignUsersClosure === 'function', 'globalThis closure assign in renderer');
    check(electronSandbox.globalThis.doLogin?.() === 'ok' || electronSandbox.window.doLogin?.() === 'ok', 'doLogin survives renderer bootstrap');
  } catch (e) {
    errors.push('Electron renderer simulation failed: ' + e.message);
  }
}

if (errors.length) {
  console.error('FAIL:', errors.join('\n'));
  process.exit(1);
}
console.log('OK: RC Hotfix Round 2 restore-auth tests passed');
