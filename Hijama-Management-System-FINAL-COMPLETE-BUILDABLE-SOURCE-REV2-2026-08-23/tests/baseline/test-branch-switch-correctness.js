#!/usr/bin/env node
'use strict';

/**
 * PR8 — Branch switching correctness behavioral suite.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const errors = [];
function check(ok, msg) { if (!ok) errors.push(msg); }

function loadModule(relPath, sandbox) {
  const src = fs.readFileSync(path.join(root, relPath), 'utf8');
  vm.runInNewContext(src, sandbox, { timeout: 3000, filename: relPath });
}

function makeSandbox() {
  const session = new Map();
  let deviceCfg = {
    lockedBranchId: 'BR-A',
    branchLocked: true,
    lastViewBranchId: 'BR-A',
    lastOwnerAggregate: false,
  };
  const licenseDoc = {
    branches: [
      { id: 'BR-A', name: 'A', active: true },
      { id: 'BR-B', name: 'B', active: true },
    ],
  };

  const sandbox = {
    console,
    currentUser: { id: 'o1', role: 'owner', branchScope: ['*'], canSwitchBranch: true },
    activeBranchId: null,
    RolePolicy: { isOrganizationOwner: (u) => String(u?.role || '').toLowerCase() === 'owner' },
    OwnerBranchMode: {
      _mode: 'owner',
      isOwnerMode() { return this._mode === 'owner'; },
      isBranchMode() { return this._mode === 'branch'; },
      getBranchId() { return this._branchId || null; },
      enterBranchMode(bid) { this._mode = 'branch'; this._branchId = bid; return { ok: true }; },
      exitToOwnerMode() { this._mode = 'owner'; this._branchId = null; return { ok: true }; },
    },
    DeviceConfig: {
      load: () => ({ ...deviceCfg }),
      save(patch) { deviceCfg = { ...deviceCfg, ...patch }; return deviceCfg; },
      isBranchLocked: () => !!(deviceCfg.branchLocked && deviceCfg.lockedBranchId),
      getLockedBranchId: () => deviceCfg.lockedBranchId || '',
    },
    LicenseCloud: { loadLocal: () => licenseDoc },
    LegacyBranchMigration: { resolveLegacyBranchId: (r) => r?.branchId || null },
    sessionStorage: {
      getItem(k) { return session.has(k) ? session.get(k) : null; },
      setItem(k, v) { session.set(k, v); },
      removeItem(k) { session.delete(k); },
    },
    notify() {},
    AuditLogger: { logSyncEvent() {} },
    _sessionRef: () => session,
    _setDeviceCfg(c) { deviceCfg = { ...deviceCfg, ...c }; },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

function runBehavioralSuite() {
  const sb = makeSandbox();
  loadModule('cloud/branch-switch-cache.js', sb);
  loadModule('cloud/branch-scope.js', sb);
  loadModule('cloud/branch-contexts.js', sb);
  loadModule('cloud/branch-authority.js', sb);
  loadModule('cloud/branch-switch-forms.js', sb);
  loadModule('cloud/branch-data-isolation.js', sb);

  const BA = sb.BranchAuthority;
  const BSC = sb.BranchSwitchCache;
  const BSF = sb.BranchSwitchForms;
  const BDI = sb.BranchDataIsolation;

  check(typeof BA.restoreFromDurable === 'function', 'BranchAuthority.restoreFromDurable present');

  sb._sessionRef().clear();
  const restored = BA.restoreFromDurable(sb.currentUser);
  check(restored.ok === true && restored.branchId === 'BR-A', 'restart restores durable lastViewBranchId BR-A');

  const genA = BSC.captureAsyncToken();
  BSC.invalidateAll('test_switch');
  check(!BSC.isGenerationCurrent(genA), 'async token stale after invalidateAll');

  sb._setDeviceCfg({ lockedBranchId: 'BR-A', branchLocked: true, lastViewBranchId: 'BR-A' });
  const lockGate = BA.assertSwitchAllowed({ id: 'o1', role: 'owner', branchScope: ['*'], canSwitchBranch: true }, 'BR-B');
  check(lockGate.ok === true && lockGate.viewOnly === true && lockGate.deviceLockedBranchId === 'BR-A',
    'locked device owner can view-switch to B (write stays on A)');
  const staffGate = BA.assertSwitchAllowed({ id: 's1', role: 'reception', branchScope: ['BR-A'] }, 'BR-B');
  check(staffGate.ok === false && staffGate.error === 'device_branch_locked', 'staff cannot switch on locked device');

  sb.BranchScope.setActiveBranchId('*');
  sb.BranchContexts.clearOperationalWriteBranch();
  check(BA.isOwnerAggregateMode({ id: 'o1', role: 'owner' }) === true, 'owner aggregate mode detected');
  check(BA.operationalWriteBranchId({ id: 'o1', role: 'owner' }) == null, 'aggregate has no write branch');

  sb.BranchContexts.setOperationalWriteBranch('BR-B', { bindDevice: false });
  sb.BranchScope.setActiveBranchId('BR-B');
  check(BA.operationalWriteBranchId({ id: 'o1', role: 'owner' }) === 'BR-B', 'owner in branch B can write');

  const merged = BDI.mergeKvBranchSlice(
    [{ id: '1', branchId: 'BR-A' }, { id: '2', branchId: 'BR-B' }],
    [{ id: '3', branchId: 'BR-A' }],
    'BR-A'
  );
  check(merged.map((r) => r.id).sort().join(',') === '2,3', 'KV merge keeps BR-B and replaces BR-A slice');

  BSF.bindOpenForm({ recordId: 'case-1' });
  BSC.invalidateAll('branch_switch');
  const formGate = BSF.assertSaveAllowed({ recordBranchId: 'BR-A' });
  check(formGate.ok === false && formGate.error === 'branch_switch_form_stale', 'form save blocked after branch switch');

  sb._sessionRef().clear();
  sb._setDeviceCfg({ lockedBranchId: '', branchLocked: false, lastViewBranchId: '', lastOwnerAggregate: false });
  sb.currentUser = null;
  const missing = BA.restoreFromDurable(null);
  check(missing.ok === false && missing.error === 'branch_context_missing', 'fail closed when no branch context');
}

runBehavioralSuite();

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const switcher = fs.readFileSync(path.join(root, 'cloud/branch-switcher.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');
const ledger = fs.readFileSync(path.join(root, 'cupping-employee-ledger.js'), 'utf8');

check(html.includes('branch-authority.js'), 'index loads branch-authority');
check(html.includes('BranchAuthority.restoreFromDurable'), 'login restores durable branch');
check(/async function applyBranchSwitch/.test(switcher), 'applyBranchSwitch is async');
check(/hasPendingCommits/.test(bridge), 'bridge exposes hasPendingCommits');
check(/filterLedgerRecords/.test(ledger), 'employee ledger branch filter');

if (errors.length) {
  console.error('FAIL: branch-switch-correctness');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('OK: branch-switch-correctness — behavioral A/B/restart/lock/aggregate suite');
