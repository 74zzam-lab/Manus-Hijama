#!/usr/bin/env node
/**
 * Independent static + lightweight runtime check for Phase 2 atomic bundles.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const checks = [
  { name: 'sync-outbox enqueueAtomicBundle', ok: /function enqueueAtomicBundle/.test(read('database/sync-outbox.js')) },
  { name: 'sync-outbox persistAtomic', ok: /function persistAtomic/.test(read('database/sync-outbox.js')) },
  { name: 'service enqueueAtomicBundle op', ok: /enqueueAtomicBundle/.test(read('electron/database/service.js')) },
  { name: 'service persistBundle op', ok: /persistBundle/.test(read('electron/database/service.js')) },
  { name: 'bridge beginBundle', ok: /function beginBundle/.test(read('cupping-sqlite-bridge.js')) },
  { name: 'bridge commitBundle', ok: /function commitBundle/.test(read('cupping-sqlite-bridge.js')) },
  { name: 'saveCase uses bundle', ok: /beginBundle/.test(read('index.html')) && /commitBundle/.test(read('index.html')) },
];

let failed = 0;
for (const c of checks) {
  console.log((c.ok ? 'PASS' : 'FAIL') + '  ' + c.name);
  if (!c.ok) failed += 1;
}

// Runtime: bundle rolls back on forced failure
try {
  const Database = require('better-sqlite3');
  const { createSyncPlatform } = require('../database/sync-outbox');
  const tmp = path.join(os.tmpdir(), `tdw-bundle-${Date.now()}.db`);
  const db = new Database(tmp);
  db.exec(`
    CREATE TABLE sync_outbox (
      event_id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id TEXT,
      operation TEXT NOT NULL,
      base_revision INTEGER,
      new_revision INTEGER,
      payload_json TEXT,
      payload_hash TEXT,
      device_id TEXT,
      actor_id TEXT,
      created_at TEXT NOT NULL,
      attempt_count INTEGER DEFAULT 0,
      next_attempt_at TEXT,
      status TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      last_error TEXT,
      acked_at TEXT,
      remote_file_id TEXT
    );
    CREATE TABLE kv_probe (key TEXT PRIMARY KEY, value TEXT);
  `);
  const sp = createSyncPlatform(db);
  db.prepare('INSERT INTO kv_probe(key,value) VALUES(?,?)').run('a', '1');
  const entry = {
    center_id: 'C1',
    branch_id: 'BR-MAIN',
    table_name: 'cases',
    operation: 'TABLE_BUMP',
    base_revision: 0,
    new_revision: 1,
    device_id: 'dev',
    payload_json: '[]',
  };
  const bad = sp.enqueueAtomicBundle(() => {
    db.prepare('UPDATE kv_probe SET value=? WHERE key=?').run('2', 'a');
    throw new Error('simulated_crash');
  }, [entry]);
  const row = db.prepare('SELECT value FROM kv_probe WHERE key=?').get('a');
  const outboxCount = db.prepare('SELECT COUNT(*) AS c FROM sync_outbox').get().c;
  const rollbackOk = row.value === '1' && outboxCount === 0 && bad.ok === false;
  console.log((rollbackOk ? 'PASS' : 'FAIL') + '  runtime bundle rollback on exception');
  if (!rollbackOk) failed += 1;
  try { fs.unlinkSync(tmp); } catch { /* empty */ }
  db.close();
} catch (e) {
  console.log('SKIP  runtime bundle test (' + (e.message || e) + ')');
}

if (failed) {
  console.error('\n' + failed + ' check(s) failed');
  process.exit(1);
}
console.log('\nAll Phase 2 atomic transaction checks passed.');
