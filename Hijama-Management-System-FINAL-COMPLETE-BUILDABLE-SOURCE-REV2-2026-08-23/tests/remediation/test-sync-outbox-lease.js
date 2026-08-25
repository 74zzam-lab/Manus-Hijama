'use strict';

const assert = require('assert');
const { createSyncPlatform } = require('../../database/sync-outbox');

function fakeDb() {
  const rows = [];
  function statement(sql) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('INSERT INTO sync_outbox')) {
      return { run(row) {
        if (rows.some((item) => item.idempotency_key === row.idempotency_key)) return { changes: 0 };
        rows.push({ ...row, status: 'pending', attempt_count: 0, last_error: null, lease_token: null, lease_expires_at: null });
        return { changes: 1 };
      } };
    }
    if (normalized.startsWith('SELECT * FROM sync_outbox') && normalized.includes("status = 'pending'")) {
      return { all(params) {
        return rows.filter((row) => row.status === 'pending'
          && (!params.branchId || row.branch_id === params.branchId)
          && (params.ignoreBackoff === 1 || !row.next_attempt_at || row.next_attempt_at <= params.now))
          .slice(0, params.limit)
          .map((row) => ({ ...row }));
      } };
    }
    if (normalized.startsWith('UPDATE sync_outbox') && normalized.includes("last_error='lease_expired_requeued'")) {
      return { run(now) {
        let changes = 0;
        for (const row of rows) {
          if (row.status === 'inflight' && row.lease_expires_at && row.lease_expires_at <= now) {
            Object.assign(row, { status: 'pending', lease_token: null, lease_expires_at: null, claimed_at: null, next_attempt_at: now, last_error: 'lease_expired_requeued' });
            changes += 1;
          }
        }
        return { changes };
      } };
    }
    if (normalized.startsWith('UPDATE sync_outbox') && normalized.includes("SET status='inflight'")) {
      return { run(params) {
        const row = rows.find((item) => item.event_id === params.eventId && item.status === 'pending');
        if (!row) return { changes: 0 };
        Object.assign(row, { status: 'inflight', attempt_count: row.attempt_count + 1, lease_token: params.leaseToken, lease_expires_at: params.leaseExpiresAt, claimed_at: params.claimedAt, last_error: null });
        return { changes: 1 };
      } };
    }
    if (normalized.startsWith('UPDATE sync_outbox') && normalized.includes("SET status='acked'")) {
      return { run(params) {
        const row = rows.find((item) => item.event_id === params.eventId && item.status === 'inflight' && item.lease_token === params.leaseToken);
        if (!row) return { changes: 0 };
        Object.assign(row, { status: 'acked', remote_file_id: params.remoteFileId, lease_token: null, lease_expires_at: null });
        return { changes: 1 };
      } };
    }
    if (normalized.startsWith('SELECT attempt_count FROM sync_outbox')) {
      return { get(eventId) { const row = rows.find((item) => item.event_id === eventId); return row ? { attempt_count: row.attempt_count } : undefined; } };
    }
    if (normalized.startsWith('UPDATE sync_outbox') && normalized.includes('lease_token=@leaseToken')) {
      return { run(params) {
        const row = rows.find((item) => item.event_id === params.id && item.status === 'inflight' && item.lease_token === params.leaseToken);
        if (!row) return { changes: 0 };
        Object.assign(row, { status: row.attempt_count >= params.maxAttempts ? 'dead-letter' : 'pending', lease_token: null, lease_expires_at: null, claimed_at: null, last_error: params.err, next_attempt_at: params.next });
        return { changes: 1 };
      } };
    }
    return { run: () => ({ changes: 1 }), get: () => undefined, all: () => [] };
  }
  return { rows, prepare: statement, transaction: (fn) => (...args) => fn(...args) };
}

const db = fakeDb();
const outbox = createSyncPlatform(db);
outbox.enqueue({ center_id: 'C-1', branch_id: 'BR-A', table_name: 'cases', record_id: 'V-1', payload_json: { id: 'V-1' } });
const first = outbox.claimPending({ branch_id: 'BR-A', leaseMs: 10000 });
assert.strictEqual(first.length, 1, 'first worker claims pending event');
assert.ok(first[0].lease_token, 'claimed event carries an ownership token');
assert.strictEqual(outbox.claimPending({ branch_id: 'BR-A' }).length, 0, 'second worker cannot claim current inflight event');

db.rows[0].lease_expires_at = '2000-01-01T00:00:00.000Z';
const second = outbox.claimPending({ branch_id: 'BR-A' });
assert.strictEqual(second.length, 1, 'expired inflight event is deterministically requeued then claimed');
assert.notStrictEqual(second[0].lease_token, first[0].lease_token, 'reclaimed event has a new lease token');
assert.strictEqual(outbox.ack(first[0].event_id, 'old-file', first[0].lease_token).ok, false, 'stale worker cannot ack a newer lease');
assert.strictEqual(outbox.ack(second[0].event_id, 'new-file', second[0].lease_token).ok, true, 'current lease owner can ack event');
console.log('PASS remediation:sync-outbox-lease');
