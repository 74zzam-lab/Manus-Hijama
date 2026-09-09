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

const csp = fs.readFileSync(path.join(root, 'electron', 'security', 'window-policy.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
const nsh = fs.readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8');
const vaultSrc = fs.readFileSync(path.join(root, 'cloud', 'license-vault-client.js'), 'utf8');
const gateSrc = fs.readFileSync(path.join(root, 'cloud', 'license-activation-gate.js'), 'utf8');
const prepSrc = fs.readFileSync(path.join(root, 'electron', 'uninstall-prep.js'), 'utf8');

check(csp.includes('script.google.com'), 'CSP must allow script.google.com for license vault');
check(csp.includes('script.googleusercontent.com'), 'CSP must allow script.googleusercontent.com');
check(main.includes('WIPE_ONLY_TARGET'), 'main must honor wipe-only userData target');
check(/if \(WIPE_ONLY_TARGET\)[\s\S]*setPath\('userData',\s*WIPE_ONLY_TARGET\)/.test(main),
  'wipe-only must setPath to wipe target (not override with Cupping Center)');
check(prepSrc.includes('wipeChromiumLicenseStorage'), 'uninstall-prep must wipe Chromium storage on disk');
check(prepSrc.includes('Local Storage'), 'uninstall-prep must target Local Storage');
check(nsh.includes('nt_fw_verify_ok') || nsh.includes('Force-removing Cupping Center'), 'NSIS must retain force-wipe helpers for explicit full removal');
check(nsh.includes('customRemoveFiles'), 'NSIS must use customRemoveFiles before INSTDIR delete');
check(nsh.includes('UPDATE detected — preserving Cupping Center userData'), 'Upgrade must preserve Cupping Center userData');
check(nsh.includes('rmdir /S /Q') || nsh.includes('rmdir /s /q'), 'NSIS must use cmd rmdir for Cupping Center');
check(prepSrc.includes('wipeLicenseFromLegacyUserDataRoots'), 'uninstall-prep must support license wipe helper for authorized reset');
check(prepSrc.includes('licensePreserved: true') || prepSrc.includes('preserved: true'), 'default uninstall-prep must preserve live root');
check(nsh.includes('App-only uninstall — preserving ALL'), 'NSIS app-only must not wipe license');
check(vaultSrc.includes('skipped: true') && vaultSrc.includes('vault_unreachable'),
  'vault client must soft-skip network failures');
check(gateSrc.includes('softNet') || gateSrc.includes('vault_unreachable'),
  'activation gate must soft-handle vault network failures');

// Runtime: Failed to fetch must not hard-fail activation gate
{
  const sandbox = {
    console,
    settings: { backup: { providers: { google: { connected: true, oauth: true } } } },
    DriveAdapter: { isConnected: () => true, ensureConnected: async () => true },
    LicenseLimits: { hasCloudSyncFeature: () => false },
    DeviceConfig: { ensureDeviceUuid: () => 'd1', load: () => ({ deviceUuid: 'd1' }) },
    licGetFingerprint: () => 'fp',
    LicenseVaultClient: {
      activateOnVault: async () => ({
        ok: false,
        error: 'vault_unreachable',
        message: 'Failed to fetch'
      })
    }
  };
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(gateSrc, sandbox, { timeout: 1000 });
  Promise.resolve(
    sandbox.LicenseActivationGate.preActivateCheck(
      { licenseId: 'L1', branches: 1, deviceBinding: 'DEVICE_ANY', productKey: 'X' },
      { requireGoogle: false, productKey: 'X' }
    )
  ).then((res) => {
    check(res.ok === true, 'preActivateCheck must soft-skip Failed to fetch vault errors');
    finish();
  }).catch((e) => {
    errors.push('gate runtime: ' + e.message);
    finish();
  });
}

function finish() {
  if (errors.length) {
    console.error('FAIL: vault-csp-uninstall-wipe');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('OK: vault CSP + uninstall wipe checks');
}
