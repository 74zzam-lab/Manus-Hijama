#!/usr/bin/env node
'use strict';

/**
 * Baseline: read current shipped license artifacts (codec V5 / engine V2 data).
 * Does not activate or forge licenses — read/structure only.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const errors = [];

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const indexPath = path.join(root, 'license', 'data', 'license-registry', 'index.json');
const samplePath = path.join(root, 'license', 'data', 'license-registry', 'L000001.json');
const bundlePath = path.join(root, 'license', 'data', 'activations', 'L000001.bundle.json');
const constantsPath = path.join(root, 'license', 'core', 'license-constants.js');
const codecPath = path.join(root, 'license', 'core', 'license-codec-v5.js');

for (const p of [indexPath, samplePath, bundlePath, constantsPath, codecPath]) {
  if (!fs.existsSync(p)) errors.push('missing:' + path.relative(root, p));
}

if (!errors.length) {
  const index = readJson(indexPath);
  if (!index || typeof index !== 'object') errors.push('index_invalid');
  if (index.registryVersion && index.registryVersion !== '1.2.0') {
    // Allow if field naming differs — record actual
    if (!String(index.registryVersion).startsWith('1.')) {
      errors.push('registryVersion=' + index.registryVersion);
    }
  }

  const sample = readJson(samplePath);
  if (!sample.licenseId && !sample.id && !sample.record) {
    // Accept several historical shapes
    if (!sample.schemaVersion && !sample.packageId && !sample.key) {
      errors.push('sample_license_shape_unexpected:' + Object.keys(sample).slice(0, 8).join(','));
    }
  }

  const bundle = readJson(bundlePath);
  if (!bundle || typeof bundle !== 'object') errors.push('bundle_invalid');

  const constantsSrc = fs.readFileSync(constantsPath, 'utf8');
  if (!constantsSrc.includes('V5_MAGIC') || !constantsSrc.includes('TDWI2')) {
    errors.push('constants_missing_v5_magic');
  }
  if (!constantsSrc.includes('commercial_license_data_v2')) {
    errors.push('constants_missing_storage_key');
  }

  const codecSrc = fs.readFileSync(codecPath, 'utf8');
  if (!codecSrc.includes('encodeV5Key') || !codecSrc.includes('decodeV5Key')) {
    errors.push('codec_missing_v5_api');
  }
}

if (errors.length) {
  console.error('FAIL: baseline license read');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: baseline license artifacts readable (V5 / storage v2)');
console.log('  registry:', path.relative(root, indexPath));
console.log('  sample:', path.relative(root, samplePath));
