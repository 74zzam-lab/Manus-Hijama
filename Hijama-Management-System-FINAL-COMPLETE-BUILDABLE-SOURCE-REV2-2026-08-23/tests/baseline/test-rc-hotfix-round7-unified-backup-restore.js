#!/usr/bin/env node
'use strict';

/**
 * RC Hotfix Round 7 — unified backup/restore coordinator + fileId download + JSON import isolation.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const coordinatorSrc = fs.readFileSync(path.join(root, 'electron/backup-restore-coordinator.js'), 'utf8');
const deviceIdSrc = fs.readFileSync(path.join(root, 'electron/device-identity-snapshot.js'), 'utf8');
const bootstrapSrc = fs.readFileSync(path.join(root, 'electron/bootstrap-restore-capability.js'), 'utf8');
const ipcSrc = fs.readFileSync(path.join(root, 'electron/backup-v2-ipc.js'), 'utf8');
const preloadSrc = fs.readFileSync(path.join(root, 'electron/preload.js'), 'utf8');
const discoveryMainSrc = fs.readFileSync(path.join(root, 'electron/cloud-data-discovery.js'), 'utf8');
const discoverySrc = fs.readFileSync(path.join(root, 'cloud/cloud-data-discovery.js'), 'utf8');
const stagingSrc = fs.readFileSync(path.join(root, 'cloud/restore-staging.js'), 'utf8');
const rehydrateSrc = fs.readFileSync(path.join(root, 'cloud/restore-runtime-rehydrate.js'), 'utf8');
const bridgeSrc = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');
const syncedSrc = fs.readFileSync(path.join(root, 'cloud/synced-write.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const driveSrc = fs.readFileSync(path.join(root, 'electron/cloud-providers/google-drive.js'), 'utf8');

check(/backup-restore-coordinator/.test(ipcSrc), 'backup-v2-ipc wires coordinator');
check(/backup:v2:restoreUnified/.test(ipcSrc), 'restoreUnified IPC handler');
check(/backup:v2:downloadCloud/.test(ipcSrc), 'downloadCloud IPC handler');
check(/Downloaded/.test(coordinatorSrc), 'coordinator uses Downloaded staging dir');
check(/device-identity-snapshot/.test(coordinatorSrc), 'coordinator uses device identity snapshot');
check(/googleFileId/.test(bootstrapSrc), 'bootstrap binds googleFileId');
check(!/licenseSnapshot/.test(bootstrapSrc) && /function resolveLicense/.test(bootstrapSrc),
  'bootstrap rejects renderer licenseSnapshot fallback and resolves main-process device cache');
check(/bootstrap_restore_license_missing/.test(bootstrapSrc), 'bootstrap license error code');
check(/verifyFileIdMetadata/.test(discoveryMainSrc), 'main discovery fileId metadata verify');
check(/downloadBackupByFileId/.test(driveSrc), 'google drive fileId download');
check(/v2RestoreUnified/.test(preloadSrc), 'preload restoreUnified bridge');
check(/v2DownloadCloud/.test(preloadSrc), 'preload downloadCloud bridge');
check(/onRestoreProgress/.test(preloadSrc), 'preload restore progress events');
check(/googleFileId/.test(discoverySrc), 'renderer passes googleFileId to restore');
check(/licenseSnapshot/.test(discoverySrc), 'renderer passes licenseSnapshot to bootstrap');
check(/MIGRATION_ALLOW_TOP_KEYS/.test(stagingSrc), 'JSON import allowlist');
check(/buildMigrationImportReport/.test(stagingSrc), 'JSON import report builder');
check(!/localStorage\.setItem\('__tdw_lic__'/.test(syncedSrc), 'synced-write does not import license from JSON');
check(/v2DownloadCloud/.test(indexSrc), 'backup page uses v2DownloadCloud');
check(/rehydrating_runtime/.test(coordinatorSrc), 'coordinator defines rehydrating_runtime stage');
check(/rehydrateRuntime/.test(coordinatorSrc), 'coordinator calls rehydrateRuntime');
check(/restoreRes\.ok === false/.test(coordinatorSrc), 'coordinator aborts on failed local restore');
check(/restore-runtime-rehydrate/.test(indexSrc), 'index loads restore-runtime-rehydrate');
check(/document-sequences\.js/.test(indexSrc), 'index loads document-sequences');
check(/reconcileDocumentSequences/.test(rehydrateSrc), 'rehydrate reconciles document sequences');
check(/invalidateOperationalCaches/.test(bridgeSrc), 'SqliteBridge exposes invalidateOperationalCaches');
check(/onRestoreRehydrateRequest/.test(preloadSrc), 'preload restore rehydrate request bridge');
check(/restoreRehydrateResult/.test(preloadSrc), 'preload restore rehydrate result bridge');
check(/backup:restoreRehydrateResult/.test(ipcSrc), 'IPC handles restore rehydrate result');

const bootstrapMod = require(path.join(root, 'electron/bootstrap-restore-capability'));
const coordinatorMod = require(path.join(root, 'electron/backup-restore-coordinator'));
const deviceIdentityMod = require(path.join(root, 'electron/device-identity-snapshot'));
const backupV2 = require(path.join(root, 'electron/backup-v2-core'));
const { openDatabase } = require(path.join(root, 'database/connection'));

bootstrapMod.configure({
  getUserDataPath: () => '/tmp',
  readKv: () => ({ syncDone: false }),
  getCloudStatus: async () => ({ connected: true, email: 'a@b.com', oauth: true }),
  verifyFileIdMetadata: async () => ({
    ok: true,
    item: { id: 'FILE123', size: 14900000, modifiedAt: '2026-08-01T00:00:00.000Z' },
  }),
  readLicense: () => ({
    ok: true,
    data: { centerId: 'C1', branches: [{ id: 'B1', active: true }] },
  }),
  getSession: () => null,
});

(async () => {
  const issued = await bootstrapMod.issueRestoreCapability(
    { sender: { id: 42 } },
    {
      bootFlow: true,
      centerId: 'C1',
      branchId: 'B1',
      remotePath: 'Backups/V2/Tadawi-Backup-V2-a.tdw',
      googleFileId: 'FILE123',
      backupId: 'FILE123',
      expectedSize: 14900000,
      licenseSnapshot: { centerId: 'C1', branches: [{ id: 'B1', active: true }] },
    }
  );
  check(issued.ok && issued.capabilityId && issued.bound?.centerId === 'C1',
    'bootstrap issues cap from main-process device cache (renderer snapshot is non-authoritative)');
  check(issued.bound?.googleFileId === 'FILE123', 'capability bound to googleFileId');

  // Snapshot-only input must never become restore authority when device cache is absent.
  bootstrapMod.configure({ readLicense: () => ({ ok: false, missing: true }) });
  const noLic = await bootstrapMod.issueRestoreCapability(
    { sender: { id: 43 } },
    {
      bootFlow: true,
      centerId: 'C1',
      remotePath: 'Backups/V2/Tadawi-Backup-V2-a.tdw',
      googleFileId: 'FILE123',
      backupId: 'FILE123',
    }
  );
  check(!noLic.ok && noLic.error === 'bootstrap_restore_license_missing', 'missing license maps to bootstrap_restore_license_missing');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-r7-'));
  const userData = path.join(tmp, 'userData');
  const dbPath = path.join(userData, 'database', 'tadawi.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(path.join(userData, 'settings'), { recursive: true });
  fs.mkdirSync(path.join(userData, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'settings', 'app.json'), JSON.stringify({
    deviceId: 'DEV-LOCAL',
    cloudV2: { deviceId: 'DEV-LOCAL', oauthEmail: 'keep@clinic.com' },
  }, null, 2));
  const db = openDatabase(dbPath);
  db.prepare(
    `INSERT INTO clients (id, name, phone, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run('c1', 'Client A', '0500000000', '{}', new Date().toISOString(), new Date().toISOString());
  db.prepare(
    `INSERT INTO clients (id, name, phone, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run('c2', 'Client B', '0500000001', '{}', new Date().toISOString(), new Date().toISOString());
  db.close();

  const snap = deviceIdentityMod.capture(userData);
  check(snap.settingsOverlay?.deviceId === 'DEV-LOCAL', 'device identity snapshot captures deviceId');

  fs.writeFileSync(path.join(userData, 'settings', 'app.json'), JSON.stringify({
    deviceId: 'DEV-RESTORED',
    cloudV2: { deviceId: 'DEV-RESTORED' },
  }, null, 2));
  deviceIdentityMod.restore(userData, snap);
  const restoredSettings = JSON.parse(fs.readFileSync(path.join(userData, 'settings', 'app.json'), 'utf8'));
  check(restoredSettings.deviceId === 'DEV-LOCAL', 'device identity overlay restored after settings swap');

  const backupDir = path.join(tmp, 'backup');
  fs.mkdirSync(backupDir, { recursive: true });
  const created = await backupV2.createBackupFile({
    userDataDir: userData,
    outputPath: path.join(backupDir, 'sample.tdw'),
    appVersion: '2.0.0',
    backupType: 'manual',
    centerId: 'C1',
    organizationId: 'C1',
    branchId: 'B1',
    branchIds: ['B1'],
    includedBranchIds: ['B1'],
    deviceId: 'DEV-BKP',
    scopeType: 'branch',
    scopeTruth: {
      scopeType: 'branch',
      includedBranchIds: ['B1'],
      recordCounts: { clients: 2, cases: 0, bookings: 0 },
    },
  });
  check(created?.ok !== false && fs.existsSync(created.path), 'fixture backup created');

  let progressStages = [];
  coordinatorMod.configure({
    getUserDataPath: () => userData,
    downloadCloudBackupByFileId: async (_id, opts) => {
      opts?.onProgress?.({ downloadedBytes: 100, totalBytes: 100, percent: 100 });
      return { ok: true, buffer: fs.readFileSync(created.path), file: { id: 'FILE123', name: 'sample.tdw', size: fs.statSync(created.path).size } };
    },
    downloadCloudBackup: async () => ({ ok: false }),
    verifyFileIdMetadata: async () => ({ ok: true, item: { id: 'FILE123', size: fs.statSync(created.path).size } }),
    runLocalRestore: async (filePath) => {
      const res = await backupV2.restoreBackupFile({
        filePath,
        userDataDir: userData,
        expectedIdentity: { centerId: 'C1', organizationId: 'C1', branchId: 'B1', authorizedBranchIds: ['B1'] },
        licensedBranchIds: ['B1'],
        skipScopeTruth: true,
        skipEmergencyBackup: true,
        closeDatabase: async () => {},
        reopenDatabase: async () => {},
      });
      return res;
    },
    reopenDatabase: async () => {},
    countDatabaseRows: (dbPath) => backupV2.countDatabaseRows(dbPath),
    inspectBackupBuffer: (buf, pwd, opts) => backupV2.inspectBackupBuffer(buf, pwd, opts),
    verifyBackupFile: (fp) => backupV2.verifyBackupFile(fp),
    scopeFromManifest: (m) => require(path.join(root, 'electron/backup-v2-scope-truth')).extractScopeSummaryFromManifest(m),
    issueBootstrapAuthorization: async () => ({ ok: true, capabilityId: 'cap-test' }),
    consumeBootstrapCapability: () => ({ ok: true }),
    assertBootstrapManifestScope: () => ({ ok: true }),
    getCapability: () => null,
    isBackupBufferEncrypted: (buf) => backupV2.isEncryptedBackupBuffer(buf),
    friendlyError: (err) => backupV2.friendlyBackupError(err),
  });

  const restoreRes = await coordinatorMod.restore({
    source: 'cloud',
    context: 'bootstrap',
    googleFileId: 'FILE123',
    remotePath: 'Backups/V2/sample.tdw',
    expectedSize: fs.statSync(created.path).size,
    onProgress: (snap) => progressStages.push(snap.stage),
    centerId: 'C1',
    branchId: 'B1',
    licensedBranchIds: ['B1'],
  });
  check(restoreRes.ok, 'coordinator cloud download + local restore succeeds');
  check(progressStages.includes('downloading'), 'coordinator emits downloading stage');
  check(progressStages.includes('rehydrating_runtime'), 'coordinator emits rehydrating_runtime stage');
  check(progressStages.includes('verifying_data'), 'coordinator emits verifying_data stage');
  check(progressStages.includes('completed'), 'coordinator emits completed stage on success');
  check(fs.existsSync(coordinatorMod.downloadedDir(userData)), 'Downloaded dir exists');

  let failStages = [];
  coordinatorMod.configure({
    runLocalRestore: async () => ({ ok: false, error: 'restore_swap_failed', message: 'swap failed' }),
    rehydrateRuntime: async () => ({ ok: true, skipped: true }),
  });
  const failRes = await coordinatorMod.restore({
    source: 'local',
    localPath: created.path,
    onProgress: (snap) => failStages.push(snap.stage),
    centerId: 'C1',
    branchId: 'B1',
    licensedBranchIds: ['B1'],
  });
  check(!failRes.ok, 'failed local restore returns ok:false');
  check(failRes.restoreVerified === false, 'failed local restore sets restoreVerified=false');
  check(!failStages.includes('completed'), 'failed local restore does not emit completed');
  check(!failStages.includes('verifying_data'), 'failed local restore skips verifying_data');
  check(!failStages.includes('rehydrating_runtime'), 'failed local restore skips rehydrating_runtime');

  const rehydrateSandbox = {
    console,
    module: { exports: {} },
    globalThis: {},
    window: {},
    DB: {
      store: { clientsRegistry: [], cases: [], bookings: [] },
      get(key, def) { return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : def; },
      set(key, val) { this.store[key] = val; },
    },
    reloadClientStoreFromDb() {
      this.clientsRegistry = this.DB.get('clientsRegistry', this.clientsRegistry);
      this.cases = this.DB.get('cases', this.cases);
      this.bookings = this.DB.get('bookings', this.bookings);
    },
    syncAppGlobals() {},
    clientsRegistry: [],
    cases: [],
    bookings: [],
    SqliteBridge: {
      invalidateOperationalCaches() {
        this.booted = false;
        this.committed = {};
      },
      booted: false,
      committed: {},
      async bootFromSQLiteSoTOnce() {
        this.booted = true;
        const data = rehydrateSandbox.DB.store;
        this.committed.clientsRegistry = data.clientsRegistry;
        this.committed.cases = data.cases;
        this.committed.bookings = data.bookings;
        rehydrateSandbox.DB.set('clientsRegistry', data.clientsRegistry);
        rehydrateSandbox.DB.set('cases', data.cases);
        rehydrateSandbox.DB.set('bookings', data.bookings);
        return { ok: true };
      },
      async rehydrateBranchView() {
        const data = rehydrateSandbox.DB.store;
        this.committed.clientsRegistry = data.clientsRegistry;
        this.committed.cases = data.cases;
        this.committed.bookings = data.bookings;
        rehydrateSandbox.DB.set('clientsRegistry', data.clientsRegistry);
        rehydrateSandbox.DB.set('cases', data.cases);
        rehydrateSandbox.DB.set('bookings', data.bookings);
        return { ok: true };
      },
      getCommittedRaw(key) {
        return this.committed[key];
      },
    },
    OwnerLifecycleAuthority: { reconcileAfterRestore() { return { ok: true }; } },
    BranchAuthority: { restoreFromDurable() { return { ok: true }; } },
    AuthCredentialTruth: { syncUsersFromAuthoritativeStore() {} },
  };
  rehydrateSandbox.window = rehydrateSandbox.globalThis = rehydrateSandbox.global = rehydrateSandbox;
  vm.runInNewContext(rehydrateSrc, rehydrateSandbox);
  const RestoreRuntimeRehydrate = rehydrateSandbox.globalThis.RestoreRuntimeRehydrate || rehydrateSandbox.module.exports;

  rehydrateSandbox.clientsRegistry = [];
  rehydrateSandbox.DB.store.clientsRegistry = [];
  rehydrateSandbox.DB.store.cases = [];
  rehydrateSandbox.DB.store.bookings = [];

  const memBefore = RestoreRuntimeRehydrate.countMemoryRecords('clientsRegistry');
  check(memBefore === 0, 'rehydrate test starts with 0 clients in memory');

  rehydrateSandbox.DB.store.clientsRegistry = Array.from({ length: 1000 }, (_, i) => ({ id: `c${i}`, name: `Client ${i}` }));

  const rehydrateOut = await RestoreRuntimeRehydrate.rehydrateAfterRestore({
    rowCounts: { clientsRegistry: 1000, cases: 0, bookings: 0 },
  });
  check(rehydrateOut.ok, 'runtime rehydrate succeeds without app restart');
  const memAfter = RestoreRuntimeRehydrate.countMemoryRecords('clientsRegistry');
  check(memAfter === 1000, 'runtime rehydrate exposes 1000 clients in bridge/memory');
  check(rehydrateSandbox.clientsRegistry.length === 1000, 'reloadClientStoreFromDb updates renderer clientsRegistry');

  coordinatorMod.configure({
    getUserDataPath: () => userData,
    downloadCloudBackupByFileId: async (_id, opts) => {
      opts?.onProgress?.({ downloadedBytes: 100, totalBytes: 100, percent: 100 });
      return { ok: true, buffer: fs.readFileSync(created.path), file: { id: 'FILE123', name: 'sample.tdw', size: fs.statSync(created.path).size } };
    },
    downloadCloudBackup: async () => ({ ok: false }),
    verifyFileIdMetadata: async () => ({ ok: true, item: { id: 'FILE123', size: fs.statSync(created.path).size } }),
    runLocalRestore: async (filePath) => {
      const res = await backupV2.restoreBackupFile({
        filePath,
        userDataDir: userData,
        expectedIdentity: { centerId: 'C1', organizationId: 'C1', branchId: 'B1', authorizedBranchIds: ['B1'] },
        licensedBranchIds: ['B1'],
        skipScopeTruth: true,
        skipEmergencyBackup: true,
        closeDatabase: async () => {},
        reopenDatabase: async () => {},
      });
      return res;
    },
    reopenDatabase: async () => {},
    countDatabaseRows: (dbPath) => backupV2.countDatabaseRows(dbPath),
    rehydrateRuntime: async ({ rowCounts }) => ({
      ok: true,
      memoryCounts: { clients: rowCounts?.clientsRegistry || 0, visits: 0, bookings: 0 },
      sqliteCounts: { clients: rowCounts?.clientsRegistry || 0, visits: 0, bookings: 0 },
    }),
    inspectBackupBuffer: (buf, pwd, opts) => backupV2.inspectBackupBuffer(buf, pwd, opts),
    verifyBackupFile: (fp) => backupV2.verifyBackupFile(fp),
    scopeFromManifest: (m) => require(path.join(root, 'electron/backup-v2-scope-truth')).extractScopeSummaryFromManifest(m),
    issueBootstrapAuthorization: async () => ({ ok: true, capabilityId: 'cap-test' }),
    consumeBootstrapCapability: () => ({ ok: true }),
    assertBootstrapManifestScope: () => ({ ok: true }),
    getCapability: () => null,
    isBackupBufferEncrypted: (buf) => backupV2.isEncryptedBackupBuffer(buf),
    friendlyError: (err) => backupV2.friendlyBackupError(err),
  });

  const sandbox = { console, module: { exports: {} }, globalThis: {}, window: {} };
  sandbox.window = sandbox.globalThis;
  sandbox.global = sandbox.globalThis;
  vm.runInNewContext(stagingSrc, sandbox);
  const RestoreStaging = sandbox.globalThis.RestoreStaging || sandbox.module.exports;

  const dirty = {
    settings: { centerName: 'Clinic', centerId: 'STOLEN', deviceId: 'STOLEN-DEV', backup: { providers: { google: { connected: true } } } },
    license: { id: 'L1' },
    oauth: { token: 'x' },
    clientsRegistry: [{ id: 'c1' }, { id: 'c2' }],
    users: [{ id: 'u1', username: 'owner', role: 'owner', passwordHash: 'hash' }],
  };
  const clean = RestoreStaging.sanitizeMigrationImport(dirty, { migrationOnly: true });
  check(!clean.license && !clean.oauth, 'allowlist strips license/oauth');
  check(Array.isArray(clean.clientsRegistry) && clean.clientsRegistry.length === 2, 'allowlist keeps clients');
  check(clean.__migrationImportReport?.skipped?.some((s) => s.key === 'users.credentials'), 'credentials reported as skipped not failure');

  if (errors.length) {
    console.error('RC Hotfix Round 7 tests FAILED:\n' + errors.map((e) => '  - ' + e).join('\n'));
    process.exit(1);
  }
  console.log('All RC Hotfix Round 7 unified backup/restore checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
