#!/usr/bin/env node
/**
 * Phase 1 Core Data Engine — record-level merge & safe-auto rules (Node smoke tests).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const errors = [];

function loadScript(rel) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), context);
}

const context = {
  window: {},
  globalThis: {},
  crypto: require('crypto').webcrypto,
  console,
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = v; },
    removeItem(k) { delete this._d[k]; }
  },
  DB: {
    get(k, def) {
      try {
        const v = context.localStorage.getItem(k);
        return v ? JSON.parse(v) : def;
      } catch { return def; }
      },
    set(k, v) {
      context.localStorage.setItem(k, JSON.stringify(v));
    }
  },
  settings: { centerName: 'Test', defaultBranchId: 'BR-MAIN' },
  currentUser: { id: 'u1', role: 'admin', fullName: 'Admin' },
  notify: () => {}
};
context.window = context;
context.globalThis = context;

vm.createContext(context);

[
  'cloud/meta.js',
  'cloud/device-config.js',
  'cloud/branch-scope.js',
  'cloud/repository.js',
  'cloud/role-policy.js',
  'cloud/record-metadata.js',
  'cloud/merge-policy.js',
  'cloud/table-merge-policy.js',
  'cloud/conflict-queue.js',
  'cloud/record-merger.js',
  'cloud/sync-guard.js',
  'cloud/drive-errors.js',
  'cloud/restore-staging.js',
  'cloud/synced-write.js',
  'cloud/data-state-analyzer.js',
  'cloud/db-bridge.js',
  'cloud/operational-layer.js',
  'cloud/config-layer.js'
].forEach(loadScript);

function assert(c, m) { if (!c) errors.push(m); }

const MP = context.MergePolicy;
const RM = context.RecordMerger;
const DSA = context.DataStateAnalyzer;
const CQ = context.ConflictQueue;
const SG = context.SyncGuard;
const RP = context.RolePolicy;
const OL = context.OperationalLayer;

const identical = MP.decideRecord(
  { id: 'a', name: 'X', revision: 1, updatedAt: '2026-01-01' },
  { id: 'a', name: 'X', revision: 1, updatedAt: '2026-01-01' }
);
assert(identical.action === 'skip', 'identical → skip');

const localOnly = MP.decideRecord({ id: 'b', name: 'Local' }, null);
assert(localOnly.action === 'push', 'local_only → push');

const cloudOnly = MP.decideRecord(null, { id: 'c', name: 'Cloud' });
assert(cloudOnly.action === 'pull', 'cloud_only → pull');

const complementary = MP.decideRecord(
  { id: 'd', name: 'A', revision: 1, updatedAt: '2026-01-01T10:00:00Z' },
  { id: 'd', notes: 'B', revision: 1, updatedAt: '2026-01-01T10:00:00Z' }
);
assert(complementary.action === 'merge', 'complementary fields → safe merge');

const diverged = MP.decideRecord(
  { id: 'e', name: 'Local', revision: 1, updatedAt: '2026-01-01T10:00:00Z' },
  { id: 'e', name: 'Cloud', revision: 1, updatedAt: '2026-01-01T10:00:00Z' }
);
assert(diverged.action === 'conflict', 'diverged same revision → conflict');

const repo = context.RepositoryFactory.createRepository(
  context.RepositoryFactory.createLocalStorageAdapter(context.DB)
);
context.Repository = repo;

const mergeResult = RM.mergeRecords(
  [{ id: 'c1', name: 'Local', branchId: 'BR-MAIN', revision: 1, updatedAt: '2026-01-01' }],
  [{ id: 'c1', notes: 'extra', branchId: 'BR-MAIN', revision: 1, updatedAt: '2026-01-01' }],
  { table: 'cases', branchId: 'BR-MAIN', enqueueConflicts: false }
);
assert(mergeResult.ok && !mergeResult.hasConflict, 'record merger safe merge');
assert(mergeResult.merged[0].name === 'Local' && mergeResult.merged[0].notes === 'extra', 'merged fields combined');

const conflictResult = RM.mergeRecords(
  [{ id: 'c2', name: 'A', branchId: 'BR-MAIN', revision: 2, updatedAt: '2026-01-02' }],
  [{ id: 'c2', name: 'B', branchId: 'BR-MAIN', revision: 2, updatedAt: '2026-01-02' }],
  { table: 'cases', branchId: 'BR-MAIN', enqueueConflicts: true }
);
assert(conflictResult.hasConflict, 'true conflict detected');
assert(CQ.countPending() >= 1, 'conflict enqueued');

const importSafe = OL.importTable('cases', {
  records: [{ id: 'c3', name: 'Cloud', branchId: 'BR-MAIN' }]
}, 'BR-MAIN');
assert(importSafe.ok, 'import cloud_only via operational layer');

repo.setAll('cases', [
  ...(repo.get('cases') || []).filter(r => r.id !== 'c2'),
  { id: 'c2', name: 'A', branchId: 'BR-MAIN', revision: 2, updatedAt: '2026-01-02', createdAt: '2026-01-01', deviceId: 'dev1' }
]);
const importBlock = OL.importTable('cases', {
  records: [{ id: 'c2', name: 'Overwrite', branchId: 'BR-MAIN', revision: 2, updatedAt: '2026-01-02' }]
}, 'BR-MAIN');
assert(importBlock.blocked && importBlock.hasConflict, 'import blocks on conflict');

const tIdentical = DSA.analyzeTable(
  [{ id: 'x', branchId: 'BR-MAIN', revision: 1, updatedAt: '2026-01-01' }],
  [{ id: 'x', branchId: 'BR-MAIN', revision: 1, updatedAt: '2026-01-01' }],
  'cases', 'BR-MAIN'
);
assert(tIdentical.state === DSA.STATES.IDENTICAL, 'analyzer identical');

const tLocal = DSA.analyzeTable(
  [{ id: 'y', branchId: 'BR-MAIN' }],
  [],
  'cases', 'BR-MAIN'
);
assert(tLocal.state === DSA.STATES.LOCAL_ONLY && tLocal.allowedActions.includes('push_local'), 'analyzer local_only');

const tCloud = DSA.analyzeTable(
  [],
  [{ id: 'z', branchId: 'BR-MAIN' }],
  'cases', 'BR-MAIN'
);
assert(tCloud.state === DSA.STATES.CLOUD_ONLY && tCloud.allowedActions.includes('pull_cloud'), 'analyzer cloud_only');

const tConflict = DSA.analyzeTable(
  [{ id: 'w', name: 'A', branchId: 'BR-MAIN', revision: 1, updatedAt: '2026-01-01' }],
  [{ id: 'w', name: 'B', branchId: 'BR-MAIN', revision: 1, updatedAt: '2026-01-01' }],
  'cases', 'BR-MAIN'
);
assert(tConflict.blocked && tConflict.state === DSA.STATES.CONFLICT, 'analyzer blocks conflict');

SG.pause('conflict', { state: 'conflict' });
assert(SG.isPaused(), 'sync guard paused on conflict');
context.CloudMeta.setCloudV2Enabled(true);
assert(!SG.canSync().ok, 'sync blocked while paused');
SG.resume({ state: 'identical' });
assert(!SG.isPaused(), 'sync guard resumed');

assert(RP.isManager({ role: 'owner' }), 'owner is manager');
assert(RP.isManager({ role: 'admin' }), 'admin is manager');
assert(!RP.isManager({ role: 'reception' }), 'reception not manager');
assert(RP.hasManagerAccount([{ role: 'owner', active: true }]), 'hasManagerAccount owner');

context.DbBridge.install();
context.DB.set('cases', [{ id: 'bridge1', name: 'Via Bridge', branchId: 'BR-MAIN' }]);
const bridged = repo.get('cases');
assert(Array.isArray(bridged) && bridged.some(c => c.id === 'bridge1'), 'db bridge writes synced table via repository');
assert(bridged[0].revision != null, 'metadata stamped via repository');

assert(OL.OPERATIONAL_TABLES.includes('inventoryItems'), 'inventory in operational tables');
assert(OL.OPERATIONAL_TABLES.includes('inventorySuppliers'), 'inventory suppliers in operational tables');
assert(OL.OPERATIONAL_TABLES.includes('inventoryMovements'), 'inventory movements in operational tables');

if (errors.length) {
  console.error('FAIL verify-record-merge:');
  errors.forEach(e => console.error(' -', e));
  process.exit(1);
}
console.log('OK: Phase 1 record-level merge & safe-auto rules verified');
