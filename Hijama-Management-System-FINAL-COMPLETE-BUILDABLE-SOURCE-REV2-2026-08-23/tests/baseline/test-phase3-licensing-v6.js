#!/usr/bin/env node
'use strict';

/**
 * Phase 3 — Commercial Licensing V6 (Ed25519) tests.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { TextEncoder, TextDecoder } = require('util');

const root = path.join(__dirname, '..', '..');
const errors = [];

function check(cond, msg) {
  if (!cond) errors.push(msg);
}

function loadCommercialLicense() {
  const sandbox = {
    console,
    TextEncoder,
    TextDecoder,
    Buffer,
    require,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    localStorage: {
      _d: {},
      getItem(k) { return this._d[k] ?? null; },
      setItem(k, v) { this._d[k] = String(v); },
      removeItem(k) { delete this._d[k]; },
    },
    crypto: undefined,
    window: undefined,
    document: { querySelector: () => null, getElementById: () => null },
  };
  sandbox.global = sandbox;
  sandbox.window = sandbox;

  const files = [
    'license/core/license-constants.js',
    'license/core/license-crypto.js',
    'license/core/license-pubkey-v6.js',
    'license/core/device-fingerprint.js',
    'license/core/license-codec-v5.js',
    'license/core/license-codec-v6.js',
    'license/engine/license-v6-verify.js',
    'license/engine/license-v6-migrate.js',
    'license/api/license-online-client.js',
  ];
  for (const rel of files) {
    vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
  }
  return sandbox.CommercialLicense;
}

async function main() {
  // Private key must not live under client trees
  for (const dir of ['license', 'electron', 'cloud']) {
    const hits = [];
    const walk = (p) => {
      if (!fs.existsSync(p)) return;
      for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
        const fp = path.join(p, ent.name);
        if (ent.isDirectory()) walk(fp);
        else if (/private|ed25519-private|\.pem$/i.test(ent.name) && ent.name.includes('private')) hits.push(fp);
      }
    };
    walk(path.join(root, dir));
    check(hits.length === 0, `no private key under ${dir}: ${hits.join(',')}`);
  }
  check(fs.existsSync(path.join(root, 'tools/license-admin/keys/dev/ed25519-private.pem')), 'dev private key present for admin tooling');
  check(fs.existsSync(path.join(root, 'license/core/license-pubkey-v6.js')), 'client public key module exists');

  const pubSrc = fs.readFileSync(path.join(root, 'license/core/license-pubkey-v6.js'), 'utf8');
  check(!/BEGIN PRIVATE KEY/.test(pubSrc), 'client pubkey file has no private key PEM');
  check(pubSrc.includes('ED25519_PUBLIC_KEY_SPKI_B64'), 'public key constant present');

  // build.files must not include tools/
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const files = pkg.build?.files || [];
  check(!files.some((f) => String(f).startsWith('tools')), 'tools/ not in electron-builder files');

  const adminCrypto = require(path.join(root, 'tools/license-admin/src/crypto.js'));
  const priv = adminCrypto.loadPrivateKey(path.join(root, 'tools/license-admin/keys/dev/ed25519-private.pem'));
  const pub = adminCrypto.loadPublicKey(path.join(root, 'tools/license-admin/keys/dev/ed25519-public.pem'));

  const good = adminCrypto.issueLicense({
    licenseId: 'TDW-2026-000001',
    customerId: 'CUSTOMER-001',
    customerName: 'Center Name',
    packageId: 'PRO',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
    features: ['clients', 'appointments', 'payroll', 'reports'],
    limits: { branches: 1, users: 5 },
    deviceBinding: { mode: 'any' },
  }, priv);

  check(adminCrypto.verifyLicense(good, pub) === true, 'admin verify valid license');
  const fixtureDir = path.join(root, 'tools/license-admin/fixtures');
  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, 'TDW-2026-000001.v6.json'), JSON.stringify(good, null, 2) + '\n');

  const token = adminCrypto.encodeToken(good);
  check(token.startsWith('TDW6.'), 'token prefix');

  const CL = loadCommercialLicense();
  check(CL.codecV6.isV6Input(good), 'detect json v6');
  check(CL.codecV6.isV6Input(token), 'detect token v6');
  check(!CL.codecV6.isV6Input('TDWI2-P04AA-CYNAA-A98JC-YCXNA'), 'v5 key not detected as v6');

  const verified = await CL.v6Verify.verifyPayload(good);
  check(verified.ok === true, 'client verifies valid license');

  // Tampered feature
  const tamperedFeature = JSON.parse(JSON.stringify(good));
  tamperedFeature.features = [...tamperedFeature.features, 'god-mode'];
  const badFeature = await CL.v6Verify.verifyPayload(tamperedFeature);
  check(badFeature.ok === false && badFeature.error === 'signature', 'feature tamper fails signature');

  // Tampered expiry
  const tamperedExp = JSON.parse(JSON.stringify(good));
  tamperedExp.expiresAt = '2099-01-01T00:00:00.000Z';
  const badExp = await CL.v6Verify.verifyPayload(tamperedExp);
  check(badExp.ok === false && badExp.error === 'signature', 'expiry tamper fails signature');

  // Forged signature
  const forged = JSON.parse(JSON.stringify(good));
  forged.signature = Buffer.alloc(64, 7).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  const badSig = await CL.v6Verify.verifyPayload(forged);
  check(badSig.ok === false && badSig.error === 'signature', 'forged signature rejected');

  // Expired
  const expired = adminCrypto.issueLicense({
    licenseId: 'TDW-2026-EXPIRED',
    expiresAt: '2020-01-01T00:00:00.000Z',
    issuedAt: '2019-01-01T00:00:00.000Z',
  }, priv);
  const badExpired = await CL.v6Verify.verifyPayload(expired, { now: '2026-07-27T00:00:00.000Z' });
  check(badExpired.ok === false && badExpired.error === 'expired', 'expired license rejected');

  // Revoked
  CL.v6Verify.saveRevocations([{ licenseId: 'TDW-2026-000001', reason: 'test' }]);
  const badRev = await CL.v6Verify.verifyPayload(good);
  check(badRev.ok === false && badRev.error === 'revoked', 'revoked license rejected');
  CL.v6Verify.saveRevocations([]);

  // Incomplete payload
  const incomplete = { schemaVersion: 6, signature: good.signature };
  const badInc = await CL.v6Verify.verifyPayload(incomplete);
  check(badInc.ok === false, 'incomplete payload rejected');

  // Device binding mismatch
  const fpA = await CL.deviceFingerprint.buildFingerprint({
    platform: 'win32', arch: 'x64', hostnameHash: 'aaa', userDataHash: 'bbb',
  });
  const fpB = await CL.deviceFingerprint.buildFingerprint({
    platform: 'win32', arch: 'x64', hostnameHash: 'ccc', userDataHash: 'ddd',
  });
  const bound = adminCrypto.issueLicense({
    licenseId: 'TDW-2026-BOUND',
    expiresAt: '2027-01-01T00:00:00.000Z',
    deviceBinding: {
      mode: 'single-device',
      fingerprintHash: fpA.hash,
      components: fpA.components,
      maxDrift: 1,
    },
  }, priv);
  const okBound = await CL.v6Verify.verifyPayload(bound, { fingerprint: fpA });
  check(okBound.ok === true, 'matching device accepted');
  const badBound = await CL.v6Verify.verifyPayload(bound, { fingerprint: fpB });
  check(badBound.ok === false && badBound.error === 'device', 'device mismatch rejected');

  // Soft drift tolerance: one component change within maxDrift=2
  const fpClose = await CL.deviceFingerprint.buildFingerprint({
    platform: 'win32', arch: 'x64', hostnameHash: 'aaa', userDataHash: 'CHANGED',
  });
  const soft = adminCrypto.issueLicense({
    licenseId: 'TDW-2026-SOFT',
    expiresAt: '2027-01-01T00:00:00.000Z',
    deviceBinding: {
      mode: 'single-device',
      fingerprintHash: 'different-full-hash',
      components: fpA.components,
      maxDrift: 2,
    },
  }, priv);
  // full hash differs but components nearly match — compatible via component drift
  const softOk = await CL.v6Verify.verifyPayload(soft, { fingerprint: fpClose });
  check(softOk.ok === true, 'soft device drift accepted');

  // Token roundtrip
  const tokenVerify = await CL.v6Verify.verifyPayload(token);
  check(tokenVerify.ok === true, 'compact token verifies');

  // V5 migration request
  const migReq = await CL.v6Migrate.buildMigrationRequest({
    v: 5,
    licenseId: 'L000001',
    productKey: 'TDWI2-P04AA-TEST',
    expiry: '2027-07-23',
    edition: '04',
    features: ['clients'],
  }, { fingerprint: fpA });
  check(migReq.type === 'v5_to_v6_migration_request', 'migration request type');
  check(migReq.source.version === 5, 'migration source v5');
  check(CL.v6Migrate.shouldKeepV5({ v: 5 }, null) === true, 'keep v5 until v6 applied');

  // Online client stub
  const online = CL.createOnlineLicenseClient({ enabled: false });
  const offline = await online.activate({});
  check(offline.offline === true, 'online client reports offline when disabled');

  // Client cannot sign: ensure no sign API exported on codecV6
  check(typeof CL.codecV6.signLicense !== 'function', 'client codec has no sign API');
  check(typeof CL.codecV6.verifyLicenseObject === 'function', 'client codec has verify API');

  // Wrong-key attack: sign with ephemeral other key
  const other = crypto.generateKeyPairSync('ed25519');
  const alien = adminCrypto.issueLicense({ licenseId: 'TDW-ALIEN', expiresAt: '2027-01-01T00:00:00.000Z' }, other.privateKey);
  const badAlien = await CL.v6Verify.verifyPayload(alien);
  check(badAlien.ok === false && badAlien.error === 'signature', 'foreign key signature rejected');

  if (errors.length) {
    console.error('FAIL: phase-3 licensing v6');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('OK: phase-3 licensing v6 (Ed25519 sign/verify, tamper, revoke, device, V5 migrate, no client private key)');
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
