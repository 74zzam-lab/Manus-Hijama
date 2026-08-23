#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const branding = JSON.parse(fs.readFileSync(path.join(root, 'branding.config.json'), 'utf8'));
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

const files = pkg.build?.files || [];
const asarUnpack = pkg.build?.asarUnpack || [];
const scripts = pkg.scripts || {};

check(!!pkg.build?.nsis, 'electron-builder nsis config missing');
check(files.includes('branding.config.json'), 'branding.config.json must be packaged');
check(files.includes('database/**/*'), 'database files must be packaged');
check(files.includes('electron/**/*'), 'electron files must be packaged');
check(files.includes('node_modules/**/*'), 'node_modules must be packaged');
check(files.includes('!tools/**/*'), 'tools must stay excluded from package');
check(asarUnpack.includes('node_modules/better-sqlite3/**'), 'better-sqlite3 must be in asarUnpack');
// Hybrid RC: keep signAndEditExecutable=false to avoid winCodeSign symlink errors
// on Windows. EXE icon is embedded via afterPack + resedit instead.
check(pkg.build?.win?.signAndEditExecutable === false, 'signAndEditExecutable should remain false (use afterPack resedit)');
check(pkg.build?.afterPack === './scripts/electron-builder-after-pack.cjs', 'afterPack icon embed hook missing');
check(pkg.build?.icon === 'build/Program-Icon.ico' || pkg.build?.win?.icon === 'build/Program-Icon.ico', 'program icon path must be configured');
check(fs.existsSync(path.join(root, 'scripts', 'run-win-build.cjs')), 'run-win-build.cjs wrapper missing');
check(fs.existsSync(path.join(root, 'scripts', 'electron-builder-after-pack.cjs')), 'electron-builder-after-pack.cjs missing');
check((scripts.prebuild || '').includes('generate-brand-assets'), 'prebuild must generate brand assets');
check((scripts.prebuild || '').includes('generate-oauth-config.mjs --strict'), 'prebuild must enforce strict oauth config generation');
check(pkg.build?.productName === branding.product?.name, 'build productName must match branding product name');

if (errors.length) {
  console.error('FAIL: phase12 build');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: phase12 build configuration checks');
