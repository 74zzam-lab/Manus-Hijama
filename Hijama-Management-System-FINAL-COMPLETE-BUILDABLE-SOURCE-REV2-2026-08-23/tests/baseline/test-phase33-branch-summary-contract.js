#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const sumSrc = fs.readFileSync(path.join(root, 'cloud', 'branch-summary.js'), 'utf8');
const hubSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8');
const errors = [];
function check(ok, msg) { if (!ok) errors.push(msg); }

const mem = new Map();
const sandbox = {
  console,
  DB: {
    get(k, d) { return mem.has(k) ? mem.get(k) : d; },
    set(k, v) { mem.set(k, v); }
  },
  BranchScope: { DEFAULT_BRANCH_ID: 'BR-MAIN' },
  LicenseCloud: { loadLocal: () => ({ branches: [{ id: 'BR-MAIN', active: true }, { id: 'BR-002', active: true }] }) },
  clientsRegistry: [{ id: 1, branchId: 'BR-MAIN' }, { id: 2, branchId: 'BR-002' }],
  cases: [{ amount: 100, branchId: 'BR-MAIN' }, { amount: 50, branchId: 'BR-002' }],
  bookings: [{ id: 1, branchId: 'BR-MAIN' }],
  expenses: [{ amount: 30, branchId: 'BR-MAIN' }]
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

try { vm.runInNewContext(sumSrc, sandbox, { timeout: 1000 }); } catch (e) { errors.push('branch-summary eval failed: ' + e.message); }

const S = sandbox.BranchSummary || {};
check(!!S.SUMMARY_KEY, 'summary key missing');
const one = S.refreshBranchSummary('BR-MAIN');
check(one && one.clientsTotal === 1, 'BR-MAIN clients total mismatch');
check(one.revenueTotal === 100, 'BR-MAIN revenue mismatch');
check(one.expensesTotal === 30, 'BR-MAIN expenses mismatch');
check(one.netTotal === 70, 'BR-MAIN net mismatch');
const all = S.refreshAllBranchSummaries();
check(!!all['BR-002'], 'missing BR-002 summary');
check(S.getSummary('BR-002').revenueTotal === 50, 'BR-002 revenue mismatch');

check(hubSrc.includes('OwnerHub.refreshBranchSummaries()'), 'owner hub summary refresh button missing');
check(hubSrc.includes('BranchSummary?.refreshAllBranchSummaries?.()'), 'owner hub must call summary refresh');

if (errors.length) {
  console.error('FAIL: phase33 branch summary contract');
  for (const err of errors) console.error(' -', err);
  process.exit(1);
}
console.log('OK: phase33 branch summary contract checks');
