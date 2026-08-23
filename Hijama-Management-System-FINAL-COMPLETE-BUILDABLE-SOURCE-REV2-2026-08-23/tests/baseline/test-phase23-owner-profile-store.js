#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'cloud', 'owner-profile.js'), 'utf8');

const store = new Map();
const sandbox = {
  console,
  DB: {
    get(key, def) { return store.has(key) ? store.get(key) : def; },
    set(key, val) { store.set(key, val); }
  },
  Organization: { getId: () => 'NJR-CLINIC-ORG00001' },
  CenterId: { getStoredCenterId: () => 'NJR-CLINIC-ORG00001' },
  LicenseCloud: {
    loadLocal() {
      return {
        ownerIdentity: { boundGoogleEmail: 'owner@example.com', identityRevision: 2 }
      };
    }
  },
  crypto: {
    getRandomValues(arr) {
      for (let i = 0; i < arr.length; i++) arr[i] = (i * 13 + 7) % 256;
      return arr;
    }
  },
  TextEncoder: class TextEncoder {
    encode(v) { return Buffer.from(String(v), 'utf8'); }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

async function run() {
  try {
    vm.runInNewContext(src, sandbox, { timeout: 1000 });
  } catch (e) {
    errors.push('owner-profile eval failed: ' + e.message);
    return;
  }

  const OP = sandbox.OwnerProfile;
  check(!!OP, 'OwnerProfile not exported');
  check(OP.OWNER_PROFILE_KEY === '__tdw_owner_profile__', 'owner profile key mismatch');
  check(OP.hasProfile() === false, 'profile should not exist initially');

  const created = await OP.createProfile({
    username: '  OWNER1 ',
    password: 'Pass#123',
    recoveryPin: '1234'
  });
  check(created.ok === true, 'createProfile should succeed');
  check(OP.hasProfile() === true, 'profile should exist after create');

  const summary = OP.summarize();
  check(summary.exists === true, 'summary exists false');
  check(summary.username === 'owner1', 'username should be normalized lowercase');
  check(summary.orgId === 'NJR-CLINIC-ORG00001', 'org id should map from Organization facade');
  check(summary.centerId === 'NJR-CLINIC-ORG00001', 'center id should map from CenterId');
  check(summary.hasCloudIdentity === true, 'cloud identity should be captured');

  const verifyGood = await OP.verifyPassword('owner1', 'Pass#123');
  const verifyBad = await OP.verifyPassword('owner1', 'wrong-pass');
  check(verifyGood === true, 'password verification should succeed for good password');
  check(verifyBad === false, 'password verification should fail for wrong password');

  const recGood = await OP.verifyRecoveryCode('1234');
  const recBad = await OP.verifyRecoveryCode('9999');
  check(recGood === true, 'recovery verification should succeed');
  check(recBad === false, 'recovery verification should fail');

  const rotate = await OP.rotatePassword('Next@123');
  check(rotate.ok === true, 'rotate password should succeed');
  const oldPasswordAfterRotate = await OP.verifyPassword('owner1', 'Pass#123');
  const newPasswordAfterRotate = await OP.verifyPassword('owner1', 'Next@123');
  check(oldPasswordAfterRotate === false, 'old password should fail after rotate');
  check(newPasswordAfterRotate === true, 'new password should pass after rotate');

  const secondCreate = await OP.createProfile({
    username: 'owner2',
    password: 'Another#1',
    recoveryCode: 'rec-code-2'
  });
  check(secondCreate.ok === false && secondCreate.error === 'profile_exists', 'second create should be blocked');
}

run().then(() => {
  if (errors.length) {
    console.error('FAIL: phase23 owner profile store');
    for (const err of errors) console.error(' -', err);
    process.exit(1);
  }
  console.log('OK: phase23 owner profile store checks');
});
