#!/usr/bin/env node
'use strict';

/**
 * License read-only — all roles may login when expired/none; daily writes blocked; backup allowed.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const licRo = fs.readFileSync(path.join(root, 'cloud/license-read-only-mode.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');
const ext = fs.readFileSync(path.join(root, 'cupping-ext-modules.js'), 'utf8');

check(/license-read-only-mode\.js/.test(index), 'index loads license-read-only-mode');
check(/login-readonly-notice/.test(index), 'login read-only notice element');
check(/LicenseReadOnlyMode\.syncSessionMode/.test(index), 'completeAuthenticatedLogin syncs read-only mode');
check(/LicenseReadOnlyMode\.applyUiLocks/.test(index), 'UI locks applied after login and navigation');
check(!/login-employee-notice/.test(index), 'legacy employee-only notice removed');
check(/جميع المستخدمين/.test(index), 'login copy mentions all users read-only');
check(/_licStatus === 'expired'[\s\S]{0,200}await finishLogin/.test(index.replace(/\n/g, ' ')),
  'expired license allows finishLogin for any active user');
check(!/u\.role !== 'employee'/.test(index) || !/session restore[\s\S]{0,400}u\.role !== 'employee'/.test(index),
  'session restore does not block non-employee on expired license');

check(/isDbKeyWriteAllowed/.test(licRo) && /runWithBackupWriteAsync/.test(licRo), 'backup write token API');
check(/guardDailyWrite/.test(licRo) && /guardRestore/.test(licRo), 'daily write and restore guards');
check(/LicenseReadOnlyMode\.isDbKeyBlocked/.test(index), 'dbSetGuarded respects license read-only');
check(/license_readonly_mode/.test(bridge), 'sqlite bridge blocks operational writes in read-only');
check(/LicenseReadOnlyMode\?\.isActive/.test(ext), 'permission UI respects license read-only');
check(/LicenseReadOnlyMode\.guardDailyWrite/.test(index), 'saveCase guarded in read-only');
check(/LicenseReadOnlyMode\.guardRestore/.test(index), 'restore functions guarded in read-only');
check(/runWithBackupWriteAsync/.test(index), 'backup create wrapped for read-only settings writes');

// Behavioral sandbox
const sandbox = {
  console,
  module: { exports: {} },
  globalThis: {},
  window: {},
  document: {
    body: { classList: { toggle() {}, contains: () => false }, prepend() {} },
    getElementById: () => null,
    querySelectorAll: () => [],
  },
  notify: () => {},
};
sandbox.window = sandbox.globalThis;
sandbox.global = sandbox.globalThis;

vm.runInNewContext(licRo, sandbox);
const LRM = sandbox.LicenseReadOnlyMode || sandbox.module.exports;

sandbox.globalThis._licStatus = 'expired';
sandbox.globalThis._appAuthed = true;
sandbox.globalThis.currentUser = { id: '1', role: 'reception', active: true };
check(LRM.isActive(), 'isActive for reception on expired license');
check(!LRM.isDbKeyWriteAllowed('cases'), 'cases write blocked');
check(LRM.isDbKeyWriteAllowed('backupLog'), 'backupLog write allowed');
check(!LRM.guardRestore('test'), 'guardRestore returns false when active');
check(!LRM.guardDailyWrite('test'), 'guardDailyWrite returns false when active');

LRM.runWithBackupWrite(() => {
  check(LRM.isDbKeyWriteAllowed('settings'), 'settings allowed during backup token');
});
check(!LRM.isDbKeyWriteAllowed('settings'), 'settings blocked after backup token');

sandbox.globalThis._licStatus = 'valid';
check(!LRM.isActive(), 'isActive false when license valid');
check(LRM.isDbKeyWriteAllowed('cases'), 'cases write allowed when license valid');

if (errors.length) {
  console.error('FAIL: license-read-only-all-roles');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('OK: license-read-only-all-roles');
