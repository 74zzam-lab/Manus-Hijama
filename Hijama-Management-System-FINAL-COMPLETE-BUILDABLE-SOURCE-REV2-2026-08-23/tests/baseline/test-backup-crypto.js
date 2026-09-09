#!/usr/bin/env node
'use strict';

const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..', '..');
const cryptoMod = require(path.join(root, 'electron', 'backup-crypto.js'));

const errors = [];
const sample = Buffer.from(JSON.stringify({
  cases: [{ id: '1', total: 100 }],
  clientsRegistry: [{ id: 'c1', name: 'Test' }],
}), 'utf8');

const password = 'baseline-test-password';
const enc = cryptoMod.encryptBuffer(sample, password);
if (!Buffer.isBuffer(enc) || enc.length < 52) errors.push('encrypt_failed');
if (!enc.subarray(0, 4).equals(Buffer.from('CDBK'))) errors.push('magic');

const dec = cryptoMod.decryptBuffer(enc, password);
if (!dec.equals(sample)) errors.push('roundtrip');

let badPass = false;
try {
  cryptoMod.decryptBuffer(enc, 'wrong-password');
} catch {
  badPass = true;
}
if (!badPass) errors.push('bad_password_accepted');

const hash = cryptoMod.sha256Hex(sample);
const expected = crypto.createHash('sha256').update(sample).digest('hex');
if (hash !== expected) errors.push('sha256');

if (errors.length) {
  console.error('FAIL: baseline backup crypto', errors.join('; '));
  process.exit(1);
}
console.log('OK: baseline backup create/encrypt/decrypt/hash');
console.log('  sha256:', hash.slice(0, 16) + '…');
