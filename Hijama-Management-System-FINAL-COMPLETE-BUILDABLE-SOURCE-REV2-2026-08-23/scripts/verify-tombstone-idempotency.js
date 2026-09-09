#!/usr/bin/env node
/**
 * Phase 7 — tombstone merge rules + outbox idempotency key stability.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const errors = [];

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

const tombstone = require('../database/tombstone-policy');
const idempotencyKeys = require('../database/idempotency-keys');
const { openDatabase } = require('../database/connection');
const { createSyncPlatform } = require('../database/sync-outbox');

// Tombstone policy (PR10: equal revision → tombstone wins; conflict only when live revision strictly newer)
const delVsUpdate = tombstone.decideTombstone(
  { id: 'c1', deletedAt: '2026-01-02T10:00:00Z', revision: 2 },
  { id: 'c1', name: 'Alive', revision: 3 },
  'clientsRegistry'
);
assert(delVsUpdate?.action === tombstone.ACTIONS.CONFLICT, 'delete_vs_update → conflict when remote revision newer');
assert(delVsUpdate?.reason === 'delete_vs_update', 'delete_vs_update reason');

const equalRevTombstoneWins = tombstone.decideTombstone(
  { id: 'c1', deletedAt: '2026-01-02T10:00:00Z', revision: 2 },
  { id: 'c1', name: 'Alive', revision: 2 },
  'clientsRegistry'
);
assert(equalRevTombstoneWins?.action === tombstone.ACTIONS.PUSH, 'equal revision: local tombstone wins over stale remote');

const updateVsDel = tombstone.decideTombstone(
  { id: 'c1', name: 'Alive', revision: 2 },
  { id: 'c1', deletedAt: '2026-01-02T10:00:00Z', revision: 2 },
  'clientsRegistry'
);
assert(updateVsDel?.action === tombstone.ACTIONS.PULL, 'equal revision: remote tombstone wins over stale live');

const trueConflict = tombstone.decideTombstone(
  { id: 'c1', name: 'Alive', revision: 4 },
  { id: 'c1', deletedAt: '2026-01-02T10:00:00Z', revision: 2 },
  'clientsRegistry'
);
assert(trueConflict?.action === tombstone.ACTIONS.CONFLICT, 'local revision newer than tombstone → conflict');

const bothTomb = tombstone.decideTombstone(
  { id: 'c1', deletedAt: '2026-01-03T10:00:00Z', revision: 3 },
  { id: 'c1', deletedAt: '2026-01-02T10:00:00Z', revision: 2 },
  'clientsRegistry'
);
assert(bothTomb?.action === tombstone.ACTIONS.PUSH, 'newer local tombstone → push');

assert(
  tombstone.recordsConflict(
    { id: 'c1', deletedAt: '2026-01-02T10:00:00Z', revision: 2 },
    { id: 'c1', name: 'Bob', revision: 3 }
  ),
  'recordsConflict on delete_vs_update when remote revision newer'
);
assert(
  !tombstone.recordsConflict(
    { id: 'c1', deletedAt: '2026-01-03T10:00:00Z' },
    { id: 'c1', deletedAt: '2026-01-02T10:00:00Z' }
  ),
  'auto-resolvable tombstone pair does not conflict'
);

const stamped = tombstone.applyTombstone({ id: 'x', revision: 1 }, { id: 'x', revision: 1 }, { branchId: 'BR-MAIN' });
assert(stamped.deletedAt && stamped.revision === 2, 'applyTombstone bumps revision');

// Idempotency keys
const payload = JSON.stringify([{ id: 'a', name: 'Test' }]);
const key1 = idempotencyKeys.buildOutboxIdempotencyKey({
  center_id: 'CTR',
  branch_id: 'BR-MAIN',
  table_name: 'clientsRegistry',
  operation: 'TABLE_BUMP',
  base_revision: 1,
  new_revision: 2,
  payload_json: payload,
});
const key2 = idempotencyKeys.buildOutboxIdempotencyKey({
  center_id: 'CTR',
  branch_id: 'BR-MAIN',
  table_name: 'clientsRegistry',
  operation: 'TABLE_BUMP',
  base_revision: 1,
  new_revision: 2,
  payload_json: payload,
});
assert(key1 === key2, 'stable idempotency key for same payload');

const key3 = idempotencyKeys.buildOutboxIdempotencyKey({
  center_id: 'CTR',
  branch_id: 'BR-MAIN',
  table_name: 'clientsRegistry',
  operation: 'TABLE_BUMP',
  base_revision: 1,
  new_revision: 3,
  payload_json: payload,
});
assert(key1 !== key3, 'different revision → different idempotency key');

// Outbox duplicate insert
const dbPath = path.join(os.tmpdir(), `verify-p7-${Date.now()}.db`);
const db = openDatabase(dbPath);

const sp = createSyncPlatform(db);
const entry = {
  center_id: 'CTR',
  branch_id: 'BR-MAIN',
  table_name: 'clientsRegistry',
  operation: 'TABLE_BUMP',
  base_revision: 0,
  new_revision: 1,
  payload_json: payload,
  device_id: 'dev1',
};
const r1 = sp.enqueue(entry);
const r2 = sp.enqueue(entry);
assert(r1.inserted === true, 'first enqueue inserts');
assert(r2.inserted === false, 'duplicate idempotency blocked');

// Renderer merge policy tombstone integration
const context = {
  window: {},
  globalThis: {},
  console,
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = v; },
    removeItem(k) { delete this._d[k]; },
  },
  DB: {
    get(k, def) {
      try {
        const v = context.localStorage.getItem(k);
        return v ? JSON.parse(v) : def;
      } catch { return def; }
    },
    set(k, v) { context.localStorage.setItem(k, JSON.stringify(v)); },
  },
  settings: { centerName: 'Test', defaultBranchId: 'BR-MAIN' },
  currentUser: { id: 'u1', role: 'admin', fullName: 'Admin' },
  notify: () => {},
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
[
  'cloud/record-metadata.js',
  'cloud/idempotency-keys.js',
  'cloud/tombstone-policy.js',
  'cloud/merge-policy.js',
  'cloud/table-merge-policy.js',
].forEach((rel) => {
  vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), context);
});

const mpConflict = context.MergePolicy.decideRecord(
  { id: 'c1', deletedAt: '2026-01-02T10:00:00Z', revision: 2, updatedAt: '2026-01-02' },
  { id: 'c1', name: 'Live', revision: 3, updatedAt: '2026-01-03' },
  'clientsRegistry'
);
assert(mpConflict.action === 'conflict', 'MergePolicy routes tombstone delete_vs_update when remote revision newer');

const tConflict = context.TableMergePolicy.decideForTable(
  'clientsRegistry',
  { id: 'c1', deletedAt: '2026-01-02T10:00:00Z', revision: 2, updatedAt: '2026-01-02' },
  { id: 'c1', name: 'Live', revision: 3, updatedAt: '2026-01-03' }
);
assert(tConflict.action === 'conflict', 'TableMergePolicy tombstone conflict when remote revision newer');

db.close();
try { fs.unlinkSync(dbPath); } catch { /* empty */ }

if (errors.length) {
  console.error('FAIL verify-tombstone-idempotency:');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('OK: Phase 7 tombstone + idempotency verified');
