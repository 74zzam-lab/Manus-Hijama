#!/usr/bin/env node
/**
 * PR5 — Transactions & Crash Safety verifier.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const checks = [
  { name: 'sqlite-busy-retry module', ok: fs.existsSync(path.join(root, 'database/sqlite-busy-retry.js')) },
  { name: 'sync-outbox uses busy retry', ok: /runWithSqliteBusyRetry/.test(read('database/sync-outbox.js')) },
  { name: 'ledger saveStore uses bundle', ok: /beginBundle/.test(read('cupping-employee-ledger.js')) && /commitBundle/.test(read('cupping-employee-ledger.js')) },
  { name: 'ledger payment busy guard', ok: /_ledgerPaymentBusy/.test(read('cupping-employee-ledger.js')) },
  { name: 'restore applyStagedMerge async bundle', ok: /async function applyStagedMerge/.test(read('cloud/restore-staging.js')) && /commitBundle/.test(read('cloud/restore-staging.js')) },
  { name: 'synced-write awaits restore merge', ok: /await global\.RestoreStaging\.applyStagedMerge/.test(read('cloud/synced-write.js')) },
  { name: 'saveCase uses bundle', ok: /beginBundle/.test(read('index.html')) && /commitBundle/.test(read('index.html')) },
  { name: 'saveSharedPackageCase uses bundle', ok: /function saveSharedPackageCase[\s\S]*beginBundle/.test(read('index.html')) },
  { name: 'backup restore rollback helper', ok: /rollbackSwaps/.test(read('electron/backup-v2-core.js')) },
];

let failed = 0;
for (const c of checks) {
  console.log((c.ok ? 'PASS' : 'FAIL') + '  ' + c.name);
  if (!c.ok) failed += 1;
}

if (failed) process.exit(1);
console.log('\nAll transactions crash-safety checks passed.');
