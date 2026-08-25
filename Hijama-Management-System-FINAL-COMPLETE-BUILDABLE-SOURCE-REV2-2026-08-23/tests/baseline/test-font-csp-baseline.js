#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

const fontsDir = path.join(root, 'assets', 'fonts');
const expected = [
  'tajawal-300-arabic.woff2', 'tajawal-300-latin.woff2',
  'tajawal-400-arabic.woff2', 'tajawal-400-latin.woff2',
  'tajawal-500-arabic.woff2', 'tajawal-500-latin.woff2',
  'tajawal-700-arabic.woff2', 'tajawal-700-latin.woff2',
  'tajawal-800-arabic.woff2', 'tajawal-800-latin.woff2',
  'tajawal-900-arabic.woff2', 'tajawal-900-latin.woff2',
  'cairo-variable-arabic.woff2', 'cairo-variable-latin-ext.woff2', 'cairo-variable-latin.woff2',
  'inter-variable-latin-ext.woff2', 'inter-variable-latin.woff2',
];
for (const name of expected) {
  const fp = path.join(fontsDir, name);
  check(fs.existsSync(fp), `missing font ${name}`);
  if (fs.existsSync(fp)) {
    const buf = fs.readFileSync(fp);
    check(buf.length > 1000, `${name} too small`);
    check(buf.slice(0, 4).toString('hex') === '774f4632', `${name} not woff2`);
  }
}

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
check(!index.includes('fonts.googleapis.com'), 'index.html must not load Google Fonts CDN');
check(index.includes('@font-face'), 'index.html must declare @font-face');
check(index.includes('assets/fonts/'), 'index.html must reference local fonts');

const csp = fs.readFileSync(path.join(root, 'electron', 'security', 'window-policy.js'), 'utf8');
check(!csp.includes('fonts.googleapis.com'), 'CSP must not allow Google Fonts');
check(!csp.includes('fonts.gstatic.com'), 'CSP must not allow gstatic fonts');
check(csp.includes("font-src 'self' data:"), 'CSP font-src must be self/data');

if (errors.length) {
  console.error('FAIL: font-csp baseline');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('OK: font-csp baseline (local fonts + strict CSP)');
