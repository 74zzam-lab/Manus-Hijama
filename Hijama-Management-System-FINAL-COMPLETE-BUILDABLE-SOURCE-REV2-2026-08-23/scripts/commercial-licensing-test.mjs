#!/usr/bin/env node
/**
 * Commercial Licensing validation suite (v1.2.0-approved).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const licenseDataFs = require(path.join(ROOT, 'electron', 'license-data.js'));

const LIC_SECRETS = ['TDW', '2026', 'Hj@', 'مة'];
let passed = 0;
let failed = 0;
let skipped = 0;
const coverage = { suites: [], assertions: { passed: 0, failed: 0, skipped: 0 }, files: {} };

function assert(cond, msg) {
  if (cond) { passed++; coverage.assertions.passed++; return; }
  failed++;
  coverage.assertions.failed++;
  console.error('FAIL:', msg);
}

function skip(msg) {
  skipped++;
  coverage.assertions.skipped++;
  console.log('SKIP:', msg);
}

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

function verifyRegistryDoc(doc, label) {
  const { registrySig, ...body } = doc;
  assert(!!registrySig, `${label}: registrySig missing`);
  assert(registrySig === computeRegistrySig(body), `${label}: registrySig invalid`);
  return body;
}

function loadJsModule(relPath) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const fn = new Function('global', code + '\n;return global.CommercialLicense;');
  return fn(globalThis);
}

async function setupCommercialLicense() {
  globalThis.localStorage = {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = v; },
    removeItem(k) { delete this._d[k]; }
  };

  globalThis.__licenseFsBackend = {
    writeLicenseShard: (id, r) => licenseDataFs.writeLicenseShard(id, r),
    writeActivationBundle: (id, b) => licenseDataFs.writeActivationBundle(id, b),
    readActivationBundle: (id) => licenseDataFs.readActivationBundle(id),
    writeCustomPackage: (cp) => licenseDataFs.writeCustomPackage(cp),
    updateLicenseIndex: (idx) => licenseDataFs.updateLicenseIndex(idx),
    appendPackageToRegistry: (pkg) => licenseDataFs.appendPackageToRegistry(pkg)
  };

  const order = [
    'license/core/license-constants.js',
    'license/core/license-crypto.js',
    'license/core/registry-integrity.js',
    'license/core/license-codec-v5.js',
    'license/engine/feature-resolver.js',
    'license/engine/license-persistence.js',
    'license/engine/license-store.js',
    'license/engine/audit-log.js',
    'license/engine/activation-bundle.js',
    'license/engine/commercial-bridge.js',
    'license/engine/license-generator-v2.js',
    'license/engine/license-validator-v2.js',
    'license/engine/license-upgrade.js',
    'license/engine/license-downgrade.js',
    'license/engine/license-migration.js',
    'license/engine/license-engine-v2.js',
    'license/license-router.js'
  ];
  for (const f of order) loadJsModule(f);
  return globalThis.CommercialLicense;
}

function loadRegistriesFromDisk(CL) {
  const regDir = path.join(ROOT, 'license', 'registries');
  const names = ['feature', 'capability', 'package', 'subscription', 'action', 'template'];
  CL.registries = {};
  for (const name of names) {
    const doc = JSON.parse(fs.readFileSync(path.join(regDir, `${name}-registry.json`), 'utf8'));
    verifyRegistryDoc(doc, name);
    CL.registries[name] = doc;
  }
  CL.registryIntegrity.validatePackageInheritance(CL.registries.package.packages);
  CL.featureResolver.invalidateCache();
}

function mockV1Helpers() {
  globalThis.licSignFeaturesObject = async (features) => {
    const keys = Object.keys(features).filter(k => features[k]).sort();
    return 'mock-sig-' + keys.join(',');
  };
  globalThis.licIsFullEdition = (features) => {
    const keys = Object.keys(features || {}).filter(k => features[k]);
    return keys.length >= 60;
  };
  globalThis.licAttachFeaturesToLicense = async (lic, payload) => {
    lic.edition = payload.edition;
    lic.features = payload.features;
    lic.featureSig = payload.featureSig;
    return lic;
  };
}

async function runTests() {
  console.log('Commercial Licensing Test Suite v1.2.0\n');

  const registryFiles = [
    'license/registries/feature-registry.json',
    'license/registries/capability-registry.json',
    'license/registries/package-registry.json',
    'license/registries/subscription-registry.json',
    'license/registries/action-registry.json',
    'license/registries/template-registry.json',
    'license/data/license-registry/index.json',
    'license/data/audit-log.json'
  ];

  for (const f of registryFiles) {
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    verifyRegistryDoc(doc, f);
    console.log('  ✓', f);
    coverage.files[f] = 'verified';
  }

  const featureReg = JSON.parse(fs.readFileSync(path.join(ROOT, 'license/registries/feature-registry.json'), 'utf8'));
  assert(featureReg.features.length === 74, 'feature count must be 74');

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const regMatch = html.match(/const FEATURE_REGISTRY\s*=\s*\[([\s\S]*?)\n\];/);
  assert(!!regMatch, 'FEATURE_REGISTRY found in index.html');
  const v1Features = new Function(`return [${regMatch[1]}];`)();
  assert(v1Features.length === 74, 'V1 FEATURE_REGISTRY has 74 entries');
  const v1Keys = v1Features.map(f => f.id);
  for (const f of featureReg.features) {
    assert(v1Keys.includes(f.key), `feature key ${f.key} in registry`);
  }

  const CL = await setupCommercialLicense();
  mockV1Helpers();
  loadRegistriesFromDisk(CL);

  const v5detect = CL.codecV5.detectKeyVersion('TDWI2P03AAK7H9PT93898VPMP');
  assert(v5detect === 'v5', 'V5 segment detection');
  const v4detect = CL.codecV5.detectKeyVersion('TDWI2K7H9P43JTXM8A2Q8VPMP');
  assert(v4detect === 'v4', 'V4 segment detection');

  const encoded = await CL.codecV5.encodeV5Key({
    packageId: '03',
    actionId: '01',
    subscriptionId: '05',
    licenseSeq: 42,
    expiry: '2027-12-31',
    devices: 3,
    branches: 2,
    deviceAny: true,
    flags: 0
  });
  assert(encoded.key.length === 29, 'V5 key formatted length');
  const decoded = await CL.codecV5.decodeV5Key(encoded.key);
  assert(decoded.ok, 'V5 decode roundtrip');
  assert(decoded.packageId === '03', 'V5 package id');
  assert(decoded.fields.licenseSeq === 42, 'V5 license seq');

  const resolved = CL.featureResolver.resolvePackageCached('01');
  assert(resolved.featureIds.length > 0, 'package 01 resolves features');
  assert(!resolved.featureIds.includes('060'), 'opt-in 060 excluded');

  const gen = await CL.generator.generate({
    packageId: '03',
    subscriptionId: '05',
    actionId: '01',
    devices: 3,
    branches: 2,
    customer: { name: 'Test', company: 'Clinic' }
  });
  assert(gen.ok, 'license generation');
  assert(gen.key.startsWith('TDWI2-P03'), 'generated key prefix');
  assert(gen.bundle.bundleSig, 'activation bundle signed');

  const shardPath = path.join(ROOT, 'license/data/license-registry', gen.record.licenseId + '.json');
  const bundlePath = path.join(ROOT, 'license/data/activations', gen.record.licenseId + '.bundle.json');
  assert(fs.existsSync(shardPath), `license shard on disk: ${gen.record.licenseId}.json`);
  assert(fs.existsSync(bundlePath), `activation bundle on disk: ${gen.record.licenseId}.bundle.json`);
  coverage.files[shardPath] = 'created';
  coverage.files[bundlePath] = 'created';

  const diskBundle = licenseDataFs.readActivationBundle(gen.record.licenseId);
  assert(!!diskBundle?.bundleSig, 'disk bundle readable');

  CL.store.saveBundle(gen.record.licenseId, null);
  const valOffline = await CL.validator.validateKey(gen.key);
  assert(valOffline.ok, 'validator loads bundle from disk when store empty');

  const val = await CL.validator.validateKey(gen.key, gen.bundle);
  assert(val.ok, 'validator accepts generated key');

  const upg = await CL.upgrade.upgrade(gen.record.licenseId, {
    targetPackageId: '04',
    mode: 'upgrade_only',
    keepExpiration: true
  });
  assert(upg.ok, 'upgrade succeeds');
  assert(upg.record.packageId === '04', 'upgraded package');
  assert(fs.existsSync(path.join(ROOT, 'license/data/activations', upg.record.licenseId + '.bundle.json')), 'upgrade bundle on disk');

  const diff = CL.upgrade.compareFeatureSets(
    CL.featureResolver.resolvePackageCached('01').featureIds,
    CL.featureResolver.resolvePackageCached('03').featureIds
  );
  assert(diff.added.length > 0, 'upgrade diff has additions');

  const testPkg = {
    id: '10',
    internalName: 'test_pkg_10',
    displayName: 'Test Package 10',
    inherits: '02',
    featureIds: ['032'],
    devices: 2,
    branches: 1,
    color: '#2980b9'
  };
  const pkgDoc = licenseDataFs.appendPackageToRegistry(testPkg);
  assert(pkgDoc.packages.some(p => p.id === '10'), 'package 10 in package-registry.json');

  CL.store.createBackup('test');
  const restored = CL.store.loadState();
  assert(restored.licenses[gen.record.licenseId], 'license in store after backup');

  const fsBackup = licenseDataFs.createFilesystemBackup('test-run');
  assert(fs.existsSync(fsBackup), 'filesystem backup directory created');

  const hash = await CL.crypto.computeFeatureHash(['009', '010', '011']);
  assert(/^F?[A-F0-9]{4}$/i.test(hash), 'feature hash format');

  console.log('\n--- Migration dry-run ---');
  const { execSync } = await import('child_process');
  const migOut = execSync('node license/migrations/migrate-1.0.0-to-1.1.0.mjs --dry-run', { cwd: ROOT, encoding: 'utf8' });
  assert(migOut.includes('"ok": true'), 'migration dry-run');

  coverage.assertions.passed = passed;
  coverage.assertions.failed = failed;
  coverage.assertions.skipped = skipped;
  coverage.generatedAt = new Date().toISOString();
  coverage.total = passed + failed + skipped;

  const reportPath = path.join(ROOT, 'pat-reports', 'license-test-coverage.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(coverage, null, 2) + '\n', 'utf8');

  console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('Coverage report:', path.relative(ROOT, reportPath));
  if (failed > 0) process.exit(1);
  console.log('All commercial licensing tests passed.');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
