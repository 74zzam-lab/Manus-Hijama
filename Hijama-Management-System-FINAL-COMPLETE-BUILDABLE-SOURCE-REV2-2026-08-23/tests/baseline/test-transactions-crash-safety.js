#!/usr/bin/env node
'use strict';

/**
 * PR5 — Transactions & Crash Safety runtime tests.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

async function main() {
  const { createSyncPlatform } = require('../../database/sync-outbox');
  const { openDatabase } = require('../../database/connection');
  const { runWithSqliteBusyRetry, isSqliteBusyError } = require('../../database/sqlite-busy-retry');
  const idempotencyKeys = require('../../database/idempotency-keys');

  check(isSqliteBusyError({ code: 'SQLITE_BUSY' }), 'detects SQLITE_BUSY');
  check(!isSqliteBusyError({ code: 'OTHER' }), 'ignores non-busy errors');

  let attempts = 0;
  const retried = runWithSqliteBusyRetry(() => {
    attempts += 1;
    if (attempts < 3) {
      const err = new Error('database is locked');
      err.code = 'SQLITE_BUSY';
      throw err;
    }
    return 'ok';
  }, { attempts: 4, baseMs: 1, maxMs: 2 });
  check(retried === 'ok' && attempts === 3, 'busy retry succeeds after transient lock');

  const tmp = path.join(os.tmpdir(), `tdw-pr5-${Date.now()}.db`);
  // Apply the full current app schema, including migration 005 lease columns.
  const db = openDatabase(tmp);
  db.exec(`
    CREATE TABLE kv_probe (key TEXT PRIMARY KEY, value TEXT);
  `);
  const sp = createSyncPlatform(db);

  // Multi-table bundle rollback on exception
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
    db.prepare(`INSERT INTO kv_store(key,value_json,updated_at) VALUES(?,?,?)`).run('cases', '[]', new Date().toISOString());
    throw new Error('simulated_crash');
  }, [entry]);
  const row = db.prepare('SELECT value FROM kv_probe WHERE key=?').get('a');
  const outboxCount = db.prepare('SELECT COUNT(*) AS c FROM sync_outbox').get().c;
  const kvCount = db.prepare('SELECT COUNT(*) AS c FROM kv_store').get().c;
  check(bad.ok === false, 'bundle returns failure on crash');
  check(row.value === '1' && outboxCount === 0 && kvCount === 0, 'bundle rollback leaves no half-written state');

  // persistAtomic multi-step success
  const ok = sp.persistAtomic(() => {
    db.prepare('UPDATE kv_probe SET value=? WHERE key=?').run('3', 'a');
    db.prepare(`INSERT INTO kv_store(key,value_json,updated_at) VALUES(?,?,?)`).run('users', '[]', new Date().toISOString());
  });
  check(ok.ok === true, 'persistAtomic succeeds');
  check(db.prepare('SELECT value FROM kv_probe WHERE key=?').get('a').value === '3', 'persistAtomic committed kv_probe');
  check(db.prepare('SELECT COUNT(*) AS c FROM kv_store').get().c === 1, 'persistAtomic committed kv_store');

  // Duplicate outbox enqueue does not double-insert
  const dupEntry = {
    center_id: 'C1',
    branch_id: 'BR-MAIN',
    table_name: 'cases',
    operation: 'TABLE_BUMP',
    base_revision: 1,
    new_revision: 2,
    device_id: 'dev',
    payload_json: '[{"id":"v1"}]',
  };
  dupEntry.idempotency_key = idempotencyKeys.buildOutboxIdempotencyKey(dupEntry);
  const first = sp.enqueue(dupEntry);
  const second = sp.enqueue({ ...dupEntry, event_id: 'other-event' });
  const outboxDup = db.prepare('SELECT COUNT(*) AS c FROM sync_outbox WHERE idempotency_key=?').get(dupEntry.idempotency_key).c;
  check(first.inserted === true, 'first outbox insert ok');
  check(second.inserted === false, 'duplicate outbox suppressed');
  check(outboxDup === 1, 'no duplicate outbox row');

  db.close();
  try { fs.unlinkSync(tmp); } catch { /* empty */ }

  if (errors.length) {
    console.error('FAIL: transactions-crash-safety');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('OK: transactions-crash-safety (retry/rollback/persist/idempotency)');
}

main().catch((e) => {
  console.error('FAIL: transactions-crash-safety threw', e);
  process.exit(1);
});
