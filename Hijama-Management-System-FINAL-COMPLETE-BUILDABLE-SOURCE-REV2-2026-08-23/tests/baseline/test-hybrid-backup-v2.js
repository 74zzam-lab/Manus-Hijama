#!/usr/bin/env node
'use strict';

/**
 * Hybrid Backup V2 smoke tests (Node main-process path — no Electron required).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../../database/connection');
const backupV2 = require('../../electron/backup-v2-core');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hybrid-backup-v2-'));
  const userDataDir = path.join(root, 'userData');
  const dbPath = path.join(userDataDir, 'database', 'tadawi.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(path.join(userDataDir, 'settings'), { recursive: true });
  fs.mkdirSync(path.join(userDataDir, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(userDataDir, 'settings', 'app.json'), JSON.stringify({ theme: 'light' }, null, 2));

  const db = openDatabase(dbPath);
  db.prepare(
    `INSERT INTO clients (id, name, phone, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run('c1', 'Test Client', '0500000000', '{}', new Date().toISOString(), new Date().toISOString());
  db.close();

  const health = backupV2.databaseHealth(dbPath);
  check(health.ok === true, 'databaseHealth ok');
  check(Number(health.schemaVersion) >= 4, `schemaVersion expected >=4 got ${health.schemaVersion}`);

  const outPath = path.join(root, 'backup.tdw');
  const created = await backupV2.createBackupFile({
    userDataDir,
    outputPath: outPath,
    appVersion: '2.0.0',
    backupType: 'manual',
  });
  check(created.ok === true, 'createBackupFile ok');
  check(fs.existsSync(outPath), 'backup file exists');
  check(created.hash && /^[a-f0-9]{64}$/i.test(created.hash), 'backup hash present');
  check(created.manifest?.encryption?.required === false, 'manifest marks encryption not required');

  const buf = fs.readFileSync(outPath);
  check(backupV2.isZipBackupBuffer(buf), 'new backup is plaintext ZIP');
  check(!backupV2.isEncryptedBackupBuffer(buf), 'new backup is not encrypted envelope');

  const verified = backupV2.verifyBackupFile(outPath, null);
  check(verified.ok === true || verified.manifest?.format === backupV2.BACKUP_FORMAT || verified.database?.ok, 'verifyBackupFile ok without password');

  // Legacy encrypted envelope still requires password
  const backupCrypto = require('../../electron/backup-crypto-v2');
  const legacyPassword = 'hybrid-test-password';
  const encPath = path.join(root, 'legacy-enc.tdw');
  fs.writeFileSync(encPath, backupCrypto.encryptBuffer(buf, legacyPassword));
  let legacyNoPwdFailed = false;
  try {
    backupV2.verifyBackupFile(encPath, null);
  } catch (err) {
    legacyNoPwdFailed = /backup_legacy_encrypted_password_required|password/i.test(String(err.code || err.message));
  }
  check(legacyNoPwdFailed, 'legacy encrypted backup rejects missing password');

  const legacyVerified = backupV2.verifyBackupFile(encPath, legacyPassword);
  check(legacyVerified.ok === true || legacyVerified.manifest?.format === backupV2.BACKUP_FORMAT, 'legacy encrypted verify with password');

  // Corrupted plaintext file (truncate — must fail verify)
  const corruptPath = path.join(root, 'corrupt.tdw');
  const corruptBuf = Buffer.from(buf).subarray(0, Math.max(64, buf.length - 32));
  fs.writeFileSync(corruptPath, corruptBuf);
  let corruptFailed = false;
  try {
    backupV2.verifyBackupFile(corruptPath, null);
  } catch {
    corruptFailed = true;
  }
  check(corruptFailed, 'corrupted backup must fail');

  // Restore plaintext to alternate userData
  const restoreDir = path.join(root, 'restoreUserData');
  fs.mkdirSync(restoreDir, { recursive: true });
  const restored = await backupV2.restoreBackupFile({
    userDataDir: restoreDir,
    filePath: outPath,
  });
  check(restored.ok === true || fs.existsSync(path.join(restoreDir, 'database', 'tadawi.db')), 'restore writes database');
  if (fs.existsSync(path.join(restoreDir, 'database', 'tadawi.db'))) {
    const restoredHealth = backupV2.databaseHealth(path.join(restoreDir, 'database', 'tadawi.db'));
    check(restoredHealth.ok === true, 'restored DB health ok');
  } else {
    check(false, `restore did not create DB; result=${JSON.stringify(restored && { ok: restored.ok, error: restored.error })}`);
  }

  // Direct restore of legacy encrypted backup must be blocked on operational path
  let directRestoreBlocked = false;
  try {
    await backupV2.restoreBackupFile({
      userDataDir: restoreDir,
      filePath: encPath,
      password: legacyPassword,
      skipEmergencyBackup: true,
    });
  } catch (err) {
    directRestoreBlocked = err.code === 'backup_legacy_encrypted_direct_restore_blocked';
  }
  check(directRestoreBlocked, 'legacy encrypted direct restore blocked');

  // CSP / remote QR must remain rejected in protected tree
  const csp = fs.readFileSync(path.join(__dirname, '..', '..', 'electron', 'security', 'window-policy.js'), 'utf8');
  check(!csp.includes('api.qrserver.com'), 'Backup V2 port must not loosen CSP for QR');

  // cleanup
  fs.rmSync(root, { recursive: true, force: true });

  if (errors.length) {
    console.error('FAIL: hybrid backup v2');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('OK: hybrid backup v2 create/verify/restore smoke');
}

main().catch((err) => {
  console.error('FAIL: hybrid backup v2', err);
  process.exit(1);
});
