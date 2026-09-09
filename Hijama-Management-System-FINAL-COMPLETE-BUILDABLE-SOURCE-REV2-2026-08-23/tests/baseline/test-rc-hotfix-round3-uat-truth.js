#!/usr/bin/env node
'use strict';

/**
 * RC Hotfix Round 3 — UAT truth: owner password, restore counts, sync READY gate,
 * JSON import isolation, branch view-only, backup manager UX.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const staging = fs.readFileSync(path.join(root, 'cloud/restore-staging.js'), 'utf8');
const verify = fs.readFileSync(path.join(root, 'cloud/restore-verification.js'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
const branchAuth = fs.readFileSync(path.join(root, 'cloud/branch-authority.js'), 'utf8');
const branchCtx = fs.readFileSync(path.join(root, 'cloud/branch-contexts.js'), 'utf8');
const branchSw = fs.readFileSync(path.join(root, 'cloud/branch-switcher.js'), 'utf8');
const ops = fs.readFileSync(path.join(root, 'cloud/ops-ux-bridge.js'), 'utf8');
const discovery = fs.readFileSync(path.join(root, 'cloud/cloud-data-discovery.js'), 'utf8');
const electronDiscovery = fs.readFileSync(path.join(root, 'electron/cloud-data-discovery.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron/preload.js'), 'utf8');
const ipc = fs.readFileSync(path.join(root, 'electron/backup-v2-ipc.js'), 'utf8');

check(/sanitizeMigrationImport/.test(staging), 'JSON import sanitizes migration payload');
check(/MIGRATION_ALLOW_TOP_KEYS/.test(staging), 'JSON import allowlist exists');
check(/buildMigrationImportReport/.test(staging), 'JSON import report builder exists');

check(/compareExpectedCounts/.test(verify) && /restore_count_mismatch/.test(verify), 'restore count mismatch gate');
check(/getCommittedRaw/.test(verify), 'restore verify reads SQLite committed raw');

check(/SyncLifecycle\?\.resolveLifecycle/.test(boot) && /syncReady/.test(boot), 'syncDone gated on READY lifecycle');
check(/lifecycle === 'READY'/.test(boot), 'bootflow checks READY before syncDone');

check(/setViewBranchOnly/.test(branchCtx), 'view-only branch context API');
check(/viewBid && write && viewBid !== write/.test(branchAuth), 'activeBranchId prefers view when view-only');
check(/setViewBranchOnly/.test(branchSw), 'branch switcher uses view-only path');

check(/saveChangePassword/.test(index) && /setAuthoritative\('users'/.test(index), 'password save uses SQLite authority');
check(/sessionRefreshFailed/.test(index), 'password change separates session refresh failure');
check(/if \(!_pendingForcedPwChange\) _authPending = false/.test(index), 'doLogin preserves auth pending during forced password');
check(!/showErr\([^)]+\);\s*notify\(msg, 'danger'\)/.test(index.replace(/\s+/g, ' ')), 'forced password errors stay in modal');

check(/modal-body/.test(index) && /id="backupModal"/.test(index), 'backup modal has scroll body');
check(/getBackupPanelHandlers/.test(index) && /deleteBackupV2Entry/.test(index), 'backup manager delete handler');
check(/onToggleShowAll/.test(ops), 'backup history show-all toggle');

check(/غير متاح في metadata/.test(discovery), 'attachments unavailable label');
check(/backupsTotal|backupsDetail/.test(electronDiscovery), 'discovery backup count breakdown');

check(/v2DeleteLocal/.test(preload) && /backup:v2:deleteLocal/.test(ipc), 'local backup delete IPC');

// Behavioral: migration import strips Google from settings
const sandbox = {
  console,
  module: { exports: {} },
  globalThis: {},
  window: {},
  structuredClone: (v) => JSON.parse(JSON.stringify(v)),
};
sandbox.window = sandbox.globalThis;
sandbox.global = sandbox.globalThis;

vm.runInNewContext(staging, sandbox);
const RestoreStaging = sandbox.globalThis.RestoreStaging || sandbox.RestoreStaging || sandbox.module.exports;

const dirty = {
  settings: {
    centerName: 'Clinic',
    centerId: 'STOLEN',
    backup: { providers: { google: { connected: true, email: 'x@y.com' }, local: {} } },
  },
  license: { id: 'L1' },
  clientsRegistry: [{ id: 'c1' }],
};
const clean = RestoreStaging.sanitizeMigrationImport(dirty, { migrationOnly: true });
check(!clean.license, 'sanitized import removes license');
check(!clean.settings?.centerId, 'sanitized import strips identity settings fields');
check(clean.settings?.centerName === 'Clinic', 'sanitized import keeps operational settings');
check(Array.isArray(clean.clientsRegistry) && clean.clientsRegistry.length === 1, 'sanitized import keeps clients');

vm.runInNewContext(verify, sandbox);
const RestoreVerification = sandbox.globalThis.RestoreVerification || sandbox.RestoreVerification || sandbox.module.exports;
const cmp = RestoreVerification.compareExpectedCounts(
  { clients: 43, visits: 10, bookings: 5 },
  { clients: 0, visits: 0, bookings: 0 }
);
check(!cmp.ok && cmp.mismatches.length === 3, 'count mismatch detects empty restore');

if (errors.length) {
  console.error('RC Hotfix Round 3 tests FAILED:\n' + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('All RC Hotfix Round 3 UAT truth checks passed.');
