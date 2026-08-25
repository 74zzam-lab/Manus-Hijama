'use strict';

/**
 * PR13 — Idempotent, crash-safe upgrade/migration orchestrator.
 * detect → backup → migrate → verify → commit
 */
const migrationSafety = require('./migration-safety');
const operationalDbHealth = require('./operational-db-health');

const UPGRADE_VERSION = 1;
const UPGRADE_MARKER = 'upgradeMigrationVersion';
const STEP_PREFIX = 'upgradeStep:';

const BRANCH_TABLES = ['clients', 'visits', 'appointments', 'expenses', 'employees'];

function tableHasBranchColumn(db, table) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === 'branch_id');
  } catch {
    return false;
  }
}

function branchScopedTables(db) {
  return BRANCH_TABLES.filter((t) => tableHasBranchColumn(db, t));
}

const STEPS = Object.freeze([
  'owner_legacy_preserve',
  'ls_conflict_queue_sqlite',
  'attachment_metadata_canonical',
  'null_branch_assignment',
  'encryption_settings_strip',
  'restore_settings_v2',
]);

function getMeta(db, key) {
  try {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function setMeta(db, key, value) {
  db.prepare(
    `INSERT INTO meta(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run(key, String(value));
}

function stepMarker(stepId) {
  return `${STEP_PREFIX}${stepId}`;
}

function isStepDone(db, stepId) {
  return getMeta(db, stepMarker(stepId)) === 'done';
}

function markStepDone(db, stepId) {
  setMeta(db, stepMarker(stepId), 'done');
}

function countNullBranchRows(db) {
  let total = 0;
  for (const table of branchScopedTables(db)) {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE branch_id IS NULL OR branch_id = ''`).get();
      total += Number(row?.c) || 0;
    } catch {
      /* skip */
    }
  }
  // attendance stores branch identity in its canonical payload in schema v7.
  try {
    for (const row of db.prepare('SELECT payload_json FROM attendance').all()) {
      let payload = null;
      try { payload = JSON.parse(row.payload_json || '{}'); } catch { total += 1; continue; }
      if (!payload?.branchId) total += 1;
    }
  } catch {
    /* no attendance table on partial legacy schemas */
  }
  return total;
}

function detectOwnerCorruption(repos) {
  const users = repos.kv.get('users', []);
  if (!Array.isArray(users)) return { ok: true };
  const owners = users.filter((u) => u && u.active !== false && String(u.role || '').toLowerCase() === 'owner');
  if (owners.length <= 1) return { ok: true, ownerId: owners[0]?.id || null };
  const ids = [...new Set(owners.map((u) => String(u.id)))];
  if (ids.length > 1) {
    return { ok: false, error: 'owner_corrupted', duplicateOwners: owners.length, ownerIds: ids };
  }
  return { ok: true, ownerId: owners[0]?.id || null };
}

function detectPendingSteps(db, repos, options = {}) {
  const pending = [];
  const owner = detectOwnerCorruption(repos);
  if (!owner.ok) pending.push('owner_legacy_preserve');

  const queue = repos.kv.get('__tdw_conflict_queue__', []);
  if (Array.isArray(queue) && queue.length && !isStepDone(db, 'ls_conflict_queue_sqlite')) {
    pending.push('ls_conflict_queue_sqlite');
  }

  const manifest = repos.kv.get('__tdw_attachment_manifest__', null);
  if (manifest != null && !isStepDone(db, 'attachment_metadata_canonical')) {
    pending.push('attachment_metadata_canonical');
  }

  const nullBranch = countNullBranchRows(db);
  if (nullBranch > 0 && !isStepDone(db, 'null_branch_assignment')) {
    pending.push('null_branch_assignment');
  }

  const settings = repos.kv.get('settings', {}) || {};
  if (
    (settings.backupEncryptionPassword || settings.backupEncryptionEnabled)
    && !isStepDone(db, 'encryption_settings_strip')
  ) {
    pending.push('encryption_settings_strip');
  }

  const restoreSettings = repos.kv.get('backupRegistry', null);
  if (restoreSettings != null && !isStepDone(db, 'restore_settings_v2')) {
    pending.push('restore_settings_v2');
  }

  if (options.includeCompleted !== true) {
    return pending.filter((s) => !isStepDone(db, s));
  }
  return pending;
}

function getInProgressRun(db) {
  try {
    return db
      .prepare(`SELECT * FROM upgrade_migration_runs WHERE status = 'in_progress' ORDER BY started_at DESC LIMIT 1`)
      .get();
  } catch {
    return null;
  }
}

function assessUpgradeState(db, repos, options = {}) {
  options = options || {};
  const upgradeVersion = Number(getMeta(db, UPGRADE_MARKER) || 0);
  const inProgress = getInProgressRun(db);
  const owner = detectOwnerCorruption(repos);
  const nullBranchCount = countNullBranchRows(db);
  const pending = detectPendingSteps(db, repos, options);

  if (inProgress) {
    return {
      ok: false,
      migration_in_progress: true,
      runId: inProgress.id,
      pending,
      upgradeVersion,
      nullBranchCount,
      ownerCorrupted: !owner.ok,
    };
  }

  if (!owner.ok) {
    return {
      ok: false,
      owner_corrupted: true,
      error: 'owner_corrupted',
      pending,
      upgradeVersion,
      nullBranchCount,
      ownerIds: owner.ownerIds,
    };
  }

  if (nullBranchCount > 0 && options.multiBranch === true && !isStepDone(db, 'null_branch_assignment')) {
    return {
      ok: false,
      unresolved_null_branch: true,
      error: 'legacy_branch_migration_required',
      nullBranchCount,
      pending,
      upgradeVersion,
    };
  }

  if (pending.length > 0 && upgradeVersion < UPGRADE_VERSION) {
    return {
      ok: false,
      migration_pending: true,
      pending,
      upgradeVersion,
      nullBranchCount,
    };
  }

  const failed = db
    .prepare(`SELECT * FROM upgrade_migration_runs WHERE status = 'failed' ORDER BY started_at DESC LIMIT 1`)
    .get();
  if (failed && upgradeVersion < UPGRADE_VERSION) {
    return {
      ok: false,
      migration_failed: true,
      lastFailedRun: failed,
      pending,
      upgradeVersion,
    };
  }

  return {
    ok: true,
    upgradeVersion: upgradeVersion || UPGRADE_VERSION,
    pending: [],
    nullBranchCount,
    ownerId: owner.ownerId || null,
  };
}

function verifyInvariants(db, repos) {
  const health = operationalDbHealth.assessHealth(db);
  if (!health.ok) {
    return { ok: false, error: health.reasons[0] || 'database_unhealthy', health };
  }
  const owner = detectOwnerCorruption(repos);
  if (!owner.ok) return { ok: false, error: 'owner_corrupted', owner };
  return { ok: true, health, ownerId: owner.ownerId };
}

function migrateOwnerLegacy(db, repos) {
  const users = repos.kv.get('users', []);
  if (!Array.isArray(users)) {
    markStepDone(db, 'owner_legacy_preserve');
    return { ok: true, skipped: true };
  }
  const owners = users.filter((u) => u && u.active !== false && String(u.role || '').toLowerCase() === 'owner');
  if (owners.length <= 1) {
    markStepDone(db, 'owner_legacy_preserve');
    return { ok: true, ownerId: owners[0]?.id || null };
  }
  const byId = new Map();
  for (const o of owners) byId.set(String(o.id), o);
  if (byId.size > 1) {
    return { ok: false, error: 'owner_corrupted', duplicateOwners: byId.size };
  }
  markStepDone(db, 'owner_legacy_preserve');
  return { ok: true, ownerId: owners[0]?.id || null, deduped: owners.length - 1 };
}

function migrateLsConflictQueue(db, repos, syncPlatform) {
  const queue = repos.kv.get('__tdw_conflict_queue__', []);
  if (!Array.isArray(queue) || !queue.length) {
    markStepDone(db, 'ls_conflict_queue_sqlite');
    return { ok: true, migrated: 0 };
  }
  if (!syncPlatform?.openConflict) {
    return { ok: false, error: 'sync_platform_unavailable' };
  }
  let migrated = 0;
  const seen = new Set();
  for (const item of queue) {
    if (!item || item.status === 'resolved') continue;
    const centerId = item.centerId || item.center_id || 'local';
    const branchId = item.branchId || item.branch_id || 'BR-MAIN';
    const table = item.table || item.table_name;
    const recordId = String(item.recordId || item.record_id || '');
    const key = `${centerId}|${branchId}|${table}|${recordId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    syncPlatform.openConflict({
      center_id: centerId,
      branch_id: branchId,
      table_name: table,
      record_id: recordId,
      local_json: item.local || {},
      remote_json: item.remote || {},
      device_id: item.deviceId || null,
      actor_id: item.detectedBy || null,
    });
    migrated += 1;
  }
  markStepDone(db, 'ls_conflict_queue_sqlite');
  return { ok: true, migrated, deduped: queue.length - migrated };
}

function migrateAttachmentMetadata(db, repos) {
  const manifest = repos.kv.get('__tdw_attachment_manifest__', null);
  if (manifest == null) {
    markStepDone(db, 'attachment_metadata_canonical');
    return { ok: true, skipped: true };
  }
  const canonical = Array.isArray(manifest)
    ? manifest
    : manifest && typeof manifest === 'object'
      ? Object.values(manifest)
      : [];
  repos.kv.set('__tdw_attachment_manifest__', canonical);
  markStepDone(db, 'attachment_metadata_canonical');
  return { ok: true, count: canonical.length };
}

function migrateNullBranchRows(db, options = {}) {
  const defaultBranch = options.defaultBranchId || 'BR-MAIN';
  const multiBranch = options.multiBranch === true;
  const nullCount = countNullBranchRows(db);
  if (!nullCount) {
    markStepDone(db, 'null_branch_assignment');
    return { ok: true, assigned: 0 };
  }
  if (multiBranch) {
    return { ok: false, error: 'legacy_branch_migration_required', nullCount };
  }
  let assigned = 0;
  const tx = db.transaction(() => {
    for (const table of branchScopedTables(db)) {
      const info = db.prepare(`UPDATE ${table} SET branch_id = ? WHERE branch_id IS NULL OR branch_id = ''`).run(defaultBranch);
      assigned += info.changes || 0;
    }
    for (const row of db.prepare('SELECT id, payload_json FROM attendance').all()) {
      let payload = null;
      try { payload = JSON.parse(row.payload_json || '{}'); } catch {
        throw Object.assign(new Error('legacy_branch_payload_invalid'), { code: 'legacy_branch_payload_invalid', table: 'attendance', id: row.id });
      }
      if (payload.branchId) continue;
      payload.branchId = defaultBranch;
      db.prepare('UPDATE attendance SET payload_json = ? WHERE id = ?').run(JSON.stringify(payload), row.id);
      assigned += 1;
    }
  });
  tx();
  markStepDone(db, 'null_branch_assignment');
  return { ok: true, assigned, defaultBranch };
}

function stripEncryptionSettings(db, repos) {
  const settings = repos.kv.get('settings', {}) || {};
  if (!settings.backupEncryptionPassword && !settings.backupEncryptionEnabled) {
    markStepDone(db, 'encryption_settings_strip');
    return { ok: true, skipped: true };
  }
  const next = { ...settings };
  if (next.backupEncryptionPassword) {
    setMeta(db, 'legacyEncryptionImportSupported', 'true');
    delete next.backupEncryptionPassword;
  }
  if (next.backupEncryptionEnabled) next.backupEncryptionEnabled = false;
  repos.kv.set('settings', next);
  markStepDone(db, 'encryption_settings_strip');
  return { ok: true, stripped: true };
}

function migrateRestoreSettingsV2(db, repos) {
  const registry = repos.kv.get('backupRegistry', null);
  if (registry == null) {
    markStepDone(db, 'restore_settings_v2');
    return { ok: true, skipped: true };
  }
  const normalized = Array.isArray(registry)
    ? registry.map((entry) => ({
      ...entry,
      restoreSurface: entry.restoreSurface || 'v2',
      encryptedDirectRestoreBlocked: entry.format === 'CDB2' || entry.format === 'CDBK' || entry.encrypted === true,
    }))
    : registry;
  repos.kv.set('backupRegistry', normalized);
  setMeta(db, 'restoreSettingsV2', 'true');
  markStepDone(db, 'restore_settings_v2');
  return { ok: true };
}

function runStep(db, repos, syncPlatform, stepId, options) {
  switch (stepId) {
    case 'owner_legacy_preserve':
      return migrateOwnerLegacy(db, repos);
    case 'ls_conflict_queue_sqlite':
      return migrateLsConflictQueue(db, repos, syncPlatform);
    case 'attachment_metadata_canonical':
      return migrateAttachmentMetadata(db, repos);
    case 'null_branch_assignment':
      return migrateNullBranchRows(db, options);
    case 'encryption_settings_strip':
      return stripEncryptionSettings(db, repos);
    case 'restore_settings_v2':
      return migrateRestoreSettingsV2(db, repos);
    default:
      return { ok: false, error: 'unknown_upgrade_step', stepId };
  }
}

/**
 * Run pending upgrade steps with mandatory backup and rollback on failure.
 */
function runUpgradePipeline(db, repos, options = {}) {
  options = options || {};
  const syncPlatform = options.syncPlatform || null;
  const dbPath = options.dbPath;
  const pending = detectPendingSteps(db, repos, options);
  if (!pending.length) {
    setMeta(db, UPGRADE_MARKER, String(UPGRADE_VERSION));
    return { ok: true, skipped: true, upgradeVersion: UPGRADE_VERSION };
  }

  const resumeRunId = String(options.resumeRunId || '').trim();
  const priorRun = resumeRunId
    ? db.prepare(`SELECT * FROM upgrade_migration_runs WHERE id = ? AND status = 'in_progress'`).get(resumeRunId)
    : null;
  if (resumeRunId && !priorRun) return { ok: false, error: 'upgrade_resume_run_not_found', runId: resumeRunId };

  const runId = priorRun?.id || `upgrade-${Date.now()}`;
  let safetyCtx;
  if (priorRun) {
    // A resumed run must reuse the backup captured before its first mutation. Creating
    // a new backup of a partially migrated database makes rollback dishonest.
    if (dbPath !== ':memory:' && !priorRun.backup_path) {
      return { ok: false, error: 'upgrade_resume_backup_missing', runId };
    }
    safetyCtx = {
      ok: true,
      originalDbPath: dbPath || ':memory:',
      targetDbPath: dbPath || ':memory:',
      backup: priorRun.backup_path ? { path: priorRun.backup_path } : null,
      dryRun: !!options.dryRun,
      existed: dbPath !== ':memory:',
      resumed: true,
    };
  } else {
    safetyCtx = migrationSafety.prepareMigrationRun({
      dbPath: dbPath || ':memory:',
      backupPath: options.backupPath,
      dryRun: !!options.dryRun,
      skipBackup: !!options.skipBackup || dbPath === ':memory:',
    });
    if (!safetyCtx.ok) {
      return migrationSafety.finalizeMigrationRun(safetyCtx, { ok: false, error: safetyCtx.error });
    }
    db.prepare(
      `INSERT INTO upgrade_migration_runs (id, source_version, status, started_at, backup_path)
       VALUES (?, ?, 'in_progress', ?, ?)`
    ).run(runId, String(options.sourceVersion || 'legacy'), new Date().toISOString(), safetyCtx.backup?.path || null);
  }

  const report = { ok: true, runId, steps: [], pending };
  try {
    for (const stepId of STEPS) {
      if (!pending.includes(stepId)) continue;
      const result = runStep(db, repos, syncPlatform, stepId, options);
      report.steps.push({ stepId, ...result });
      if (!result.ok) {
        report.ok = false;
        report.error = result.error || 'migration_failed';
        break;
      }
    }

    if (report.ok) {
      const verify = verifyInvariants(db, repos);
      report.verify = verify;
      if (!verify.ok) {
        report.ok = false;
        report.error = verify.error || 'integrity_failed';
      }
    }

    if (report.ok) {
      setMeta(db, UPGRADE_MARKER, String(UPGRADE_VERSION));
      db.prepare(
        `UPDATE upgrade_migration_runs SET status='completed', finished_at=? WHERE id=?`
      ).run(new Date().toISOString(), runId);
    } else {
      db.prepare(
        `UPDATE upgrade_migration_runs SET status='failed', finished_at=?, error_code=? WHERE id=?`
      ).run(new Date().toISOString(), report.error || 'migration_failed', runId);
    }
  } catch (err) {
    report.ok = false;
    report.error = err.code || 'migration_failed';
    report.message = err.message;
    db.prepare(
      `UPDATE upgrade_migration_runs SET status='failed', finished_at=?, error_code=? WHERE id=?`
    ).run(new Date().toISOString(), report.error, runId);
  }

  return migrationSafety.finalizeMigrationRun(safetyCtx, report);
}

/**
 * Resume or finalize an in-progress run after crash (idempotent step markers).
 */
function resumeInProgressRun(db, repos, options = {}) {
  const inProgress = getInProgressRun(db);
  if (!inProgress) return { ok: true, resumed: false };
  const pending = detectPendingSteps(db, repos, options);
  if (!pending.length) {
    const verify = verifyInvariants(db, repos);
    if (!verify.ok) {
      db.prepare(
        `UPDATE upgrade_migration_runs SET status='failed', finished_at=?, error_code=? WHERE id=?`
      ).run(new Date().toISOString(), verify.error || 'integrity_failed', inProgress.id);
      return { ok: false, resumed: true, error: verify.error || 'integrity_failed', verify };
    }
    setMeta(db, UPGRADE_MARKER, String(UPGRADE_VERSION));
    db.prepare(
      `UPDATE upgrade_migration_runs SET status='completed', finished_at=? WHERE id=?`
    ).run(new Date().toISOString(), inProgress.id);
    return { ok: true, resumed: true, completed: true, verify };
  }
  return runUpgradePipeline(db, repos, { ...options, resumeRunId: inProgress.id });
}

module.exports = {
  UPGRADE_VERSION,
  UPGRADE_MARKER,
  STEPS,
  BRANCH_TABLES,
  assessUpgradeState,
  detectPendingSteps,
  detectOwnerCorruption,
  countNullBranchRows,
  verifyInvariants,
  runUpgradePipeline,
  resumeInProgressRun,
  migrateOwnerLegacy,
  migrateLsConflictQueue,
  migrateNullBranchRows,
  stripEncryptionSettings,
  migrateRestoreSettingsV2,
};
