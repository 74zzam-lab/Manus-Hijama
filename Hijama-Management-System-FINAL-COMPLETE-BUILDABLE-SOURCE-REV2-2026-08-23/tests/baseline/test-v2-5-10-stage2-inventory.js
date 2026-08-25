#!/usr/bin/env node
'use strict';

/**
 * V2-5.10 Stage-2 PREP inventory (non-destructive).
 * Documents dual stores / duplicate surfaces. Does NOT flip Stage-2 complete.
 * Destructive consolidation waits until Stage-1 Windows A–E PASS.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const bridge = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');
const conflictQ = fs.readFileSync(path.join(root, 'cloud/conflict-queue.js'), 'utf8');
const attach = fs.readFileSync(path.join(root, 'cloud/attachment-lifecycle.js'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
const sheets = fs.readFileSync(path.join(root, 'cloud/google-sheets-ops.js'), 'utf8');
const backupJs = fs.readFileSync(path.join(root, 'electron/backup.js'), 'utf8');
const backupGate = fs.readFileSync(path.join(root, 'electron/backup-v1-gate.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mig002 = fs.readFileSync(path.join(root, 'database/migrations/002_sync_platform.js'), 'utf8');

// SoT helpers present (cutover incomplete until Stage-1 + Stage-2)
check(/CORE_TABLES|__noOptimisticOperational/.test(bridge), 'SQLite bridge operational guards present');
check(/restoreLastCommit|setAuthoritative/.test(bridge), 'authoritative write / rollback helpers');

// Dual conflict stores still exist (documented debt)
check(/__tdw_conflict_queue__/.test(conflictQ), 'LS ConflictQueue still present (Stage-2 merge target)');
check(/sync_conflicts/.test(mig002), 'SQLite sync_conflicts table exists (canonical target)');

// Dual attachment metadata still exists
check(/__tdw_attachment_manifest__|MANIFEST_KEY/.test(attach), 'attachment LS manifest still present');
check(/attachments/.test(fs.readFileSync(path.join(root, 'database/migrations/001_initial.js'), 'utf8')),
  'SQLite attachments table exists');

// Activation: BootFlow present; duplicate surfaces still in index (merge after Stage-1)
check(/version:\s*'v2-5\.9'|NEW_STEPS/.test(boot), 'BootFlow canonical path present');
check(/login-drive-bootstrap-panel|openLicenseScreen|CenterSetupUI/.test(index),
  'duplicate activation surfaces still inventoried in index');

// Sheets non-SoT
check(/license_registry_integration/.test(sheets) && /isSourceOfTruth:\s*false/.test(sheets),
  'Sheets role remains license_registry_integration only');

// Backup V1 hard-disabled at main layer (Stage-1 + Stage-2 prep)
check(/backup-v1-gate/.test(backupJs) && /isBackupV1RuntimeDisabled/.test(backupJs),
  'Backup V1 runtime disable wired in backup.js');
check(/BACKUP_V1_DISABLED|backup_v1_disabled/.test(backupGate), 'Backup V1 deny payload');

const program = fs.readFileSync(path.join(root, 'docs/integration-v2-5-10/00-PROGRAM.md'), 'utf8');
check(/Stage 2[\s\S]{0,120}BLOCKED|Architecture Consolidation[\s\S]{0,80}BLOCKED/i.test(program)
  || /BLOCKED/.test(program),
  'Stage 2 remains BLOCKED in program until Stage-1 PASS');

if (errors.length) {
  console.error('FAIL v2-5.10 stage2 inventory:\n- ' + errors.join('\n- '));
  process.exit(1);
}

console.log('PASS v2-5.10 stage2 inventory (prep only — dual stores documented, Stage-2 not complete)');
process.exit(0);
