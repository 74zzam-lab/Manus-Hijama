/**
 * Commercial license data — filesystem persistence (Electron main + Node tests).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const LICENSE_REGISTRY_DIR = path.join(ROOT, 'license', 'data', 'license-registry');
const ACTIVATIONS_DIR = path.join(ROOT, 'license', 'data', 'activations');
const CUSTOM_PACKAGES_DIR = path.join(ROOT, 'license', 'data', 'custom-packages');
const PACKAGE_REGISTRY_PATH = path.join(ROOT, 'license', 'registries', 'package-registry.json');
const BACKUP_DIR = path.join(ROOT, 'license', 'data', 'backup');

const LIC_SECRETS = ['TDW', '2026', 'Hj@', 'مة'];

function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

function computeRegistrySig(body) {
  const material = LIC_SECRETS.join('|') + '|TADAWI_OFFLINE_LIC_V4';
  const salt = 'TadawiMadina_LIC_SALT_2026';
  const key = crypto.pbkdf2Sync(material, salt, 150000, 32, 'sha256');
  return crypto.createHmac('sha256', key).update(canonicalJson(body)).digest('hex');
}

function withRegistrySig(body) {
  return { ...body, registrySig: computeRegistrySig(body) };
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

/** Verify a document carrying a HMAC signature over its canonical body. */
function verifySignedDocument(doc, signatureField = 'signature') {
  if (!doc || typeof doc !== 'object') return { ok: false, error: 'license_missing' };
  const signature = String(doc[signatureField] || '');
  if (!signature) return { ok: false, error: 'license_signature_missing' };
  const body = { ...doc };
  delete body[signatureField];
  const expected = computeRegistrySig(body);
  return timingSafeEqualText(signature, expected)
    ? { ok: true }
    : { ok: false, error: 'license_signature_invalid' };
}

/** Owner bootstrap tokens use the same HMAC primitive as the signed license document. */
function hashBootstrapToken(token) {
  const supplied = String(token || '').trim();
  return supplied ? computeRegistrySig(supplied) : '';
}

function verifyBootstrapToken(token, expectedHash) {
  const supplied = String(token || '').trim();
  const expected = String(expectedHash || '').trim();
  if (!supplied || !expected) return false;
  return timingSafeEqualText(hashBootstrapToken(supplied), expected);
}

function signDocument(body, signatureField = 'signature') {
  return { ...body, [signatureField]: computeRegistrySig(body) };
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return filePath;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validatePackageInheritance(packages) {
  const byId = Object.fromEntries((packages || []).map(p => [p.id, p]));
  for (const pkg of packages || []) {
    if (!pkg.inherits) continue;
    const visited = new Set();
    let cur = pkg.inherits;
    while (cur) {
      if (visited.has(cur) || cur === pkg.id) {
        throw new Error(`circular_inheritance:${pkg.id}->${cur}`);
      }
      visited.add(cur);
      cur = byId[cur]?.inherits || null;
    }
  }
}

function writeLicenseShard(licenseId, record) {
  const { safeId, resolveInside } = require('./security/path-guard');
  const id = safeId(licenseId, 'licenseId');
  return writeJson(resolveInside(LICENSE_REGISTRY_DIR, `${id}.json`), record);
}

function readLicenseShard(licenseId) {
  const { safeId, resolveInside } = require('./security/path-guard');
  const id = safeId(licenseId, 'licenseId');
  return readJson(resolveInside(LICENSE_REGISTRY_DIR, `${id}.json`));
}

function writeActivationBundle(licenseId, bundle) {
  const { safeId, resolveInside } = require('./security/path-guard');
  const id = safeId(licenseId, 'licenseId');
  return writeJson(resolveInside(ACTIVATIONS_DIR, `${id}.bundle.json`), bundle);
}

function readActivationBundle(licenseId) {
  const { safeId, resolveInside } = require('./security/path-guard');
  const id = safeId(licenseId, 'licenseId');
  return readJson(resolveInside(ACTIVATIONS_DIR, `${id}.bundle.json`));
}

function writeCustomPackage(cp) {
  const { safeId, resolveInside } = require('./security/path-guard');
  if (!cp || typeof cp !== 'object') throw Object.assign(new Error('invalid_custom_package'), { code: 'IPC_TYPE' });
  const id = safeId(cp.customPackageId, 'customPackageId');
  return writeJson(resolveInside(CUSTOM_PACKAGES_DIR, `${id}.json`), cp);
}

function readCustomPackage(customPackageId) {
  return readJson(path.join(CUSTOM_PACKAGES_DIR, `${customPackageId}.json`));
}

function updateLicenseIndex(index) {
  const signed = withRegistrySig(index);
  writeJson(path.join(LICENSE_REGISTRY_DIR, 'index.json'), signed);
  return signed;
}

function appendPackageToRegistry(pkgDef) {
  const doc = readJson(PACKAGE_REGISTRY_PATH);
  if (!doc) throw new Error('package_registry_missing');
  const { registrySig, ...body } = doc;
  const idx = body.packages.findIndex(p => p.id === pkgDef.id);
  const entry = {
    id: pkgDef.id,
    internalName: pkgDef.internalName,
    displayName: pkgDef.displayName,
    displayNameAr: pkgDef.displayNameAr || pkgDef.displayName,
    color: pkgDef.color || '#2980b9',
    icon: pkgDef.icon || '📦',
    inherits: pkgDef.inherits || null,
    capabilityIds: pkgDef.capabilityIds || [],
    featureIds: pkgDef.featureIds || [],
    excludedOptIn: pkgDef.excludedOptIn || ['060', '063', '064', '066'],
    devices: pkgDef.devices ?? 1,
    branches: pkgDef.branches ?? 1,
    maxUsers: pkgDef.maxUsers ?? 10,
    price: null,
    visible: pkgDef.visible !== false,
    order: pkgDef.order ?? parseInt(pkgDef.id, 10)
  };
  if (idx >= 0) body.packages[idx] = { ...body.packages[idx], ...entry };
  else body.packages.push(entry);
  validatePackageInheritance(body.packages);
  const signed = withRegistrySig(body);
  writeJson(PACKAGE_REGISTRY_PATH, signed);
  return signed;
}

function syncLicenseArtifacts(record, bundle) {
  writeLicenseShard(record.licenseId, record);
  if (bundle) writeActivationBundle(record.licenseId, bundle);
  return { shard: record.licenseId, bundle: bundle ? record.licenseId : null };
}

function createFilesystemBackup(label) {
  const day = label || new Date().toISOString().slice(0, 10);
  const destDir = path.join(BACKUP_DIR, day);
  fs.mkdirSync(destDir, { recursive: true });
  const copy = (src, name) => {
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(destDir, name));
  };
  copy(path.join(LICENSE_REGISTRY_DIR, 'index.json'), 'index.json');
  if (fs.existsSync(LICENSE_REGISTRY_DIR)) {
    for (const f of fs.readdirSync(LICENSE_REGISTRY_DIR)) {
      if (f.endsWith('.json') && f !== 'index.json') {
        copy(path.join(LICENSE_REGISTRY_DIR, f), f);
      }
    }
  }
  if (fs.existsSync(ACTIVATIONS_DIR)) {
    fs.mkdirSync(path.join(destDir, 'activations'), { recursive: true });
    for (const f of fs.readdirSync(ACTIVATIONS_DIR)) {
      copy(path.join(ACTIVATIONS_DIR, f), path.join('activations', f));
    }
  }
  return destDir;
}

module.exports = {
  ROOT,
  LICENSE_REGISTRY_DIR,
  ACTIVATIONS_DIR,
  CUSTOM_PACKAGES_DIR,
  writeLicenseShard,
  readLicenseShard,
  writeActivationBundle,
  readActivationBundle,
  writeCustomPackage,
  readCustomPackage,
  updateLicenseIndex,
  appendPackageToRegistry,
  syncLicenseArtifacts,
  createFilesystemBackup,
  withRegistrySig,
  canonicalJson,
  verifySignedDocument,
  hashBootstrapToken,
  verifyBootstrapToken,
  signDocument,
  validatePackageInheritance
};
