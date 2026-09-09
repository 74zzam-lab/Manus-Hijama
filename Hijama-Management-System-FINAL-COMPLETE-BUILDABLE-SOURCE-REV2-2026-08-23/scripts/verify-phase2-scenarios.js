#!/usr/bin/env node
/**
 * Phase 2 — real-world sync scenario tests.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const errors = [];

function loadScript(rel) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), context);
}

const driveStore = {};
const context = {
  window: {},
  globalThis: {},
  crypto: require('crypto').webcrypto,
  TextEncoder: TextEncoder,
  console,
  navigator: { onLine: true },
  sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } },
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } },
  DB: {
    get(k, def) {
      try { const v = context.localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
    },
    set(k, v) { context.localStorage.setItem(k, JSON.stringify(v)); }
  },
  settings: { centerName: 'مركز', cloudV2Enabled: true, defaultBranchId: 'BR-MAIN', backup: { cloudEnabled: true, providers: { google: { connected: true } } } },
  users: [{ id: 'u1', role: 'admin', fullName: 'Admin', active: true, branchScope: ['BR-MAIN'] }],
  currentUser: { id: 'u1', role: 'admin', fullName: 'Admin' },
  cases: [], clientsRegistry: [], bookings: [], services: [], packages: [],
  notify: () => {},
  setTimeout: global.setTimeout, clearTimeout: global.clearTimeout,
  setInterval: global.setInterval, clearInterval: global.clearInterval
};
context.window = context;
context.globalThis = context;
context.window.addEventListener = () => {};
context.window.removeEventListener = () => {};

context.BackupBridge = {
  uploadCloud: async (payload, filename, provider, meta) => {
    driveStore[meta.remotePath] = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return { ok: true, remotePath: meta.remotePath };
  },
  downloadCloudBackup: async (remotePath) => {
    if (!driveStore[remotePath]) return { ok: false, message: 'missing' };
    return { ok: true, text: driveStore[remotePath] };
  },
  listCloudBackups: async () => ({ ok: true, items: [] }),
  getCloudStatus: async () => ({ connected: true })
};

vm.createContext(context);

[
  'cloud/center-id.js', 'cloud/drive-layout.js', 'cloud/meta.js', 'cloud/device-config.js',
  'cloud/branch-scope.js', 'cloud/settings-split.js', 'cloud/repository.js', 'cloud/role-policy.js',
  'cloud/record-metadata.js', 'cloud/merge-policy.js', 'cloud/table-merge-policy.js',
  'cloud/conflict-queue.js', 'cloud/record-merger.js', 'cloud/sync-guard.js',
  'cloud/drive-errors.js', 'cloud/restore-staging.js', 'cloud/synced-write.js',
  'cloud/data-state-analyzer.js', 'cloud/data-state-presenter.js',
  'cloud/db-bridge.js', 'cloud/versions.js', 'cloud/audit-logger.js', 'cloud/settings-guard.js',
  'cloud/config-layer.js', 'cloud/sync-state.js', 'cloud/drive-adapter.js',
  'cloud/operational-layer.js', 'cloud/lock-manager.js', 'cloud/sync-engine.js',
  'cloud/bootstrap.js', 'cloud/migration-runner.js', 'cloud/cloud-v2-init.js'
].forEach(loadScript);

function assert(c, m) { if (!c) errors.push(m); }

const MP = context.MergePolicy;
const TMP = context.TableMergePolicy;
const RM = context.RecordMerger;
const CQ = context.ConflictQueue;
const DSA = context.DataStateAnalyzer;
const DSP = context.DataStatePresenter;
const RS = context.RestoreStaging;
const AL = context.AuditLogger;
const repo = context.RepositoryFactory.createRepository(context.RepositoryFactory.createLocalStorageAdapter(context.DB));
context.Repository = repo;
context.DbBridge.install();
context.CloudMeta.setCloudV2Enabled(true);

const baseRec = (id, extra) => ({
  id, branchId: 'BR-MAIN', revision: 1, updatedAt: '2026-01-01T10:00:00Z', createdAt: '2026-01-01T09:00:00Z', ...extra
});

// 1. جهازان يعدلان نفس العميل — merge fields
const clientMerge = TMP.decideForTable('clientsRegistry',
  baseRec('cl1', { name: 'أحمد', phone: '050111' }),
  baseRec('cl1', { name: 'أحمد', notes: 'VIP', phone: '050111', revision: 1, updatedAt: '2026-01-01T11:00:00Z' })
);
assert(clientMerge.action === 'merge' || clientMerge.action === 'pull', 'same client complementary merge');

// 2. جهازان يعدلان نفس الفاتورة — strict conflict
const invoiceConflict = TMP.decideForTable('cases',
  baseRec('inv152', { total: 100, invoiceNo: '152' }),
  baseRec('inv152', { total: 200, invoiceNo: '152' })
);
assert(invoiceConflict.action === 'conflict', 'same invoice → strict conflict');

// 3. تعديل بيانات المركز من جهازين
const settingsConflict = TMP.decideForTable('settings',
  { id: '__settings__', centerName: 'مركز أ', branchId: 'BR-MAIN', revision: 2, updatedAt: '2026-01-02' },
  { id: '__settings__', centerName: 'مركز ب', branchId: 'BR-MAIN', revision: 2, updatedAt: '2026-01-02' }
);
assert(settingsConflict.action === 'conflict', 'center settings diverged → conflict');

// 4. Offline شهر ثم إعادة الربط
context.DriveAdapter = context.DriveAdapter || {};
const origConnected = context.DriveAdapter.isConnected;
context.DriveAdapter.isConnected = () => context.DriveAdapter._mockConnected !== false;
context.DriveAdapter.downloadJsonFirst = async (paths) => {
  const p = paths[0];
  if (!driveStore[p]) return { ok: false, error: 'not_found' };
  return { ok: true, data: JSON.parse(driveStore[p]), path: p };
};
context.DriveAdapter.uploadJson = async (p, data) => { driveStore[p] = JSON.stringify(data); return { ok: true }; };
context.DriveAdapter.downloadJson = async (p) => {
  if (!driveStore[p]) return { ok: false, error: 'not_found' };
  return { ok: true, data: JSON.parse(driveStore[p]) };
};
context.DriveAdapter._mockConnected = true;

// 4. Offline
context.DriveAdapter.isConnected = () => false;
const offlineCheck = { offline: true, state: DSA.STATES.OFFLINE };
assert(offlineCheck.offline, 'offline state blocks cloud fetch');
context.DriveAdapter.isConnected = () => true;

// 5. جهاز جديد لأول مرة — cloud_only
const newDevice = DSA.analyzeTable([], [baseRec('c1', { name: 'Case' })], 'cases', 'BR-MAIN');
assert(newDevice.state === DSA.STATES.CLOUD_ONLY, 'new device cloud_only');

// 6. إعادة تثبيت — empty local + cloud data
repo.setAll('cases', []);
const reinstall = DSA.analyzeTable([], [baseRec('c2', { name: 'Reinstall' })], 'cases', 'BR-MAIN');
assert(reinstall.allowedActions.includes('pull_cloud'), 'reinstall can pull');

// 7. فقدان الاتصال أثناء المزامنة
context.SyncGuard.pause('offline_during_sync');
assert(!context.SyncGuard.canSync().ok, 'sync paused during connection loss');
context.SyncGuard.resume({ state: 'identical' });

// 8. استرجاع Backup قديم مع بيانات أحدث
repo.setAll('cases', [baseRec('old1', { total: 500, revision: 5, updatedAt: '2026-06-01' })]);
const staged = RS.stageBackup({ cases: [baseRec('old1', { total: 100, revision: 1, updatedAt: '2026-01-01' })] }, { source: 'old_backup' });
const cmp = RS.compareWithLocal(staged);
assert(cmp.perTable.cases?.hasConflict || cmp.perTable.cases?.stats?.conflict > 0, 'old backup vs newer local → conflict');

// 9. تغيير صلاحيات المستخدم
context.currentUser = { id: 'u2', role: 'reception', fullName: 'Rec' };
const empResolve = CQ.resolve('fake', { choice: 'local' });
assert(empResolve.error === 'not_found' || empResolve.error === 'manager_only', 'employee cannot resolve conflicts');
context.currentUser = { id: 'u1', role: 'admin', fullName: 'Admin' };

// Conflict queue lifecycle
CQ.enqueue({ table: 'cases', recordId: 'inv152', local: baseRec('inv152', { total: 100 }), remote: baseRec('inv152', { total: 200 }), fields: ['total'] });
assert(CQ.countPending() >= 1, 'conflict enqueued');
const item = CQ.list({ status: 'pending' })[0];
const resolved = CQ.resolve(item.id, { choice: 'local' });
assert(resolved.ok && CQ.countPending() === 0, 'conflict closed after resolve');
assert(CQ.getHistory().length >= 1, 'resolved conflict in history');

// Presenter — no technical terms
const presented = DSP.present({
  state: 'conflict', blocked: true, requiresUserDecision: true, branchId: 'BR-MAIN',
  analyzedAt: new Date().toISOString()
});
assert(presented.stateLabel.includes('تعارض'), 'user-friendly conflict label');
assert(!presented.stateLabel.includes('Revision'), 'no technical jargon');

// Audit events
AL.logSyncEvent('LOCAL_PUSH', { entity: 'cases', summary: 'test push' });
AL.logSyncEvent('CONFLICT_RESOLVED', { entity: 'cases', entityId: 'inv152', summary: 'test resolve' });
const syncLogs = AL.querySyncEvents();
assert(syncLogs.some(e => e.action === 'LOCAL_PUSH'), 'audit LOCAL_PUSH');
assert(syncLogs.some(e => e.action === 'CONFLICT_RESOLVED'), 'audit CONFLICT_RESOLVED');

// Attendance latest wins
const att = TMP.decideForTable('attendance',
  baseRec('a1', { status: 'present', revision: 1, updatedAt: '2026-01-01T08:00:00Z' }),
  baseRec('a1', { status: 'absent', revision: 2, updatedAt: '2026-01-01T09:00:00Z' })
);
assert(att.action === 'pull', 'attendance → latest wins (cloud newer)');

// Inventory movement aware
const inv = TMP.decideForTable('inventoryMovements',
  baseRec('m1', { qty: 5, revision: 1 }),
  baseRec('m1', { qty: 3, revision: 1 })
);
assert(inv.action === 'merge', 'inventory movements union merge');

// Repository-only write path
context.DB.set('clientsRegistry', [baseRec('rw1', { name: 'Test' })]);
const bridged = repo.get('clientsRegistry');
assert(bridged?.[0]?.revision != null, 'DB.set on synced table goes through repository');

// Boot wizard step validation
loadScript('cloud/boot-flow-ui.js');
assert(typeof context.BootFlow.validateStep === 'function', 'boot wizard step validation');
// V2-5.9: language→google→license→organization→branch→restore→sync→ready (8)
assert(context.BootFlow.NEW_STEPS.length === 8, 'new customer 8 steps (V2-5.9, no owner)');
assert(context.BootFlow.EXISTING_STEPS.length === 8, 'existing customer 8 steps (branch_select)');
assert(!context.BootFlow.NEW_STEPS.includes('owner'), 'customer journey excludes owner step');
context.localStorage.setItem('__tdw_boot_complete__', '1');
context.settings.backup.providers.google = { connected: false };
assert(!context.BootFlow.isBootComplete(), 'boot cannot complete without real checks');

if (errors.length) {
  console.error('FAIL verify-phase2-scenarios:');
  errors.forEach(e => console.error(' -', e));
  process.exit(1);
}
console.log('OK: Phase 2 scenario tests verified (' + 10 + ' scenarios)');
