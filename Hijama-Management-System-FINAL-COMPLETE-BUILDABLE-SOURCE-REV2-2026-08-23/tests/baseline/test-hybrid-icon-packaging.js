#!/usr/bin/env node
'use strict';

/**
 * Hybrid H2 — Windows icon packaging configuration checks.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const mainJs = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
const afterPack = fs.readFileSync(path.join(root, 'scripts', 'electron-builder-after-pack.cjs'), 'utf8');
const icoPath = path.join(root, 'build', 'Program-Icon.ico');
const ico = fs.readFileSync(icoPath);

// Keep signAndEditExecutable false to avoid winCodeSign symlink privilege failures on Windows.
check(pkg.build?.win?.signAndEditExecutable === false, 'signAndEditExecutable must stay false (avoid winCodeSign)');
check(pkg.build?.afterPack === './scripts/electron-builder-after-pack.cjs', 'afterPack hook must embed icon via resedit');
check(afterPack.includes('resedit'), 'afterPack must use resedit');
check(afterPack.includes('Program-Icon.ico'), 'afterPack must target Program-Icon.ico');
check(!!pkg.devDependencies?.resedit, 'resedit must be a devDependency');
check(pkg.build?.icon === 'build/Program-Icon.ico', 'top-level build.icon must point to Program-Icon.ico');
check(pkg.build?.win?.icon === 'build/Program-Icon.ico', 'win.icon must point to Program-Icon.ico');
check(pkg.build?.nsis?.installerIcon === 'build/Program-Icon.ico', 'nsis installerIcon configured');
check(pkg.scripts?.['build:win']?.includes('run-win-build'), 'build:win must use hybrid run-win-build wrapper');
check(mainJs.includes('APP_ICON'), 'main process must define APP_ICON');
check(mainJs.includes('icon: APP_ICON') || mainJs.includes('{ icon: APP_ICON }'), 'BrowserWindow must set icon');

check(ico[0] === 0 && ico[1] === 0 && ico[2] === 1 && ico[3] === 0, 'Program-Icon.ico must be Windows ICO');
const count = ico.readUInt16LE(4);
const sizes = [];
for (let i = 0; i < count; i++) {
  const w = ico[6 + i * 16] || 256;
  sizes.push(w);
}
for (const need of [16, 24, 32, 48, 64, 128, 256]) {
  check(sizes.includes(need), `ICO missing ${need}x${need}`);
}

const csp = fs.readFileSync(path.join(root, 'electron', 'security', 'window-policy.js'), 'utf8');
check(!csp.includes('fonts.googleapis.com'), 'CSP must not allow Google Fonts');
check(!csp.includes('api.qrserver.com'), 'CSP must not allow remote QR');

if (errors.length) {
  console.error('FAIL: hybrid icon packaging');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('OK: hybrid icon packaging configuration');
console.log('  ICO sizes:', sizes.join(', '));
console.log('  Icon embed: afterPack + resedit (no winCodeSign)');
