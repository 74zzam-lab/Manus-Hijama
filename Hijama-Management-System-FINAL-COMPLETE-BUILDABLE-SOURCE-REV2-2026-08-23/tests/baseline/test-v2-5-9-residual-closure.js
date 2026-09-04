#!/usr/bin/env node
'use strict';

/**
 * V2-5.9 residual closure unit checks:
 * - no optimistic operational DB.set cache
 * - legacy branch migration explicit
 * - attachment lifecycle wired
 * - Sheets role + harness helpers
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const bridgeSrc = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');
check(/__noOptimisticOperational/.test(bridgeSrc), 'bridge marks no-optimistic flag');
check(!/Optimistic UI cache/.test(bridgeSrc), 'must not document optimistic UI cache');
check(/restoreLastCommit/.test(bridgeSrc), 'rollback to last commit on failure');
check(/setAuthoritative/.test(bridgeSrc), 'setAuthoritative API');

const legacySrc = fs.readFileSync(path.join(root, 'cloud/legacy-branch-migration.js'), 'utf8');
check(/mapping_required/.test(legacySrc), 'multi-branch mapping required');
check(/isPushBlocked/.test(legacySrc), 'push blocked until migration');
check(/MARKER_KEY/.test(legacySrc), 'migration marker');

const scopeSrc = fs.readFileSync(path.join(root, 'cloud/branch-scope.js'), 'utf8');
check(/resolveLegacyBranchId/.test(scopeSrc), 'filterByBranch uses explicit resolver');

const attachSrc = fs.readFileSync(path.join(root, 'cloud/attachment-lifecycle.js'), 'utf8');
check(/PENDING|UPLOADING|SYNCED|FAILED|MISSING_REMOTE|QUARANTINED|DELETED/.test(attachSrc), 'attachment states');
check(/createAttachment|uploadAttachment|deleteAttachment/.test(attachSrc), 'lifecycle ops');

const sheetsSrc = fs.readFileSync(path.join(root, 'cloud/google-sheets-ops.js'), 'utf8');
check(/isSourceOfTruth:\s*false/.test(sheetsSrc), 'Sheets not SoT');
check(/license_registry_integration/.test(sheetsSrc), 'Sheets role named');
check(/simulateHttpFailure/.test(sheetsSrc), 'Sheets harness failure simulator');

const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
check(/legacy-branch-migration\.js/.test(indexSrc), 'legacy migration wired');
check(/attachment-lifecycle\.js/.test(indexSrc), 'attachment lifecycle wired');

const preload = fs.readFileSync(path.join(root, 'electron/preload.js'), 'utf8');
check(/attachments:writeLocal/.test(preload), 'attachments IPC exposed');
check(fs.existsSync(path.join(root, 'electron/attachments-ipc.js')), 'attachments-ipc module');

const syncSrc = fs.readFileSync(path.join(root, 'cloud/sync-engine.js'), 'utf8');
check(/legacy_branch_migration_required/.test(syncSrc), 'sync push blocked on legacy');

// Runtime: legacy migration sandbox
const store = new Map();
const sandbox = {
  console,
  Date,
  JSON,
  Array,
  Object,
  Promise,
  clientsRegistry: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B', branchId: 'BR-MAIN' }],
  cases: [{ id: 'v1' }],
  bookings: [],
  expenses: [],
  attendance: [],
  doctors: [],
  DB: {
    get(k, def) { return store.has(k) ? store.get(k) : def; },
    set(k, v) { store.set(k, v); },
  },
  LicenseCloud: { loadLocal: () => ({ centerId: 'CTR', branches: [{ id: 'BR-MAIN', active: true }, { id: 'BR02', active: true }] }) },
  DeviceConfig: { getLockedBranchId: () => 'BR-MAIN' },
  AuditLogger: { log() {} },
  CenterId: { getStoredCenterId: () => 'CTR' },
};
sandbox.global = sandbox;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(legacySrc, sandbox, { timeout: 2000 });

const det = sandbox.LegacyBranchMigration.detectLegacyRecords();
check(det.legacyTotal >= 2, 'detects legacy rows without branchId');
check(sandbox.LegacyBranchMigration.isMultiBranch() === true, 'multi-branch detected');
check(sandbox.LegacyBranchMigration.isPushBlocked() === true, 'push blocked before migration');

const noMap = sandbox.LegacyBranchMigration.runMigration({ mapping: null });
// runMigration is async
Promise.resolve(noMap).then(async (r0) => {
  // In vm, async function returns Promise
}).catch(() => {});

async function runAsyncChecks() {
  const denied = await sandbox.LegacyBranchMigration.runMigration({});
  check(denied.ok === false && denied.error === 'mapping_required', 'multi-branch requires mapping');

  // Single-branch path with explicit mapping
  sandbox.LicenseCloud.loadLocal = () => ({ centerId: 'CTR', branches: [{ id: 'BR-MAIN', active: true }] });
  sandbox.clientsRegistry = [{ id: 'c1', name: 'A' }];
  sandbox.cases = [{ id: 'v1' }];
  const okMig = await sandbox.LegacyBranchMigration.runMigration({
    mapping: 'BR-MAIN',
    allowSingleBranchDefault: true,
  });
  // backup may fail in sandbox — if so, still validate mapping_required vs backup
  if (okMig.ok) {
    check(sandbox.clientsRegistry[0].branchId === 'BR-MAIN', 'legacy client mapped');
    check(sandbox.LegacyBranchMigration.isMigrationComplete() === true, 'marker completed');
    check(sandbox.LegacyBranchMigration.isPushBlocked() === false, 'push unblocked after migration');
  } else {
    check(okMig.error === 'pre_migration_backup_required' || okMig.error === 'backup_unavailable',
      'single-branch migration demands backup when no backup API: ' + okMig.error);
    // Force marker path with stub backup
    sandbox.RestoreReconciliation = { createMandatoryPreRestoreSnapshot: async () => ({ ok: true, skipped: true }) };
    const ok2 = await sandbox.LegacyBranchMigration.runMigration({ mapping: 'BR-MAIN' });
    check(ok2.ok === true, 'migration succeeds with backup stub');
    check(sandbox.clientsRegistry[0].branchId === 'BR-MAIN', 'mapped after stub backup');
  }

  // Sheets role sandbox
  const sheetsSandbox = { console, module: { exports: {} } };
  sheetsSandbox.global = sheetsSandbox;
  sheetsSandbox.window = sheetsSandbox;
  sheetsSandbox.globalThis = sheetsSandbox;
  vm.runInNewContext(sheetsSrc, sheetsSandbox, { timeout: 1000 });
  const role = sheetsSandbox.GoogleSheetsOps.SHEETS_ROLE;
  check(role && role.isSourceOfTruth === false, 'runtime Sheets not SoT');
  const sim = sheetsSandbox.GoogleSheetsOps.simulateHttpFailure(429);
  check(sim.ok === false && sim.code === 'rate_limit', '429 classified');

  // Attachment lifecycle sandbox
  const attStore = new Map();
  const attSb = {
    console,
    Date,
    JSON,
    Promise,
    Array,
    Object,
    crypto: undefined,
    DB: {
      get(k, def) { return attStore.has(k) ? attStore.get(k) : def; },
      set(k, v) { attStore.set(k, v); },
    },
    CenterId: { getStoredCenterId: () => 'CTR' },
    BranchContexts: { getOperationalWriteBranch: () => 'BR-MAIN', assertOperationalWriteContext: () => ({ ok: true, branchId: 'BR-MAIN' }) },
    BranchScope: { getActiveBranchId: () => 'BR-MAIN' },
    DriveLayout: { attachmentBlobPath: (c, b, h) => `${c}/${b}/${h}` },
    DriveAdapter: {
      uploadBinary: async () => ({ ok: true }),
    },
    LegacyBranchMigration: { isPushBlocked: () => false },
  };
  attSb.global = attSb;
  attSb.window = attSb;
  attSb.globalThis = attSb;
  // Provide hash via subtle polyfill
  const nodeCrypto = require('crypto');
  attSb.crypto = {
    subtle: {
      digest: async (_algo, ab) => {
        const buf = Buffer.from(ab);
        return nodeCrypto.createHash('sha256').update(buf).digest().buffer;
      },
    },
  };
  vm.runInNewContext(attachSrc, attSb, { timeout: 2000 });
  const bytes = new Uint8Array([1, 2, 3, 4, 5]).buffer;
  const created = await attSb.AttachmentLifecycle.createAttachment(
    { filename: 'a.txt', recordId: 'r1', recordTable: 'cases' },
    bytes
  );
  check(created.ok === true && created.item.state === 'PENDING', 'attachment created PENDING');
  const uploaded = await attSb.AttachmentLifecycle.uploadAttachment(created.item.id, { buffer: bytes });
  check(uploaded.ok === true && uploaded.item.state === 'SYNCED', 'attachment upload SYNCED');
  const del = await attSb.AttachmentLifecycle.deleteAttachment(created.item.id);
  check(del.ok === true && del.state === 'DELETED', 'attachment deleted');

  // Bridge no-optimistic: when sqlitePrimary + fake db, set must not write LS before commit
  const ls = new Map();
  const bridgeSb = {
    console,
    Date,
    JSON,
    Promise,
    Array,
    Object,
    localStorage: {
      getItem(k) { return ls.has(k) ? ls.get(k) : null; },
      setItem(k, v) { ls.set(k, v); },
      removeItem(k) { ls.delete(k); },
    },
  };
  bridgeSb.global = bridgeSb;
  bridgeSb.window = bridgeSb;
  bridgeSb.globalThis = bridgeSb;
  bridgeSb.DB = {
    get(k, def) {
      const raw = bridgeSb.localStorage.getItem(k);
      return raw ? JSON.parse(raw) : def;
    },
    set(k, v) { bridgeSb.localStorage.setItem(k, JSON.stringify(v)); },
  };
  let persistCalls = 0;
  bridgeSb.cuppingElectron = {
    database: {
      status: async () => ({ ok: true, sqlitePrimary: true }),
      enableSqlitePrimary: async () => ({ ok: true, sqlitePrimary: true }),
      persistTable: async () => { persistCalls += 1; return { ok: false, error: 'forced_fail' }; },
      syncOp: async () => { persistCalls += 1; return { ok: false, error: 'forced_fail' }; },
      persistKv: async () => ({ ok: true }),
      hydrate: async () => ({
        ok: true,
        status: { sqlitePrimary: true },
        data: { clientsRegistry: [{ id: 'old', branchId: 'BR-MAIN' }], cases: [], bookings: [], doctors: [], attendance: [], expenses: [] },
      }),
    },
  };
  bridgeSb.BranchContexts = {
    getOperationalWriteBranch: () => 'BR-MAIN',
    assertOperationalWriteContext: () => ({ ok: true, branchId: 'BR-MAIN' }),
  };
  bridgeSb.DeviceConfig = { isBranchLocked: () => false };
  bridgeSb.BranchScope = {
    filterForActiveView: (records) => records,
    filterByBranch: (records) => records,
    isAggregateBranchView: () => false,
  };
  vm.runInNewContext(bridgeSrc, bridgeSb, { timeout: 2000 });
  await bridgeSb.SqliteBridge.hydrateIntoMemory();
  check(bridgeSb.SqliteBridge.getState().sqlitePrimary === true, 'sqlite primary after hydrate');
  const before = bridgeSb.localStorage.getItem('clientsRegistry');
  bridgeSb.DB.set('clientsRegistry', [{ id: 'new-divergent', branchId: 'BR-MAIN' }]);
  // Allow microtask for failed commit
  await new Promise((r) => setTimeout(r, 30));
  const after = bridgeSb.localStorage.getItem('clientsRegistry');
  check(persistCalls >= 1, 'persist attempted');
  check(after === before || /old/.test(String(after)), 'failed commit does not keep divergent optimistic cache');
  check(bridgeSb.SqliteBridge.getLastError(), 'lastError set on failure');

  if (errors.length) {
    console.error('FAIL: v2-5.9 residual closure');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('OK: v2-5.9 residual closure unit checks');
}

runAsyncChecks().catch((e) => {
  console.error('FAIL: v2-5.9 residual closure threw', e);
  process.exit(1);
});
