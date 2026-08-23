'use strict';

/**
 * PR9 — Atomic Restore validation gates with explicit failure stages.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { writeFileAtomicSync } = require('./atomic-file');

const STAGES = Object.freeze({
  VALIDATION: 'validation',
  STAGING: 'staging',
  INTEGRITY: 'integrity',
  SNAPSHOT: 'snapshot',
  SWAP: 'swap',
  REOPEN: 'reopen',
  HYDRATE: 'hydrate',
  RECONCILIATION: 'reconciliation',
});

function restoreError(code, message, stage, details = {}) {
  const err = new Error(message || code);
  err.code = code;
  err.stage = stage || STAGES.VALIDATION;
  err.details = details;
  return err;
}

function throwRestore(code, message, stage, details) {
  throw restoreError(code, message, stage, details);
}

function normalizeId(value) {
  return String(value || '').trim().slice(0, 128);
}

function uniqueIds(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list || []) {
    const id = normalizeId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function safeRemove(target, expectedParent) {
  const resolved = path.resolve(target);
  const parent = path.resolve(expectedParent);
  if (resolved === parent || !resolved.startsWith(parent + path.sep)) throw new Error('unsafe_cleanup_target');
  if (fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true });
}

/**
 * Idempotent retry: block concurrent/in-flight restore; allow retry after rollback.
 */
function assertIdempotentRestoreAllowed(gateState, backupId, options = {}) {
  if (options.forceRetry === true) return { ok: true, forced: true };
  const gate = gateState || {};
  if (gate.pending === true) {
    throwRestore(
      'restore_already_in_progress',
      'restore_already_in_progress',
      STAGES.VALIDATION,
      { backupId: gate.backupId || null }
    );
  }
  if (gate.verified === true && gate.backupId && backupId && gate.backupId === backupId && !gate.failed) {
    return { ok: true, idempotent: true, alreadyVerified: true };
  }
  return { ok: true };
}

/**
 * Restore-time scopeTruth gate (distinct from backup-create readiness).
 */
function assertRestoreScopeTruthAllowed(manifest, expected = {}) {
  const scopeTruth = manifest?.scopeTruth || null;
  const scope = manifest?.scope || {};
  const includedBranchIds = uniqueIds(
    scopeTruth?.includedBranchIds || scope.includedBranchIds || scope.branchIds || []
  );
  const classification = String(
    scopeTruth?.classification || scope.classification || scope.type || 'branch'
  ).toLowerCase();

  const licensedBranchIds = uniqueIds(expected.licensedBranchIds || []);
  const authorizedBranchIds = uniqueIds(
    expected.authorizedBranchIds || (expected.branchId ? [expected.branchId] : [])
  );

  if (expected.skipScopeTruth === true) {
    return { ok: true, skipped: true };
  }

  if (!scopeTruth && expected.requireScopeTruth === true) {
    throwRestore('restore_scope_truth_missing', 'restore_scope_truth_missing', STAGES.VALIDATION);
  }

  if (scopeTruth && scopeTruth.readiness && scopeTruth.readiness.ok === false && classification === 'organization') {
    throwRestore(
      'restore_scope_truth_not_ready',
      'restore_scope_truth_not_ready',
      STAGES.VALIDATION,
      { readiness: scopeTruth.readiness }
    );
  }

  if (includedBranchIds.length && authorizedBranchIds.length) {
    const allowed = new Set(authorizedBranchIds);
    const unauthorized = includedBranchIds.filter((id) => !allowed.has(id) && !licensedBranchIds.includes(id));
    if (unauthorized.length && licensedBranchIds.length) {
      const bad = unauthorized.filter((id) => !licensedBranchIds.includes(id));
      if (bad.length) {
        throwRestore(
          'restore_branch_scope_mismatch',
          'restore_branch_scope_mismatch',
          STAGES.VALIDATION,
          { unauthorized: bad, includedBranchIds, authorizedBranchIds }
        );
      }
    }
  }

  return {
    ok: true,
    classification,
    includedBranchIds,
    attachmentsCount: scopeTruth?.attachmentsCount ?? null,
  };
}

function listAttachmentFiles(attachmentsDir) {
  const root = path.resolve(attachmentsDir || '');
  if (!root || !fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const ent of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile()) out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  return out;
}

function validateStagedAttachments(stageRoot, manifest, options = {}) {
  const attachmentsDir = path.join(stageRoot, 'attachments');
  const filesOnDisk = new Set(listAttachmentFiles(attachmentsDir));
  const scopeTruth = manifest?.scopeTruth || {};
  const expectedCount = scopeTruth.attachmentsCount;

  if (Number.isFinite(Number(expectedCount)) && Number(expectedCount) >= 0) {
    const actual = filesOnDisk.size;
    if (actual < Number(expectedCount)) {
      throwRestore(
        'restore_attachments_missing',
        'restore_attachments_missing',
        STAGES.STAGING,
        { expectedCount: Number(expectedCount), actualCount: actual }
      );
    }
  }

  const dbPath = path.join(stageRoot, 'database', 'tadawi.db');
  if (!fs.existsSync(dbPath)) return { ok: true, skipped: true, reason: 'no_db' };

  let db;
  const missingPaths = [];
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 5000 });
    let rows = [];
    try {
      rows = db.prepare(`SELECT path FROM attachments WHERE path IS NOT NULL AND path != ''`).all();
    } catch {
      /* attachments table optional on legacy */
    }
    for (const row of rows) {
      const rel = String(row.path || '').replace(/^attachments\//, '').replace(/\\/g, '/');
      if (!rel) continue;
      if (!filesOnDisk.has(rel) && !filesOnDisk.has(`attachments/${rel}`)) {
        missingPaths.push(rel);
        if (missingPaths.length >= (options.maxMissingAttachmentRefs || 20)) break;
      }
    }
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }

  if (missingPaths.length && options.allowMissingAttachmentRefs !== true) {
    throwRestore(
      'restore_attachment_reference_missing',
      'restore_attachment_reference_missing',
      STAGES.STAGING,
      { missingPaths, count: missingPaths.length }
    );
  }

  return { ok: true, filesOnDisk: filesOnDisk.size, missingPaths };
}

function parseUserRole(payloadJson) {
  try {
    const obj = JSON.parse(payloadJson || '{}');
    return String(obj.role || '').toLowerCase();
  } catch {
    return '';
  }
}

function validateStagedSemanticInvariants(databasePath, options = {}) {
  const allowedBranchIds = uniqueIds(options.allowedBranchIds || options.includedBranchIds || []);
  const allowLegacyBranchless = options.allowLegacyBranchless !== false;

  let db;
  let ownerCount = 0;
  let hqCount = 0;
  const violations = [];
  try {
    db = new Database(databasePath, { readonly: true, fileMustExist: true, timeout: 5000 });

    try {
      const users = db.prepare(`SELECT id, role, payload_json FROM users`).all();
      const ids = new Set();
      for (const u of users) {
        if (ids.has(u.id)) {
          violations.push({ code: 'duplicate_user_id', id: u.id });
        }
        ids.add(u.id);
        const role = String(u.role || '').toLowerCase() || parseUserRole(u.payload_json);
        if (role === 'owner') ownerCount += 1;
        if (role === 'hq_admin') hqCount += 1;
      }
    } catch {
      /* users table optional */
    }

    if (ownerCount > 1) {
      violations.push({ code: 'owner_count_invalid', ownerCount });
    }

    const branchCheckTables = [
      { table: 'clients', col: 'branch_id' },
      { table: 'visits', col: 'branch_id' },
      { table: 'appointments', col: 'branch_id' },
    ];
    if (allowedBranchIds.length) {
      const allowed = new Set(allowedBranchIds);
      for (const spec of branchCheckTables) {
        try {
          const rows = db.prepare(
            `SELECT DISTINCT ${spec.col} AS branchId FROM ${spec.table} WHERE ${spec.col} IS NOT NULL AND ${spec.col} != ''`
          ).all();
          for (const row of rows) {
            const bid = normalizeId(row.branchId);
            if (bid && !allowed.has(bid)) {
              violations.push({ code: 'branch_id_invalid', table: spec.table, branchId: bid });
            }
          }
        } catch {
          /* table may not exist */
        }
      }
    }

    try {
      const orphanVisits = db.prepare(
        `SELECT v.id FROM visits v LEFT JOIN clients c ON c.id = v.client_id WHERE v.client_id IS NOT NULL AND v.client_id != '' AND c.id IS NULL LIMIT 5`
      ).all();
      if (orphanVisits.length) {
        violations.push({ code: 'orphan_visit_client', count: orphanVisits.length, sample: orphanVisits.map((r) => r.id) });
      }
    } catch {
      /* ignore */
    }

    if (!allowLegacyBranchless && allowedBranchIds.length === 1) {
      const bid = allowedBranchIds[0];
      try {
        const missingBranchClients = db.prepare(
          `SELECT COUNT(*) AS c FROM clients WHERE branch_id IS NULL OR branch_id = ''`
        ).get();
        if (Number(missingBranchClients?.c || 0) > 0) {
          violations.push({ code: 'legacy_branch_unresolved', table: 'clients', count: missingBranchClients.c, expectedBranch: bid });
        }
      } catch { /* ignore */ }
    }
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }

  if (violations.length) {
    throwRestore(
      'restore_semantic_invariant_failed',
      'restore_semantic_invariant_failed',
      STAGES.INTEGRITY,
      { violations, ownerCount, hqCount }
    );
  }

  return { ok: true, ownerCount, hqCount };
}

function assertSafetySnapshotOk(emergencyResult, options = {}) {
  if (options.skipEmergencyBackup === true || options.skipSafetySnapshot === true) {
    return { ok: true, skipped: true };
  }
  if (!emergencyResult) {
    throwRestore('restore_safety_snapshot_failed', 'restore_safety_snapshot_failed', STAGES.SNAPSHOT);
  }
  if (emergencyResult.skipped === true && emergencyResult.reason === 'no_live_database') {
    return { ok: true, skipped: true, reason: 'no_live_database' };
  }
  if (emergencyResult.ok !== true && !emergencyResult.path) {
    throwRestore(
      'restore_safety_snapshot_failed',
      emergencyResult.error || 'restore_safety_snapshot_failed',
      STAGES.SNAPSHOT,
      { emergency: emergencyResult }
    );
  }
  return { ok: true, path: emergencyResult.path || null };
}

/**
 * Fast safety copy of production database directory after closeDatabase().
 */
function createSafetyDatabaseCopy(userDataDir, options = {}) {
  const srcDb = path.join(userDataDir, 'database', 'tadawi.db');
  if (!fs.existsSync(srcDb)) {
    return { ok: true, skipped: true, reason: 'no_live_database' };
  }
  const stamp = (options.now || new Date()).toISOString().replace(/[:.]/g, '-');
  const safetyRoot = path.join(userDataDir, `.restore-v2-safety-${stamp}-${process.pid}`);
  const destDb = path.join(safetyRoot, 'tadawi.db');
  fs.mkdirSync(safetyRoot, { recursive: true });
  try {
    fs.copyFileSync(srcDb, destDb, fs.constants.COPYFILE_EXCL);
    const wal = `${srcDb}-wal`;
    const shm = `${srcDb}-shm`;
    if (fs.existsSync(wal)) fs.copyFileSync(wal, path.join(safetyRoot, 'tadawi.db-wal'));
    if (fs.existsSync(shm)) fs.copyFileSync(shm, path.join(safetyRoot, 'tadawi.db-shm'));
    const meta = {
      at: new Date().toISOString(),
      source: srcDb,
      safetyRoot,
      size: fs.statSync(destDb).size,
    };
    writeFileAtomicSync(path.join(safetyRoot, 'safety-meta.json'), `${JSON.stringify(meta, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    return { ok: true, safetyRoot, path: destDb, meta };
  } catch (error) {
    try { safeRemove(safetyRoot, userDataDir); } catch { /* ignore */ }
    throwRestore(
      'restore_safety_snapshot_failed',
      error.code === 'ENOSPC' ? 'backup_disk_space_insufficient' : (error.message || 'restore_safety_snapshot_failed'),
      STAGES.SNAPSHOT,
      { code: error.code || null }
    );
  }
}

/**
 * Recover from interrupted restore on startup (crash during swap).
 */
function recoverInterruptedRestore(userDataDir, options = {}) {
  const gatePath = path.join(userDataDir, 'settings', 'restore-v2-gate.json');
  if (!fs.existsSync(gatePath)) return { ok: true, action: 'none' };

  let gate;
  try {
    gate = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
  } catch {
    return { ok: false, action: 'gate_corrupt', error: 'restore_gate_corrupt' };
  }

  if (gate.pending !== true) {
    return { ok: true, action: 'none', gate };
  }

  const rollbackDirs = fs.readdirSync(userDataDir)
    .filter((name) => name.startsWith('.restore-v2-rollback-'))
    .map((name) => path.join(userDataDir, name))
    .filter((p) => fs.existsSync(p))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  const rollbackRoot = rollbackDirs[0];
  if (!rollbackRoot) {
    writeFileAtomicSync(gatePath, `${JSON.stringify({
      ...gate,
      pending: false,
      verified: false,
      failed: true,
      error: 'restore_interrupted_no_rollback',
      recoveredAt: new Date().toISOString(),
    }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    return { ok: false, action: 'interrupted_no_rollback', error: 'restore_interrupted_no_rollback' };
  }

  const RESTORE_ROOTS = options.restoreRoots || ['database', 'attachments', 'settings', 'center-assets'];
  const swapped = [];
  for (const root of RESTORE_ROOTS) {
    const live = path.join(userDataDir, root);
    const previous = path.join(rollbackRoot, root);
    if (fs.existsSync(previous)) {
      if (fs.existsSync(live)) safeRemove(live, userDataDir);
      fs.renameSync(previous, live);
      swapped.push(root);
    }
  }

  writeFileAtomicSync(gatePath, `${JSON.stringify({
    ...gate,
    pending: false,
    verified: false,
    failed: true,
    rolledBack: true,
    recoveredAt: new Date().toISOString(),
    error: 'restore_interrupted_recovered',
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

  return { ok: true, action: 'rolled_back', swapped, rollbackRoot };
}

module.exports = {
  STAGES,
  restoreError,
  assertIdempotentRestoreAllowed,
  assertRestoreScopeTruthAllowed,
  validateStagedAttachments,
  validateStagedSemanticInvariants,
  assertSafetySnapshotOk,
  createSafetyDatabaseCopy,
  recoverInterruptedRestore,
};
