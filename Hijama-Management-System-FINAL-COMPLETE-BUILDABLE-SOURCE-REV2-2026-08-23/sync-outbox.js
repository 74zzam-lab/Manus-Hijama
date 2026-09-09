'use strict';

/**
 * Durable SQLite Outbox / Inbox / Conflict helpers (V2-4).
 * Main-process and Node test harness use this module directly.
 */
const crypto = require('crypto');
const idempotencyKeys = require('./idempotency-keys');
const conflictKeys = require('./conflict-keys');
const { runWithSqliteBusyRetry } = require('./sqlite-busy-retry');

function nowIso() {
  return new Date().toISOString();
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function uuid() {
  return crypto.randomUUID();
}

function createSyncPlatform(db) {
  if (!db) throw new Error('createSyncPlatform requires better-sqlite3 db');

  const insertOutbox = db.prepare(`
    INSERT INTO sync_outbox (
      event_id, center_id, branch_id, table_name, record_id, operation,
      base_revision, new_revision, payload_json, payload_hash, device_id, actor_id,
      created_at, attempt_count, next_attempt_at, status, idempotency_key, last_error
    ) VALUES (
      @event_id, @center_id, @branch_id, @table_name, @record_id, @operation,
      @base_revision, @new_revision, @payload_json, @payload_hash, @device_id, @actor_id,
      @created_at, 0, @next_attempt_at, 'pending', @idempotency_key, NULL
    )
    ON CONFLICT(idempotency_key) DO NOTHING
  `);

  const listPending = db.prepare(`
    SELECT * FROM sync_outbox
    WHERE status = 'pending'
      AND (
        @ignoreBackoff = 1
        OR next_attempt_at IS NULL
        OR next_attempt_at <= @now
      )
      AND (@branchId IS NULL OR branch_id = @branchId)
    ORDER BY created_at ASC
    LIMIT @limit
  `);

  const recoverExpiredInflight = db.prepare(`
    UPDATE sync_outbox
    SET status='pending', lease_token=NULL, lease_expires_at=NULL,
        claimed_at=NULL, next_attempt_at=?, last_error='lease_expired_requeued'
    WHERE status='inflight' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
  `);

  const markInflight = db.prepare(`
    UPDATE sync_outbox
    SET status='inflight', attempt_count=attempt_count+1, last_error=NULL,
        lease_token=@leaseToken, lease_expires_at=@leaseExpiresAt, claimed_at=@claimedAt
    WHERE event_id=@eventId AND status='pending'
  `);

  const markAcked = db.prepare(`
    UPDATE sync_outbox
    SET status='acked', acked_at=@ackedAt, remote_file_id=@remoteFileId, last_error=NULL,
        lease_token=NULL, lease_expires_at=NULL
    WHERE event_id=@eventId AND status='inflight' AND lease_token=@leaseToken
  `);

  const markFailed = db.prepare(`
    UPDATE sync_outbox
    SET status=CASE WHEN attempt_count >= @maxAttempts THEN 'dead-letter' ELSE 'pending' END,
        next_attempt_at=@next,
        last_error=@err,
        lease_token=NULL,
        lease_expires_at=NULL,
        claimed_at=NULL
    WHERE event_id=@id AND status='inflight' AND lease_token=@leaseToken
  `);

  const insertApplied = db.prepare(`
    INSERT INTO sync_inbox_applied (
      apply_id, center_id, branch_id, table_name, remote_revision,
      remote_file_id, payload_hash, source_device_id, applied_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(center_id, branch_id, table_name, remote_revision, payload_hash) DO NOTHING
  `);

  const wasApplied = db.prepare(`
    SELECT 1 AS ok FROM sync_inbox_applied
    WHERE center_id=? AND branch_id=? AND table_name=? AND remote_revision=? AND payload_hash=?
  `);

  const insertConflict = db.prepare(`
    INSERT INTO sync_conflicts (
      conflict_id, center_id, branch_id, table_name, record_id, base_revision,
      local_json, remote_json, base_json, status, created_at, device_id, actor_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    ON CONFLICT(conflict_id) DO UPDATE SET
      local_json=excluded.local_json,
      remote_json=excluded.remote_json,
      base_json=excluded.base_json,
      status='open',
      device_id=excluded.device_id,
      actor_id=excluded.actor_id
  `);

  const resolveConflict = db.prepare(`
    UPDATE sync_conflicts
    SET status='resolved', resolution=?, resolved_revision=?, resolved_at=?, actor_id=?
    WHERE conflict_id=? AND status='open'
  `);

  const insertAudit = db.prepare(`
    INSERT INTO sync_audit (
      event_id, timestamp_utc, center_id, branch_id, device_id, actor_id,
      action, entity, entity_id, result, correlation_id, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const setMeta = db.prepare(`
    INSERT INTO sync_meta(key, value, updated_at) VALUES(?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `);

  const getMeta = db.prepare(`SELECT value FROM sync_meta WHERE key=?`);

  function enqueue(entry) {
    const payloadJson = entry.payload_json != null
      ? (typeof entry.payload_json === 'string' ? entry.payload_json : JSON.stringify(entry.payload_json))
      : null;
    const payloadHash = entry.payload_hash || (payloadJson ? sha256(payloadJson) : null);
    const eventId = entry.event_id || uuid();
    const idempotencyKey = idempotencyKeys.buildOutboxIdempotencyKey({
      ...entry,
      payload_hash: payloadHash,
      payload_json: payloadJson,
    });

    const row = {
      event_id: eventId,
      center_id: String(entry.center_id || ''),
      branch_id: String(entry.branch_id || 'BR-MAIN'),
      table_name: String(entry.table_name || ''),
      record_id: entry.record_id != null ? String(entry.record_id) : null,
      operation: entry.operation || 'TABLE_BUMP',
      base_revision: Number(entry.base_revision || 0),
      new_revision: Number(entry.new_revision || 0),
      payload_json: payloadJson,
      payload_hash: payloadHash,
      device_id: String(entry.device_id || 'unknown-device'),
      actor_id: entry.actor_id != null ? String(entry.actor_id) : null,
      created_at: entry.created_at || nowIso(),
      next_attempt_at: entry.next_attempt_at || nowIso(),
      idempotency_key: idempotencyKey,
    };
    if (!row.center_id) throw new Error('outbox_center_id_required');
    if (!row.table_name) throw new Error('outbox_table_required');

    const info = insertOutbox.run(row);
    return {
      ok: true,
      eventId,
      idempotencyKey,
      inserted: info.changes > 0,
    };
  }

  /**
   * Atomically persist a business side-effect callback + outbox event.
   * `mutateFn` receives the db and must not commit its own outer transaction.
   */
  function enqueueAtomic(entry, mutateFn) {
    return runWithSqliteBusyRetry(() => {
      const tx = db.transaction(() => {
        if (typeof mutateFn === 'function') mutateFn(db);
        return enqueue(entry);
      });
      return tx();
    });
  }

  /**
   * Phase 2 — multiple mutations + optional outbox events in one SQLite transaction.
   * On failure the entire bundle rolls back (no partial table/kv/outbox state).
   */
  function enqueueAtomicBundle(mutateFn, entries) {
    try {
      return runWithSqliteBusyRetry(() => {
        const tx = db.transaction(() => {
          if (typeof mutateFn === 'function') mutateFn();
          const results = [];
          for (const entry of entries || []) {
            results.push(enqueue(entry));
          }
          return { ok: true, results };
        });
        return tx();
      });
    } catch (err) {
      return { ok: false, error: err.code || 'bundle_atomic_failed', message: err.message };
    }
  }

  function persistAtomic(mutateFn) {
    try {
      return runWithSqliteBusyRetry(() => {
        const tx = db.transaction(() => {
          if (typeof mutateFn === 'function') mutateFn();
          return { ok: true };
        });
        return tx();
      });
    } catch (err) {
      return { ok: false, error: err.code || 'persist_atomic_failed', message: err.message };
    }
  }

  function claimPending(options = {}) {
    const limit = Math.min(500, Number(options.limit || 50));
    const branchId = options.branch_id || null;
    const leaseMs = Math.min(15 * 60 * 1000, Math.max(10 * 1000, Number(options.leaseMs) || 2 * 60 * 1000));
    const claimed = [];
    // Select and compare-and-swap execute under one SQLite write transaction. A second
    // worker observes zero changes once the first worker has moved a row to inflight.
    const tx = db.transaction(() => {
      const claimedAt = nowIso();
      recoverExpiredInflight.run(claimedAt, claimedAt);
      const rows = listPending.all({
        ignoreBackoff: options.ignoreBackoff ? 1 : 0,
        now: claimedAt,
        branchId,
        limit,
      });
      for (const row of rows) {
        const leaseToken = uuid();
        const leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
        const r = markInflight.run({ eventId: row.event_id, leaseToken, leaseExpiresAt, claimedAt });
        if (r.changes === 1) claimed.push({ ...row, status: 'inflight', lease_token: leaseToken, lease_expires_at: leaseExpiresAt, claimed_at: claimedAt });
      }
    });
    tx();
    return claimed;
  }

  function ack(eventId, remoteFileId, leaseToken) {
    if (!leaseToken) return { ok: false, error: 'outbox_lease_required' };
    const info = markAcked.run({
      ackedAt: nowIso(),
      remoteFileId: remoteFileId || null,
      eventId: String(eventId || ''),
      leaseToken: String(leaseToken),
    });
    return { ok: info.changes === 1, error: info.changes === 1 ? null : 'outbox_lease_lost' };
  }

  function fail(eventId, err, options = {}) {
    const maxAttempts = Number(options.maxAttempts || 8);
    const attemptRow = db.prepare('SELECT attempt_count FROM sync_outbox WHERE event_id=?').get(eventId);
    const attempts = Number(attemptRow?.attempt_count || 1);
    const backoffMs = Math.min(
      300000,
      Math.round((Math.pow(2, Math.min(8, attempts)) * 1000) * (0.5 + Math.random()))
    );
    const next = new Date(Date.now() + backoffMs).toISOString();
    const leaseToken = String(options.leaseToken || '');
    if (!leaseToken) return { ok: false, error: 'outbox_lease_required' };
    const info = markFailed.run({
      id: eventId,
      maxAttempts,
      next,
      err: String(err || 'push_failed').slice(0, 2000),
      leaseToken,
    });
    return {
      ok: info.changes === 1,
      error: info.changes === 1 ? null : 'outbox_lease_lost',
      nextAttemptAt: next,
      backoffMs,
    };
  }

  function listDeadLetters(options = {}) {
    const limit = Math.min(500, Number(options.limit || 100));
    const branchId = options.branch_id || null;
    const rows = branchId
      ? db.prepare(
        `SELECT * FROM sync_outbox WHERE status='dead-letter' AND branch_id=? ORDER BY created_at DESC LIMIT ?`
      ).all(branchId, limit)
      : db.prepare(
        `SELECT * FROM sync_outbox WHERE status='dead-letter' ORDER BY created_at DESC LIMIT ?`
      ).all(limit);
    return rows;
  }

  function requeueDeadLetter(eventId) {
    const id = String(eventId || '');
    if (!id) return { ok: false, error: 'event_id_required' };
    const info = db.prepare(
      `UPDATE sync_outbox
       SET status='pending', next_attempt_at=?, last_error=NULL, attempt_count=0
       WHERE event_id=? AND status='dead-letter'`
    ).run(nowIso(), id);
    return { ok: info.changes > 0, requeued: info.changes > 0, eventId: id };
  }

  function requeueDeadLetters(options = {}) {
    const rows = listDeadLetters(options);
    let requeued = 0;
    for (const row of rows) {
      const r = requeueDeadLetter(row.event_id);
      if (r.requeued) requeued += 1;
    }
    return { ok: true, requeued, total: rows.length };
  }

  function countByStatus(branchId) {
    const rows = branchId
      ? db.prepare('SELECT status, COUNT(*) AS c FROM sync_outbox WHERE branch_id=? GROUP BY status').all(branchId)
      : db.prepare('SELECT status, COUNT(*) AS c FROM sync_outbox GROUP BY status').all();
    const out = { pending: 0, inflight: 0, sent: 0, 'dead-letter': 0, acked: 0, total: 0 };
    for (const r of rows) {
      out[r.status] = r.c;
      out.total += r.c;
    }
    return out;
  }

  function markRemoteApplied(entry) {
    const payloadHash = entry.payload_hash || sha256(entry.payload_json || '');
    const existing = wasApplied.get(
      entry.center_id,
      entry.branch_id,
      entry.table_name,
      Number(entry.remote_revision || 0),
      payloadHash
    );
    if (existing) return { ok: true, duplicate: true };
    insertApplied.run(
      entry.apply_id || uuid(),
      entry.center_id,
      entry.branch_id,
      entry.table_name,
      Number(entry.remote_revision || 0),
      entry.remote_file_id || null,
      payloadHash,
      entry.source_device_id || null,
      nowIso()
    );
    return { ok: true, duplicate: false };
  }

  function openConflict(entry) {
    let conflictId = entry.conflict_id || null;
    if (!conflictId) {
      try {
        conflictId = conflictKeys.buildConflictId(entry);
      } catch {
        conflictId = uuid();
      }
    }
    const info = insertConflict.run(
      conflictId,
      entry.center_id,
      entry.branch_id,
      entry.table_name,
      String(entry.record_id),
      entry.base_revision != null ? Number(entry.base_revision) : null,
      typeof entry.local_json === 'string' ? entry.local_json : JSON.stringify(entry.local_json || {}),
      typeof entry.remote_json === 'string' ? entry.remote_json : JSON.stringify(entry.remote_json || {}),
      entry.base_json == null
        ? null
        : typeof entry.base_json === 'string'
          ? entry.base_json
          : JSON.stringify(entry.base_json),
      nowIso(),
      entry.device_id || null,
      entry.actor_id || null
    );
    return { ok: true, conflictId, upserted: info.changes > 0 };
  }

  function resolveConflictById(conflictId, resolution, resolvedRevision, actorId) {
    const info = resolveConflict.run(
      resolution,
      resolvedRevision != null ? Number(resolvedRevision) : null,
      nowIso(),
      actorId || null,
      conflictId
    );
    return { ok: info.changes > 0 };
  }

  function listOpenConflicts(options) {
    options = options || {};
    let sql = `SELECT * FROM sync_conflicts WHERE status = 'open'`;
    const params = [];
    if (options.branchId) {
      sql += ` AND branch_id = ?`;
      params.push(String(options.branchId));
    }
    if (options.table) {
      sql += ` AND table_name = ?`;
      params.push(String(options.table));
    }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(Math.min(Number(options.limit) || 200, 500));
    return db.prepare(sql).all(...params);
  }

  function audit(entry) {
    insertAudit.run(
      entry.event_id || uuid(),
      entry.timestamp_utc || nowIso(),
      entry.center_id || null,
      entry.branch_id || null,
      entry.device_id || null,
      entry.actor_id || null,
      entry.action,
      entry.entity || null,
      entry.entity_id || null,
      entry.result || null,
      entry.correlation_id || null,
      entry.metadata_json
        ? typeof entry.metadata_json === 'string'
          ? entry.metadata_json
          : JSON.stringify(entry.metadata_json)
        : null
    );
    return { ok: true };
  }

  function metaSet(key, value) {
    setMeta.run(String(key), String(value), nowIso());
  }

  function metaGet(key, def = null) {
    const row = getMeta.get(String(key));
    return row ? row.value : def;
  }

  return {
    enqueue,
    enqueueAtomic,
    enqueueAtomicBundle,
    persistAtomic,
    claimPending,
    ack,
    fail,
    countByStatus,
    listDeadLetters,
    requeueDeadLetter,
    requeueDeadLetters,
    markRemoteApplied,
    openConflict,
    resolveConflictById,
    listOpenConflicts,
    audit,
    metaSet,
    metaGet,
    sha256,
    uuid,
  };
}

module.exports = {
  createSyncPlatform,
  sha256,
  uuid,
  nowIso,
};
