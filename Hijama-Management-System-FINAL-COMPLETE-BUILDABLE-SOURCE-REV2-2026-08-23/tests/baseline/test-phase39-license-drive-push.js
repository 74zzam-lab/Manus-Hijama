#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const root = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'cloud', 'license-cloud.js'), 'utf8');
const errors = [];
function check(ok, msg) { if (!ok) errors.push(msg); }

function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

function hmacSha256Hex(message) {
  return crypto.createHmac('sha256', 'tdw-test-signing-key').update(String(message), 'utf8').digest('hex');
}

const mem = new Map();
const uploads = [];

const sandbox = {
  console,
  DB: {
    get(k, d) { return mem.has(k) ? mem.get(k) : d; },
    set(k, v) { mem.set(k, v); }
  },
  settings: { centerName: 'مركز اختبار' },
  DriveLayout: {
    licenseJson(centerId) { return 'NajjarTech/Test/License/license.json'; }
  },
  DriveAdapter: {
    isConnected() { return true; },
    async ensureConnected() { return true; },
    async uploadJson(remotePath, data) {
      uploads.push({ remotePath, data: JSON.parse(JSON.stringify(data)) });
      return { ok: true, id: 'file-1' };
    }
  },
  CommercialLicense: {
    crypto: { hmacSha256Hex, canonicalJson }
  },
  CloudMeta: {
    loadMeta() { return {}; },
    saveMeta() {}
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

try { vm.runInNewContext(src, sandbox, { timeout: 2000 }); } catch (e) {
  errors.push('license-cloud eval failed: ' + e.message);
}

async function run() {
  const LC = sandbox.LicenseCloud;
  check(typeof LC?.resignDoc === 'function', 'resignDoc missing');
  check(typeof LC?.ensurePushedToDrive === 'function', 'ensurePushedToDrive missing');
  check(typeof LC?.pushToDrive === 'function', 'pushToDrive missing');

  const unsigned = {
    schemaVersion: 2,
    centerId: 'CTR-TEST-1',
    centerName: 'مركز اختبار',
    licenseId: 'LIC-1',
    expiresAt: '2099-01-01',
    features: [],
    limits: { maxBranches: 1, maxUsers: 10, maxDevices: 0 },
    branches: [],
    activation: { consumed: true, primaryDeviceUuid: 'dev-1' },
    devices: { registered: [] },
    licenseVersion: 1,
    issuedAt: '2026-01-01',
    updatedAt: '2026-01-01T00:00:00.000Z',
    signature: 'stale-signature'
  };

  const signed = await LC.resignDoc({ ...unsigned, updatedAt: '2026-07-28T12:00:00.000Z' });
  const verify = await LC.verifyLicenseDoc(signed);
  check(verify.ok === true, 'resignDoc must produce verifiable signature');

  LC.saveLocal(signed);
  const push = await LC.ensurePushedToDrive({ doc: signed });
  check(push.ok === true, 'ensurePushedToDrive should succeed');
  check(uploads.length === 1, 'should upload exactly once');
  check(uploads[0].remotePath.includes('license.json'), 'upload path must be license.json');

  const uploaded = uploads[0].data;
  const remoteVerify = await LC.verifyLicenseDoc(uploaded);
  check(remoteVerify.ok === true, 'uploaded license.json must verify (signature after updatedAt)');
  check(Array.isArray(uploaded.branches) && uploaded.branches.length >= 1, 'ensurePushedToDrive must seed first branch');

  // Mutating updatedAt without resign must fail verify — documents the original bug class.
  const broken = { ...uploaded, updatedAt: '2099-12-31T23:59:59.000Z' };
  const brokenVerify = await LC.verifyLicenseDoc(broken);
  check(brokenVerify.ok === false, 'updatedAt without resign must invalidate signature');

  if (errors.length) {
    console.error('FAIL: phase39 license drive push');
    for (const err of errors) console.error(' -', err);
    process.exit(1);
  }
  console.log('OK: phase39 license drive push checks');
}

run().catch((e) => {
  console.error('FAIL: phase39 license drive push');
  console.error(' -', e.message || e);
  process.exit(1);
});
