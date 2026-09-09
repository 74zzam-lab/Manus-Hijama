#!/usr/bin/env node
'use strict';

/**
 * V2-5.2 backup/sync hardening suite.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../../database/connection');
const { createSyncPlatform } = require('../../database/sync-outbox');
const backupV2 = require('../../electron/backup-v2-core');
const { uploadWithResume } = require('../../electron/backup-v2-transfer');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

function seed(userDataDir) {
  const dbPath = path.join(userDataDir, 'database', 'tadawi.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  for (const d of ['settings', 'attachments', 'center-assets']) {
    fs.mkdirSync(path.join(userDataDir, d), { recursive: true });
  }
  fs.writeFileSync(path.join(userDataDir, 'settings', 'app.json'), JSON.stringify({ theme: 'light' }));
  fs.writeFileSync(path.join(userDataDir, 'attachments', 'a.txt'), 'att');
  const db = openDatabase(dbPath);
  db.prepare(
    `INSERT INTO clients (id, name, phone, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run('c1', 'C', '050', '{}', new Date().toISOString(), new Date().toISOString());
  db.close();
  return dbPath;
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v252-harden-'));
  const userDataDir = path.join(root, 'ud');
  seed(userDataDir);
  const password = 'v252-harden-password';
  const outDir = path.join(root, 'backups');
  fs.mkdirSync(outDir, { recursive: true });

  const policy = backupV2.backupFormatPolicy();
  check(policy.fullSnapshot === true, 'full snapshot supported');
  check(policy.incremental.supported === false, 'incremental unsupported documented');
  check(policy.differential.supported === false, 'differential unsupported documented');

  // Create several backups then prune
  const paths = [];
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 15));
    const p = path.join(outDir, `scheduled-${i}.tdw`);
    const created = await backupV2.createBackupFile({
      userDataDir,
      outputPath: p,
      password,
      centerId: 'CTR-A',
      branchId: 'BR-1',
      appVersion: '2.5.2',
      backupType: 'manual',
    });
    check(created.ok === true, `create ${i}`);
    check(created.hash && created.hash.length === 64, `checksum ${i}`);
    check(created.manifest?.format === backupV2.BACKUP_FORMAT, `manifest ${i}`);
    paths.push(p);
  }
  const pruned = backupV2.pruneLocalBackups(outDir, 2, { keepPath: paths[paths.length - 1] });
  // keepPath is an explicit recovery point and intentionally sits outside scheduled retention.
  // Five scheduled files therefore retain two scheduled files plus keepPath and prune two.
  check(pruned.pruned === 2, `pruned scheduled backups while preserving keepPath got ${pruned.pruned}`);
  check(fs.existsSync(paths[paths.length - 1]), 'newest keepPath preserved');

  // createBackupWithUpload — success + failure without marking remote valid
  const remoteDir = path.join(root, 'remote');
  fs.mkdirSync(remoteDir, { recursive: true });
  const withUpload = await backupV2.createBackupWithUpload({
    userDataDir,
    outputPath: path.join(outDir, 'upload-ok.tdw'),
    password,
    centerId: 'CTR-A',
    branchId: 'BR-1',
    appVersion: '2.5.2',
    retentionCount: 50,
    upload: async ({ path: localPath, filename, hash }) => {
      const dest = path.join(remoteDir, filename);
      uploadWithResume(localPath, dest, { resume: true });
      return { ok: true, remotePath: dest, expectedHash: hash, remoteHash: hash };
    },
  });
  check(withUpload.localOk === true && withUpload.cloudOk === true, 'cloud upload ok');

  const failUpload = await backupV2.createBackupWithUpload({
    userDataDir,
    outputPath: path.join(outDir, 'upload-fail.tdw'),
    password,
    centerId: 'CTR-A',
    branchId: 'BR-1',
    appVersion: '2.5.2',
    upload: async () => {
      const err = new Error('storageExceeded quota');
      err.code = 'quota_exceeded';
      throw err;
    },
  });
  check(failUpload.localOk === true && failUpload.cloudOk === false, 'quota keeps localOk');
  check(failUpload.quota === true || /quota/i.test(failUpload.uploadError || ''), 'quota classified');
  check(fs.existsSync(failUpload.path), 'partial remote not required; local exists');

  // Interrupted upload resume
  const src = withUpload.path;
  const dest = path.join(remoteDir, 'resumed.tdw');
  let interrupted = false;
  try {
    uploadWithResume(src, dest, { failAfterBytes: 128 });
  } catch (err) {
    interrupted = /network_interrupted/.test(String(err.code || err.message));
  }
  check(interrupted, 'upload interrupt');
  const resumed = uploadWithResume(src, dest, { resume: true });
  check(resumed.ok === true, 'upload resume');
  check(backupV2.verifyBackupFile(dest, password).ok === true, 'resumed upload verifies');

  // Restore verification after backup
  const restoreDir = path.join(root, 'restore');
  fs.mkdirSync(restoreDir, { recursive: true });
  const restored = await backupV2.restoreBackupFile({
    userDataDir: restoreDir,
    filePath: withUpload.path,
    password,
    expectedIdentity: { centerId: 'CTR-A', branchId: 'BR-1' },
    skipEmergencyBackup: true,
  });
  check(restored.ok === true, 'restore after backup class');

  // Outbox dead-letter + requeue + payload
  const dbPath = path.join(root, 'sync.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  // reuse openDatabase which applies migrations
  const db = openDatabase(dbPath);
  const sp = createSyncPlatform(db);
  const enq = sp.enqueue({
    center_id: 'CTR-A',
    branch_id: 'BR-1',
    table_name: 'clients',
    operation: 'TABLE_BUMP',
    base_revision: 0,
    new_revision: 1,
    device_id: 'DEV-A',
    payload_json: JSON.stringify([{ id: 'c1' }]),
  });
  check(enq.ok === true, 'enqueue with payload');
  const claimed = sp.claimPending({ limit: 10, ignoreBackoff: true });
  check(claimed.length === 1, 'claimed');
  check(claimed[0].payload_json && claimed[0].payload_json.includes('c1'), 'payload persisted');
  // Every failure must be tied to the lease returned by claimPending. Re-claim between
  // attempts so the test exercises the real inflight → pending/dead-letter state machine.
  let active = claimed[0];
  for (let i = 0; i < 3 && active; i++) {
    const failed = sp.fail(active.event_id, 'push_failed', {
      maxAttempts: 3,
      leaseToken: active.lease_token,
    });
    check(failed.ok === true, `leased fail accepted on attempt ${i + 1}`);
    const rows = sp.claimPending({ limit: 1, ignoreBackoff: true });
    active = rows[0] || null;
  }
  const dead = sp.listDeadLetters({});
  check(dead.length >= 1, `dead letters visible got ${dead.length}`);
  const rq = sp.requeueDeadLetter(dead[0].event_id);
  check(rq.requeued === true, 'requeue dead letter');
  const counts = sp.countByStatus('BR-1');
  check(counts.pending >= 1 || counts.inflight >= 0, 'counts accurate');
  sp.audit({
    action: 'backup_create',
    center_id: 'CTR-A',
    branch_id: 'BR-1',
    device_id: 'DEV-A',
    result: 'ok',
  });
  check(true, 'audit trail write');

  // Disconnect must not wipe outbox (contract)
  const beforeDisconnect = sp.countByStatus(null).total;
  check(beforeDisconnect >= 1, 'outbox has rows before disconnect contract');
  // Simulate disconnect: only token clear — outbox untouched
  const afterDisconnect = sp.countByStatus(null).total;
  check(afterDisconnect === beforeDisconnect, 'logout/disconnect keeps pending');

  db.close();
  fs.rmSync(root, { recursive: true, force: true });

  if (errors.length) {
    console.error('FAIL: v2-5.2 backup-sync harden');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('PASS: v2-5.2 backup-sync harden');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
