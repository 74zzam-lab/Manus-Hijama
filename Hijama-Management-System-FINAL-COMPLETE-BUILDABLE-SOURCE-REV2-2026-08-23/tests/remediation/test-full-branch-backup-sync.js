#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');

function loadScript(rel, ctx) {
  vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx, { filename: rel });
}

const settingsCtx = {
  console,
  settings: {
    centerName: 'مركز الحجامة',
    overdueTemplate: 'لم نرك منذ فترة',
    cupPrice: 70,
    siliconFacePrice: 120,
    backup: { providers: { google: { tokenEnc: 'secret' } } },
    cloudV2Enabled: true,
    devices: { thermal: { name: 'local-printer' } },
  },
};
settingsCtx.window = settingsCtx;
settingsCtx.globalThis = settingsCtx;
loadScript('cloud/settings-split.js', settingsCtx);

const packSettings = settingsCtx.SettingsSplit.extractBranchSettings(settingsCtx.settings);
assert.strictEqual(packSettings.centerName, 'مركز الحجامة');
assert.strictEqual(packSettings.overdueTemplate, 'لم نرك منذ فترة');
assert.strictEqual(packSettings.cupPrice, 70);
assert.strictEqual(packSettings.siliconFacePrice, 120);
assert.strictEqual(packSettings.backup, undefined, 'device backup tokens stay local');
assert.strictEqual(packSettings.devices, undefined, 'printer/device config stays local');
assert.strictEqual(packSettings.cloudV2Enabled, undefined);

const prices = settingsCtx.SettingsSplit.extractPrices(settingsCtx.settings);
assert.strictEqual(prices.cupPrice, 70);
assert.strictEqual(prices.siliconFacePrice, 120);
assert.strictEqual(prices.vatRate, undefined, 'missing price keys are not invented as defaults');

const driveCtx = {
  console,
  Date,
  settings: {
    backup: {
      cloudProvider: 'google',
      cloudEnabled: true,
      providers: {
        google: {
          connected: true,
          oauth: true,
          email: '7uzzam@gmail.com',
          hasRefreshToken: true,
        },
      },
    },
  },
  DB: {
    store: {},
    get(key, fallback) { return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : fallback; },
    set(key, value) { this.store[key] = value; return value; },
  },
  BackupBridge: {
    isElectron: () => true,
    getCloudStatus: async () => ({ connected: false, error: 'temporary', ok: false }),
  },
};
driveCtx.window = driveCtx;
driveCtx.globalThis = driveCtx;
loadScript('cloud/drive-adapter.js', driveCtx);

assert.strictEqual(driveCtx.DriveAdapter.isConnectedFromSettings(), true);
const preserved = driveCtx.DriveAdapter.persistAuthorityStatus(
  { connected: false, error: 'timeout' },
  'main_status_failed'
);
assert.strictEqual(preserved.connected, true, 'transient live miss must keep Google connected');
assert.strictEqual(driveCtx.settings.backup.providers.google.email, '7uzzam@gmail.com');

const reauthCtx = {
  console,
  Date,
  settings: {
    backup: {
      cloudProvider: 'google',
      providers: { google: { connected: true, oauth: true, email: 'cached@example.invalid' } },
    },
  },
  DB: {
    store: {},
    get(key, fallback) { return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : fallback; },
    set(key, value) { this.store[key] = value; return value; },
  },
};
reauthCtx.window = reauthCtx;
reauthCtx.globalThis = reauthCtx;
loadScript('cloud/drive-adapter.js', reauthCtx);
const reauth = reauthCtx.DriveAdapter.persistAuthorityStatus(
  { connected: false, needsReauth: true },
  'main_status'
);
assert.strictEqual(reauth.connected, false, 'true reauth without refresh token still disconnects');

const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(indexSrc, /function enrichBackupStatusSummary/, 'backup summary reads V2 schedule and file dates');
assert.match(indexSrc, /st\?\.needsReauth && !st\?\.hasRefreshToken/, 'Google UI stays connected through transient status');
assert.doesNotMatch(indexSrc, /else if \(p\.connected\) \{\s*settings\.backup\.providers\[prov\] = \{ \.\.\.p, connected: false/, 'must not flip Google off on a live miss');

const rbac = require('../../electron/rbac-session');
assert.ok(rbac.PUBLIC_CHANNELS.has('backup:v2:scheduleStatus'), 'schedule status is readable without a classified-channel deny');

const ipcSrc = fs.readFileSync(path.join(root, 'electron/backup-v2-ipc.js'), 'utf8');
assert.match(ipcSrc, /Tadawi-Backup-V2-scheduled-latest\.tdw/, 'scheduled backup replaces the previous automatic file');
assert.match(ipcSrc, /overwrite: true/, 'Drive upload overwrites the current automatic archive');

const configSrc = fs.readFileSync(path.join(root, 'cloud/config-layer.js'), 'utf8');
assert.match(configSrc, /services\.slice\(\)/, 'config pack includes inactive services');
assert.match(configSrc, /persistImportedBranchSettings/, 'pulled center settings are written into the branch store');

const restoreSrc = fs.readFileSync(path.join(root, 'cloud/restore-runtime-rehydrate.js'), 'utf8');
assert.match(restoreSrc, /persistBranchSettings/, 'restore seeds branch settings from the restored snapshot');

console.log('PASS remediation:full-branch-backup-sync');
