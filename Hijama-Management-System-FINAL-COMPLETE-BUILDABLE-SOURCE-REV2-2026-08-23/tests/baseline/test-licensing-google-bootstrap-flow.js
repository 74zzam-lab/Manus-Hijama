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

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const driveAdapter = fs.readFileSync(path.join(root, 'cloud', 'drive-adapter.js'), 'utf8');
const gate = fs.readFileSync(path.join(root, 'cloud', 'license-activation-gate.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'cloud', 'bootstrap.js'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'cloud', 'boot-flow-ui.js'), 'utf8');
const googleDrive = fs.readFileSync(path.join(root, 'electron', 'cloud-providers', 'google-drive.js'), 'utf8');
const ownerHub = fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8');

check(html.includes('style="display:none" hidden') && html.includes('login-drive-branch-fields'),
  'login branch fields must start hidden');
check(html.includes('lic-drive-branch-fields') && html.includes('display:none" hidden'),
  'license branch fields must start hidden');
check(html.includes('confirmDriveBootstrapDeviceHydrate'), 'confirmDriveBootstrapDeviceHydrate missing');
check(html.includes('connectGoogleDriveOnly'), 'connectGoogleDriveOnly missing');
check(html.includes('ربط Google فقط'), 'connect-only CTA missing');
check(html.includes('سحب الترخيص أولاً'), 'copy must say pull license first');
check(!html.includes('الترخiص'), 'typo الترخiص must be fixed');
check(/if \(p\.userDisconnected\)/.test(html), 'syncCloudStatusFromElectron must key off userDisconnected only');
check(!/p\.userDisconnected \|\| p\.connected === false/.test(html), 'must not force-disconnect when connected===false');

check(driveAdapter.includes('ensureConnected'), 'DriveAdapter.ensureConnected missing');
check(gate.includes('ensureConnected'), 'activation gate must refresh Google via ensureConnected');
check(gate.includes('drivePush'), 'commitActivation must report drivePush');
check(bootstrap.includes('NajjarTech Hijama Management'), 'discovery must also scan legacy Drive root');
check(bootstrap.includes('licenseJsonCandidates'), 'fetch must try path candidates');
check(googleDrive.includes('items.slice(0, 500)'), 'listBackups must keep enough files to find license.json');
check(googleDrive.includes('aLic'), 'listBackups must prioritize license.json');

check(boot.includes('hasGoogle()') && boot.includes('license'), 'boot wizard must allow Google-then-license (primary device)');
check(boot.includes('oauthInFlight'), 'boot must prevent duplicate OAuth clicks');
check(html.includes('window.connectGoogleDriveOnly'), 'connectGoogleDriveOnly must be on window');
check(html.includes('window.confirmDriveBootstrapDeviceHydrate'), 'confirm hydrate must be on window');
check(html.includes('needsDeviceLock'), 'bootstrap must pause for branch/device choice');
check(html.includes('primaryHint'), 'no_license_on_drive must give primary-device hint');
check(ownerHub.includes('ما زال صالحاً ولم يُعطَّل'), 'Owner Hub must clarify V5/legacy license remains valid');

const sandbox = {
  console,
  settings: {
    backup: {
      cloudProvider: 'google',
      cloudEnabled: false,
      providers: { google: { connected: false, email: '', oauth: false } }
    }
  },
  DB: { set() {}, get() { return null; } },
  BackupBridge: {
    isElectron: () => true,
    getCloudStatus: async () => ({ connected: true, email: 'owner@clinic.test', oauth: true, hasRefreshToken: true })
  }
};
sandbox.global = sandbox;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(driveAdapter, sandbox, { timeout: 1000 });
check(!!sandbox.DriveAdapter?.ensureConnected, 'ensureConnected export missing');

(async () => {
  const ok = await sandbox.DriveAdapter.ensureConnected();
  check(ok === true, 'ensureConnected should return true after live OAuth sync');
  check(sandbox.settings.backup.providers.google.connected === true, 'settings.google.connected should sync');
  check(sandbox.DriveAdapter.isConnected() === true, 'isConnected should be true after ensureConnected');

  // Gate: requireGoogle must pass after ensureConnected sync
  sandbox.LicenseLimits = { hasCloudSyncFeature: () => false };
  sandbox.LicenseVaultClient = null;
  sandbox.DeviceConfig = { ensureDeviceUuid: () => 'dev-1', load: () => ({ deviceUuid: 'dev-1' }) };
  sandbox.licGetFingerprint = () => 'fp';
  vm.runInNewContext(gate, sandbox, { timeout: 1000 });
  const pre = await sandbox.LicenseActivationGate.preActivateCheck(
    { branches: 2, deviceBinding: 'DEVICE_ANY', licenseId: 'L1' },
    { requireGoogle: true, productKey: '' }
  );
  check(pre.ok === true, 'preActivateCheck must succeed when Google is connected via ensureConnected');

  if (errors.length) {
    console.error('FAIL: licensing google bootstrap flow');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('OK: licensing google bootstrap flow checks');
})().catch((e) => {
  console.error('FAIL: licensing google bootstrap flow');
  console.error(' -', e.message || e);
  process.exit(1);
});
