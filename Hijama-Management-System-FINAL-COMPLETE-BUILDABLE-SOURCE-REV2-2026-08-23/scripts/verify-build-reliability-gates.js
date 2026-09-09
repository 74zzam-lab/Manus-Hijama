#!/usr/bin/env node
/**
 * Phase 14 — build reliability gates for Stable Operational Core packaging.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const errors = [];

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

function fileExists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// Phase 12 baseline build configuration
const buildTest = spawnSync(process.execPath, ['tests/baseline/test-phase12-build.js'], {
  cwd: root,
  encoding: 'utf8',
});
assert(buildTest.status === 0, 'test-phase12-build.js failed');

// Phase 13 electron structural readiness
const electronTest = spawnSync(process.execPath, ['tests/baseline/test-phase13-electron-readiness.js'], {
  cwd: root,
  encoding: 'utf8',
});
assert(electronTest.status === 0, 'test-phase13-electron-readiness.js failed');

const pkg = JSON.parse(read('package.json'));
const files = pkg.build?.files || [];

assert(files.includes('cloud/**/*'), 'cloud/**/* must be packaged');
assert(files.includes('database/**/*'), 'database/**/* must be packaged');
assert(files.includes('cupping-*.js'), 'cupping-*.js must be packaged');
assert(files.includes('!tools/**/*'), 'tools must stay excluded');

const REQUIRED_DB_MODULES = [
  'database/operational-db-health.js',
  'database/operational-readiness.js',
  'database/operational-error-truth.js',
  'database/migration-safety.js',
  'database/tombstone-policy.js',
  'database/idempotency-keys.js',
  'database/operational-rbac-policy.js',
  'database/attachment-authority.js',
  'database/hybrid-schema.js',
];

const REQUIRED_CLOUD_MODULES = [
  'cloud/operational-readiness.js',
  'cloud/operational-db-health.js',
  'cloud/operational-error-truth.js',
  'cloud/migration-safety.js',
  'cloud/operational-rbac-guard.js',
  'cloud/attachment-authority.js',
  'cloud/sync-engine.js',
];

for (const mod of REQUIRED_DB_MODULES) {
  assert(fileExists(mod), `missing database module ${mod}`);
}
for (const mod of REQUIRED_CLOUD_MODULES) {
  assert(fileExists(mod), `missing cloud module ${mod}`);
}

const html = read('index.html');
const REQUIRED_SCRIPT_TAGS = [
  'cloud/operational-error-truth.js',
  'cloud/migration-safety.js',
  'cloud/operational-db-health.js',
  'cloud/operational-readiness.js',
  'cloud/operational-rbac-guard.js',
  'cloud/attachment-authority.js',
];
for (const tag of REQUIRED_SCRIPT_TAGS) {
  assert(html.includes(tag), `index.html missing script ${tag}`);
}

const bridge = read('cupping-sqlite-bridge.js');
assert(bridge.includes('OperationalReadiness'), 'SqliteBridge must integrate OperationalReadiness');
assert(bridge.includes('OperationalDbHealth'), 'SqliteBridge must integrate OperationalDbHealth');
assert(bridge.includes('MigrationSafety'), 'SqliteBridge must integrate MigrationSafety');

const main = read('electron/main.js');
assert(main.includes('database:status') || main.includes("'database:status'"), 'main must expose database status IPC');

assert(fileExists('scripts/verify-oauth-build-packaging.js'), 'verify-oauth-build-packaging.js missing');

const oauthPkg = spawnSync(process.execPath, ['scripts/verify-oauth-build-packaging.js'], {
  cwd: root,
  encoding: 'utf8',
});
assert(oauthPkg.status === 0, 'verify-oauth-build-packaging failed');
assert(fileExists('scripts/run-win-build.cjs'), 'run-win-build.cjs missing');
assert((pkg.scripts.build || '').includes('validate-production-deps.mjs'), 'build script must validate production deps');

if (errors.length) {
  console.error('FAIL verify-build-reliability-gates');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS verify-build-reliability-gates');
