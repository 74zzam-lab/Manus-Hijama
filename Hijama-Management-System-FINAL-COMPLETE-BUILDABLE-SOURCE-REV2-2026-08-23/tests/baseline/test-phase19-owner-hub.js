#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

const src = fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

check(src.includes('function buildAnalyticsSummary(model)'), 'buildAnalyticsSummary missing');
check(src.includes('function buildDiagnosticsSnapshot()'), 'buildDiagnosticsSnapshot missing');
check(src.includes('function showDiagnosticsSnapshot()'), 'showDiagnosticsSnapshot missing');
check(src.includes("health === 'healthy'"), 'sync health labeling missing');
check(src.includes('owner-hub-diagnostics'), 'diagnostics panel markup missing');
check(src.includes("'organization', 'branches', 'devices', 'sync', 'backup', 'administration', 'advanced'"), 'Owner Hub operational section taxonomy missing');
check(src.includes('function notifyStatusChanged(kind, detail)'), 'Owner Hub status event notifier missing');
check(src.includes('function bindStatusEvents()'), 'Owner Hub status event binding missing');
check(src.includes('آخر تحديث:'), 'Owner Hub must expose a truthful last-updated display');
check(!src.includes('Developer renewal'), 'developer renewal must not remain as untranslated normal UI text');
check(/cloud\/owner-hub\.js/.test(html), 'owner-hub wired in index.html');
check(pkg.scripts?.['ownerhub:test'] === 'node tests/baseline/test-phase19-owner-hub.js', 'ownerhub:test script missing');

const context = {
  console,
  document: {
    getElementById() { return null; },
    createElement() {
      return { id: '', textContent: '', style: {}, appendChild() {} };
    },
    head: { appendChild() {} },
  },
  sessionStorage: {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  },
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  },
  DB: {
    get(k, def) {
      try {
        const v = context.localStorage.getItem(k);
        return v ? JSON.parse(v) : def;
      } catch {
        return def;
      }
    },
    set(k, v) {
      context.localStorage.setItem(k, JSON.stringify(v));
    },
  },
  notify() {},
  users: [{ id: '1', role: 'admin', active: true }],
  settings: { cloudV2Enabled: true },
  currentUser: { id: '1', role: 'admin', username: 'admin', active: true, branchScope: ['*'] },
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

function load(rel) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), context);
}

load('cloud/role-policy.js');
load('cloud/branch-scope.js');
load('cloud/sync-guard.js');
load('cloud/conflict-queue.js');
load('cloud/owner-hub.js');

context.CloudMeta = { isCloudV2Enabled: () => true };
context.LicenseCloud = {
  loadLocal: () => ({
    centerId: 'NJR-CLINIC-ABCDEF12',
    centerName: 'Test Center',
    limits: { maxDevices: 5 },
    branches: [
      { id: 'BR-MAIN', name: 'Main', active: true },
      { id: 'BR-JED', name: 'Jeddah', active: true },
    ],
    activation: { consumed: true },
  }),
};
context.DeviceRegistry = {
  listDevices: () => ([
    { deviceName: 'PC-1', branchId: 'BR-MAIN', lastSeenAt: new Date().toISOString() },
    { deviceName: 'PC-2', branchId: 'BR-JED', lastSeenAt: new Date(Date.now() - 3 * 86400000).toISOString() },
  ]),
};
context.SyncEngine = {
  getStatus: () => ({
    enabled: true,
    running: true,
    online: true,
    pending: 2,
    lastPushAt: new Date().toISOString(),
    lastPollAt: new Date().toISOString(),
    pollIntervalMs: 15000,
    lastError: null,
  }),
};
context.BackupLayer = {
  getStatus: () => ({ enabled: true, lastAutoBackupAt: null, due: false }),
};
context.AuditLogger = {
  query: () => ([{ at: new Date().toISOString(), action: 'LOCAL_PUSH' }]),
};
context.ConflictQueue.enqueue({
  table: 'bookings',
  recordId: 'b1',
  branchId: 'BR-MAIN',
  local: { id: 'b1' },
  remote: { id: 'b1' },
  fields: ['status'],
});

const OwnerHub = context.OwnerHub;
context.currentUser = { id: '3', role: 'owner', username: 'owner', active: true, branchScope: ['*'] };
check(OwnerHub.canAccess(), 'owner should access owner hub');
context.currentUser = { id: '1', role: 'admin', username: 'admin', active: true, branchScope: ['*'] };
check(!OwnerHub.canAccess(), 'admin should not access owner hub');
context.currentUser = { id: '3', role: 'owner', username: 'owner', active: true, branchScope: ['*'] };
const model = OwnerHub.buildModel();
check(model.analytics?.health === 'healthy', 'analytics health should be healthy');
check(model.analytics?.onlineDevices === 1, 'online device count mismatch');
check(model.analytics?.staleDevices === 1, 'stale device count mismatch');
check(model.analytics?.conflictsPending === 1, 'conflicts pending mismatch');
check(Array.isArray(model.analytics?.branchStats) && model.analytics.branchStats.length === 2, 'branch stats missing');

const snap = OwnerHub.buildDiagnosticsSnapshot();
check(snap.sync?.health === 'healthy', 'snapshot sync health missing');
check(snap.devices?.total === 2, 'snapshot devices total missing');
check(snap.sync?.conflictsPending === 1, 'snapshot conflicts missing');
check(snap.centerId === 'NJR-CLINIC-ABCDEF12', 'snapshot centerId missing');

context.SyncGuard.pause('test_pause');
const paused = OwnerHub.buildDiagnosticsSnapshot();
check(paused.sync?.health === 'paused', 'paused sync health missing');

if (errors.length) {
  console.error('FAIL: phase19 owner hub');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: phase19 owner hub checks');
