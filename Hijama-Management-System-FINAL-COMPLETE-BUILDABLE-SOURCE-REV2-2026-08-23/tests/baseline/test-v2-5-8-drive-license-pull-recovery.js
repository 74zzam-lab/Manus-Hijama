#!/usr/bin/env node
'use strict';

/**
 * V2-5.8 — Google Drive License Pull recovery (Developer Tools).
 * Unit/static + sandbox behavioral checks. Live Windows Setup EXE remains mandatory.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

const css = fs.readFileSync(path.join(root, 'renderer/styles/design-system.css'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'license/ui/developer-panel.js'), 'utf8');
const bootstrapSrc = fs.readFileSync(path.join(root, 'cloud/bootstrap.js'), 'utf8');
const legacySrc = fs.readFileSync(path.join(root, 'cloud/license-legacy-bridge.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const smoke = fs.readFileSync(path.join(root, 'docs/integration-v2-5-8/LIVE-PRODUCTION-SMOKE.md'), 'utf8');

// Root cause: 9df1abe hid #lic-drive-bootstrap-panel globally — recovery must stay visible.
check(/#login-drive-bootstrap-panel\s*\{[^}]*display:\s*none\s*!important/.test(css), 'login duplicate panel remains hidden');
check(!/#login-drive-bootstrap-panel\s*,\s*#lic-drive-bootstrap-panel\s*\{[^}]*display:\s*none/.test(css), 'lic-drive panel must not share global hide with login');
check(!/#lic-drive-bootstrap-panel\s*\{[^}]*display:\s*none\s*!important/.test(css), 'lic-drive recovery panel not globally hidden');

check(/License Recovery/.test(panel) && /Pull License from Google Drive/.test(panel), 'Developer Tools License Recovery UI');
check(/renderLicenseRecoverySection/.test(panel), 'renderLicenseRecoverySection present');
check(/lic-devtools-drive-pull-btn/.test(panel), 'devtools pull button id');
check(/loginConnectGoogleAndBootstrap/.test(panel), 'recovery wires existing bootstrap path');
check(/حتى مع وجود Owner|اكتمال التفعيل/.test(panel), 'recovery visible when Owner/activation complete');

check(/listLicensesFromDrive/.test(bootstrapSrc), 'listLicensesFromDrive exported path');
check(/multiple_licenses/.test(bootstrapSrc), 'multi-license selection signal');
check(/needsSelection/.test(bootstrapSrc), 'needsSelection flag');
check(/foreign_organization/.test(bootstrapSrc), 'foreign org confirm gate');
check(/persistPulledLicense/.test(bootstrapSrc), 'persistPulledLicense');
check(/assertGoogleMayPullLicense/.test(bootstrapSrc), 'google account assert before persist');
check(/classifyDrivePullError/.test(bootstrapSrc), 'drive error classification');
check(/drive_rate_limit|oauth_unauthorized|drive_forbidden/.test(bootstrapSrc), '401/403/rate-limit mapping');

check(/Verify \+ build FIRST|buildLegacyLicenseFromCloudDoc\(doc\)/.test(legacySrc), 'legacy bridge verifies before save');
check(/multiple_licenses/.test(html) && /renderDriveLicenseCandidates/.test(html), 'UI multi-license picker');
check(/preservedLocal/.test(html), 'failed pull preserves local');
check(/lic-drive-bootstrap-candidates/.test(html), 'license screen candidates host');
check(/refreshAfterLicensePull/.test(html), 'refresh license/owner after pull');

check(/License Pull Recovery|Pull License from Google Drive/i.test(smoke), 'LIVE smoke covers Drive pull recovery');
check(/Ready for main:\s*NO/i.test(smoke), 'smoke still Ready for main: NO');

// Behavioral sandbox
const store = { cloud: null, legacy: null, meta: {} };
const sandbox = {
  console,
  settings: { backup: { providers: { google: { connected: true, email: 'owner@clinic.test', oauth: true } } }, centerName: 'Clinic A' },
  DB: {
    get(k, d) {
      if (k === '__tdw_cloud_license__') return store.cloud;
      return d == null ? null : d;
    },
    set(k, v) {
      if (k === '__tdw_cloud_license__') store.cloud = v;
      if (k === 'settings') sandbox.settings = v;
    }
  },
  CloudMeta: {
    loadMeta() { return { ...store.meta }; },
    saveMeta(m) { store.meta = { ...m }; },
    isCloudV2Enabled() { return true; }
  },
  CenterId: {
    getStoredCenterId() { return store.meta.centerId || ''; },
    isValidCenterId(id) { return !!id && String(id).length > 2; },
    ensureCenterId(id) { return id; }
  },
  DriveLayout: {
    ROOT: 'NajjarTech',
    licenseJson(cid) { return `NajjarTech/${cid}/License/license.json`; },
    licenseJsonCandidates(cid) { return [`NajjarTech/${cid}/License/license.json`]; }
  },
  DriveAdapter: {
    isConnected() { return true; },
    ensureConnected: async () => true,
    downloadJson: async () => ({ ok: false }),
    downloadJsonFirst: async () => ({ ok: false })
  },
  BackupBridge: {
    listCloudBackups: async () => ({ ok: true, items: [] }),
    downloadCloudBackup: async () => ({ ok: false })
  },
  LicenseCloud: null,
  LicenseIdentity: {
    getConnectedGoogleEmail() { return 'owner@clinic.test'; }
  },
  DeviceConfig: { ensureDeviceConfig() {} },
  BranchScope: {},
  SyncGuard: {},
  SyncEngine: {},
  SyncState: {},
  DeviceCache: {},
  OwnerManagement: { setSystemBusy() {}, clearSystemBusy() {} }
};
sandbox.global = sandbox;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.runInNewContext(fs.readFileSync(path.join(root, 'cloud/license-cloud.js'), 'utf8'), sandbox, { timeout: 2000 });
// Minimal verify: accept docs with signature === 'SIG-OK'
sandbox.LicenseCloud.verifyLicenseDoc = async (doc) => {
  if (!doc?.signature) return { ok: false, error: 'signature_missing' };
  if (doc.signature !== 'SIG-OK') return { ok: false, error: 'signature_invalid' };
  return { ok: true };
};
sandbox.LicenseCloud.saveLocal = (doc) => {
  store.cloud = doc;
  if (doc?.centerId) store.meta.centerId = doc.centerId;
  return doc;
};
sandbox.LicenseCloud.loadLocal = () => store.cloud;

vm.runInNewContext(bootstrapSrc, sandbox, { timeout: 3000 });
check(!!sandbox.CloudBootstrap?.listLicensesFromDrive, 'listLicensesFromDrive export');
check(!!sandbox.CloudBootstrap?.discoverAndFetchLicenseFromDrive, 'discover export');

(async () => {
  // 1) No license on Drive
  let res = await sandbox.CloudBootstrap.discoverAndFetchLicenseFromDrive({ forceList: true });
  check(res.ok === false && res.error === 'no_license_on_drive', 'empty Drive → no_license_on_drive');
  check(store.cloud == null, 'empty Drive must not create blank local license');

  // 2) Corrupt signature rejected without persist
  const bad = { centerId: 'CTR-BAD', centerName: 'Bad', licenseId: 'L-BAD', expiresAt: '2099-01-01', signature: 'NOPE' };
  sandbox.BackupBridge.listCloudBackups = async () => ({
    ok: true,
    items: [{ name: 'license.json', path: 'NajjarTech/CTR-BAD/License/license.json', modifiedAt: '2026-01-02' }]
  });
  sandbox.BackupBridge.downloadCloudBackup = async () => ({ ok: true, text: JSON.stringify(bad) });
  res = await sandbox.CloudBootstrap.discoverAndFetchLicenseFromDrive({ forceList: true });
  check(res.ok === false && res.error === 'no_license_on_drive', 'corrupt-only scan → no valid license');
  check(store.cloud == null, 'corrupt must not persist');

  // 3) Single valid license persists
  const goodA = {
    centerId: 'CTR-A', centerName: 'Alpha Clinic', licenseId: 'L-A',
    expiresAt: '2099-06-01', ownerIdentity: { authorizedEmail: 'owner@clinic.test' }, signature: 'SIG-OK'
  };
  sandbox.BackupBridge.listCloudBackups = async () => ({
    ok: true,
    items: [{ name: 'license.json', path: 'NajjarTech/CTR-A/License/license.json', modifiedAt: '2026-02-01' }]
  });
  sandbox.BackupBridge.downloadCloudBackup = async (p) => ({ ok: true, text: JSON.stringify(goodA) });
  res = await sandbox.CloudBootstrap.discoverAndFetchLicenseFromDrive({ forceList: true });
  check(res.ok === true && res.license?.centerId === 'CTR-A', 'single license pulled');
  check(store.cloud?.centerId === 'CTR-A', 'single license persisted locally');

  // 4) Multiple licenses → needsSelection, no auto-pick overwrite
  const goodB = {
    centerId: 'CTR-B', centerName: 'Beta Clinic', licenseId: 'L-B',
    expiresAt: '2099-07-01', ownerIdentity: { authorizedEmail: 'owner@clinic.test' }, signature: 'SIG-OK'
  };
  sandbox.BackupBridge.listCloudBackups = async () => ({
    ok: true,
    items: [
      { name: 'license.json', path: 'NajjarTech/CTR-A/License/license.json', modifiedAt: '2026-02-02' },
      { name: 'license.json', path: 'NajjarTech/CTR-B/License/license.json', modifiedAt: '2026-02-03' }
    ]
  });
  sandbox.BackupBridge.downloadCloudBackup = async (p) => {
    if (String(p).includes('CTR-B')) return { ok: true, text: JSON.stringify(goodB) };
    return { ok: true, text: JSON.stringify(goodA) };
  };
  // Clear stored center so direct fetch is skipped
  store.meta.centerId = '';
  store.cloud = { ...goodA };
  res = await sandbox.CloudBootstrap.discoverAndFetchLicenseFromDrive({ forceList: true });
  check(res.ok === false && res.error === 'multiple_licenses' && res.needsSelection, 'multi → needsSelection');
  check(Array.isArray(res.candidates) && res.candidates.length >= 2, 'multi returns candidate list');
  check(res.candidates.every(c => c.centerId && c.centerName), 'candidates include org/center');
  check(store.cloud?.centerId === 'CTR-A', 'multi-select must not auto-overwrite local');

  // 5) Explicit path selection persists chosen license
  res = await sandbox.CloudBootstrap.discoverAndFetchLicenseFromDrive({
    path: 'NajjarTech/CTR-B/License/license.json',
    confirmForeignOrg: true
  });
  check(res.ok === true && res.license?.centerId === 'CTR-B', 'explicit path pulls CTR-B');
  check(store.cloud?.centerId === 'CTR-B', 'explicit path persisted');

  // 6) Wrong Google account rejected without wiping
  store.cloud = { ...goodB };
  sandbox.settings.backup.providers.google.email = 'wrong@other.test';
  sandbox.LicenseIdentity.getConnectedGoogleEmail = () => 'wrong@other.test';
  const wrongDoc = {
    ...goodA,
    ownerIdentity: { boundGoogleEmail: 'owner@clinic.test', authorizedEmail: 'owner@clinic.test' }
  };
  sandbox.BackupBridge.downloadCloudBackup = async () => ({ ok: true, text: JSON.stringify(wrongDoc) });
  res = await sandbox.CloudBootstrap.discoverAndFetchLicenseFromDrive({
    path: 'NajjarTech/CTR-A/License/license.json'
  });
  check(res.ok === false && (res.error === 'google_identity_transfer' || res.error === 'google_email_mismatch'), 'wrong Google rejected');
  check(store.cloud?.centerId === 'CTR-B', 'wrong Google must not wipe local license');

  // 7) Expired license does not replace good local
  sandbox.settings.backup.providers.google.email = 'owner@clinic.test';
  sandbox.LicenseIdentity.getConnectedGoogleEmail = () => 'owner@clinic.test';
  const expired = {
    centerId: 'CTR-B', centerName: 'Beta Clinic', licenseId: 'L-B',
    expiresAt: '2020-01-01', ownerIdentity: { authorizedEmail: 'owner@clinic.test' }, signature: 'SIG-OK'
  };
  sandbox.BackupBridge.downloadCloudBackup = async () => ({ ok: true, text: JSON.stringify(expired) });
  res = await sandbox.CloudBootstrap.discoverAndFetchLicenseFromDrive({
    path: 'NajjarTech/CTR-B/License/license.json'
  });
  check(res.ok === false && res.error === 'license_expired' && res.preservedLocal, 'expired preserves local');
  check(store.cloud?.expiresAt !== '2020-01-01', 'expired not persisted over good local');

  // 8) classifyDrivePullError mappings
  const c401 = sandbox.CloudBootstrap.classifyDrivePullError({ status: 401, message: 'Unauthorized' });
  const c429 = sandbox.CloudBootstrap.classifyDrivePullError({ status: 429, message: 'rate limit' });
  const cOff = sandbox.CloudBootstrap.classifyDrivePullError({ message: 'ENOTFOUND network' });
  check(c401.error === 'oauth_unauthorized', '401 → oauth_unauthorized');
  check(c429.error === 'drive_rate_limit' && c429.retry === true, '429 → rate limit retry');
  check(cOff.offline === true || cOff.error === 'offline', 'network → offline');

  // 9) applyFromCloudDoc must not save before verify
  vm.runInNewContext(legacySrc, sandbox, { timeout: 2000 });
  store.cloud = { centerId: 'CTR-KEEP', signature: 'SIG-OK', expiresAt: '2099-01-01' };
  const before = store.cloud;
  sandbox.licSave = () => {};
  sandbox.licLoadMeta = () => ({});
  sandbox.licSaveMeta = () => {};
  const applied = await sandbox.LicenseLegacyBridge.applyFromCloudDoc({
    centerId: 'CTR-X', expiresAt: '2099-01-01', signature: 'BAD'
  });
  check(applied.ok === false, 'corrupt apply rejected');
  check(store.cloud?.centerId === 'CTR-KEEP', 'corrupt apply must not overwrite cloud license');

  const evidenceDir = path.join(root, 'docs/integration-v2-5-8/evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, 'drive-license-pull-recovery.json'), JSON.stringify({
    at: new Date().toISOString(),
    ok: errors.length === 0,
    errors,
    rootCause: '9df1abe CSS hide of #lic-drive-bootstrap-panel (DED-258 BootFlow dedupe)',
    lastWorking: 'pre-9df1abe (lic-drive-bootstrap-panel visible)',
    firstBroken: '9df1abe',
    windowsSetupExeTested: false,
    note: 'Live Windows Setup EXE validation still required — unit PASS ≠ release PASS'
  }, null, 2) + '\n');

  if (errors.length) {
    console.error('FAIL: v2-5.8 drive license pull recovery');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('OK: v2-5.8 drive license pull recovery (' + (before ? 'legacy-safe' : 'ok') + ')');
})().catch((e) => {
  console.error('FAIL: v2-5.8 drive license pull recovery');
  console.error(' -', e.stack || e.message || e);
  process.exit(1);
});
