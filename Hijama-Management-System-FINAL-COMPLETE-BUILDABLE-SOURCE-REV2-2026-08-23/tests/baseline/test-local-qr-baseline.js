#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

for (const rel of [
  'assets/vendor/qrcode-generator.js',
  'assets/vendor/qrcode-generator-utf8.js',
  'cupping-qr-local.js',
]) {
  check(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
}

for (const rel of ['index.html', 'cupping-simplified-tax-invoice.js', 'cupping-client-file.js', 'cupping-qr-local.js']) {
  const txt = fs.readFileSync(path.join(root, rel), 'utf8');
  check(!txt.includes('api.qrserver.com'), `${rel} must not use api.qrserver.com`);
}

const csp = fs.readFileSync(path.join(root, 'electron', 'security', 'window-policy.js'), 'utf8');
check(!csp.includes('api.qrserver.com'), 'CSP must not allow api.qrserver.com');

const ctx = { console };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/vendor/qrcode-generator.js'), 'utf8'), ctx);
vm.runInContext('this.qrcode = qrcode;', ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/vendor/qrcode-generator-utf8.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'cupping-qr-local.js'), 'utf8'), ctx);
const dataUrl = ctx.CuppingQr.makeDataUrl('HYBRID-QR-TEST', { size: 128 });
check(typeof dataUrl === 'string' && dataUrl.startsWith('data:image/'), 'CuppingQr.makeDataUrl must return data URL');

if (errors.length) {
  console.error('FAIL: local-qr baseline');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('OK: local-qr baseline (offline QR under CSP)');
