#!/usr/bin/env node
/**
 * Phase 3: Backup V2 creates plaintext ZIP; legacy encrypted import path only.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'electron', 'backup-v2-core.js'), 'utf8');
const ipc = fs.readFileSync(path.join(root, 'electron', 'backup-v2-ipc.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.js'), 'utf8');
const reconcile = fs.readFileSync(path.join(root, 'cloud', 'restore-reconciliation.js'), 'utf8');

const checks = [
  { name: 'manifest encryption.required false', ok: /encryption:\s*\{\s*required:\s*false/.test(core) },
  { name: 'isEncryptedBackupBuffer exported', ok: /isEncryptedBackupBuffer/.test(core) },
  { name: 'isZipBackupBuffer for plaintext', ok: /function isZipBackupBuffer/.test(core) },
  { name: 'legacy import module exists', ok: fs.existsSync(path.join(root, 'electron', 'backup-v2-legacy-import.js')) },
  { name: 'IPC importLegacy handler', ok: /backup:v2:importLegacy/.test(ipc) },
  { name: 'optionalBackupPassword in IPC', ok: /function optionalBackupPassword/.test(ipc) },
  { name: 'preload v2ImportLegacy', ok: /v2ImportLegacy/.test(preload) },
  { name: 'UI no schedule password gate', ok: !/فعّل الجدولة يتطلب كلمة مرور Backup V2/.test(html) },
  { name: 'UI legacy import action', ok: /runBackupV2ImportLegacy/.test(html) },
  { name: 'restore-reconcile no pre_restore_password_required', ok: !/pre_restore_password_required/.test(reconcile) },
  { name: 'assertOperationalRestoreAllowed exported', ok: /function assertOperationalRestoreAllowed/.test(core) },
  { name: 'direct encrypted restore blocked in restoreBackupFile', ok: /assertOperationalRestoreAllowed\(inspected/.test(core) },
  { name: 'legacy import stages migration folder', ok: /legacy-migration-staging/.test(fs.readFileSync(path.join(root, 'electron', 'backup-v2-legacy-import.js'), 'utf8')) },
  { name: 'IPC runRestore rejects encrypted buffer', ok: /isEncryptedBackupBuffer\(buf\)/.test(ipc) },
  { name: 'scheduler no password tick', ok: !/credentialVault\.get\(PASSWORD_CREDENTIAL\)/.test(fs.readFileSync(path.join(root, 'electron', 'backup-v2-scheduler.js'), 'utf8')) },
  { name: 'UI restore blocks legacy encrypted', ok: /blocked:\s*true/.test(html.split('resolveBackupV2PasswordForFile')[1]?.slice(0, 800) || '') },
];

let failed = 0;
for (const c of checks) {
  console.log((c.ok ? 'PASS' : 'FAIL') + '  ' + c.name);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nAll Backup V2 plaintext checks passed.');
