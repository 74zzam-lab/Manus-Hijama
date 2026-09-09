#!/usr/bin/env node
'use strict';

/**
 * PR6 — Remove data/backup encryption from operational path.
 * Proves plaintext V2 create/restore, blocks direct encrypted restore,
 * keeps legacy decrypt for migration import only, auth primitives untouched.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../../database/connection');
const backupV2 = require('../../electron/backup-v2-core');
const legacyImport = require('../../electron/backup-v2-legacy-import');
const backupCrypto = require('../../electron/backup-crypto-v2');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remove-backup-encryption-'));
  const userDataDir = path.join(root, 'userData');
  const dbPath = path.join(userDataDir, 'database', 'tadawi.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(path.join(userDataDir, 'settings'), { recursive: true });
  fs.mkdirSync(path.join(userDataDir, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(userDataDir, 'attachments', 'photo.bin'), Buffer.from([9, 8, 7]));
  fs.writeFileSync(path.join(userDataDir, 'settings', 'app.json'), JSON.stringify({ theme: 'dark' }, null, 2));

  const db = openDatabase(dbPath);
  db.prepare(
    `INSERT INTO clients (id, name, phone, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run('c1', 'Plain Client', '0501111111', '{}', new Date().toISOString(), new Date().toISOString());
  db.close();

  const outPath = path.join(root, 'plain.tdw');
  const created = await backupV2.createBackupFile({
    userDataDir,
    outputPath: outPath,
    appVersion: '2.0.0',
    backupType: 'manual',
  });
  check(created.ok === true, 'create plaintext backup');
  check(created.manifest?.encryption?.required === false, 'manifest encryption.required false');

  const plainBuf = fs.readFileSync(outPath);
  check(backupV2.isZipBackupBuffer(plainBuf), 'output is ZIP');
  check(!backupV2.isEncryptedBackupBuffer(plainBuf), 'output is not encrypted envelope');

  const verified = backupV2.verifyBackupFile(outPath, null);
  check(verified.ok === true && verified.encrypted === false, 'verify without password');

  const restoreDir = path.join(root, 'restored');
  fs.mkdirSync(restoreDir, { recursive: true });
  const restored = await backupV2.restoreBackupFile({
    userDataDir: restoreDir,
    filePath: outPath,
    skipEmergencyBackup: true,
  });
  check(restored.ok === true, 'restore plaintext without password');
  check(fs.existsSync(path.join(restoreDir, 'database', 'tadawi.db')), 'sqlite restored');
  check(fs.existsSync(path.join(restoreDir, 'attachments', 'photo.bin')), 'attachments restored');

  // Legacy encrypted — verify with password OK, direct restore blocked
  const legacyPassword = 'legacy-import-password';
  const encPath = path.join(root, 'legacy-enc.tdw');
  fs.writeFileSync(encPath, backupCrypto.encryptBuffer(plainBuf, legacyPassword));

  const legacyVerified = backupV2.verifyBackupFile(encPath, legacyPassword);
  check(legacyVerified.encrypted === true, 'legacy verify marks encrypted');

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
  check(directRestoreBlocked, 'direct restore of encrypted backup blocked');

  let assertBlocked = false;
  try {
    backupV2.assertOperationalRestoreAllowed({ encrypted: true }, {});
  } catch (err) {
    assertBlocked = err.code === 'backup_legacy_encrypted_direct_restore_blocked';
  }
  check(assertBlocked, 'assertOperationalRestoreAllowed blocks encrypted');

  let assertAllowsMigration = false;
  try {
    const r = backupV2.assertOperationalRestoreAllowed({ encrypted: true }, { legacyMigrationImport: true });
    assertAllowsMigration = r.legacy === true;
  } catch {
    assertAllowsMigration = false;
  }
  check(assertAllowsMigration, 'assertOperationalRestoreAllowed allows migration flag');

  const picked = backupV2.pickLatestAuthorizedBackup(
    [encPath, outPath],
    legacyPassword,
    { allowMissingSourceMetadata: true }
  );
  check(picked.ok === true, 'pick skips encrypted and selects plaintext');
  check(path.basename(picked.selected.filePath) === 'plain.tdw', 'pick selected plaintext backup');
  check(
    picked.rejected.some((r) => r.reason === 'backup_legacy_encrypted_direct_restore_blocked'),
    'pick rejects encrypted for operational restore'
  );

  const importUserData = path.join(root, 'importUserData');
  fs.mkdirSync(importUserData, { recursive: true });
  const imported = await legacyImport.importLegacyEncryptedBackup({
    filePath: encPath,
    password: legacyPassword,
    userDataDir: importUserData,
  });
  check(imported.ok === true, 'legacy import succeeds with password');
  check(imported.migrationOnly === true, 'legacy import is migration-only');
  check(fs.existsSync(imported.stagingZipPath), 'legacy staging zip written');
  check(fs.existsSync(path.join(imported.stagingPath, 'legacy-import-meta.json')), 'legacy meta written');
  check(!fs.existsSync(path.join(importUserData, 'database', 'tadawi.db')), 'legacy import did not create production DB');

  let wrongFormatBlocked = false;
  try {
    backupV2.inspectBackupBuffer(Buffer.from('not-a-backup'), null);
  } catch (err) {
    wrongFormatBlocked = /invalid_backup_format/i.test(String(err.message || err.code));
  }
  check(wrongFormatBlocked, 'unsupported format fails closed');

  let wrongLegacyPassword = false;
  const badImport = await legacyImport.importLegacyEncryptedBackup({
    filePath: encPath,
    password: 'wrong-password-here',
    userDataDir,
  });
  wrongLegacyPassword = badImport.ok === false;
  check(wrongLegacyPassword, 'wrong legacy password fails import');

  let plainNotLegacy = false;
  const plainImport = await legacyImport.importLegacyEncryptedBackup({
    filePath: outPath,
    password: legacyPassword,
    userDataDir,
  });
  plainNotLegacy = plainImport.error === 'not_legacy_encrypted_backup';
  check(plainNotLegacy, 'plaintext rejected by legacy import path');

  // Auth/security primitives remain (static checks — not removed in this PR)
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  check(/pbkdf2:/.test(indexHtml), 'password hashing markers still present');
  check(fs.existsSync(path.join(__dirname, '..', '..', 'electron', 'backup-crypto-v2.js')), 'backup-crypto-v2 kept for legacy decrypt');
  check(typeof backupCrypto.decryptBuffer === 'function', 'legacy decrypt still exported');

  fs.rmSync(root, { recursive: true, force: true });

  if (errors.length) {
    console.error('FAIL: remove-backup-encryption');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('OK: remove-backup-encryption (plaintext create/restore, legacy import-only, auth primitives preserved)');
}

main().catch((err) => {
  console.error('FAIL: remove-backup-encryption fatal', err);
  process.exit(1);
});
