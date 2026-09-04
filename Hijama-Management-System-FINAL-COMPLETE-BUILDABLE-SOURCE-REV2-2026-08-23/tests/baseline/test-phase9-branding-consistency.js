#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

check(
  html.includes("centerName: 'مركز الحجامة', centerNameEn: '',"),
  "defaultSettings.centerNameEn should preserve the legacy empty-string default"
);
check(
  html.includes("const cnEn   = settings.centerNameEn  || 'Cupping Center';"),
  "receipt English center fallback should preserve the legacy 'Cupping Center' value"
);
check(
  !html.includes("centerName: 'مركز الحجامة', centerNameEn: APP_META.productName || 'Hijama Management System'"),
  'Phase 9 APP_META default for centerNameEn should not override the restored legacy behavior'
);
check(
  !html.includes("const cnEn   = settings.centerNameEn  || APP_META.productName || 'Hijama Management System';"),
  'Phase 9 APP_META receipt fallback should not override the restored legacy behavior'
);

if (errors.length) {
  console.error('FAIL: phase9 branding consistency');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: phase9 branding consistency checks');
