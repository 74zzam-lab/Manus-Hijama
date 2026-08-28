#!/usr/bin/env node
/**
 * Cloud V2 — smoke tests (Node, no DOM).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

const root = path.join(__dirname, '..');
const errors = [];

function loadScript(rel) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), context);
}

const driveStore = {};

const context = {
  window: {},
  globalThis: {},
  crypto: require('crypto').webcrypto,
  TextEncoder: TextEncoder,
  TextDecoder: TextDecoder,
  console,
  navigator: { onLine: true },
  sessionStorage: {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = v; },
    removeItem(k) { delete this._d[k]; }
  },
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = v; },
    removeItem(k) { delete this._d[k]; }
  },
  DB: {
    get(k, def) {
      try {
        const v = context.localStorage.getItem(k);
        return v ? JSON.parse(v) : def;
      } catch { return def; }
    },
    set(k, v) {
      context.localStorage.setItem(k, JSON.stringify(v));
    }
  },
  settings: {
    centerName: 'مركز تجريبي',
    cloudV2Enabled: true,
    cupPrice: 55,
    vatRate: 15,
    backup: { cloudEnabled: true, cloudProvider: 'google', providers: { google: { connected: true } } }
  },
  services: [{ id: 's1', name: 'حجامة', active: true }],
  packages: [{ id: 'p1', name: 'باقة', active: true }],
  users: [{ id: '1', role: 'reception', fullName: 'Rec', username: 'rec', active: true, password: 'x', branchScope: ['BR-MAIN'] }],
  cases: [],
  clientsRegistry: [],
  notify: () => {},
  setTimeout: global.setTimeout,
  clearTimeout: global.clearTimeout,
  setInterval: global.setInterval,
  clearInterval: global.clearInterval
};
context.window = context;
context.globalThis = context;
context.window.addEventListener = () => {};
context.window.removeEventListener = () => {};

context.BackupBridge = {
  isElectron: () => true,
  uploadCloud: async (payload, filename, provider, meta) => {
    driveStore[meta.remotePath] = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return { ok: true, remotePath: meta.remotePath };
  },
  downloadCloudBackup: async (remotePath) => {
    if (!driveStore[remotePath]) return { ok: false, message: 'missing' };
    return { ok: true, text: driveStore[remotePath] };
  },
  listCloudBackups: async (_provider, prefix) => {
    const p = String(prefix || '');
    const items = Object.keys(driveStore)
      .filter(k => k.startsWith(p) && /\.json$/i.test(k) && !k.endsWith('.meta.json'))
      .map(k => ({ path: k, name: k.split('/').pop(), modifiedAt: new Date().toISOString() }));
    return { ok: true, items };
  },
  getCloudStatus: async () => ({ connected: true, needsReauth: false, email: 'owner@clinic.test', oauth: true, hasRefreshToken: true })
};

vm.createContext(context);

[
  'cloud/center-id.js',
  'cloud/drive-layout.js',
  'cloud/meta.js',
  'cloud/device-config.js',
  'cloud/branch-scope.js',
  'cloud/settings-split.js',
  'cloud/repository.js',
  'cloud/role-policy.js',
  'cloud/record-metadata.js',
  'cloud/merge-policy.js',
  'cloud/table-merge-policy.js',
  'cloud/conflict-queue.js',
  'cloud/record-merger.js',
  'cloud/data-state-analyzer.js',
  'cloud/sync-guard.js',
  'cloud/sync-push-guards.js',
  'cloud/sync-baseline.js',
  'cloud/sync-coordinator.js',
  'cloud/drive-errors.js',
  'cloud/restore-staging.js',
  'cloud/synced-write.js',
  'cloud/db-bridge.js',
  'cloud/versions.js',
  'cloud/audit-logger.js',
  'cloud/settings-guard.js',
  'cloud/config-layer.js',
  'cloud/sync-state.js',
  'cloud/drive-adapter.js',
  'cloud/operational-layer.js',
  'cloud/lock-manager.js',
  'cloud/sync-engine.js',
  'cloud/backup-layer.js',
  'cloud/bootstrap.js',
  'cloud/boot-flow-ui.js',
  'cloud/drive-migration.js',
  'cloud/license-limits.js',
  'cloud/migration-runner.js',
  'cloud/cloud-v2-init.js'
].forEach(loadScript);

vm.runInContext('var CommercialLicense = {};', context);
loadScript('license/core/license-crypto.js');
loadScript('cloud/license-cloud.js');
loadScript('cloud/drive-folder-registry.js');
loadScript('cloud/license-identity.js');
loadScript('cloud/license-activation-gate.js');
loadScript('cloud/branch-enrollment.js');
loadScript('cloud/device-registry.js');
loadScript('cloud/device-cache.js');

// Settings are presentation cache only. This offline harness supplies the same
// verified main-process snapshot that the Electron provider would persist.
context.DriveAdapter.persistAuthorityStatus({
  connected: true,
  needsReauth: false,
  email: 'owner@clinic.test',
  oauth: true,
  hasRefreshToken: true
}, 'main_status');

function assert(c, m) { if (!c) errors.push(m); }

const CloudMeta = context.CloudMeta;
const MigrationRunner = context.MigrationRunner;
const RepositoryFactory = context.RepositoryFactory;
const LicenseCloud = context.LicenseCloud;
const CloudV2 = context.CloudV2;
const SyncState = context.SyncState;
const SyncEngine = context.SyncEngine;
const LockManager = context.LockManager;
const OperationalLayer = context.OperationalLayer;
const DriveAdapter = context.DriveAdapter;
const VersionsIndex = context.VersionsIndex;
const DeviceConfig = context.DeviceConfig;
const AuditLogger = context.AuditLogger;
const BackupLayer = context.BackupLayer;
const DriveLayout = context.DriveLayout;
const CloudBootstrap = context.CloudBootstrap;
const ConfigLayer = context.ConfigLayer;
const { createDeviceCache } = require(path.join(root, 'electron/device-cache.js'));

CloudMeta.setCloudV2Enabled(true);
context.settings.cloudV2Enabled = true;

const cid = context.CenterId.generateCenterId();
CloudMeta.saveMeta({ ...CloudMeta.loadMeta(), centerId: cid, schemaVersion: 0 });

const repo = RepositoryFactory.createRepository(RepositoryFactory.createLocalStorageAdapter(context.DB));
context.Repository = repo;

const mig = MigrationRunner.runMigrations();
assert(mig.ok && mig.to >= 6, 'migration to schema 6');
assert(CloudMeta.loadMeta().recordMetadataReady === true, 'v6 recordMetadataReady flag');
assert(CloudMeta.loadMeta().ownerHubReady === true, 'v5 ownerHubReady flag');
assert(context.settings.cloudV2?.autoBackupEnabled === true, 'v5 autoBackupEnabled default');

DeviceConfig.ensureDeviceUuid();
DeviceConfig.setBranchLock('BR-MAIN', true, 'Test-PC');

SyncState.queuePush({ layer: 'operational', table: 'cases', branchId: 'BR-MAIN', revision: 1 });
assert(SyncState.load().pendingPushes.length === 1, 'sync state queues push');

const lockA = LockManager.acquire('BR-MAIN', 'client', 'CL-1');
assert(lockA.ok, 'lock acquire');
DeviceConfig.save({ ...DeviceConfig.load(), deviceUuid: 'other-device' });
const lockB = LockManager.isLocked('BR-MAIN', 'client', 'CL-1');
assert(lockB.locked, 'lock blocks other device');
DeviceConfig.save({ ...DeviceConfig.load(), deviceUuid: lockA.lock.lockedBy.deviceUuid });
LockManager.release('BR-MAIN', 'client', 'CL-1');

repo.setAll('cases', [{ id: 'c1', name: 'Case', branchId: 'BR-MAIN' }]);
const exported = OperationalLayer.exportTable('cases', 'BR-MAIN');
assert(exported.records.length === 1, 'operational export');

let inventoryPush = null;
const origSchedulePush = SyncEngine.schedulePush;
SyncEngine.schedulePush = (table, branchId) => { inventoryPush = { table, branchId }; };
VersionsIndex.onRepositoryBump('inventoryItems', 'BR-MAIN');
assert(inventoryPush?.table === 'inventoryItems', 'inventory bump schedules push');
assert(VersionsIndex.TABLE_VERSION_MAP.inventoryItems === 'databaseVersion', 'inventoryItems in TABLE_VERSION_MAP');
assert(VersionsIndex.TABLE_VERSION_MAP.inventorySuppliers === 'databaseVersion', 'inventorySuppliers in TABLE_VERSION_MAP');
assert(VersionsIndex.TABLE_VERSION_MAP.inventoryMovements === 'databaseVersion', 'inventoryMovements in TABLE_VERSION_MAP');
SyncEngine.schedulePush = origSchedulePush;

assert(typeof context.DriveErrors?.classify === 'function', 'drive-errors loaded');
assert(typeof context.SyncedWrite?.restoreFromBackup === 'function', 'synced-write loaded');
const quotaClass = context.DriveErrors.classify({ error: 'storageQuotaExceeded' });
assert(quotaClass.type === 'drive_quota' && quotaClass.pauseSync, 'quota error classified');

const syncedTables = context.Repository.SYNCED_TABLES;
const versionTables = Object.keys(VersionsIndex.TABLE_VERSION_MAP);
const opTables = context.OperationalLayer.OPERATIONAL_TABLES;
const restoreTables = Object.keys(context.RestoreStaging.SYNCED_MAP);
const mergeTables = Object.keys(context.TableMergePolicy.TABLE_POLICIES);
syncedTables.forEach(t => {
  if (t === 'settings' || t === 'users' || t === 'services' || t === 'packages') return;
  assert(opTables.includes(t), `operational layer has ${t}`);
  assert(restoreTables.includes(t), `restore staging has ${t}`);
  assert(mergeTables.includes(t), `merge policy has ${t}`);
});
opTables.forEach(t => {
  assert(versionTables.includes(t), `version map has ${t}`);
  assert(restoreTables.includes(t), `restore staging has op table ${t}`);
});
assert(syncedTables.includes('activityLog'), 'activityLog is cloud-synced');
assert(syncedTables.includes('messageLog'), 'messageLog is cloud-synced');
assert(syncedTables.includes('expenses'), 'expenses are cloud-synced');
assert(syncedTables.includes('systemLogs'), 'systemLogs is cloud-synced');
assert(opTables.includes('opsKv'), 'opsKv operational pack is synced');
assert(opTables.includes('cashDrawerSession'), 'cash float / عهدة is cloud-synced');
assert(!syncedTables.includes('cashDrawerSession'), 'cash float uses operational pack, not a repo array');
assert(!context.SyncedWrite.LOCAL_ONLY_KEYS.has('cashDrawerSession'), 'cash float is not local-only');
assert(!context.SyncedWrite.LOCAL_ONLY_KEYS.has('messageLog'), 'messageLog is not local-only');
assert(context.SyncedWrite.LOCAL_ONLY_KEYS.has('hardwareLog'), 'hardwareLog stays local');

(async () => {
  context.settings.backup.providers.google = { connected: true, email: 'owner@clinic.test', oauth: true };
  const record = {
    licenseId: 'L000001', licenseUuid: 'uuid-test', packageId: '03', subscriptionId: '05',
    expiryDate: '2027-12-31', issueDate: '2026-01-01', devices: 3, branches: 1, maxUsers: 10,
    customer: { company: 'مركز نجار', name: 'Owner' }, centerId: cid
  };
  const doc = await LicenseCloud.buildFromRecord(record, { centerName: 'مركز', centerId: cid });
  if (!doc.branches?.length) doc.branches = [{ id: 'BR-MAIN', name: 'الفرع الرئيسي', active: true }];
  LicenseCloud.saveLocal(doc);
  DeviceConfig.ensureDeviceConfig({ centerId: cid });

  const versions = VersionsIndex.toDriveJson(VersionsIndex.syncFromRepository(repo, cid, 'BR-MAIN'));
  await DriveAdapter.uploadVersions(cid, versions);

  context.SyncBaseline?.markHydrating?.({ organizationResolved: true, branchResolved: true });
  context.SyncBaseline?.markBaselineKnown?.({
    branchId: 'BR-MAIN',
    remoteRevision: Number(versions?.branches?.['BR-MAIN']?.databaseVersion || versions?.databaseVersion || 0),
    integrityPass: true,
  });
  context.SyncBaseline?.markReady?.();

  const pushRes = await SyncEngine.pushTable('cases', 'BR-MAIN');
  assert(pushRes.ok, 'sync push cases');

  const remotePath = OperationalLayer.drivePathForTable(cid, 'BR-MAIN', 'cases');
  assert(driveStore[remotePath], 'cases uploaded to mock drive');
  assert(/\/branches\//i.test(remotePath) || /\/Branches\//.test(remotePath), 'branch folder drive layout');
  assert(remotePath.includes(`/centers/${cid}/`) || remotePath.includes('NajjarTech/'), 'center-scoped drive path');

  // This fixture provides settings.json only. Do not announce a database revision
  // unless all operational tables exist in the mock drive.
  const remoteVersions = { ...versions, branches: { 'BR-MAIN': { settingsVersion: 999 } } };
  driveStore[VersionsIndex.drivePath(cid, 'BR-MAIN')] = JSON.stringify(remoteVersions);
  driveStore[context.ConfigLayer.drivePathForFile(cid, 'BR-MAIN', 'settings.json')] = JSON.stringify({ branchName: 'Remote Branch' });

  const pollRes = await SyncEngine.applyRemoteVersions(remoteVersions);
  assert(pollRes.ok, 'apply remote versions');

  LicenseCloud.saveLocal({
    ...LicenseCloud.loadLocal(),
    branches: [
      { id: 'BR-MAIN', name: 'فرع الرياض', active: true },
      { id: 'BR-JED', name: 'فرع جدة', active: true }
    ]
  });
  DeviceConfig.setBranchLock('BR-MAIN', true, 'Test-PC');
  const crossVersions = {
    ...versions,
    branches: { 'BR-MAIN': { settingsVersion: 9999 }, 'BR-JED': { settingsVersion: 8888 } }
  };
  // Keep the locked branch settings coherent with the earlier successful pull.
  // Conflict behavior belongs to a dedicated conflict scenario, not this smoke path.
  driveStore[DriveLayout.configBranchFile(cid, 'BR-MAIN', 'settings.json')] = JSON.stringify({ branchName: 'Remote Branch' });
  driveStore[DriveLayout.configBranchFile(cid, 'BR-JED', 'settings.json')] = JSON.stringify({ branchName: 'JED Remote' });
  const cross = await SyncEngine.applyRemoteVersions(crossVersions);
  assert(cross.pulled.some(p => p.branchId === 'BR-MAIN'), 'poll pulls locked branch only');
  assert(!cross.pulled.some(p => p.branchId === 'BR-JED'), 'poll skips other branch data');

  assert(SyncState.DEFAULT_POLL_MS === 15000, 'default poll interval 15s');

  const flushRes = await SyncEngine.flushPending();
  assert(flushRes.ok, 'flush pending');

  CloudBootstrap.markBootstrapComplete('BR-MAIN');

  const init = CloudV2.init({ force: true });
  assert(init.ok && init.sync, 'CloudV2 init with sync status');
  assert(init.backup?.enabled === true, 'CloudV2 init starts backup layer');

  AuditLogger.log({ action: 'SETTINGS_CHANGED', entity: 'settings', summary: 'verify test' });
  assert(AuditLogger.query().length >= 1, 'audit log local entry');
  const auditFlush = await AuditLogger.flushToDrive();
  assert(auditFlush.ok && auditFlush.flushed >= 1, 'audit flush to drive');
  const auditYm = AuditLogger.monthKey();
  const auditPath = DriveLayout.auditLogMonth(cid, auditYm);
  assert(driveStore[auditPath], 'audit log uploaded to mock drive');

  context.buildFullBackupObject = () => ({
    _meta: { version: 1 },
    settings: context.settings,
    cases: []
  });
  context.settings.backup = { ...(context.settings.backup || {}), encrypt: false };
  const backupPath = DriveLayout.backupAutoFile(cid, new Date().toISOString().slice(0, 10), 'BR-MAIN');
  assert(backupPath.includes('/Backup/'), 'backup auto path layout (per-branch)');
  const autoRes = await BackupLayer.runAutoBackup(true);
  assert(autoRes.ok, 'auto backup upload');
  assert(driveStore[autoRes.remotePath], 'auto backup on mock drive');
  assert(context.settings.cloudV2.lastAutoBackupDate, 'auto backup date tracked');

  context.currentUser = { id: '1', role: 'owner', fullName: 'Owner' };
  loadScript('cloud/owner-hub.js');
  assert(context.OwnerHub.canAccess(), 'owner hub owner access when v2 enabled');
  context.currentUser = { id: '1', role: 'admin', fullName: 'Admin' };
  assert(!context.OwnerHub.canAccess(), 'owner hub blocked for admin');
  context.currentUser = { id: '2', role: 'reception', fullName: 'Rec' };
  assert(!context.OwnerHub.canAccess(), 'owner hub blocked for non-owner');
  context.currentUser = { id: '3', role: 'accountant', fullName: 'Acc', branchScope: ['*'] };
  assert(!context.OwnerHub.canAccess(), 'owner hub blocked for accountant');

  const bootBranch = 'BR-MAIN';
  CloudMeta.saveMeta({ ...CloudMeta.loadMeta(), bootstrapCompletedAt: null, bootstrapBranchId: null });
  context.localStorage.removeItem('__tdw_cloud_license__');
  repo.setAll('cases', []);
  driveStore[DriveLayout.licenseJson(cid)] = JSON.stringify(await LicenseCloud.buildFromRecord({
    licenseId: 'L000001', licenseUuid: 'uuid-boot', packageId: '03', subscriptionId: '05',
    expiryDate: '2027-12-31', issueDate: '2026-01-01', devices: 3, branches: 1, maxUsers: 10,
    customer: { company: 'Boot Center' }, centerId: cid
  }, { centerName: 'Boot', centerId: cid }));
  driveStore[ConfigLayer.drivePathForFile(cid, bootBranch, 'settings.json')] = JSON.stringify({ branchName: 'Boot Branch', defaultBranchId: bootBranch });
  driveStore[OperationalLayer.drivePathForTable(cid, bootBranch, 'cases')] = JSON.stringify({
    centerId: cid, branchId: bootBranch, table: 'cases', records: [{ id: 'boot1', name: 'Boot Case', branchId: bootBranch }]
  });
  const bootVersions = VersionsIndex.toDriveJson(VersionsIndex.syncFromRepository(repo, cid, bootBranch));
  driveStore[VersionsIndex.drivePath(cid, bootBranch)] = JSON.stringify({
    ...bootVersions,
    branches: { [bootBranch]: { ...(bootVersions.branches?.[bootBranch] || {}), databaseVersion: 9999 } }
  });

  const bootRes = await CloudBootstrap.runNewDeviceBootstrap({ branchId: bootBranch, startSync: false });
  assert(bootRes.ok, 'bootstrap hydrate new device');
  assert(CloudBootstrap.isBootstrapComplete(), 'bootstrap marked complete');
  assert((repo.get('cases') || []).some(c => c.id === 'boot1'), 'bootstrap imported operational cases');

  const legacySettings = DriveLayout.legacyConfigBranchFile(cid, 'BR-MAIN', 'settings.json');
  const legacyCases = DriveLayout.legacyOperationalBranchFile(cid, 'BR-MAIN', 'cases');
  driveStore[legacySettings] = JSON.stringify({ branchName: 'Legacy Main', defaultBranchId: 'BR-MAIN' });
  driveStore[legacyCases] = JSON.stringify({
    centerId: cid, branchId: 'BR-MAIN', table: 'cases',
    records: [{ id: 'leg1', name: 'Legacy Case', branchId: 'BR-MAIN' }]
  });
  LicenseCloud.saveLocal({
    ...LicenseCloud.loadLocal(),
    branches: [{ id: 'BR-MAIN', name: 'الفرع الرئيسي', active: true }]
  });
  const migPreview = await context.DriveBranchMigration.preview({ centerId: cid });
  assert(migPreview.ok && migPreview.total >= 2, 'migration preview finds legacy branch files');
  const migRun = await context.DriveBranchMigration.run({ centerId: cid, force: true });
  assert(migRun.ok && migRun.migrated >= 2, 'migration copies legacy to Branches folder');
  const newSettingsPath = DriveLayout.configBranchFile(cid, 'BR-MAIN', 'settings.json');
  assert(driveStore[newSettingsPath], 'migrated settings at new branch path');
  assert(context.DriveBranchMigration.parseLegacyPath(legacySettings)?.branchId === 'BR-MAIN', 'legacy path parses branchId');

  CloudMeta.setCloudV2Enabled(false);
  context.settings.cloudV2Enabled = false;
  context.settings.cloudV2UserDisabled = false;
  LicenseCloud.saveLocal({
    centerId: cid,
    limits: { maxDevices: 3, maxBranches: 1 },
    branches: [{ id: 'BR-MAIN', name: 'الفرع الرئيسي', active: true }]
  });
  const v2AutoRes = CloudV2.maybeAutoEnableCloudV2();
  assert(v2AutoRes.autoEnabled === true, 'maybeAutoEnableCloudV2 single branch multi-device');
  assert(CloudMeta.isCloudV2Enabled(), 'cloud v2 auto enabled after drive+license');
  assert(CloudV2.getMaxDevicesFromLicense() === null, 'devices unlimited — no license cap');

  assert(context.LicenseLimits.isUnlimitedDevices(0), 'zero means unlimited devices');
  assert(context.LicenseLimits.getEffectiveMaxDevices({ maxDevices: 0 }) === null, 'effective max null when unlimited');
  LicenseCloud.saveLocal({
    ...LicenseCloud.loadLocal(),
    limits: { maxDevices: 0, maxBranches: 2 },
    branches: [{ id: 'BR-MAIN', name: 'Main', active: true }],
    features: ['cloud_multi_device']
  });
  assert(CloudV2.canUseCloudV2Sync(), 'cloud v2 eligible with unlimited devices');
  for (let i = 0; i < 4; i++) {
    DeviceConfig.save({ ...DeviceConfig.load(), deviceUuid: 'uuid-dev-' + i });
    const reg = await context.DeviceRegistry.registerDevice({ deviceName: 'PC-' + i, branchId: 'BR-MAIN' });
    assert(reg.ok, 'unlimited device registration #' + i);
  }
  const blocked = context.LicenseLimits.canRegisterDevice(LicenseCloud.loadLocal(), { branchId: 'BR-NOT' });
  assert(!blocked.ok && blocked.error === 'branch_not_licensed', 'reject unlicensed branch');

  LicenseCloud.saveLocal({
    centerId: cid,
    limits: { maxDevices: 0, maxBranches: 2 },
    branches: [],
    features: ['cloud_multi_device']
  });
  const be0Blocked = await context.BranchEnrollment.enrollBranch(LicenseCloud.loadLocal(), { branchName: 'الرياض' });
  assert(!be0Blocked.ok && be0Blocked.error === 'owner_hub_required', 'first branch also requires owner hub source');
  const be1 = await context.BranchEnrollment.enrollBranch(LicenseCloud.loadLocal(), { branchName: 'الرياض', source: 'owner_hub' });
  assert(be1.ok, 'enroll first branch via owner hub');
  const be2Blocked = await context.BranchEnrollment.enrollBranch(LicenseCloud.loadLocal(), { branchName: 'جدة' });
  assert(!be2Blocked.ok && be2Blocked.error === 'owner_hub_required', 'second branch requires owner hub source');
  const be2 = await context.BranchEnrollment.enrollBranch(LicenseCloud.loadLocal(), { branchName: 'جدة', source: 'owner_hub' });
  assert(be2.ok, 'enroll second branch via owner hub up to maxBranches');
  const be3 = await context.BranchEnrollment.enrollBranch(LicenseCloud.loadLocal(), { branchName: 'مكة', source: 'owner_hub' });
  assert(!be3.ok && be3.error === 'branch_limit_reached', 'reject branch over maxBranches');

  context.settings.backup.providers.google = { connected: true, email: 'owner@clinic.test', oauth: true };
  LicenseCloud.saveLocal({
    centerId: cid,
    ownerIdentity: { authorizedEmail: 'owner@clinic.test', boundGoogleEmail: null },
    limits: { maxBranches: 1 },
    branches: [{ id: 'BR-MAIN', name: 'Main', active: true }]
  });
  const bind1 = await context.LicenseIdentity.bindGoogleAccount('owner@clinic.test');
  assert(bind1.ok && bind1.bound, 'bind google to authorized email');
  const mismatch = await context.LicenseIdentity.verifyGoogleBinding();
  assert(mismatch.ok, 'verify bound google ok');
  context.settings.backup.providers.google.email = 'thief@other.test';
  context.DriveAdapter.persistAuthorityStatus({
    connected: true,
    needsReauth: false,
    email: 'thief@other.test',
    oauth: true,
    hasRefreshToken: true
  }, 'main_status');
  const stolen = await context.LicenseIdentity.verifyGoogleBinding();
  assert(!stolen.ok && stolen.error === 'google_identity_transfer', 'detect google identity transfer');

  LicenseCloud.saveLocal({
    centerId: cid,
    activation: { consumed: true, primaryDeviceFingerprint: 'ABC123', primaryDeviceUuid: 'uuid-primary' }
  });
  context.DeviceConfig.save({ deviceUuid: 'uuid-primary' });
  assert(context.LicenseActivationGate.isPrimaryDevice(LicenseCloud.loadLocal()), 'primary device info (audit only)');
  context.DeviceConfig.save({ deviceUuid: 'uuid-other' });
  assert(!context.LicenseActivationGate.isPrimaryDevice(LicenseCloud.loadLocal()), 'non-primary uuid (informational)');

  assert(typeof context.BootFlow?.hasOwnerAccount === 'function', 'boot flow module loaded');
  assert(context.DriveFolderRegistry?.getCenterFolderName(cid), 'drive folder registry resolves center name');

  const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert(/cloud\/sync-engine\.js/.test(indexSrc), 'sync-engine wired');
  assert(/cloud\/lock-manager\.js/.test(indexSrc), 'lock-manager wired');
  assert(/cloud\/backup-layer\.js/.test(indexSrc), 'backup-layer wired');
  assert(/cloud\/owner-hub\.js/.test(indexSrc), 'owner-hub wired');
  assert(/cloud\/boot-flow-ui\.js/.test(indexSrc), 'boot-flow-ui wired');
  assert(/ensureLoginAccessible/.test(fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8')), 'boot login accessible');
  assert(!/pointerEvents = blocked \? 'none'/.test(fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8')), 'boot must not block login clicks');
  assert(/cloud\/drive-folder-registry\.js/.test(indexSrc), 'drive-folder-registry wired');
  assert(/cloud\/settings-guard\.js/.test(indexSrc), 'settings-guard wired');
  assert(/cloud\/sync-guard\.js/.test(indexSrc), 'sync-guard wired');
  assert(/cloud\/drive-errors\.js/.test(indexSrc), 'drive-errors wired');
  assert(/cloud\/synced-write\.js/.test(indexSrc), 'synced-write wired');
  const extSrc = fs.readFileSync(path.join(root, 'cupping-ext-modules.js'), 'utf8');
  const extRestoreBlock = extSrc.match(/function extRestoreData\([\s\S]*?\n\}/);
  assert(extRestoreBlock && !/DB\.set\('inventoryItems'/.test(extRestoreBlock[0]), 'extRestoreData must not overwrite inventory');
  assert(/autoRestore:\s*false/.test(fs.readFileSync(path.join(root, 'cupping-drive-sync.js'), 'utf8')), 'legacy autoRestore disabled by default');
  assert(/cloud\/data-state-analyzer\.js/.test(indexSrc), 'data-state-analyzer wired');
  assert(/cloud\/record-merger\.js/.test(indexSrc), 'record-merger wired');
  assert(/cloud\/table-merge-policy\.js/.test(indexSrc), 'table-merge-policy wired');
  assert(/cloud\/data-state-ui\.js/.test(indexSrc), 'data-state-ui wired');
  assert(/cloud\/conflict-manager-ui\.js/.test(indexSrc), 'conflict-manager-ui wired');
  assert(/cloud\/restore-staging\.js/.test(indexSrc), 'restore-staging wired');
  assert(/cloud\/db-bridge\.js/.test(indexSrc), 'db-bridge wired');
  assert(/maybeAutoEnableCloudV2/.test(indexSrc), 'auto enable cloud v2 on startup');
  assert(/page-owner-hub/.test(indexSrc), 'owner-hub page wired');
  assert(/cloud\/branch-switcher\.js/.test(indexSrc), 'branch-switcher wired');
  assert(/bk-cv2-poll-interval/.test(indexSrc), 'poll interval UI wired');
  assert(/login-drive-branch-id/.test(indexSrc), 'login branch picker wired');
  assert(/drive-migration\.js/.test(indexSrc), 'drive migration wired');
  assert(/license-activation-gate\.js/.test(indexSrc), 'license-activation-gate wired');
  assert(/runDriveBranchMigration/.test(indexSrc), 'drive migration UI wired');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const buildFiles = pkg.build?.files || [];
  assert(buildFiles.some(f => String(f).includes('cloud')), 'electron-builder must pack cloud/**/*');
  const installerNsh = fs.readFileSync(path.join(root, 'build/installer.nsh'), 'utf8');
  installerNsh.split('\n').forEach((line, i) => {
    if (!/MessageBox/i.test(line)) return;
    const ids = line.match(/\bID[A-Z]+\b/g) || [];
    if (ids.length > 2) errors.push(`installer.nsh:${i + 1} MessageBox has ${ids.length} jump labels (NSIS max 2): ${ids.join(' ')}`);
  });
  assert(/folder \|\| SYNC_FOLDER/.test(fs.readFileSync(path.join(root, 'electron/cloud-providers/google-drive.js'), 'utf8')), 'google drive sync uses folder');

  const tmpCache = path.join(os.tmpdir(), 'tdw-cache-test-' + Date.now());
  const electronCache = createDeviceCache(tmpCache);
  assert(electronCache.writeVersions(cid, versions).ok, 'device cache versions');
  try { fs.rmSync(tmpCache, { recursive: true, force: true }); } catch { /* empty */ }

  SyncEngine.stop();
  BackupLayer.stop();
  context.DeviceRegistry?.stopHeartbeat?.();

  if (errors.length) {
    console.error('FAIL verify-cloud-v2:');
    errors.forEach(e => console.error(' -', e));
    process.exit(1);
  }
  console.log('OK: Cloud V2 Sprint 6 bootstrap & integration verified');
  // This is a Node verification harness. Services above own recurring timers, so
  // terminate only after every assertion has completed and services were stopped.
  process.exit(0);
})();
