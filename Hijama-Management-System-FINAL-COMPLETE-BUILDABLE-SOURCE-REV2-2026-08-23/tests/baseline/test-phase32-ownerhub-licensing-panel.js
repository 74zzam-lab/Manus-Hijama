#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8');
const errors = [];
function check(ok, msg) { if (!ok) errors.push(msg); }

check(src.includes('📦 الاشتراك والترخيص'), 'licensing panel title missing');
check(src.includes('>الباقة<'), 'localized package field missing');
check(src.includes('>الاشتراك<'), 'localized subscription field missing');
check(src.includes('>تاريخ الانتهاء<'), 'localized expiry field missing');
check(!src.includes('Developer renewal'), 'untranslated developer renewal label must not return to normal UI');
check(src.includes("openLicenseScreen('licensing')"), 'licensing action button missing');
check(src.includes("openLicenseScreen('developer')"), 'developer renewal action missing');

if (errors.length) {
  console.error('FAIL: phase32 ownerhub licensing panel');
  for (const err of errors) console.error(' -', err);
  process.exit(1);
}
console.log('OK: phase32 ownerhub licensing panel checks');
