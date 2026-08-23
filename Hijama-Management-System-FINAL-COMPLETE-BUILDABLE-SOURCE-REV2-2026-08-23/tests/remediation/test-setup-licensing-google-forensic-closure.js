#!/usr/bin/env node
'use strict';

/*
 * Regression closure for the independent Setup/Licensing/Google forensic audit.
 * These tests are intentionally offline: they validate fail-closed contracts and
 * do not simulate a successful Google, Drive, Vault, or Sheets production call.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function dbStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get(key, fallback) { return data.has(key) ? data.get(key) : fallback; },
    set(key, value) { data.set(key, value); return value; },
    remove(key) { data.delete(key); },
  };
}

function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

function makeContext(overrides = {}) {
  const ctx = {
    console,
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Promise,
    Map,
    Set,
    localStorage: storage(),
    sessionStorage: storage(),
    DB: dbStore(),
    settings: { backup: { cloudProvider: 'google', providers: { google: {} } } },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      body: { classList: { toggle: () => {} } },
      createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} }, appendChild: () => {}, setAttribute: () => {} }),
      head: { appendChild: () => {} },
      activeElement: null,
    },
    window: null,
    ...overrides,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  return ctx;
}

function load(ctx, rel) {
  vm.runInNewContext(read(rel), ctx, { filename: rel });
}

(async () => {
  const index = read('index.html');
  const bootSource = read('cloud/boot-flow-ui.js');
  const disconnectSource = read('cloud/bootstrap-google-disconnect.js');
  const stateSource = read('cloud/setup-state-service.js');
  const stateDomSource = read('cloud/setup-state-dom.js');
  const discoverySource = read('electron/cloud-data-discovery.js');
  const cloudV2Source = read('cloud/cloud-v2-init.js');

  // FSA-SRC-001: explicit input/surfaces contract prevents legacy selector bleed.
  assert.match(index, /async function licApplyRenewal\(inputCode, surfaces\)/);
  assert.match(bootSource, /global\.licApplyRenewal\(key, \{[\s\S]*bf-license-error[\s\S]*bf-license-ok/);
  assert.doesNotMatch(bootSource, /global\.licApplyRenewal\(key\);/);

  // FSA-SRC-003: both migration normalizer and disconnect use canonical index.
  assert.match(disconnectSource, /w\.currentStep = 1;/);
  const wizardCtx = makeContext();
  load(wizardCtx, 'cloud/boot-flow-ui.js');
  assert.strictEqual(wizardCtx.BootFlow.normalizeWizardState({ path: 'new', currentStep: 'google' }).currentStep, 1);
  assert.strictEqual(wizardCtx.BootFlow.normalizeWizardState({ path: 'existing', currentStep: 'branch_select' }).currentStep, 4);
  assert.strictEqual(wizardCtx.BootFlow.normalizeWizardState({ path: 'new', currentStep: 'unknown' }).currentStep, 0);

  const disconnectCtx = makeContext({
    settings: { backup: { cloudProvider: 'google', providers: { google: { connected: true, oauth: true } } } },
  });
  disconnectCtx.localStorage.setItem('__tdw_boot_wizard__', JSON.stringify({ path: 'new', currentStep: 'google', completedSteps: ['language', 'google', 'license'] }));
  load(disconnectCtx, 'cloud/bootstrap-google-disconnect.js');
  const disconnected = await disconnectCtx.BootstrapGoogleDisconnect.disconnectGoogleDuringBootstrap({ force: true });
  assert.strictEqual(disconnected.ok, true);
  assert.strictEqual(disconnectCtx.DB.get('__tdw_boot_wizard__').currentStep, 1);

  // FSA-SRC-004: cache-only settings cannot become a Google eligibility signal.
  let liveStatus = { connected: false, needsReauth: true, email: 'cached@example.invalid' };
  const driveCtx = makeContext({
    settings: { backup: { cloudProvider: 'google', cloudEnabled: true, providers: { google: { connected: true, oauth: true, email: 'cached@example.invalid' } } } },
    BackupBridge: { isElectron: () => true, getCloudStatus: async () => liveStatus },
  });
  load(driveCtx, 'cloud/drive-adapter.js');
  assert.strictEqual(driveCtx.DriveAdapter.isConnected(), false, 'no verified snapshot must fail closed');
  await driveCtx.DriveAdapter.refreshAuthoritativeConnection();
  assert.strictEqual(driveCtx.DriveAdapter.isConnected(), false, 'needsReauth from main must override cache');
  liveStatus = { connected: true, needsReauth: false, email: 'live@example.invalid', oauth: true, hasRefreshToken: true };
  await driveCtx.DriveAdapter.refreshAuthoritativeConnection();
  assert.strictEqual(driveCtx.DriveAdapter.isConnected(), true, 'verified main status enables connection');
  const stale = driveCtx.DB.get(driveCtx.DriveAdapter.GOOGLE_AUTHORITY_KEY);
  stale.checkedAt = new Date(Date.now() - driveCtx.DriveAdapter.AUTHORITY_MAX_AGE_MS - 1).toISOString();
  driveCtx.DB.set(driveCtx.DriveAdapter.GOOGLE_AUTHORITY_KEY, stale);
  assert.strictEqual(driveCtx.DriveAdapter.isConnected(), false, 'stale verified snapshot must fail closed');

  // FSA-SRC-007: authorized identity mismatch is rejected before first binding.
  const identityCtx = makeContext({
    DriveAdapter: { authoritySnapshot: () => ({ verified: true, connected: true, needsReauth: false, stale: false, email: 'different@example.invalid' }) },
    LicenseCloud: {
      loadLocal: () => ({ centerId: 'C-1', ownerIdentity: { authorizedEmail: 'authorized@example.invalid', boundGoogleEmail: null } }),
    },
  });
  load(identityCtx, 'cloud/license-identity.js');
  const mismatch = await identityCtx.LicenseIdentity.verifyGoogleBinding();
  assert.deepStrictEqual({ ok: mismatch.ok, error: mismatch.error }, { ok: false, error: 'google_email_mismatch' });
  const bindMismatch = await identityCtx.LicenseIdentity.bindGoogleAccount('different@example.invalid');
  assert.deepStrictEqual({ ok: bindMismatch.ok, error: bindMismatch.error }, { ok: false, error: 'google_email_mismatch' });

  // FSA-SRC-006: local fallback is labelled remote-pending, not a silent online success.
  const gateCtx = makeContext({
    DriveAdapter: { ensureConnected: async () => true, isConnected: () => true },
    GoogleSheetsOps: { activate: async () => ({ ok: false, code: 'rate_limit', message: 'rate limit' }) },
  });
  load(gateCtx, 'cloud/license-activation-gate.js');
  const gate = await gateCtx.LicenseActivationGate.preActivateCheck({ licenseId: 'L-1', branches: 1 }, { productKey: 'V5-LOCAL', requireGoogle: false });
  assert.strictEqual(gate.ok, true);
  assert.strictEqual(gate.pendingRemoteConfirmation, true);
  assert.strictEqual(gate.remoteConfirmationReason, 'vault_unreachable');

  // FSA-SRC-010: failed Drive publish remains explicitly pending and cannot stamp local cache as published.
  const cloudCtx = makeContext({
    DriveLayout: { licenseJson: (centerId) => `centers/${centerId}/license.json` },
    DriveAdapter: { ensureConnected: async () => true, isConnected: () => true, uploadJson: async () => ({ ok: false, error: 'offline', offline: true }) },
  });
  load(cloudCtx, 'cloud/license-cloud.js');
  const original = { centerId: 'C-1', licenseId: 'L-1', updatedAt: 'before-upload' };
  cloudCtx.LicenseCloud.saveLocal(original);
  const failedPush = await cloudCtx.LicenseCloud.pushToDrive({ ...original, updatedAt: 'upload-candidate' }, { skipOwnerGate: true });
  assert.strictEqual(failedPush.pendingRemote, true);
  assert.strictEqual(failedPush.remotePublished, false);
  assert.strictEqual(cloudCtx.LicenseCloud.loadLocal().updatedAt, 'before-upload');
  assert.strictEqual(cloudCtx.LicenseCloud.getRemoteReplicationStatus().state, 'pending');

  const offlineCtx = makeContext({
    DriveLayout: { licenseJson: (centerId) => `centers/${centerId}/license.json` },
    DriveAdapter: { ensureConnected: async () => false, isConnected: () => false },
  });
  load(offlineCtx, 'cloud/license-cloud.js');
  const offlinePush = await offlineCtx.LicenseCloud.pushToDrive({ centerId: 'C-2', licenseId: 'L-2' }, { skipOwnerGate: true });
  assert.strictEqual(offlinePush.pendingRemote, true);
  assert.strictEqual(offlinePush.remotePublished, false);
  assert.strictEqual(offlineCtx.LicenseCloud.getRemoteReplicationStatus().error, 'drive_not_connected');

  // FSA-SRC-005 and FSA-SRC-008 source contracts.
  assert.doesNotMatch(stateSource, /ERROR_RECOVERABLE/);
  assert.doesNotMatch(stateDomSource, /ERROR_RECOVERABLE/);
  assert.match(discoverySource, /if \(listed\?\.truncated\) \{[\s\S]*out\.partialScan = true/);
  assert.match(discoverySource, /لم تُفحص كل صفحات Drive/);
  assert.match(discoverySource, /لا يمكن الجزم بعدم وجود نسخة/);
  assert.match(bootSource, /const cloudPartial = !!\(cloud\.partialScan \|\| cloud\.timedOut\)/);
  assert.match(bootSource, /القائمة ليست كاملة/);
  assert.match(cloudV2Source, /return !!global\.DriveAdapter\?\.isConnected\?\.\(\);/);
  assert.doesNotMatch(cloudV2Source, /cloudEnabled && prov\?\.connected/);

  console.log('PASS: forensic Setup/Licensing/Google remediation closure contracts');
})().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
