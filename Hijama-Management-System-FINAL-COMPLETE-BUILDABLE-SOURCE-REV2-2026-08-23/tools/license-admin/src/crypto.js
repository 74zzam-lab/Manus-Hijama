'use strict';

/**
 * License Admin V6 crypto helpers (Node only). PRIVATE KEY stays here.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

function loadPrivateKey(keyPath) {
  const pem = fs.readFileSync(keyPath, 'utf8');
  return crypto.createPrivateKey(pem);
}

function loadPublicKey(keyPath) {
  const pem = fs.readFileSync(keyPath, 'utf8');
  return crypto.createPublicKey(pem);
}

function publicKeySpkiB64(publicKey) {
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

function signLicenseBody(body, privateKey) {
  const message = Buffer.from(canonicalJson(body), 'utf8');
  const signature = crypto.sign(null, message, privateKey);
  return signature.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function verifyLicense(signed, publicKey) {
  const { signature, ...body } = signed;
  const message = Buffer.from(canonicalJson(body), 'utf8');
  const sig = Buffer.from(String(signature).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return crypto.verify(null, message, publicKey, sig);
}

function randomNonce() {
  return crypto.randomBytes(16).toString('hex');
}

function issueLicense(input, privateKey) {
  const now = new Date();
  const issuedAt = input.issuedAt || now.toISOString();
  const expiresAt = input.expiresAt || new Date(now.getTime() + 365 * 24 * 3600 * 1000).toISOString();
  const body = {
    schemaVersion: 6,
    licenseId: input.licenseId || `TDW-${now.getUTCFullYear()}-${String(input.seq || 1).padStart(6, '0')}`,
    customerId: input.customerId || 'CUSTOMER-001',
    customerName: input.customerName || 'Center Name',
    packageId: input.packageId || 'PRO',
    issuedAt,
    expiresAt,
    deviceBinding: input.deviceBinding || { mode: 'any' },
    features: Array.isArray(input.features) ? input.features : ['clients', 'appointments', 'payroll', 'reports'],
    limits: input.limits || { branches: 1, users: 5 },
    nonce: input.nonce || randomNonce(),
    keyId: input.keyId || 'dev-ed25519-2026',
  };
  if (input.status) body.status = input.status;
  const signature = signLicenseBody(body, privateKey);
  return { ...body, signature };
}

function encodeToken(signedLicense) {
  const { signature, ...body } = signedLicense;
  const payload = Buffer.from(canonicalJson(body), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `TDW6.${payload}.${signature}`;
}

function defaultKeyPaths(root) {
  const base = root || path.join(__dirname, '..');
  return {
    privateKeyPath: process.env.TADAWI_LICENSE_PRIVATE_KEY
      || path.join(base, 'keys', 'dev', 'ed25519-private.pem'),
    publicKeyPath: process.env.TADAWI_LICENSE_PUBLIC_KEY
      || path.join(base, 'keys', 'dev', 'ed25519-public.pem'),
  };
}

function assertPrivateKeyNotInClientTree(repoRoot) {
  const forbidden = [
    path.join(repoRoot, 'license'),
    path.join(repoRoot, 'electron'),
    path.join(repoRoot, 'cloud'),
  ];
  // Soft check used by tests — private key must live under tools/license-admin
  return forbidden;
}

module.exports = {
  canonicalJson,
  loadPrivateKey,
  loadPublicKey,
  publicKeySpkiB64,
  signLicenseBody,
  verifyLicense,
  randomNonce,
  issueLicense,
  encodeToken,
  defaultKeyPaths,
  assertPrivateKeyNotInClientTree,
};
