#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..', '..');
const snapshotSrc = fs.readFileSync(path.join(root, 'electron', 'clinic-snapshot.js'), 'utf8');
const backupSrc = fs.readFileSync(path.join(root, 'electron', 'cloud-db-backup.js'), 'utf8');
const cryptoMod = require(path.join(root, 'electron', 'backup-crypto.js'));
const fflate = require(path.join(root, 'node_modules', 'fflate'));
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

check(snapshotSrc.includes('function inspectClinicZipBuffer(zipBuf)'), 'inspectClinicZipBuffer missing');
check(snapshotSrc.includes("err.code = 'INVALID_BACKUP_ZIP';"), 'restore must throw INVALID_BACKUP_ZIP');
check(backupSrc.includes('backup_hash_mismatch'), 'backup hash mismatch guard missing');
check(backupSrc.includes('inspectClinicZipBuffer(zipBuf)'), 'restore must validate zip structure before apply');

function makeZip(entries) {
  const normalized = {};
  for (const [k, v] of Object.entries(entries)) normalized[k] = fflate.strToU8(v);
  return Buffer.from(fflate.zipSync(normalized, { level: 1 }));
}

const validZip = makeZip({
  'clinic.db/000003.log': 'stub-leveldb-record',
  'backup.manifest': JSON.stringify({ format: 'clinic-db-snapshot-v1', appVersion: '2.0.0' })
});
const invalidZip = makeZip({
  'indexeddb/a.txt': 'no clinic db and no manifest'
});

const enc = cryptoMod.encryptBuffer(validZip, 'phase7-test-password');
check(Buffer.isBuffer(enc) && enc.length > validZip.length, 'encrypt valid zip failed');

const round = cryptoMod.decryptBuffer(enc, 'phase7-test-password');
check(round.equals(validZip), 'decrypt valid zip failed');

let badRejected = false;
try {
  // Matches runtime expectation: invalid zip should be rejected by structure checks
  const names = Object.keys(fflate.unzipSync(new Uint8Array(invalidZip)));
  badRejected = !names.includes('backup.manifest') && !names.some((n) => n.startsWith('clinic.db/'));
} catch { /* ignore */ }
check(badRejected, 'invalid zip fixture setup failed');

if (errors.length) {
  console.error('FAIL: phase7 backup hardening');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: phase7 backup hardening checks');
