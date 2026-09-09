#!/usr/bin/env node
'use strict';

/**
 * V2-5.10 Category B (safe without live Windows) wiring checks.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const bridge = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');
check(/__tdw_conflict_queue__/.test(bridge) && /__tdw_attachment_manifest__/.test(bridge),
  'KV_MIRROR includes conflict queue + attachment manifest');
check(/function isPrimary/.test(bridge), 'SqliteBridge.isPrimary helper');

const cq = fs.readFileSync(path.join(root, 'cloud/conflict-queue.js'), 'utf8');
check(/mirrorOpenToSqlite/.test(cq) && /openConflict/.test(cq), 'ConflictQueue dual-writes sync_conflicts');
check(/mirrorResolveToSqlite/.test(cq) && /resolveConflict/.test(cq), 'ConflictQueue resolves SQLite conflict');
check(/listMerged/.test(cq) && /rowToQueueItem/.test(cq), 'ConflictQueue listMerged reads sync_conflicts');
const cfUi = fs.readFileSync(path.join(root, 'cloud/conflict-manager-ui.js'), 'utf8');
check(/listMerged/.test(cfUi) && /modal-shell/.test(cfUi), 'Conflict Manager UI uses listMerged + modal-shell');
check(/function manualMerge[\s\S]{0,200}listMerged/.test(cfUi), 'manualMerge reads listMerged');

const outbox = fs.readFileSync(path.join(root, 'database/sync-outbox.js'), 'utf8');
check(/listOpenConflicts/.test(outbox), 'listOpenConflicts API');
check(/ON CONFLICT\(conflict_id\)/.test(outbox), 'openConflict idempotent upsert');

const svc = fs.readFileSync(path.join(root, 'electron/database/service.js'), 'utf8');
check(/listOpenConflicts/.test(svc), 'syncOp exposes listOpenConflicts');

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
check(/BootFlow is the only customer activation path/.test(index)
  || /never show it/.test(index),
  'login drive bootstrap panel forced hidden');
check(/onclick="openBootWizardFromLogin\(\)"/.test(index)
  && /بدء الإعداد/.test(index),
  'login primary CTA is BootFlow');
check(/شاشة الترخيص \(دعم\)|openLicenseScreen\(\)/.test(index),
  'license screen remains available as support entry');
check(/never fall back to CenterSetup|معالج الإعداد غير محمّل/.test(index),
  'BootFlow login CTA does not fall back to CenterSetup');
check(/countPending/.test(index) && /refreshOpsUxStatusStrip/.test(index),
  'ops status strip uses ConflictQueue.countPending');
check(/Owner Hub — الفروع والأجهزة/.test(index),
  'Settings Cloud V2 primary CTA routes to Owner Hub');
check(!/id="login-center-setup-panel"/.test(index),
  'dead login CenterSetup panel removed');
check(/modal-shell--sm/.test(index) && /100dvh/.test(index), 'modal-shell responsive sizing');
check(/id="doctorModal">\s*<div class="modal modal-shell"/.test(index), 'doctor modal-shell');
check(/id="partialResetModal"[\s\S]{0,160}modal-shell/.test(index), 'partialReset modal-shell');
check(/id="clientEditModalBox"[^>]*modal-shell|modal-shell[^>]*id="clientEditModalBox"/.test(index)
  || /id="clientEditModalBox"[\s\S]{0,80}modal-shell/.test(index),
  'clientEdit modal-shell');
check(/id="receiptModal"[\s\S]{0,120}modal-shell/.test(index), 'receipt modal-shell');
check(/id="userModal"[\s\S]{0,120}modal-shell/.test(index), 'user modal-shell');
check(/id="backupModal"[\s\S]{0,120}modal-shell/.test(index), 'backup modal-shell');
check(/id="importWizardModal"[\s\S]{0,120}modal-shell/.test(index), 'import wizard modal-shell');
check(/max-width:\s*1024px[\s\S]{0,200}#menu-toggle|#menu-toggle[\s\S]{0,80}1024px/.test(index)
  || /@media \(max-width: 1024px\)[\s\S]{0,400}#menu-toggle/.test(index),
  'drawer sidebar extends to 1024px');
check(/cloud\/ui-busy\.js/.test(index), 'ui-busy wired');

const hub = fs.readFileSync(path.join(root, 'cloud/owner-hub.js'), 'utf8');
check(/showSection/.test(hub)
  && /data-oh-section-btn="organization"/.test(hub)
  && /data-oh-section-btn="advanced"/.test(hub)
  && /id="oh-panel-organization"/.test(hub)
  && /id="oh-panel-advanced"/.test(hub),
  'Owner Hub operational overview vs advanced support sections');

const csUi = fs.readFileSync(path.join(root, 'cloud/center-setup-ui.js'), 'utf8');
check(/function maybeAutoOpen\(\)\s*\{[\s\S]{0,280}return;\s*\}/.test(csUi)
  || /never auto-prompt/.test(csUi),
  'CenterSetupUI.maybeAutoOpen is no-op (BootFlow + Owner Hub)');
const cs = fs.readFileSync(path.join(root, 'cloud/center-setup.js'), 'utf8');
check(/function shouldAutoPromptSetup\(\)\s*\{[\s\S]{0,200}return false;/.test(cs),
  'CenterSetup.shouldAutoPromptSetup always false');

const endVision = fs.readFileSync(
  path.join(root, 'docs/integration-v2-5-10/END-OF-PROGRAM-VISION-REPORT.md'),
  'utf8'
);
check(/Production Candidate[\s\S]{0,80}\*\*NO\*\*/i.test(endVision),
  'end-of-program vision keeps PC = NO');
check(/Category B[\s\S]{0,120}COMPLETE|SUBSTANTIALLY COMPLETE/i.test(endVision),
  'end-of-program marks Category B complete');

const boot = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
check(/runWithButtonLock/.test(boot), 'BootFlow buttons use busy lock');
check(/Backup V2/.test(boot), 'BootFlow restore hint mentions Backup V2');

const actErr = fs.readFileSync(path.join(root, 'cloud/activation-errors.js'), 'utf8');
check(/backup_v1_disabled/.test(actErr) && /bootflow_required/.test(actErr),
  'activation errors cover V1 deny + BootFlow');

check(/inventoryItems/.test(bridge), 'inventory tables mirrored in SQLite KV');

const cat = fs.readFileSync(path.join(root, 'docs/integration-v2-5-10/CATEGORY-A-B.md'), 'utf8');
check(/Category A/.test(cat) && /Category B/.test(cat), 'Category A/B doc present');
check(/Production Candidate/.test(cat), 'PC still gated by Category A');

const status = fs.readFileSync(path.join(root, 'docs/integration-v2-5-10/CURRENT-STATUS.md'), 'utf8');
check(/Ready for production[\s\S]{0,40}\*\*NO\*\*/i.test(status), 'production still NO');
check(!/Overall\s*[≥>=]\s*90/.test(status), 'no score inflation');

// Runtime: listOpenConflicts on temp DB
const os = require('os');
const { openDatabase } = require(path.join(root, 'database/connection'));
const { createSyncPlatform } = require(path.join(root, 'database/sync-outbox'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2510-catb-'));
const dbPath = path.join(tmp, 't.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = openDatabase(dbPath);
const sp = createSyncPlatform(db);
const opened = sp.openConflict({
  conflict_id: 'cf-test-1',
  center_id: 'CTR',
  branch_id: 'BR-MAIN',
  table_name: 'cases',
  record_id: 'c1',
  local_json: { id: 'c1', v: 1 },
  remote_json: { id: 'c1', v: 2 },
});
check(opened.ok === true, 'openConflict ok');
const again = sp.openConflict({
  conflict_id: 'cf-test-1',
  center_id: 'CTR',
  branch_id: 'BR-MAIN',
  table_name: 'cases',
  record_id: 'c1',
  local_json: { id: 'c1', v: 3 },
  remote_json: { id: 'c1', v: 2 },
});
check(again.ok === true, 'openConflict upsert ok');
const rows = sp.listOpenConflicts({ branchId: 'BR-MAIN' });
check(Array.isArray(rows) && rows.length >= 1, 'listOpenConflicts returns rows');
check(sp.resolveConflictById('cf-test-1', 'local', null, 'tester').ok === true, 'resolveConflict ok');
try { db.close(); } catch { /* empty */ }

if (errors.length) {
  console.error('FAIL v2-5.10 category-b:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log('PASS v2-5.10 category-b (SQLite conflict dual-write, Owner Hub split, BootFlow-only login, modal shell)');
assert.strictEqual(errors.length, 0);
