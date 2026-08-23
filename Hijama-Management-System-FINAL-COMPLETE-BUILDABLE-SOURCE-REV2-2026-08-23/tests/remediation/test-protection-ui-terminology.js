'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const start = html.indexOf('id="set-panel-backup"');
const end = html.indexOf('id="set-panel-help"', start);
assert(start >= 0 && end > start, 'backup settings surface must exist');
const backupSurface = html.slice(start, end);

[
  'حماية البيانات والتحديث بين الأجهزة',
  'ربط حساب Google',
  'تحديث بين الأجهزة',
  'النسخ الاحتياطي الرسمي',
  'معرّف الدعم',
  'فترة التحديث',
].forEach((copy) => assert(backupSurface.includes(copy), `expected customer-facing copy: ${copy}`));

[
  'Cloud V2 — حالة المزامنة',
  'Cloud V2 — مزامنة Drive',
  'Push + Poll بين الأجهزة',
  'Backup V1 (LevelDB / Cloud DB المشفر)',
].forEach((technicalCopy) => assert(!backupSurface.includes(technicalCopy), `technical customer copy must not return: ${technicalCopy}`));

console.log('PASS remediation:protection-ui-terminology');
