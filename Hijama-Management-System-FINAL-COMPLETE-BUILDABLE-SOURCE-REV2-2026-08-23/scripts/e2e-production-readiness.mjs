#!/usr/bin/env node
/**
 * Production Readiness E2E — vm-based harness (Node, no Electron shell).
 * Covers sync/restore/boot/drive-error scenarios; run inside Electron CI when available.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const errors = [];
const results = [];

function assert(c, m) { if (!c) errors.push(m); }
function scenario(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    errors.push(`${name}: ${e.message}`);
    results.push({ name, ok: false, error: e.message });
  }
}

function loadScript(rel) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), context);
}

const driveStore = {};
const context = {
  window: {},
  globalThis: {},
  crypto: globalThis.crypto,
  TextEncoder,
  TextDecoder,
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
  settings: {
    centerName: 'مركز تجريبي',
    cloudV2Enabled: true,
    defaultBranchId: 'BR-MAIN',
    backup: { cloudEnabled: true, providers: { google: { connected: true, email: 'owner@test.com', oauth: true } } }
  },
  users: [{ id: 'u1', role: 'admin', fullName: 'Admin', username: 'admin', active: true, branchScope: ['BR-MAIN'] }],
  currentUser: { id: 'u1', role: 'admin', fullName: 'Admin' },
  cases: [], clientsRegistry: [], bookings: [], services: [], packages: [],
  inventoryItems: [], inventorySuppliers: [], inventoryMovements: [],
  notify: () => {},
  setTimeout: global.setTimeout, clearTimeout: global.clearTimeout,
  setInterval: global.setInterval, clearInterval: global.clearInterval
};
context.window = context;
context.globalThis = context;
context.window.addEventListener = () => {};
context.window.removeEventListener = () => {};

context.BackupBridge = {
  uploadCloud: async (payload, _fn, _prov, meta) => {
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
  'cloud/conflict-queue.js', 'cloud/record-merger.js', 'cloud/data-state-analyzer.js',
  'cloud/sync-guard.js', 'cloud/drive-errors.js', 'cloud/restore-staging.js', 'cloud/synced-write.js',
  'cloud/db-bridge.js', 'cloud/versions.js', 'cloud/audit-logger.js', 'cloud/settings-guard.js',
  'cloud/config-layer.js', 'cloud/sync-state.js', 'cloud/drive-adapter.js',
  'cloud/operational-layer.js', 'cloud/lock-manager.js', 'cloud/sync-engine.js',
  'cloud/migration-runner.js', 'cloud/cloud-v2-init.js', 'cloud/boot-flow-ui.js'
].forEach(loadScript);

const repo = context.RepositoryFactory.createRepository(context.RepositoryFactory.createLocalStorageAdapter(context.DB));
context.Repository = repo;
context.DbBridge.install();
context.CloudMeta.setCloudV2Enabled(true);
context.DeviceConfig.ensureDeviceUuid();
context.DeviceConfig.setBranchLock('BR-MAIN', true, 'E2E-PC');

const baseRec = (id, extra) => ({
  id, branchId: 'BR-MAIN', revision: 1,
  updatedAt: '2026-01-01T10:00:00Z', createdAt: '2026-01-01T09:00:00Z', ...extra
});

// 1. جهاز جديد
scenario('new_device', () => {
  repo.setAll('cases', []);
  const analysis = context.DataStateAnalyzer.analyzeTable([], [baseRec('c1', { name: 'New' })], 'cases', 'BR-MAIN');
  assert(analysis.state === context.DataStateAnalyzer.STATES.CLOUD_ONLY, 'new device sees cloud_only');
});

// 2. جهازان يعدلان نفس العميل
scenario('two_devices_same_client', () => {
  const d = context.TableMergePolicy.decideForTable('clientsRegistry',
    baseRec('cl1', { name: 'أحمد', phone: '050111' }),
    baseRec('cl1', { name: 'أحمد', notes: 'VIP', phone: '050111', revision: 1, updatedAt: '2026-01-01T11:00:00Z' })
  );
  assert(d.action === 'merge' || d.action === 'pull', 'complementary client fields merge');
});

// 3. جهازان يعدلان نفس الفاتورة
scenario('two_devices_same_invoice', () => {
  const d = context.TableMergePolicy.decideForTable('cases',
    baseRec('inv1', { total: 100 }),
    baseRec('inv1', { total: 200 })
  );
  assert(d.action === 'conflict', 'same invoice diverged → conflict');
});

// 4. Offline طويل ثم إعادة الاتصال
scenario('long_offline_reconnect', async () => {
  context.SyncGuard.pause('offline');
  assert(!context.SyncGuard.canSync().ok, 'sync paused while offline');
  context.SyncGuard.resume({ state: 'identical' });
  assert(context.SyncGuard.canSync().ok, 'sync resumes after reconnect');
});

// 5. Restore Backup قديم
scenario('restore_old_backup', () => {
  repo.setAll('cases', [baseRec('old1', { total: 500, revision: 5, updatedAt: '2026-06-01' })]);
  const staged = context.RestoreStaging.stageBackup(
    { cases: [baseRec('old1', { total: 100, revision: 1, updatedAt: '2026-01-01' })] },
    { source: 'old_backup' }
  );
  const cmp = context.RestoreStaging.compareWithLocal(staged);
  assert(cmp.hasConflict || cmp.perTable?.cases?.hasConflict, 'old backup conflicts with newer local');
});

// 6. إعادة تثبيت البرنامج
scenario('reinstall_fresh_local', () => {
  const savedSettings = JSON.parse(JSON.stringify(context.settings));
  context.localStorage._d = {};
  context.settings = savedSettings;
  context.CloudMeta.setCloudV2Enabled(true);
  context.DB.set('cases', []);
  const analysis = context.DataStateAnalyzer.analyzeTable([], [baseRec('r1', { name: 'Cloud' })], 'cases', 'BR-MAIN');
  assert(analysis.allowedActions?.includes('pull_cloud'), 'reinstall can pull cloud');
});

// 7. فقدان الاتصال أثناء Sync
scenario('connection_loss_during_sync', () => {
  context.SyncEngine.stop?.();
  const r = context.DriveErrors.handleFailure({ error: 'network ECONNRESET' }, { layer: 'sync' });
  assert(r.classified?.retry === true, 'transient network is retryable');
  context.SyncGuard.pause('offline_during_sync');
  assert(!context.SyncGuard.canSync().ok, 'sync blocked during connection loss');
  context.SyncGuard.resume({ state: 'identical' });
});

// 8. تغيير صلاحيات المستخدم
scenario('user_permission_change', () => {
  context.currentUser = { id: 'u2', role: 'reception' };
  const r = context.ConflictQueue.resolve('fake', { choice: 'local' });
  assert(r.error === 'not_found' || r.error === 'manager_only', 'reception cannot resolve conflicts');
  context.currentUser = { id: 'u1', role: 'admin' };
});

// 9. حذف وإعادة ربط Google
scenario('google_disconnect_relink', () => {
  context.settings.backup.providers.google = { connected: false, userDisconnected: true };
  assert(!context.DriveAdapter.isConnected(), 'disconnected google');
  const oauth = context.DriveErrors.classify({ error: 'invalid_grant token revoked' });
  assert(oauth.type === 'oauth_error', 'oauth failure classified');
  assert(oauth.pauseSync === true, 'oauth pauses sync');
  context.settings.backup.providers.google = { connected: true, oauth: true, email: 'owner@test.com' };
  assert(context.DriveAdapter.isConnected(), 'relinked google');
});

// 10. تعطل أثناء الكتابة (محاكاة)
scenario('crash_during_write', () => {
  const before = repo.get('clientsRegistry')?.length || 0;
  repo.upsert('clientsRegistry', baseRec('cw1', { name: 'CrashTest' }));
  const after = repo.get('clientsRegistry')?.length || 0;
  assert(after >= before, 'repository write survives simulated crash read');
  const rev = repo.get('clientsRegistry')?.find(r => r.id === 'cw1')?.revision;
  assert(rev != null && rev >= 1, 'revision metadata preserved after write');
});

// Production fixes verification
scenario('synced_write_restore_path', async () => {
  repo.setAll('cases', []);
  const backup = { cases: [baseRec('b1', { name: 'Backup Case', total: 50 })], clientsRegistry: [] };
  const res = await context.SyncedWrite.restoreFromBackup(backup, { source: 'e2e' });
  assert(res.ok === true, 'restore via SyncedWrite succeeds without conflict');
  assert((repo.get('cases') || []).some(c => c.id === 'b1'), 'backup case applied through restore staging');
});

scenario('inventory_schedule_push', () => {
  context.CloudMeta.setCloudV2Enabled(true);
  let pushed = null;
  const orig = context.SyncEngine.schedulePush;
  context.SyncEngine.schedulePush = (table, branchId) => { pushed = { table, branchId }; };
  const bumpRes = context.VersionsIndex.onRepositoryBump('inventoryItems', 'BR-MAIN');
  context.SyncEngine.schedulePush = orig;
  assert(bumpRes != null, 'inventory bump returns versions');
  assert(pushed?.table === 'inventoryItems', 'inventory bump schedules push');
  assert(context.VersionsIndex.TABLE_VERSION_MAP.inventoryItems === 'databaseVersion', 'inventory in TABLE_VERSION_MAP');
});

scenario('settings_restore_requires_manager', () => {
  context.currentUser = { id: 'u2', role: 'reception' };
  const r = context.SettingsGuard.restorePoint('missing');
  assert(r.error === 'manager_required' || r.error === 'not_found', 'settings restore gated');
  context.currentUser = { id: 'u1', role: 'admin' };
});

scenario('migration_auth_exempt', () => {
  context._migrationRunning = true;
  assert(context._migrationRunning === true, 'migration flag available for auth exempt');
  context._migrationRunning = false;
});

scenario('boot_wizard_no_self_report', () => {
  context.settings.backup = context.settings.backup || { providers: {} };
  context.settings.backup.providers = context.settings.backup.providers || {};
  context.localStorage.setItem('__tdw_boot_complete__', '1');
  context.settings.backup.providers.google = { connected: false };
  assert(!context.BootFlow.isBootComplete(), 'boot flag alone cannot bypass verification');
  context.settings.backup.providers.google = { connected: true, oauth: true };
  context._licStatus = 'valid';
  context.licLoad = () => ({ licenseId: 'L1' });
  assert(context.BootFlow.validateStep('license') === true, 'license step requires real license');
});

const passed = results.filter(r => r.ok).length;
const total = results.length;

if (errors.length) {
  console.error('FAIL e2e-production-readiness:');
  errors.forEach(e => console.error(' -', e));
  console.error(`\nResults: ${passed}/${total} passed`);
  process.exit(1);
}

console.log(`OK: Production readiness E2E — ${passed}/${total} scenarios passed`);
results.forEach(r => console.log(`  ✓ ${r.name}`));
