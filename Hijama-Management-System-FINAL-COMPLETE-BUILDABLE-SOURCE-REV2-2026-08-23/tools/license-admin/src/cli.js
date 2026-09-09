#!/usr/bin/env node
'use strict';

/**
 * Tadawi License Admin CLI (V6 / Ed25519)
 *
 * Commands:
 *   generate-keypair
 *   issue [--out file] [--token]
 *   renew --license file --days 365
 *   revoke --id TDW-2026-000001 --list file
 *   migrate-v5 --request file --out file
 *   export-public
 *   verify --license file
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  loadPrivateKey,
  loadPublicKey,
  publicKeySpkiB64,
  issueLicense,
  encodeToken,
  verifyLicense,
  defaultKeyPaths,
  canonicalJson,
} = require('./crypto');

const ROOT = path.join(__dirname, '..');

function usage() {
  console.log(`Tadawi License Admin V6

Usage:
  node tools/license-admin/src/cli.js <command> [options]

Commands:
  generate-keypair          Create Ed25519 keypair under keys/dev (or --dir)
  issue                     Issue a signed V6 license JSON
  renew                     Extend expiresAt and re-sign
  revoke                    Append licenseId to a revocation list
  migrate-v5                Convert a V5 migration request into a signed V6 license
  export-public             Print SPKI base64 for embedding in client
  verify                    Verify a signed V6 license file

Environment:
  TADAWI_LICENSE_PRIVATE_KEY   Path to private PEM
  TADAWI_LICENSE_PUBLIC_KEY    Path to public PEM
`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else args._.push(a);
  }
  return args;
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function cmdGenerateKeypair(args) {
  const dir = path.resolve(args.dir || path.join(ROOT, 'keys', 'dev'));
  fs.mkdirSync(dir, { recursive: true });
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privPath = path.join(dir, 'ed25519-private.pem');
  const pubPath = path.join(dir, 'ed25519-public.pem');
  const b64Path = path.join(dir, 'ed25519-public.b64');
  fs.writeFileSync(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  fs.writeFileSync(pubPath, publicKey.export({ type: 'spki', format: 'pem' }));
  fs.writeFileSync(b64Path, publicKeySpkiB64(publicKey) + '\n');
  console.log('Generated:', privPath);
  console.log('Public:   ', pubPath);
  console.log('SPKI b64: ', publicKeySpkiB64(publicKey));
  console.log('\nWARNING: Keep the private key offline. Never copy it into license/ or electron/.');
}

function cmdIssue(args) {
  const keys = defaultKeyPaths(ROOT);
  const priv = loadPrivateKey(args.private || keys.privateKeyPath);
  const features = args.features
    ? String(args.features).split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;
  const signed = issueLicense({
    licenseId: args.id,
    customerId: args.customerId,
    customerName: args.customerName || args.name,
    packageId: args.package || args.packageId,
    issuedAt: args.issuedAt,
    expiresAt: args.expiresAt,
    features,
    limits: {
      branches: args.branches != null ? Number(args.branches) : 1,
      users: args.users != null ? Number(args.users) : 5,
    },
    deviceBinding: args.bind
      ? { mode: 'single-device', fingerprintHash: String(args.bind), maxDrift: 2 }
      : { mode: 'any' },
    seq: args.seq,
  }, priv);

  const out = args.out || path.join(ROOT, 'fixtures', `${signed.licenseId}.v6.json`);
  writeJson(out, signed);
  console.log('Issued:', out);
  if (args.token) {
    const token = encodeToken(signed);
    const tokenOut = out.replace(/\.json$/i, '.token.txt');
    fs.writeFileSync(tokenOut, token + '\n', 'utf8');
    console.log('Token: ', tokenOut);
    console.log(token);
  }
}

function cmdRenew(args) {
  const keys = defaultKeyPaths(ROOT);
  const priv = loadPrivateKey(args.private || keys.privateKeyPath);
  const file = args.license || args._[1];
  if (!file) throw new Error('--license required');
  const current = JSON.parse(fs.readFileSync(file, 'utf8'));
  const body = { ...current };
  delete body.signature;
  const days = Number(args.days || 365);
  const base = body.expiresAt ? new Date(body.expiresAt) : new Date();
  body.expiresAt = new Date(base.getTime() + days * 24 * 3600 * 1000).toISOString();
  body.issuedAt = new Date().toISOString();
  body.nonce = crypto.randomBytes(16).toString('hex');
  const signed = issueLicense(body, priv);
  const out = args.out || file;
  writeJson(out, signed);
  console.log('Renewed until', signed.expiresAt, '→', out);
}

function cmdRevoke(args) {
  const id = args.id || args._[1];
  if (!id) throw new Error('--id required');
  const listPath = args.list || path.join(ROOT, 'fixtures', 'revocations.json');
  let doc = { schemaVersion: 1, revoked: [], updatedAt: null };
  if (fs.existsSync(listPath)) doc = JSON.parse(fs.readFileSync(listPath, 'utf8'));
  if (!Array.isArray(doc.revoked)) doc.revoked = [];
  if (!doc.revoked.some((r) => (typeof r === 'string' ? r === id : r.licenseId === id))) {
    doc.revoked.push({ licenseId: id, revokedAt: new Date().toISOString(), reason: args.reason || 'admin_revoke' });
  }
  doc.updatedAt = new Date().toISOString();
  writeJson(listPath, doc);
  console.log('Revocation list updated:', listPath);
}

function cmdMigrateV5(args) {
  const keys = defaultKeyPaths(ROOT);
  const priv = loadPrivateKey(args.private || keys.privateKeyPath);
  const reqPath = args.request || args._[1];
  if (!reqPath) throw new Error('--request required');
  const req = JSON.parse(fs.readFileSync(reqPath, 'utf8'));
  const src = req.source || {};
  const signed = issueLicense({
    licenseId: args.id || src.licenseId || `TDW-MIG-${Date.now()}`,
    customerId: src.customerId || 'MIGRATED',
    customerName: src.customerName || 'Migrated Center',
    packageId: src.packageId || 'PRO',
    expiresAt: src.expiry ? new Date(src.expiry).toISOString() : undefined,
    features: src.features,
    deviceBinding: req.deviceBinding || { mode: 'any' },
  }, priv);
  const out = args.out || path.join(ROOT, 'fixtures', `${signed.licenseId}.v6.json`);
  writeJson(out, signed);
  console.log('Migrated V5→V6:', out);
  console.log('Keep V5 data until client confirms V6 activation.');
}

function cmdExportPublic(args) {
  const keys = defaultKeyPaths(ROOT);
  const pub = loadPublicKey(args.public || keys.publicKeyPath);
  const b64 = publicKeySpkiB64(pub);
  console.log(b64);
  if (args.out) fs.writeFileSync(args.out, b64 + '\n');
}

function cmdVerify(args) {
  const keys = defaultKeyPaths(ROOT);
  const pub = loadPublicKey(args.public || keys.publicKeyPath);
  const file = args.license || args._[1];
  if (!file) throw new Error('--license required');
  const signed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ok = verifyLicense(signed, pub);
  console.log(ok ? 'OK: signature valid' : 'FAIL: signature invalid');
  if (!ok) process.exit(1);
  console.log(canonicalJson({ licenseId: signed.licenseId, expiresAt: signed.expiresAt, packageId: signed.packageId }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (!cmd || args.help) { usage(); return; }
  switch (cmd) {
    case 'generate-keypair': return cmdGenerateKeypair(args);
    case 'issue': return cmdIssue(args);
    case 'renew': return cmdRenew(args);
    case 'revoke': return cmdRevoke(args);
    case 'migrate-v5': return cmdMigrateV5(args);
    case 'export-public': return cmdExportPublic(args);
    case 'verify': return cmdVerify(args);
    default:
      console.error('Unknown command:', cmd);
      usage();
      process.exit(1);
  }
}

main();
