#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../../database/connection');
const { createSyncPlatform } = require('../../database/sync-outbox');
const backupV2 = require('../../electron/backup-v2-core');
const scopeTruth = require('../../electron/backup-v2-scope-truth');
const { createDeviceCache } = require('../../electron/device-cache');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

function seedUserData(userDataDir, centerId, branchId) {
  const dbPath = path.join(userDataDir, 'database', 'tadawi.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(path.join(userDataDir, 'settings'), { recursive: true });
  fs.mkdirSync(path.join(userDataDir, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(userDataDir, 'attachments', 'a.txt'), 'file-a');
  fs.writeFileSync(path.join(userDataDir, 'settings', 'app.json'), JSON.stringify({ centerId, branchId }, null, 2));
  const db = openDatabase(dbPath);
  db.prepare(`INSERT INTO clients (id, name, phone, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run('c1', 'Client', '050', '{}', new Date().toISOString(), new Date().toISOString());
  db.close();
  return dbPath;
}

function writeVersions(userDataDir, centerId, branches) {
  const cache = createDeviceCache(userDataDir);
  cache.writeVersions(centerId, {
    centerId,
    databaseVersion: 5,
    branches,
    updatedAt: new Date().toISOString(),
  });
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-scope-truth-'));
  const userDataDir = path.join(root, 'userData');
  const centerId = 'CTR-SCOPE';
  const branchMain = 'BR-MAIN';
  const branchJed = 'BR-JED';

  seedUserData(userDataDir, centerId, branchMain);
  writeVersions(userDataDir, centerId, {
    [branchMain]: { databaseVersion: 12, settingsVersion: 3 },
    [branchJed]: { databaseVersion: 8, settingsVersion: 2 },
  });

  const dbPath = path.join(userDataDir, 'database', 'tadawi.db');
  const db = openDatabase(dbPath);
  const sp = createSyncPlatform(db);
  db.close();

  const branchCtx = {
    centerId,
    branchId: branchMain,
    deviceId: 'DEV-1',
    licensedBranchIds: [branchMain],
    localBranchIds: [branchMain],
    branchNames: { [branchMain]: 'المدينة' },
    appVersion: '2.5.10',
  };

  let signals = scopeTruth.collectDatabaseSignals(dbPath, userDataDir, branchCtx);
  check(signals.integrity?.ok === true, 'integrity PASS for branch signals');
  check(signals.attachmentsCount === 1, 'attachmentsCount captured');

  const branchScope = scopeTruth.resolveBackupScope('branch', signals, branchCtx);
  check(branchScope.scopeType === 'branch', 'branch classification');
  check(branchScope.includedBranchIds.includes(branchMain), 'branch includes active branch');
  check(branchScope.scopeLabelAr.includes('نسخة فرع'), 'branch Arabic label');
  check(branchScope.sourceDeviceId === 'DEV-1', 'sourceDeviceId on branch scope');

  const createdBranch = await backupV2.createBackupFile({
    userDataDir,
    outputPath: path.join(root, 'branch.tdw'),
    appVersion: '2.5.10',
    centerId,
    branchId: branchMain,
    deviceId: 'DEV-1',
    scopeType: 'branch',
    scopeTruth: branchScope,
  });
  const manifest = createdBranch.manifest;
  check(manifest.scopeTruth?.classification === 'branch', 'manifest scopeTruth.classification branch');
  check(Array.isArray(manifest.scopeTruth?.includedBranchIds), 'manifest includedBranchIds');
  check(manifest.scopeTruth?.recordCounts != null, 'manifest recordCounts');
  check(manifest.scopeTruth?.attachmentsCount === 1, 'manifest attachmentsCount');
  check(manifest.scopeTruth?.syncRevisionByBranch?.[branchMain]?.databaseVersion === 12, 'manifest syncRevisionByBranch');
  check(manifest.appVersion === '2.5.10', 'manifest appVersion');
  check(manifest.schemaVersion != null, 'manifest schemaVersion');

  const extracted = scopeTruth.extractScopeSummaryFromManifest(manifest);
  check(extracted.scopeLabelAr.includes('المدينة'), 'extract scope label from manifest');

  // Organization blocked when licensed branch missing locally
  const orgCtxMissing = {
    ...branchCtx,
    licensedBranchIds: [branchMain, branchJed],
    localBranchIds: [branchMain],
    branchNames: { [branchMain]: 'المدينة', [branchJed]: 'جدة' },
  };
  signals = scopeTruth.collectDatabaseSignals(dbPath, userDataDir, orgCtxMissing);
  let orgBlocked = false;
  try {
    scopeTruth.resolveBackupScope('organization', signals, orgCtxMissing);
  } catch (err) {
    orgBlocked = err.code === 'org_backup_not_ready';
    check(err.details?.missingBranches?.includes(branchJed), 'org blocked — missing branch locally');
  }
  check(orgBlocked, 'organization backup blocked when branch missing');

  // Organization blocked when pending outbox
  const db2 = openDatabase(dbPath);
  const sp2 = createSyncPlatform(db2);
  sp2.enqueue({
    center_id: centerId,
    branch_id: branchMain,
    table_name: 'cases',
    record_id: 'c1',
    operation: 'UPDATE',
    payload_json: '{}',
    device_id: 'DEV-1',
    idempotency_key: 'idem-1',
    status: 'pending',
  });
  db2.close();

  const orgCtxBoth = {
    ...branchCtx,
    licensedBranchIds: [branchMain],
    localBranchIds: [branchMain],
  };
  signals = scopeTruth.collectDatabaseSignals(dbPath, userDataDir, orgCtxBoth);
  orgBlocked = false;
  try {
    scopeTruth.resolveBackupScope('organization', signals, orgCtxBoth);
  } catch (err) {
    orgBlocked = err.code === 'org_backup_not_ready';
    check((err.details?.reasons || []).some((r) => r.code === 'pending_outbox'), 'org blocked — pending outbox');
  }
  check(orgBlocked, 'organization backup blocked with pending outbox');

  // Clean outbox + add open conflict → blocked
  const db3 = openDatabase(dbPath);
  db3.prepare(`UPDATE sync_outbox SET status='acked' WHERE status='pending'`).run();
  const sp3 = createSyncPlatform(db3);
  sp3.openConflict({
    conflict_id: 'cf-1',
    center_id: centerId,
    branch_id: branchMain,
    table_name: 'cases',
    record_id: 'c1',
    local_json: { id: 'c1' },
    remote_json: { id: 'c1', v: 2 },
  });
  db3.close();

  signals = scopeTruth.collectDatabaseSignals(dbPath, userDataDir, orgCtxBoth);
  orgBlocked = false;
  try {
    scopeTruth.resolveBackupScope('organization', signals, orgCtxBoth);
  } catch (err) {
    orgBlocked = err.code === 'org_backup_not_ready';
    check((err.details?.reasons || []).some((r) => r.code === 'blocking_conflicts'), 'org blocked — open conflicts');
  }
  check(orgBlocked, 'organization backup blocked with open conflicts');

  // Full org readiness PASS
  const db4 = openDatabase(dbPath);
  db4.prepare(`UPDATE sync_conflicts SET status='resolved' WHERE status='open'`).run();
  db4.close();
  writeVersions(userDataDir, centerId, {
    [branchMain]: { databaseVersion: 12, settingsVersion: 3 },
  });

  signals = scopeTruth.collectDatabaseSignals(dbPath, userDataDir, orgCtxBoth);
  const orgScope = scopeTruth.resolveBackupScope('organization', signals, orgCtxBoth);
  check(orgScope.scopeType === 'organization', 'organization scope when gates pass');
  check(orgScope.scopeLabelAr.includes('نسخة مؤسسة'), 'organization Arabic label');
  check(orgScope.readiness?.ok === true, 'readiness snapshot ok');

  const readiness = scopeTruth.assessBackupReadiness(userDataDir, dbPath, orgCtxBoth);
  check(readiness.organizationAllowed === true, 'assessBackupReadiness organizationAllowed');
  check(readiness.branch.ready === true, 'assessBackupReadiness branch ready');

  if (errors.length) {
    console.error('FAIL backup-v2-scope-truth');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('OK: backup v2 scope truth + org readiness gate');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
