#!/usr/bin/env node
/**
 * Phase 8 — attachment metadata authority (`attachments_meta` canonical).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const errors = [];

function assert(c, m) {
  if (!c) errors.push(m);
}

const AA = require('../database/attachment-authority');
const { sha256Buffer } = require('../database/attachment-sync');

// Node helpers
const item = {
  id: 'att-abc',
  sha256: 'a'.repeat(64),
  branchId: 'BR-A',
  centerId: 'CTR',
  filename: 'note.txt',
  state: 'PENDING',
  size: 12,
};
const rec = AA.itemToMetaRecord(item);
assert(rec && rec.id === item.id, 'itemToMetaRecord');
assert(rec.sha256 === item.sha256, 'sha256 preserved');

const legacy = {
  version: 1,
  items: [{ id: 'att-old', sha256: 'b'.repeat(64), branchId: 'BR-B', filename: 'old.pdf', state: 'SYNCED' }],
};
const migrated = AA.migrateLegacyManifest(legacy);
assert(migrated.length === 1 && migrated[0].branchId === 'BR-B', 'legacy manifest migrate');

const merged = AA.mergeBranchSlice(
  [{ id: '1', branchId: 'BR-A' }, { id: '2', branchId: 'BR-B' }],
  [{ id: '3', branchId: 'BR-A' }],
  'BR-A'
);
assert(merged.length === 2 && merged.some((r) => r.id === '2') && merged.some((r) => r.id === '3'), 'branch slice merge');

const denied = AA.assertBranchWrite({ branchId: 'BR-B' }, 'BR-A');
assert(!denied.ok && denied.error === 'branch_authority_denied', 'branch authority denied');

const buf = Buffer.from('attachment-bytes');
const hash = sha256Buffer(buf);
const verified = AA.verifyContentHash(buf, hash);
assert(verified.ok, 'hash verify ok');
const badHash = AA.verifyContentHash(buf, 'c'.repeat(64));
assert(!badHash.ok && badHash.error === 'hash_mismatch', 'hash mismatch');

// Renderer integration
const context = {
  window: {},
  globalThis: {},
  console,
  crypto: require('crypto').webcrypto,
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
    __rawSet(k, v) { context.localStorage.setItem(k, JSON.stringify(v)); },
  },
  settings: { defaultBranchId: 'BR-MAIN' },
  BranchScope: {
    getActiveBranchId: () => 'BR-A',
    getOperationalWriteBranch: () => 'BR-A',
  },
  BranchContexts: { getOperationalWriteBranch: () => 'BR-A' },
  CenterId: { getStoredCenterId: () => 'CTR' },
  RecordMetadata: { getDeviceId: () => 'dev1' },
  Repository: {
    SYNCED_TABLES: ['attachments_meta'],
    isSyncedTable(t) { return t === 'attachments_meta'; },
    get(t) { return context.DB.get(t, []); },
    setAll(t, v) {
      context.DB.set(t, v);
      return v;
    },
  },
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

vm.runInContext(fs.readFileSync(path.join(root, 'cloud/attachment-authority.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'cloud/attachment-lifecycle.js'), 'utf8'), context);

// Legacy manifest → attachments_meta on load
context.DB.set('__tdw_attachment_manifest__', legacy);
const loaded = context.AttachmentAuthority.loadItems();
assert(loaded.length === 1 && loaded[0].sha256 === 'b'.repeat(64), 'legacy migrated on load');

const metaRows = context.DB.get('attachments_meta', []);
assert(Array.isArray(metaRows) && metaRows.length === 1, 'attachments_meta populated');

const iso = context.AttachmentAuthority.verifyBranchIsolation('BR-A');
assert(iso.ok, 'branch isolation ok for BR-A');

const repoSynced = context.RepositoryFactory?.SYNCED_TABLES
  || context.Repository?.SYNCED_TABLES;
if (repoSynced) {
  assert(repoSynced.includes('attachments_meta'), 'repository lists attachments_meta');
} else {
  const repoSrc = fs.readFileSync(path.join(root, 'cloud/repository.js'), 'utf8');
  assert(repoSrc.includes('attachments_meta'), 'repository source includes attachments_meta');
}

const syncSrc = fs.readFileSync(path.join(root, 'cloud/sync-engine.js'), 'utf8');
assert(syncSrc.includes('attachments_meta'), 'sync-engine includes attachments_meta');

const bridgeSrc = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');
assert(bridgeSrc.includes('attachments_meta'), 'sqlite bridge includes attachments_meta');

const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(indexSrc.includes('attachment-authority.js'), 'index loads attachment-authority');

if (errors.length) {
  console.error('FAIL verify-attachment-authority:');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('OK: Phase 8 attachment authority verified');
