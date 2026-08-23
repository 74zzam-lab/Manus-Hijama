#!/usr/bin/env node
/**
 * PR8: branch switch re-hydrates SQLite view; durable authority; cache invalidation.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const bridge = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');
const switcher = fs.readFileSync(path.join(root, 'cloud/branch-switcher.js'), 'utf8');
const scopeSrc = fs.readFileSync(path.join(root, 'cloud/branch-scope.js'), 'utf8');
const authority = fs.readFileSync(path.join(root, 'cloud/branch-authority.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const isolation = fs.readFileSync(path.join(root, 'cloud/branch-data-isolation.js'), 'utf8');
const ledger = fs.readFileSync(path.join(root, 'cupping-employee-ledger.js'), 'utf8');

const checks = [
  { name: 'rehydrateBranchView exported', ok: /async function rehydrateBranchView/.test(bridge) && /rehydrateBranchView,/.test(bridge) },
  { name: 'assertScopeMatch on commit', ok: /function assertScopeMatch/.test(bridge) },
  { name: 'hasPendingCommits blocks switch', ok: /hasPendingCommits/.test(bridge) && /hasPendingCommits/.test(switcher) },
  { name: 'commitKv write gate', ok: /commitKv[\s\S]{0,300}assertOperationalWriteBranch/.test(bridge) },
  { name: 'branch-switcher async apply + invalidate', ok: /async function applyBranchSwitch/.test(switcher) && /invalidateAll/.test(switcher) },
  { name: 'durable persist on switch', ok: /persistDurableViewState/.test(switcher) },
  { name: 'BranchAuthority restoreFromDurable', ok: /function restoreFromDurable/.test(authority) },
  { name: 'login rehydrate on restart', ok: /restoreFromDurable/.test(html) && /rehydrateBranchView/.test(html) },
  { name: 'branch-authority loaded', ok: /branch-authority\.js/.test(html) },
  { name: 'owner view overrides device lock', ok: /ownerCanSwitch/.test(scopeSrc) },
  { name: 'branch data isolation KV merge', ok: /mergeKvBranchSlice/.test(isolation) },
  { name: 'employee ledger branch filter', ok: /filterLedgerRecords/.test(ledger) },
];

let failed = 0;
for (const c of checks) {
  console.log((c.ok ? 'PASS' : 'FAIL') + '  ' + c.name);
  if (!c.ok) failed += 1;
}

if (failed) process.exit(1);
console.log('\nAll branch switch hardening checks passed.');
