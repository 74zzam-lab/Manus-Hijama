#!/usr/bin/env node
'use strict';

/**
 * RC Hotfix Round 7 — capability-aware RBAC for bootstrap restore IPC.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const rbacSrc = fs.readFileSync(path.join(root, 'electron/rbac-session.js'), 'utf8');
const bootstrapSrc = fs.readFileSync(path.join(root, 'electron/bootstrap-restore-capability.js'), 'utf8');
const mainSrc = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8');
const bootSrc = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
const opsSrc = fs.readFileSync(path.join(root, 'cloud/ops-ux-bridge.js'), 'utf8');
const ipcSrc = fs.readFileSync(path.join(root, 'electron/backup-v2-ipc.js'), 'utf8');

check(/bootstrapCapability:\s*'restore'/.test(rbacSrc), 'restoreUnified policy uses bootstrapCapability');
check(/backup:v2:restoreUnified/.test(bootstrapSrc), 'bootstrap channels include restoreUnified');
check(/assertChannelAllowed\(event, channel, trustedRbacOpts\)/.test(mainSrc), 'main IPC guard passes main-issued trusted context to RBAC');
check(/invokeRestoreUnified/.test(ipcSrc), 'restoreFromCloudRemote delegates to invokeRestoreUnified');
check(/source:\s*'local'/.test(bootSrc) && /context:\s*'bootstrap'/.test(bootSrc), 'BootFlow local restore uses bootstrap unified path');
check(/issueRestoreCapability/.test(bootSrc), 'BootFlow local restore issues bootstrap capability');
check(/v2RestoreUnified/.test(bootSrc), 'BootFlow local restore calls v2RestoreUnified');
check(/btn\.disabled = true/.test(opsSrc), 'confirm button disables during restore');
check(/سحب أحدث بيانات المزامنة للفرع/.test(bootSrc), 'sync hydrate user-facing label updated');

const rbac = require(path.join(root, 'electron/rbac-session'));
const bootstrap = require(path.join(root, 'electron/bootstrap-restore-capability'));

const users = [
  { id: '1', role: 'owner', active: true, branchScope: ['*'] },
  { id: '4', role: 'admin', active: true, branchScope: ['*'] },
];

bootstrap.configure({
  getUserDataPath: () => path.join(os.tmpdir(), 'tdw-r7-rbac'),
  readKv: (key) => (key === '__tdw_boot_wizard__' ? { syncDone: false } : null),
  getCloudStatus: async () => ({ connected: true, email: 'a@b.com', oauth: true }),
  verifyFileIdMetadata: async () => ({ ok: true, item: { id: 'FILE-A', size: 1000 } }),
  readLicense: (centerId) => ({ ok: true, data: { centerId, branches: [{ id: 'B1', active: true }] } }),
  getSession: () => null,
});

const fakeEvent = { sender: { id: 9001 } };
const cloudPath = 'Backups/V2/Tadawi-Backup-V2-a.tdw';
const cloudPathB = 'Backups/V2/Tadawi-Backup-V2-b.tdw';

function assertDenied(channel, opts, expectedCode) {
  try {
    rbac.assertChannelAllowed(fakeEvent, channel, opts || {});
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.code || err.message };
  }
}

(async () => {
  const deniedNoCap = assertDenied('backup:v2:restoreUnified', {});
  check(!deniedNoCap.ok && deniedNoCap.error === 'rbac_session_required', 'pre-login + no capability → DENIED');

  const issued = await bootstrap.issueRestoreCapability(fakeEvent, {
    bootFlow: true,
    centerId: 'C1',
    branchId: 'B1',
    remotePath: cloudPath,
    googleFileId: 'FILE-A',
    backupId: 'FILE-A',
    licenseSnapshot: { centerId: 'C1', branches: [{ id: 'B1', active: true }] },
  });
  check(issued.ok && issued.capabilityId, 'issue bootstrap capability for cloud restore');

  let allowed = null;
  try {
    allowed = rbac.assertChannelAllowed(fakeEvent, 'backup:v2:restoreUnified', {
      bootstrapRestoreCapabilityId: issued.capabilityId,
      remotePath: cloudPath,
      googleFileId: 'FILE-A',
      centerId: 'C1',
      branchId: 'B1',
    });
  } catch (err) {
    allowed = { ok: false, error: err.code };
  }
  check(allowed?.ok && allowed.bootstrap, 'pre-login + valid bootstrap capability → ALLOWED');

  const issued2 = await bootstrap.issueRestoreCapability({ sender: { id: 9002 } }, {
    bootFlow: true,
    centerId: 'C1',
    branchId: 'B1',
    remotePath: cloudPath,
    googleFileId: 'FILE-A',
    backupId: 'FILE-A',
    licenseSnapshot: { centerId: 'C1', branches: [{ id: 'B1', active: true }] },
  });
  const cap = bootstrap.getCapability(issued2.capabilityId);
  cap.expiresAt = Date.now() - 1000;
  bootstrap._purgeExpired();
  const expired = assertDenied('backup:v2:restoreUnified', {
    bootstrapRestoreCapabilityId: issued2.capabilityId,
    remotePath: cloudPath,
    googleFileId: 'FILE-A',
    centerId: 'C1',
  });
  check(!expired.ok && expired.error === 'restore_authorization_required', 'pre-login + expired capability → DENIED');

  const issued3 = await bootstrap.issueRestoreCapability({ sender: { id: 9003 } }, {
    bootFlow: true,
    centerId: 'C1',
    branchId: 'B1',
    remotePath: cloudPath,
    googleFileId: 'FILE-A',
    backupId: 'FILE-A',
    licenseSnapshot: { centerId: 'C1', branches: [{ id: 'B1', active: true }] },
  });
  const wrongBackup = assertDenied('backup:v2:restoreUnified', {
    bootstrapRestoreCapabilityId: issued3.capabilityId,
    remotePath: cloudPathB,
    googleFileId: 'FILE-B',
    centerId: 'C1',
  });
  check(!wrongBackup.ok && wrongBackup.error === 'restore_authorization_required', 'pre-login + capability Backup A + request Backup B → DENIED');

  const issued4 = await bootstrap.issueRestoreCapability({ sender: { id: 9004 } }, {
    bootFlow: true,
    centerId: 'C1',
    branchId: 'B1',
    remotePath: cloudPath,
    googleFileId: 'FILE-A',
    backupId: 'FILE-A',
    licenseSnapshot: { centerId: 'C1', branches: [{ id: 'B1', active: true }] },
  });
  const wrongCenter = assertDenied('backup:v2:restoreUnified', {
    bootstrapRestoreCapabilityId: issued4.capabilityId,
    remotePath: cloudPath,
    googleFileId: 'FILE-A',
    centerId: 'C2',
  });
  check(!wrongCenter.ok && wrongCenter.error === 'restore_authorization_required', 'pre-login + capability center A + center B → DENIED');

  const adminEvent = { sender: { id: 9005 } };
  rbac.clearSession(adminEvent);
  const adminBind = rbac.bindSession(adminEvent, {
    userId: '4',
    role: 'admin',
    branchScope: ['*'],
    lookupUsers: () => users,
  });
  check(adminBind.ok, 'admin session binds');
  let adminAllowed = null;
  try {
    adminAllowed = rbac.assertChannelAllowed(adminEvent, 'backup:v2:restoreUnified', {});
  } catch (err) {
    adminAllowed = { ok: false, error: err.code };
  }
  check(adminAllowed?.ok, 'logged-in admin → ALLOWED normally');

  bootstrap.configure({ readKv: () => ({ syncDone: true }) });
  const afterReady = await bootstrap.issueRestoreCapability({ sender: { id: 9006 } }, {
    bootFlow: true,
    centerId: 'C1',
    remotePath: cloudPath,
    backupId: cloudPath,
  });
  check(!afterReady.ok && afterReady.error === 'bootstrap_restore_not_allowed_app_ready', 'logged-out after app READY → DENIED issue');

  bootstrap.configure({ readKv: (key) => (key === '__tdw_boot_wizard__' ? { syncDone: false } : null) });
  const localBackupDir = path.join(os.tmpdir(), 'tdw-r7-rbac', 'Backups', 'V2');
  fs.mkdirSync(localBackupDir, { recursive: true });
  const tmpTdw = path.join(localBackupDir, `tdw-local-${Date.now()}.tdw`);
  fs.writeFileSync(tmpTdw, 'fixture');
  const localCap = await bootstrap.issueRestoreCapability({ sender: { id: 9007 } }, {
    bootFlow: true,
    source: 'local',
    localPath: tmpTdw,
    centerId: 'C1',
    branchId: 'B1',
    backupId: path.basename(tmpTdw),
    licenseSnapshot: { centerId: 'C1', branches: [{ id: 'B1', active: true }] },
  });
  check(localCap.ok, 'bootstrap local file capability issued');
  let localGate = null;
  try {
    localGate = rbac.assertChannelAllowed({ sender: { id: 9007 } }, 'backup:v2:restoreUnified', {
      bootstrapRestoreCapabilityId: localCap.capabilityId,
      source: 'local',
      localPath: tmpTdw,
      filePath: tmpTdw,
      centerId: 'C1',
    });
  } catch (err) {
    localGate = { ok: false, error: err.code };
  }
  check(localGate?.ok, 'local bootstrap capability authorizes restoreUnified');
  try { fs.unlinkSync(tmpTdw); } catch { /* ignore */ }

  check(/execute: async \(\)[\s\S]{0,800}issueRestoreCapability[\s\S]{0,800}v2RestoreUnified/.test(bootSrc), 'local file confirm dispatches bootstrap restoreUnified');

  if (errors.length) {
    console.error('RC Hotfix Round 7 RBAC bootstrap restore tests FAILED:\n' + errors.map((e) => '  - ' + e).join('\n'));
    process.exit(1);
  }
  console.log('All RC Hotfix Round 7 RBAC bootstrap restore checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
