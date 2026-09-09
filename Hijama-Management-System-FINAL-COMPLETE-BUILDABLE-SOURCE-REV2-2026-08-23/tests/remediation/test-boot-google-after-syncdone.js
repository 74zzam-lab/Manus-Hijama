#!/usr/bin/env node
'use strict';

/**
 * After initial sync is recorded, BootFlow ready must still see Google as connected.
 * RBAC bootstrap for getCloudStatus lasts until activation restart, not syncDone.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const bootstrap = require(path.join(root, 'electron/bootstrap-restore-capability.js'));

let kv = { '__tdw_boot_wizard__': { path: 'new', currentStep: 7, syncDone: true } };
bootstrap.configure({
  readKv: (key) => kv[key] ?? null,
});
assert.strictEqual(bootstrap.isBootstrapPhase(), false, 'restore bootstrap ends at syncDone');
assert.strictEqual(bootstrap.isActivationBootstrapPhase(), true, 'Google IPC bootstrap continues until boot complete');

kv['__tdw_boot_complete__'] = '1';
assert.strictEqual(bootstrap.isActivationBootstrapPhase(), false, 'activation bootstrap ends after boot complete');

const driveSrc = fs.readFileSync(path.join(root, 'cloud/drive-adapter.js'), 'utf8');
const settings = {
  backup: {
    cloudProvider: 'google',
    providers: { google: { connected: true, oauth: true, email: 'owner@clinic.test', hasRefreshToken: true } },
  },
};
const sandbox = {
  console,
  globalThis: {
    settings,
    DB: {
      _data: {},
      get(key, fallback) {
        if (key === 'settings') return settings;
        return this._data[key] != null ? this._data[key] : fallback;
      },
      set(key, value) { this._data[key] = value; return { ok: true }; },
    },
    BackupBridge: {
      isElectron: () => true,
      getCloudStatus: async () => ({ ok: false, error: 'rbac_bootstrap_phase_required' }),
    },
  },
};
sandbox.window = sandbox.globalThis;
vm.runInNewContext(driveSrc, sandbox, { filename: 'drive-adapter.js' });

(async () => {
  const snap = await sandbox.globalThis.DriveAdapter.refreshAuthoritativeConnection();
  assert.strictEqual(snap.connected, true, 'denied cloud status must not clobber Google');
  assert.strictEqual(sandbox.globalThis.settings.backup.providers.google.connected, true);

  const bootSrc = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
  const bootSb = {
    console,
    document: { getElementById: () => null, querySelector: () => null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    globalThis: {
      settings: { backup: { providers: { google: {} } } },
      DB: {
        get: (key, fallback) => (key === '__tdw_boot_wizard__'
          ? { path: 'new', currentStep: 7, completedSteps: ['language', 'google', 'license'], syncDone: true }
          : fallback),
        set() {},
      },
    },
  };
  bootSb.window = bootSb.globalThis;
  bootSb.document.addEventListener = () => {};
  vm.runInNewContext(bootSrc, bootSb, { filename: 'boot-flow-ui.js' });
  assert.strictEqual(bootSb.globalThis.BootFlow.hasGoogle(), true, 'ready step must keep Google after wizard passed it');
  console.log('PASS remediation:boot-google-after-syncdone');
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
