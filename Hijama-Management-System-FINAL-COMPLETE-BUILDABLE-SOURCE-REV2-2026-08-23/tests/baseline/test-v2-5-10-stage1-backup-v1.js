#!/usr/bin/env node
'use strict';

/**
 * V2-5.10 Stage-1: Backup V1 (LevelDB Cloud DB) must be hidden/disabled
 * from customer UI entry points. Wiring/unit only — not Windows Requirement PASS.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

check(/BACKUP_V1_CUSTOMER_UI_DISABLED\s*=\s*true/.test(indexSrc), 'BACKUP_V1_CUSTOMER_UI_DISABLED must be true');
check(/function isBackupV1CustomerUiDisabled/.test(indexSrc), 'isBackupV1CustomerUiDisabled helper');
check(/function denyBackupV1CustomerAction/.test(indexSrc), 'denyBackupV1CustomerAction helper');
check(/window\.isBackupV1CustomerUiDisabled\s*=\s*isBackupV1CustomerUiDisabled/.test(indexSrc), 'export isBackupV1CustomerUiDisabled');
check(/window\.runCloudV2SyncNow\s*=\s*runCloudV2SyncNow/.test(indexSrc), 'export runCloudV2SyncNow');

const backupMain = fs.readFileSync(path.join(root, 'electron/backup.js'), 'utf8');
check(/backup-v1-gate/.test(backupMain), 'backup.js uses backup-v1-gate');
check(/isBackupV1RuntimeDisabled\(\)/.test(backupMain), 'main-layer Backup V1 disable calls');
check(/denyBackupV1\(/.test(backupMain), 'main denyBackupV1 used');
const bridgeSrc = fs.readFileSync(path.join(root, 'cupping-cloud-db-backup.js'), 'utf8');
check(/isDisabled\(\)/.test(bridgeSrc) && /backup_v1_disabled/.test(bridgeSrc),
  'renderer CloudDbBackupBridge denies V1');

// Runtime: gate module (no Electron download)
const gate = require(path.join(root, 'electron/backup-v1-gate.js'));
check(gate.isBackupV1RuntimeDisabled() === true, 'isBackupV1RuntimeDisabled defaults true');
const denied = gate.denyBackupV1('uploadDbBackup');
check(denied && denied.ok === false && denied.error === 'backup_v1_disabled', 'denyBackupV1 payload');

// V1 buttons present only as disabled/hidden stubs (ids retained for render guards)
for (const id of ['btn-cdb-backup', 'btn-cdb-restore', 'btn-cdb-sync']) {
  const re = new RegExp(`id="${id}"[^>]*disabled`, 'i');
  check(re.test(indexSrc) || new RegExp(`id="${id}"[\\s\\S]{0,120}?disabled`, 'i').test(indexSrc),
    id + ' must be disabled in markup');
  check(new RegExp(`id="${id}"[^>]*display:\\s*none`, 'i').test(indexSrc)
    || new RegExp(`id="${id}"[\\s\\S]{0,200}?display:\\s*none`, 'i').test(indexSrc),
    id + ' must be display:none in markup');
}

check(/id="cdb-v1-auto-wrap"/.test(indexSrc)
  && /display:\s*none\s*!important"[\s\S]{0,40}id="cdb-v1-auto-wrap"|id="cdb-v1-auto-wrap"[\s\S]{0,80}display:\s*none/i.test(indexSrc),
  'V1 auto schedule wrap hidden');
check(/id="cloud-db-backup-list"[\s\S]{0,80}?display:\s*none|id="cloud-db-backup-list"\s+style="display:\s*none/i.test(indexSrc),
  'V1 backup list hidden');

// Entry points deny when flag set
check(/async function runCloudDbBackupNow[\s\S]{0,200}?isBackupV1CustomerUiDisabled\(\)/.test(indexSrc),
  'runCloudDbBackupNow denies when V1 disabled');
check(/async function syncCloudDbBackupNow[\s\S]{0,200}?isBackupV1CustomerUiDisabled\(\)/.test(indexSrc),
  'syncCloudDbBackupNow denies when V1 disabled');
check(/async function openCloudDbRestoreList[\s\S]{0,200}?isBackupV1CustomerUiDisabled\(\)/.test(indexSrc),
  'openCloudDbRestoreList denies when V1 disabled');
check(/async function restoreCloudDbBackupItem[\s\S]{0,200}?isBackupV1CustomerUiDisabled\(\)/.test(indexSrc),
  'restoreCloudDbBackupItem denies when V1 disabled');
check(/function startCloudDbAutoTimer\(\)\s*\{[\s\S]{0,400}?isBackupV1CustomerUiDisabled\(\)\s*\)\s*return/.test(indexSrc)
  || /function startCloudDbAutoTimer\(\)\s*\{[\s\S]{0,400}?if\s*\(\s*isBackupV1CustomerUiDisabled\(\)\s*\)\s*return/.test(indexSrc),
  'startCloudDbAutoTimer returns early when V1 disabled');

// Cloud V2 sync must not call V1 backup
check(/onclick="runCloudV2SyncNow\(\)"/.test(indexSrc), 'Cloud V2 card uses runCloudV2SyncNow');
check(/async function runCloudV2SyncNow[\s\S]{0,400}?SyncEngine\.runOnce/.test(indexSrc),
  'runCloudV2SyncNow calls SyncEngine.runOnce');
check(!/onclick="runCloudDbBackupNow\(/.test(indexSrc), 'no customer onclick to runCloudDbBackupNow');
check(!/onclick="syncCloudDbBackupNow\(/.test(indexSrc), 'no customer onclick to syncCloudDbBackupNow');

// Customer-facing recovery messaging must explain the official path without implementation versions.
check(/النسخ الاحتياطي الرسمي/.test(indexSrc) && /طريقة النسخ القديمة معطّلة/.test(indexSrc),
  'customer legend states the legacy path is disabled and the official recovery path is available');

// Honesty: Stage-1 docs must not claim production ready or inflate scores
const statusPath = path.join(root, 'docs/integration-v2-5-10/CURRENT-STATUS.md');
check(fs.existsSync(statusPath), 'CURRENT-STATUS.md exists');
const status = fs.readFileSync(statusPath, 'utf8');
check(/Ready for production\s*\|\s*\*\*NO\*\*/i.test(status) || /Ready for production[\s\S]{0,40}\*\*NO\*\*/i.test(status),
  'CURRENT-STATUS must say Ready for production NO');
check(!/Overall\s*[≥>=]+\s*90/.test(status), 'must not claim Overall ≥ 90 yet');

const stage1Path = path.join(root, 'docs/integration-v2-5-10/STAGE-1-RELEASE-SAFETY.md');
check(fs.existsSync(stage1Path), 'STAGE-1-RELEASE-SAFETY.md exists');
const stage1 = fs.readFileSync(stage1Path, 'utf8');
check(/40\/40/.test(stage1) && /UNVERIFIED/.test(stage1), 'Stage-1 tracker keeps 40/40 UNVERIFIED honest');

if (errors.length) {
  console.error('FAIL v2-5.10 stage1 backup-v1:\n- ' + errors.join('\n- '));
  process.exit(1);
}

console.log('PASS v2-5.10 stage1 backup-v1 (' + [
  'flag', 'hidden buttons', 'deny stubs', 'Cloud V2 sync', 'honesty docs',
].join(', ') + ')');
assert.strictEqual(errors.length, 0);
