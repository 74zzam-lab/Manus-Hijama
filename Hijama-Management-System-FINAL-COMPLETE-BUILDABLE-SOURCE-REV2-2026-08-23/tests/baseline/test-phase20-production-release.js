#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..', '..');
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

const script = fs.readFileSync(path.join(root, 'scripts', 'production-release-gate.mjs'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

check(script.includes('Phase 20 — Production Release Gate'), 'phase 20 header missing');
check(script.includes('REQUIRED_BUILD_ASSETS'), 'build assets inventory missing');
check(script.includes("decision = blocking.length === 0"), 'release decision policy missing');
check(script.includes("READY_UNSIGNED_INTERNAL"), 'unsigned internal readiness state missing');
check(script.includes("production-release-results.json"), 'json report output missing');
check(script.includes('PRODUCTION-RELEASE-REPORT.md'), 'markdown report output missing');
check(pkg.scripts?.['release:gate'] === 'node scripts/production-release-gate.mjs', 'release:gate script missing');
check(pkg.scripts?.['releasegate:test'] === 'node tests/baseline/test-phase20-production-release.js', 'releasegate:test script missing');

const requiredAssets = [
  'build/Program-Icon.ico',
  'build/installer.nsh',
];
for (const asset of requiredAssets) {
  check(fs.existsSync(path.join(root, asset)), `missing asset ${asset}`);
}
check(fs.existsSync(path.join(root, 'scripts', 'generate-brand-assets.mjs')), 'generate-brand-assets script missing');

const run = spawnSync(process.execPath, [path.join(root, 'scripts', 'production-release-gate.mjs')], {
  cwd: root,
  encoding: 'utf8',
  timeout: 180000,
});
check(run.status === 0, `production release gate failed: ${(run.stderr || run.stdout || '').trim().split('\n').slice(-4).join(' | ')}`);

const generatedAssets = [
  'build/Installer-Sidebar.bmp',
  'build/Installer-Header.bmp',
  'build/Uninstaller-Sidebar.bmp',
  'build/installer-branding.nsh',
];
for (const asset of generatedAssets) {
  check(fs.existsSync(path.join(root, asset)), `gate must generate ${asset}`);
}

const jsonPath = path.join(root, 'pat-reports', 'production-release-results.json');
check(fs.existsSync(jsonPath), 'production-release-results.json was not written');
if (fs.existsSync(jsonPath)) {
  const result = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  check(result.decision === 'READY_UNSIGNED_INTERNAL' || result.decision === 'READY_FOR_SIGNED_RELEASE', `unexpected decision ${result.decision}`);
  check(Array.isArray(result.checks) && result.checks.length > 0, 'checks inventory empty');
  check(Array.isArray(result.manualWindowsChecklist) && result.manualWindowsChecklist.length >= 4, 'windows checklist incomplete');
}

if (errors.length) {
  console.error('FAIL: phase20 production release');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: phase20 production release checks');
