#!/usr/bin/env node
'use strict';

/** Production lock UX — branch isolation, login support, backup summary, thermal preview, shortcuts. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const setupDom = fs.readFileSync(path.join(root, 'cloud/setup-state-dom.js'), 'utf8');
const bootFlow = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
const branchScope = fs.readFileSync(path.join(root, 'cloud/branch-scope.js'), 'utf8');
const desktopInput = fs.readFileSync(path.join(root, 'cupping-desktop-input.js'), 'utf8');
const migUi = fs.readFileSync(path.join(root, 'cloud/legacy-branch-migration-ui.js'), 'utf8');

check(/setVisible\(loginSupport,\s*true\)/.test(setupDom), 'login support details always visible');
check(!/centerSupport\.style\.display\s*=\s*['"]none['"]/.test(bootFlow),
  'boot-flow must not hide login support after activation');

check(/getViewBranchFilter/.test(branchScope) && /isAggregateBranchView/.test(branchScope),
  'BranchScope view filter helpers');
check(/ensureRecordBranch/.test(indexSrc) && /saveCase/.test(indexSrc),
  'saveCase assigns branchId via ensureRecordBranch');

check(/id="bk-status-summary"/.test(indexSrc) && /renderBackupStatusSummary/.test(indexSrc),
  'backup status summary card wired');
check(/id="bk-v2-pass"[\s\S]*display:none/.test(indexSrc) || /aria-hidden="true"[\s\S]*bk-v2-pass/.test(indexSrc),
  'bk-v2-pass hidden from main UI');

check(/parseISODateLocal/.test(indexSrc) && /recordMatchesMonth/.test(indexSrc),
  'local ISO date parsing for reports');
check(/previewDailyThermal/.test(indexSrc) && /previewThermalSummary/.test(indexSrc),
  'thermal preview buttons wired');
check(/onclick="previewDailyThermal\(\)"/.test(indexSrc), 'daily thermal uses preview button');
check(/onclick="previewThermalSummary\(\)"/.test(indexSrc), 'period thermal uses preview button');
check(/showThermalReceiptPreview/.test(indexSrc) && /receiptModal/.test(indexSrc),
  'thermal preview uses receipt modal popup');
check(/function showReceipt\(caseId\)/.test(indexSrc) && !/showReceipt[\s\S]{0,200}showThermalReceiptPreview/.test(indexSrc),
  'client showReceipt unchanged from thermal preview helper');

check(/applyBranchViewModeUi/.test(indexSrc) && /page-readonly/.test(indexSrc),
  'owner aggregate read-only UI');

check(/Native keyboard editing is intentionally not intercepted/.test(desktopInput),
  'DesktopInput must preserve native editable keyboard semantics');
check(/function isEditableField\(el\)/.test(desktopInput) && /function destroy\(\)/.test(desktopInput),
  'DesktopInput must classify editable fields and support lifecycle cleanup');
check(/document\.addEventListener\('contextmenu', onContextMenu, true\)/.test(desktopInput),
  'DesktopInput contextual menu remains wired without a global keyboard interceptor');

check(/معالج لمرة واحدة بعد الترقية/.test(migUi),
  'migration wizard intro explains one-time upgrade purpose');

if (errors.length) {
  console.error('FAIL test-v2-5-10-production-lock-ux');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('OK test-v2-5-10-production-lock-ux');
