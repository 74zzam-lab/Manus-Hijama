#!/usr/bin/env node
'use strict';

/**
 * PR9 — Atomic Restore & Recovery behavioral suite.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../../database/connection');
const backupV2 = require('../../electron/backup-v2-core');
const restoreValidation = require('../../electron/restore-v2-validation');

const errors = [];
function check(ok, msg) { if (!ok) errors.push(msg); }

function seedUserData(userDataDir, clientId, centerId = 'CTR-A', branchId = 'BR-1') {
  const dbPath = path.join(userDataDir, 'database', 'tadawi.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(path.join(userDataDir, 'settings'), { recursive: true });
  fs.mkdirSync(path.join(userDataDir, 'attachments'), { recursive: true });
  fs.mkdirSync(path.join(userDataDir, 'center-assets'), { recursive: true });
  fs.writeFileSync(path.join(userDataDir, 'settings', 'app.json'), JSON.stringify({ theme: 'light', centerId }, null, 2));
  const attachment = path.join(userDataDir, 'attachments', 'note.txt');
  fs.writeFileSync(attachment, `attachment-for-${clientId}`);
  const db = openDatabase(dbPath);
  db.prepare(
    `INSERT INTO clients (id, name, phone, branch_id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(clientId, 'Client ' + clientId, '0500000000', branchId, '{}', new Date().toISOString(), new Date().toISOString());
  db.close();
  return { dbPath, attachment };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr9-restore-'));
  const userDataDir = path.join(root, 'userData');
  seedUserData(userDataDir, 'c-live');

  const backupPath = path.join(root, 'backup.tdw');
  await backupV2.createBackupFile({
    userDataDir,
    outputPath: backupPath,
    appVersion: '2.5.1',
    backupType: 'manual',
    centerId: 'CTR-A',
    organizationId: 'CTR-A',
    branchId: 'BR-1',
    branchIds: ['BR-1'],
  });

  const liveHashBefore = backupV2.hashTree(path.join(userDataDir, 'attachments'));

  // Pre-swap failure: wrong center → production unchanged
  let centerRejected = false;
  try {
    await backupV2.restoreBackupFile({
      userDataDir,
      filePath: backupPath,
      expectedIdentity: { centerId: 'CTR-OTHER', branchId: 'BR-1' },
      skipEmergencyBackup: true,
      skipSafetySnapshot: true,
    });
  } catch (err) {
    centerRejected = err.code === 'restore_center_mismatch';
    check(err.stage === restoreValidation.STAGES.VALIDATION || !err.stage, 'center reject has validation stage');
  }
  check(centerRejected, 'wrong center rejected before swap');
  check(JSON.stringify(backupV2.hashTree(path.join(userDataDir, 'attachments'))) === JSON.stringify(liveHashBefore), 'attachments unchanged after pre-swap fail');

  // Corrupt archive → validation stage
  const corruptPath = path.join(root, 'corrupt.tdw');
  const buf = fs.readFileSync(backupPath);
  buf[buf.length - 5] ^= 0xff;
  fs.writeFileSync(corruptPath, buf);
  let corruptStage = null;
  try {
    await backupV2.restoreBackupFile({
      userDataDir,
      filePath: corruptPath,
      expectedIdentity: { centerId: 'CTR-A', branchId: 'BR-1' },
      skipEmergencyBackup: true,
    });
  } catch (err) {
    corruptStage = err.stage || 'thrown';
  }
  check(corruptStage === restoreValidation.STAGES.VALIDATION || corruptStage === 'thrown', 'corrupt archive fails at validation');

  // Swap failpoint → rollback
  let rollbackOk = false;
  try {
    await backupV2.restoreBackupFile({
      userDataDir,
      filePath: backupPath,
      expectedIdentity: { centerId: 'CTR-A', branchId: 'BR-1', authorizedBranchIds: ['BR-1'] },
      skipEmergencyBackup: true,
      skipSafetySnapshot: true,
      failpoint: 'after_first_swap',
      closeDatabase: async () => {},
      reopenDatabase: async () => {},
    });
  } catch (err) {
    rollbackOk = true;
    check(err.stage === restoreValidation.STAGES.SWAP, 'swap failpoint sets swap stage');
  }
  check(rollbackOk, 'swap failpoint triggers rollback path');
  check(fs.existsSync(path.join(userDataDir, 'database', 'tadawi.db')), 'DB present after swap rollback');

  // Successful restore to clean dir
  const restoreDir = path.join(root, 'device-restored');
  fs.mkdirSync(restoreDir, { recursive: true });
  const restored = await backupV2.restoreBackupFile({
    userDataDir: restoreDir,
    filePath: backupPath,
    expectedIdentity: { centerId: 'CTR-A', branchId: 'BR-1', authorizedBranchIds: ['BR-1'] },
    skipEmergencyBackup: true,
    skipSafetySnapshot: true,
  });
  check(restored.ok === true, 'successful restore');
  check(restored.reconciliationRequired === true, 'reconciliation required flag set');
  const gate = backupV2.readRestoreGate(restoreDir);
  check(gate.verified === true && gate.reconciliationRequired === true, 'gate marks reconciliation required');
  const counts = backupV2.countDatabaseRows(path.join(restoreDir, 'database', 'tadawi.db'));
  check(counts.ok === true && Number(counts.counts?.clients || 0) >= 1, 'restored DB valid');

  // Idempotent retry same backup
  const again = await backupV2.restoreBackupFile({
    userDataDir: restoreDir,
    filePath: backupPath,
    expectedIdentity: { centerId: 'CTR-A', branchId: 'BR-1' },
    skipEmergencyBackup: true,
  });
  check(again.idempotent === true, 'idempotent retry does not re-swap');

  // scopeTruth branch mismatch
  const manifest = backupV2.inspectBackupBuffer(fs.readFileSync(backupPath)).manifest;
  manifest.scopeTruth = { includedBranchIds: ['BR-OTHER'], classification: 'branch' };
  let scopeRejected = false;
  try {
    restoreValidation.assertRestoreScopeTruthAllowed(manifest, {
      authorizedBranchIds: ['BR-1'],
      licensedBranchIds: ['BR-1'],
    });
  } catch (err) {
    scopeRejected = err.code === 'restore_branch_scope_mismatch';
    check(err.stage === restoreValidation.STAGES.VALIDATION, 'scope mismatch validation stage');
  }
  check(scopeRejected, 'branch scope mismatch rejected');

  // Semantic invariant: duplicate owners
  const badDbDir = path.join(root, 'bad-db');
  fs.mkdirSync(badDbDir, { recursive: true });
  const badDbPath = path.join(badDbDir, 'tadawi.db');
  fs.copyFileSync(path.join(restoreDir, 'database', 'tadawi.db'), badDbPath);
  const badDb = openDatabase(badDbPath);
  badDb.prepare(`INSERT INTO users (id, username, role, payload_json) VALUES ('u1','a','owner','{}'), ('u2','b','owner','{}')`).run();
  badDb.close();
  let semanticRejected = false;
  try {
    restoreValidation.validateStagedSemanticInvariants(badDbPath, { allowedBranchIds: ['BR-1'] });
  } catch (err) {
    semanticRejected = err.code === 'restore_semantic_invariant_failed';
    check(err.stage === restoreValidation.STAGES.INTEGRITY, 'semantic fail integrity stage');
  }
  check(semanticRejected, 'multiple owners rejected');

  // Interrupted restore recovery simulation
  const crashDir = path.join(root, 'crash-dir');
  seedUserData(crashDir, 'c-crash');
  const rollbackRoot = path.join(crashDir, '.restore-v2-rollback-test');
  fs.mkdirSync(path.join(rollbackRoot, 'database'), { recursive: true });
  fs.copyFileSync(path.join(crashDir, 'database', 'tadawi.db'), path.join(rollbackRoot, 'database', 'tadawi.db'));
  backupV2.writeRestoreGate(crashDir, { pending: true, verified: false, backupId: 'test-bid' });
  fs.renameSync(rollbackRoot, path.join(crashDir, `.restore-v2-rollback-${Date.now()}-9999`));
  const recovered = restoreValidation.recoverInterruptedRestore(crashDir);
  check(recovered.action === 'rolled_back', 'interrupted restore recovered via rollback');

  // Static wiring
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  check(html.includes('restore-post-open.js'), 'restore-post-open loaded');
  check(html.includes('RestorePostOpen.runPostOpenVerification'), 'login runs post-open verification');
  check(fs.existsSync(path.join(__dirname, '..', '..', 'electron', 'restore-v2-validation.js')), 'restore-v2-validation module exists');

  fs.rmSync(root, { recursive: true, force: true });

  if (errors.length) {
    console.error('FAIL: atomic-restore-recovery');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('OK: atomic-restore-recovery — staging/validation/rollback/idempotent/reconciliation gates');
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
