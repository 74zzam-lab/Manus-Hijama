'use strict';

/**
 * Dual-device peer sync harness (V2-4).
 * Uses production SQLite outbox + a filesystem remote that mirrors Drive layout.
 * Google Drive adapter can replace FileRemote when OAuth tokens are available.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { openDatabase } = require('./connection');
const { createSyncPlatform } = require('./sync-outbox');
const pushGuards = require('./sync-push-guards');
const tombstonePolicy = require('./tombstone-policy');
const { classify } = require('./sync-error-classify');
const { createSyncBaseline } = require('./sync-baseline');
const { createSyncCoordinatorCore } = require('./sync-coordinator-core');

function sha256(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

class FileRemote {
  constructor(root) {
    this.root = root;
    ensureDir(root);
  }

  centerRoot(centerId) {
    return path.join(this.root, 'NajjarTech', 'centers', String(centerId));
  }

  branchDir(centerId, branchId) {
    return path.join(this.centerRoot(centerId), 'branches', String(branchId));
  }

  versionsPath(centerId, branchId) {
    return path.join(this.branchDir(centerId, branchId), 'versions.json');
  }

  tablePath(centerId, branchId, table) {
    return path.join(this.branchDir(centerId, branchId), 'operational', `${table}.json`);
  }

  quarantineDir(centerId, branchId) {
    return path.join(this.branchDir(centerId, branchId), 'quarantine');
  }

  attachmentPath(centerId, branchId, sha) {
    return path.join(this.branchDir(centerId, branchId), 'attachments', String(sha).toLowerCase());
  }

  readJson(file) {
    if (!fs.existsSync(file)) return null;
    const text = fs.readFileSync(file, 'utf8');
    try {
      return JSON.parse(text);
    } catch {
      const err = new Error('remote_corrupt_json');
      err.code = 'corrupt';
      err.remotePath = file;
      err.rawText = text;
      throw err;
    }
  }

  writeAtomic(file, obj) {
    ensureDir(path.dirname(file));
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    const body = JSON.stringify(obj, null, 2);
    fs.writeFileSync(tmp, body);
    const hash = sha256(body);
    const verify = sha256(fs.readFileSync(tmp));
    if (verify !== hash) throw new Error('remote_temp_checksum_mismatch');
    fs.renameSync(tmp, file);
    return { fileId: sha256(file + ':' + hash).slice(0, 32), hash, path: file };
  }

  quarantineCorrupt(centerId, branchId, remotePath, reason, rawText) {
    const qDir = this.quarantineDir(centerId, branchId);
    ensureDir(qDir);
    const base = path.basename(remotePath || 'unknown.json');
    const qPath = path.join(qDir, `${Date.now()}-${base}`);
    const body = typeof rawText === 'string' ? rawText : JSON.stringify({ reason: String(reason || 'corrupt') });
    fs.writeFileSync(qPath, body);
    if (remotePath && fs.existsSync(remotePath)) {
      try {
        fs.renameSync(remotePath, `${remotePath}.corrupt-${Date.now()}`);
      } catch {
        /* preserve */
      }
    }
    return { ok: true, quarantinePath: qPath, fileId: sha256(qPath).slice(0, 32) };
  }

  putAttachment(centerId, branchId, sha256Hex, buffer) {
    const dest = this.attachmentPath(centerId, branchId, sha256Hex);
    ensureDir(path.dirname(dest));
    const tmp = `${dest}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, dest);
    return { fileId: sha256(dest).slice(0, 32), path: dest, hash: sha256Hex };
  }

  getAttachment(centerId, branchId, sha256Hex) {
    const dest = this.attachmentPath(centerId, branchId, sha256Hex);
    if (!fs.existsSync(dest)) return null;
    return { buffer: fs.readFileSync(dest), path: dest };
  }

  getVersions(centerId, branchId) {
    const existing = this.readJson(this.versionsPath(centerId, branchId));
    if (existing && typeof existing === 'object') {
      existing.branches = existing.branches || {};
      existing.branches[branchId] = existing.branches[branchId] || {};
      if (existing.branches[branchId].databaseVersion == null && existing.databaseVersion != null) {
        existing.branches[branchId].databaseVersion = existing.databaseVersion;
      }
      return existing;
    }
    return {
      schemaVersion: 1,
      formatVersion: 1,
      centerId,
      branchId,
      databaseVersion: 0,
      branches: { [branchId]: { databaseVersion: 0 } },
      tables: {},
      updatedAt: null,
    };
  }

  getBranchDatabaseRevision(versions, branchId) {
    return Number(
      versions?.branches?.[branchId]?.databaseVersion
      ?? versions?.databaseVersion
      ?? 0
    );
  }

  getTableRevision(centerId, branchId, table) {
    const remoteTable = this.getTable(centerId, branchId, table);
    return Number(remoteTable?.revision || 0);
  }

  putTable(centerId, branchId, table, revision, records, deviceId, options = {}) {
    options = options || {};
    const versionsBefore = this.getVersions(centerId, branchId);
    const currentDbRev = this.getBranchDatabaseRevision(versionsBefore, branchId);
    const currentTableRev = this.getTableRevision(centerId, branchId, table);
    const expectedTableRevision = options.expectedTableRevision != null
      ? Number(options.expectedTableRevision)
      : null;

    if (expectedTableRevision != null && expectedTableRevision !== currentTableRev) {
      const err = new Error('remote_revision_mismatch');
      err.code = 'remote_revision_mismatch';
      err.expectedTableRevision = expectedTableRevision;
      err.actualTableRevision = currentTableRev;
      err.retry = true;
      throw err;
    }

    const putRev = Math.max(currentTableRev + 1, Number(revision || 0));
    const payload = {
      centerId,
      branchId,
      table,
      revision: putRev,
      deviceId,
      updatedAt: new Date().toISOString(),
      records,
      payloadHash: sha256(JSON.stringify(records)),
      operationId: options.operationId || null,
    };
    const written = this.writeAtomic(this.tablePath(centerId, branchId, table), payload);

    const versionsAfterRead = this.getVersions(centerId, branchId);
    const manifestExpected = options.expectedManifestRevision != null
      ? Number(options.expectedManifestRevision)
      : currentDbRev;
    const manifestActual = this.getBranchDatabaseRevision(versionsAfterRead, branchId);
    const manifestCas = pushGuards.evaluateManifestCasGuard({
      expectedManifestRevision: manifestExpected,
      actualManifestRevision: manifestActual,
    });
    if (!manifestCas.ok) {
      const err = new Error(manifestCas.code || 'manifest_revision_mismatch');
      err.code = manifestCas.code || 'manifest_revision_mismatch';
      err.retry = manifestCas.retry === true;
      throw err;
    }

    const nextDbRev = currentDbRev + 1;
    const nextVersions = { ...versionsAfterRead };
    nextVersions.tables = nextVersions.tables || {};
    nextVersions.tables[table] = {
      revision: putRev,
      checksum: payload.payloadHash,
      fileId: written.fileId,
      updatedAt: payload.updatedAt,
      lastWriter: deviceId,
      operationId: options.operationId || null,
    };
    nextVersions.branches = nextVersions.branches || {};
    nextVersions.branches[branchId] = nextVersions.branches[branchId] || {};
    nextVersions.branches[branchId].databaseVersion = nextDbRev;
    nextVersions.databaseVersion = Math.max(Number(nextVersions.databaseVersion || 0), nextDbRev);
    nextVersions.updatedAt = payload.updatedAt;
    nextVersions.writerDeviceId = deviceId;
    nextVersions.operationId = options.operationId || null;
    this.writeAtomic(this.versionsPath(centerId, branchId), nextVersions);
    return {
      ...written,
      payloadHash: payload.payloadHash,
      revision: putRev,
      databaseVersion: nextDbRev,
    };
  }

  verifyTableCommit(centerId, branchId, table, expected = {}) {
    const remoteTable = this.getTable(centerId, branchId, table);
    if (!remoteTable) {
      return { ok: false, code: 'remote_verify_missing_table' };
    }
    const versions = this.getVersions(centerId, branchId);
    const dbRev = this.getBranchDatabaseRevision(versions, branchId);
    if (expected.revision != null && Number(remoteTable.revision) !== Number(expected.revision)) {
      return {
        ok: false,
        code: 'remote_verify_revision_mismatch',
        expectedRevision: expected.revision,
        actualRevision: remoteTable.revision,
      };
    }
    if (expected.payloadHash && remoteTable.payloadHash !== expected.payloadHash) {
      return {
        ok: false,
        code: 'remote_verify_hash_mismatch',
        expectedHash: expected.payloadHash,
        actualHash: remoteTable.payloadHash,
      };
    }
    if (expected.databaseVersion != null && dbRev !== Number(expected.databaseVersion)) {
      return {
        ok: false,
        code: 'remote_verify_manifest_mismatch',
        expectedDatabaseVersion: expected.databaseVersion,
        actualDatabaseVersion: dbRev,
      };
    }
    return { ok: true, databaseVersion: dbRev, revision: remoteTable.revision };
  }

  getTable(centerId, branchId, table) {
    return this.readJson(this.tablePath(centerId, branchId, table));
  }
}

function createDevice(options) {
  const dir = options.userDataDir;
  ensureDir(path.join(dir, 'database'));
  const dbPath = path.join(dir, 'database', 'tadawi.db');
  const db = openDatabase(dbPath);
  const sync = createSyncPlatform(db);
  let deviceStatus = options.deviceStatus || 'approved';
  let baselineState = null;
  try {
    const raw = sync.metaGet('sync_baseline_state');
    if (raw) baselineState = JSON.parse(raw);
  } catch { /* start uninitialized */ }
  const baseline = createSyncBaseline({
    load: () => baselineState,
    save: (state) => {
      baselineState = state;
      try { sync.metaSet('sync_baseline_state', JSON.stringify(state)); } catch { /* ignore */ }
    },
  });
  const coordinator = createSyncCoordinatorCore();
  const state = {
    centerId: options.centerId,
    branchId: options.branchId || 'BR-MAIN',
    deviceId: options.deviceId,
    appVersion: options.appVersion || '2.4.0',
    tables: Object.create(null),
    revisions: Object.create(null),
  };

  function setDeviceStatus(status) {
    deviceStatus = String(status || 'approved');
  }

  function canSync() {
    if (typeof options.canSync === 'function') {
      return options.canSync({ deviceId: state.deviceId, status: deviceStatus });
    }
    if (deviceStatus === 'revoked') return { ok: false, error: 'device_revoked', status: deviceStatus };
    if (deviceStatus === 'pending') return { ok: false, error: 'device_pending_approval', status: deviceStatus };
    return { ok: true, status: deviceStatus };
  }

  try {
    const rows = db.prepare(`SELECT key, value FROM sync_meta WHERE key LIKE 'table:%' OR key LIKE 'rev:%'`).all();
    for (const row of rows) {
      if (row.key.startsWith('table:')) {
        const table = row.key.slice('table:'.length);
        try {
          state.tables[table] = JSON.parse(row.value);
        } catch {
          state.tables[table] = [];
        }
      } else if (row.key.startsWith('rev:')) {
        state.revisions[row.key.slice('rev:'.length)] = Number(row.value) || 0;
      }
    }
  } catch {
    /* fresh db */
  }

  function persistTableState(table) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO sync_meta(key, value, updated_at) VALUES(?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
    ).run(`table:${table}`, JSON.stringify(state.tables[table] || []), now);
    db.prepare(
      `INSERT INTO sync_meta(key, value, updated_at) VALUES(?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
    ).run(`rev:${table}`, String(state.revisions[table] || 0), now);
  }

  function getAll(table) {
    return Array.isArray(state.tables[table]) ? state.tables[table].slice() : [];
  }

  function setAll(table, records, actorId) {
    const list = Array.isArray(records) ? records.slice() : [];
    const base = Number(state.revisions[table] || 0);
    const next = base + 1;
    const payload = JSON.stringify(list);
    const result = sync.enqueueAtomic(
      {
        center_id: state.centerId,
        branch_id: state.branchId,
        table_name: table,
        record_id: null,
        operation: 'TABLE_BUMP',
        base_revision: base,
        new_revision: next,
        payload_json: payload,
        device_id: state.deviceId,
        actor_id: actorId || state.deviceId,
      },
      () => {
        state.tables[table] = list;
        state.revisions[table] = next;
        persistTableState(table);
      }
    );
    return { ok: true, revision: next, outbox: result };
  }

  function upsertRecord(table, record, actorId) {
    const list = getAll(table);
    const idx = list.findIndex((r) => r && r.id === record.id);
    if (idx >= 0) {
      const prev = list[idx];
      const block = tombstonePolicy.assertNotResurrecting(prev, record);
      if (block && !block.ok) return block;
    }
    const op = idx >= 0 ? 'UPDATE' : 'CREATE';
    if (idx >= 0) list[idx] = { ...list[idx], ...record, updatedAt: new Date().toISOString() };
    else list.push({ ...record, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const base = Number(state.revisions[table] || 0);
    const next = base + 1;
    sync.enqueueAtomic(
      {
        center_id: state.centerId,
        branch_id: state.branchId,
        table_name: table,
        record_id: record.id,
        operation: op,
        base_revision: base,
        new_revision: next,
        payload_json: JSON.stringify(list),
        device_id: state.deviceId,
        actor_id: actorId || state.deviceId,
      },
      () => {
        state.tables[table] = list;
        state.revisions[table] = next;
        persistTableState(table);
      }
    );
    return { ok: true, revision: next, operation: op };
  }

  function softDeleteRecord(table, recordId, actorId) {
    const list = getAll(table);
    const idx = list.findIndex((r) => r && r.id === recordId);
    if (idx < 0) return { ok: false, error: 'not_found' };
    list[idx] = tombstonePolicy.applyTombstone(list[idx], list[idx], { branchId: state.branchId });
    return setAll(table, list, actorId);
  }

  async function bootstrapFromRemote(remote, bootstrapOptions = {}) {
    baseline.markHydrating({
      organizationResolved: true,
      branchResolved: true,
    });
    const pullRes = await pull(remote);
    if (pullRes.blocked || pullRes.error) {
      return { ok: false, error: pullRes.error || pullRes.reason || 'bootstrap_pull_failed', pullRes };
    }
    const versions = await Promise.resolve(remote.getVersions(state.centerId, state.branchId));
    const remoteRevision = remote.getBranchDatabaseRevision(versions, state.branchId);
    const marked = baseline.markBaselineKnown({
      branchId: state.branchId,
      remoteRevision,
      integrityPass: bootstrapOptions.integrityPass !== false,
      organizationResolved: true,
      branchResolved: true,
      operationId: bootstrapOptions.operationId || null,
    });
    if (!marked.ok) return { ok: false, error: marked.code || 'baseline_mark_failed', pullRes };
    baseline.markReady({ operationId: bootstrapOptions.operationId || null });
    return { ok: true, remoteRevision, pullRes };
  }

  async function flush(remote, options = {}) {
    return coordinator.withMutex(async ({ operationId }) => {
      const gate = canSync();
      if (!gate.ok) {
        sync.audit({
          action: 'sync.push.blocked',
          center_id: state.centerId,
          branch_id: state.branchId,
          device_id: state.deviceId,
          result: 'blocked',
          metadata_json: { reason: gate.error || 'device_sync_blocked', operationId },
        });
        return [{ ok: false, blocked: true, reason: gate.error || 'device_sync_blocked' }];
      }

      const baselineGate = baseline.assertPushAllowed({ branchId: state.branchId, force: options.force === true });
      if (!baselineGate.ok) {
        return [{
          ok: false,
          blocked: true,
          reason: baselineGate.code || baselineGate.reason || 'baseline_push_blocked',
          operationId,
        }];
      }

      const claimed = sync.claimPending({
        branch_id: state.branchId,
        limit: 100,
        ignoreBackoff: !!options.ignoreBackoff,
      });
      const results = [];

      for (const row of claimed) {
        const rowResult = await coordinator.runWithBoundedRetry(async ({ attempt }) => {
          await pull(remote);
          const versions = await Promise.resolve(remote.getVersions(state.centerId, state.branchId));
          const remoteDbRev = remote.getBranchDatabaseRevision(versions, state.branchId);
          const baseRevision = Number(row.base_revision || 0);

          let records = row.payload_json ? JSON.parse(row.payload_json) : getAll(row.table_name);
          const remoteMeta = versions.tables?.[row.table_name];
          const remoteRev = Number(remoteMeta?.revision || 0);
          if (remoteMeta && remoteRev > Number(row.base_revision || 0)) {
            const remoteTable = await Promise.resolve(
              remote.getTable(state.centerId, state.branchId, row.table_name)
            );
            const remoteRecords = remoteTable?.records || [];
            let opened = 0;
            for (const localRec of records) {
              if (!localRec?.id) continue;
              const rr = remoteRecords.find((x) => x && x.id === localRec.id);
              if (!rr) continue;
              if (tombstonePolicy.recordsConflict(localRec, rr)) {
                sync.openConflict({
                  center_id: state.centerId,
                  branch_id: state.branchId,
                  table_name: row.table_name,
                  record_id: localRec.id,
                  base_revision: row.base_revision,
                  local_json: localRec,
                  remote_json: rr,
                  device_id: state.deviceId,
                });
                opened += 1;
              }
            }
            if (opened > 0) {
              sync.fail(row.event_id, 'conflict_detected_push', { maxAttempts: 99, leaseToken: row.lease_token });
              return { eventId: row.event_id, ok: false, conflict: true, opened, operationId };
            }
            const byId = new Map();
            for (const r of remoteRecords) {
              if (r?.id) byId.set(r.id, r);
            }
            for (const l of records) {
              if (l?.id) byId.set(l.id, l);
            }
            records = [...byId.values()];
            state.tables[row.table_name] = records;
            persistTableState(row.table_name);
          }

          const localRev = Number(state.revisions[row.table_name] || row.base_revision || 0);
          const pushGuard = pushGuards.evaluatePushGuard({
            localRevision: localRev,
            remoteRevision: remoteDbRev,
            recordCount: records.length,
          });
          if (!pushGuard.ok) {
            sync.fail(row.event_id, pushGuard.code, { maxAttempts: 99, leaseToken: row.lease_token });
            return {
              eventId: row.event_id,
              ok: false,
              blocked: true,
              reason: pushGuard.code,
              operationId,
            };
          }

          const remoteTableRev = remote.getTableRevision
            ? remote.getTableRevision(state.centerId, state.branchId, row.table_name)
            : Number((remote.getTable(state.centerId, state.branchId, row.table_name) || {}).revision || 0);
          const putRev = Math.max(localRev, remoteTableRev + 1);
          let put;
          try {
            put = await Promise.resolve(
              remote.putTable(
                state.centerId,
                state.branchId,
                row.table_name,
                putRev,
                records,
                state.deviceId,
                {
                  expectedTableRevision: remoteTableRev,
                  expectedManifestRevision: remoteDbRev,
                  operationId,
                }
              )
            );
          } catch (err) {
            if (err.retry === true || err.code === 'remote_revision_mismatch' || err.code === 'manifest_revision_mismatch') {
              sync.fail(row.event_id, err.code || err.message || 'push_retryable_failure', { leaseToken: row.lease_token });
              return {
                eventId: row.event_id,
                ok: false,
                reason: err.code || err.message,
                retry: true,
                attempt,
                operationId,
              };
            }
            sync.fail(row.event_id, err.message || String(err), { leaseToken: row.lease_token });
            return {
              eventId: row.event_id,
              ok: false,
              error: String(err.message || err),
              operationId,
            };
          }

          const verified = remote.verifyTableCommit(state.centerId, state.branchId, row.table_name, {
            revision: put.revision,
            payloadHash: put.payloadHash,
            databaseVersion: put.databaseVersion,
          });
          if (!verified.ok) {
            sync.fail(row.event_id, verified.code || 'remote_verify_failed', { maxAttempts: 99, leaseToken: row.lease_token });
            return {
              eventId: row.event_id,
              ok: false,
              reason: verified.code || 'remote_verify_failed',
              retry: true,
              attempt,
              operationId,
            };
          }

          state.revisions[row.table_name] = putRev;
          persistTableState(row.table_name);
          sync.ack(row.event_id, put.fileId, row.lease_token);
          baseline.updateBaselineAfterVerifiedPush(state.branchId, put.databaseVersion, operationId);
          sync.audit({
            action: 'sync.push.ack',
            center_id: state.centerId,
            branch_id: state.branchId,
            device_id: state.deviceId,
            entity: row.table_name,
            entity_id: row.record_id,
            result: 'ok',
            metadata_json: {
              remoteFileId: put.fileId,
              revision: putRev,
              databaseVersion: put.databaseVersion,
              operationId,
            },
          });
          return {
            eventId: row.event_id,
            ok: true,
            fileId: put.fileId,
            revision: putRev,
            databaseVersion: put.databaseVersion,
            operationId,
          };
        }, { operationId, maxAttempts: options.maxAttempts || 4 });

        results.push(rowResult);
      }

      return results;
    }, { operationId: options.operationId, prefix: 'flush' });
  }

  function openRecordConflict(table, lr, rr, baseRevision) {
    sync.openConflict({
      center_id: state.centerId,
      branch_id: state.branchId,
      table_name: table,
      record_id: lr.id,
      base_revision: baseRevision,
      local_json: lr,
      remote_json: rr,
      device_id: state.deviceId,
    });
  }

  function mergeRemoteTable(table, localRecords, remoteRecords, localTableRev, remoteTableRev) {
    const byId = new Map();
    for (const r of localRecords) {
      if (r?.id) byId.set(r.id, r);
    }
    let openedConflicts = 0;
    for (const rr of remoteRecords) {
      if (!rr?.id) continue;
      const lr = byId.get(rr.id);
      if (!lr) {
        byId.set(rr.id, rr);
        continue;
      }
      const tombDecision = tombstonePolicy.decideTombstone(lr, rr, table);
      if (tombDecision) {
        if (tombDecision.action === tombstonePolicy.ACTIONS.CONFLICT) {
          openRecordConflict(table, lr, rr, localTableRev);
          openedConflicts += 1;
          continue;
        }
        if (tombDecision.action === tombstonePolicy.ACTIONS.PULL) {
          byId.set(rr.id, tombDecision.tombstone || rr);
          continue;
        }
        if (tombDecision.action === tombstonePolicy.ACTIONS.PUSH) {
          continue;
        }
        if (tombDecision.action === tombstonePolicy.ACTIONS.SKIP) {
          byId.set(rr.id, lr);
          continue;
        }
      }
      if (JSON.stringify(lr) === JSON.stringify(rr)) {
        byId.set(rr.id, lr);
        continue;
      }
      const lrRev = Number(lr.revision) || 0;
      const rrRev = Number(rr.revision) || 0;
      if (rrRev > lrRev) {
        byId.set(rr.id, rr);
      } else if (lrRev > rrRev) {
        continue;
      } else if (remoteTableRev >= localTableRev) {
        // Table-level pull advanced — remote payload authoritative on tie/missing record revision
        byId.set(rr.id, rr);
      } else {
        openRecordConflict(table, lr, rr, localTableRev);
        openedConflicts += 1;
      }
    }
    for (const lr of localRecords) {
      if (lr?.id && !byId.has(lr.id)) byId.set(lr.id, lr);
    }
    return { merged: [...byId.values()], openedConflicts };
  }

  async function pull(remote) {
    const gate = canSync();
    if (!gate.ok) {
      sync.audit({
        action: 'sync.pull.blocked',
        center_id: state.centerId,
        branch_id: state.branchId,
        device_id: state.deviceId,
        result: 'blocked',
        metadata_json: { reason: gate.error || 'device_sync_blocked' },
      });
      return { versions: null, applied: [], blocked: true, reason: gate.error || 'device_sync_blocked' };
    }
    let versions;
    try {
      versions = await Promise.resolve(remote.getVersions(state.centerId, state.branchId));
    } catch (err) {
      const classified = classify(err);
      if (classified.category === 'remote_corrupt' && typeof remote.quarantineCorrupt === 'function') {
        await Promise.resolve(
          remote.quarantineCorrupt(
            state.centerId,
            state.branchId,
            remote.versionsPath?.(state.centerId, state.branchId) || 'versions.json',
            err.message,
            err.rawText
          )
        );
      }
      return {
        versions: null,
        applied: [],
        error: String(err.message || err),
        classified,
        quarantined: classified.category === 'remote_corrupt',
      };
    }
    const applied = [];
    for (const [table, meta] of Object.entries(versions.tables || {})) {
      const localRev = Number(state.revisions[table] || 0);
      const remoteRev = Number(meta.revision || 0);
      if (remoteRev < localRev) continue;
      let remoteTable;
      try {
        remoteTable = await Promise.resolve(remote.getTable(state.centerId, state.branchId, table));
      } catch (err) {
        const classified = classify(err);
        if (classified.category === 'remote_corrupt' && typeof remote.quarantineCorrupt === 'function') {
          await Promise.resolve(
            remote.quarantineCorrupt(
              state.centerId,
              state.branchId,
              remote.tablePath?.(state.centerId, state.branchId, table) || `${table}.json`,
              err.message,
              err.rawText
            )
          );
          applied.push({ table, error: 'quarantined_corrupt', classified });
          continue;
        }
        throw err;
      }
      if (!remoteTable) continue;
      const payloadHash = remoteTable.payloadHash || sha256(JSON.stringify(remoteTable.records || []));
      const marked = sync.markRemoteApplied({
        center_id: state.centerId,
        branch_id: state.branchId,
        table_name: table,
        remote_revision: remoteRev,
        remote_file_id: meta.fileId,
        payload_hash: payloadHash,
        source_device_id: remoteTable.deviceId,
      });
      if (marked.duplicate) continue;

      const localRecords = getAll(table);
      const remoteRecords = remoteTable.records || [];
      const { merged, openedConflicts } = mergeRemoteTable(table, localRecords, remoteRecords, localRev, remoteRev);
      state.tables[table] = merged;
      state.revisions[table] = remoteRev;
      persistTableState(table);
      applied.push({ table, revision: remoteRev, duplicate: false, openedConflicts });
      sync.audit({
        action: 'sync.pull.apply',
        center_id: state.centerId,
        branch_id: state.branchId,
        device_id: state.deviceId,
        entity: table,
        result: 'ok',
        metadata_json: { revision: remoteRev },
      });
    }
    return { versions, applied, remoteDatabaseRevision: remote.getBranchDatabaseRevision(versions, state.branchId) };
  }

  function getBaseline() {
    return baseline;
  }

  function getCoordinator() {
    return coordinator;
  }

  function close() {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }

  return {
    db,
    sync,
    state,
    getAll,
    setAll,
    upsertRecord,
    softDeleteRecord,
    flush,
    pull,
    bootstrapFromRemote,
    close,
    dbPath,
    canSync,
    setDeviceStatus,
    getBaseline,
    getCoordinator,
  };
}

module.exports = {
  FileRemote,
  createDevice,
  sha256,
};
