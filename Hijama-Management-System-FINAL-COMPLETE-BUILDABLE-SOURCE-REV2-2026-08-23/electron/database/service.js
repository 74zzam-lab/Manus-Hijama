'use strict';

/**
 * Electron main-process SQLite service.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('electron');
const { openDatabase, defaultDbPath, integrityCheck, getSchemaVersion } = require('../../database/connection');
const { createRepositories } = require('../../database/repositories');
const { migrateFromSnapshot, exportSnapshot } = require('../../database/migrate-from-json');
const { createSyncPlatform } = require('../../database/sync-outbox');
const operationalDbHealth = require('../../database/operational-db-health');
const operationalReadiness = require('../../database/operational-readiness');
const operationalScope = require('../../database/operational-scope');
const operationalErrorTruth = require('../../database/operational-error-truth');
const upgradeOrchestrator = require('../../database/upgrade-migration-orchestrator');

let db = null;
let repos = null;
let syncPlatform = null;

function getDbPath() {
  return defaultDbPath(app.getPath('userData'));
}

function ensureDb() {
  if (db) return db;
  try {
    db = openDatabase(getDbPath());
    repos = createRepositories(db);
    syncPlatform = createSyncPlatform(db);
    return db;
  } catch (err) {
    // DATA-007: never silently open empty replacement after corrupt/missing-required.
    console.error('[sqlite] open failed:', err.code || err.message, err.details || '');
    throw err;
  }
}

function getOperationalHealth() {
  ensureDb();
  return operationalDbHealth.assessHealth(db, operationalDbHealth.RUNTIME_HEALTH_OPTIONS);
}

function readMeta(db) {
  const meta = {};
  for (const row of db.prepare('SELECT key, value FROM meta').all()) meta[row.key] = row.value;
  return meta;
}

function getUpgradeAssessment() {
  ensureDb();
  return upgradeOrchestrator.assessUpgradeState(db, repos, { syncPlatform: ensureSync() });
}

function assertOperationalWriteAllowed() {
  ensureDb();
  const health = operationalDbHealth.assessHealth(db, operationalDbHealth.RUNTIME_HEALTH_OPTIONS);
  const healthGate = operationalDbHealth.assertWriteAllowed(health);
  if (!healthGate.ok) {
    return operationalErrorTruth.enrichResult({ ...healthGate, stage: 'database_write' });
  }

  const meta = readMeta(db);
  const upgrade = getUpgradeAssessment();
  const readinessGate = operationalReadiness.assertOperationalReady({
    health,
    sqlitePrimary: meta.sqlitePrimary === 'true',
    sqlitePrimaryRequired: false,
    migrationPending: !!upgrade.migration_pending,
    migrationInProgress: !!upgrade.migration_in_progress,
    migrationFailed: !!upgrade.migration_failed,
    ownerCorrupted: !!upgrade.owner_corrupted,
    legacyBranchMigrationBlocked: !!upgrade.unresolved_null_branch,
  });
  if (!readinessGate.ok) {
    return operationalErrorTruth.enrichResult({ ...readinessGate, stage: 'database_write' });
  }
  return { ok: true, readiness: readinessGate.readiness, upgrade };
}

function getStatus() {
  ensureDb();
  const meta = readMeta(db);
  const operationalHealth = operationalDbHealth.assessHealth(db, operationalDbHealth.RUNTIME_HEALTH_OPTIONS);
  const upgradeState = getUpgradeAssessment();
  const operationalReadinessReport = operationalReadiness.assessOperationalReadiness({
    health: operationalHealth,
    sqlitePrimary: meta.sqlitePrimary === 'true',
    sqlitePrimaryRequired: false,
    migrationPending: !!upgradeState.migration_pending,
    migrationInProgress: !!upgradeState.migration_in_progress,
    migrationFailed: !!upgradeState.migration_failed,
    ownerCorrupted: !!upgradeState.owner_corrupted,
    legacyBranchMigrationBlocked: !!upgradeState.unresolved_null_branch,
  });
  return {
    ok: true,
    path: getDbPath(),
    schemaVersion: getSchemaVersion(db),
    integrity: integrityCheck(db),
    operationalHealth,
    operationalReadiness: operationalReadinessReport,
    upgradeState,
    meta,
    counts: {
      clients: repos.clients.count(),
      visits: repos.visits.count(),
      bookings: repos.bookings.count(),
      employees: repos.employees.count(),
      attendance: repos.attendance.count(),
      expenses: repos.expenses.count(),
    },
    sqlitePrimary: meta.sqlitePrimary === 'true',
    localStorageRetained: meta.localStorageRetained !== 'false',
  };
}

function hydrate() {
  ensureDb();
  const data = {
    clientsRegistry: repos.clients.getAll(),
    cases: repos.visits.getAll(),
    bookings: repos.bookings.getAll(),
    doctors: repos.employees.getAll(),
    attendance: repos.attendance.getAll(),
    expenses: repos.expenses.getAll(),
    ...repos.kv.exportAll(),
  };
  return { ok: true, data, status: getStatus() };
}

function persistTable(tableKey, records, options = {}) {
  const gate = assertOperationalWriteAllowed();
  if (!gate.ok) return gate;
  ensureDb();
  const list = Array.isArray(records) ? records : [];
  const branchId = options.branchId ? String(options.branchId) : null;
  if (operationalScope.isOperationalTable(tableKey)) {
    if (!branchId) {
      return { ok: false, error: 'branch_id_required', message: 'Operational table writes require branchId' };
    }
    try {
      operationalScope.assertOperationalRecordsBranch(list, branchId);
    } catch (err) {
      return { ok: false, error: err.code || 'branch_scope_denied', message: err.message };
    }
  }
  const map = {
    clientsRegistry: () => repos.clients.replaceBranchSlice(list, branchId),
    cases: () => repos.visits.replaceBranchSlice(list, branchId),
    bookings: () => repos.bookings.replaceBranchSlice(list, branchId),
    doctors: () => repos.employees.replaceBranchSlice(list, branchId),
    attendance: () => repos.attendance.replaceBranchSlice(list, branchId),
    expenses: () => repos.expenses.replaceBranchSlice(list, branchId),
  };
  if (!map[tableKey]) return { ok: false, error: 'unknown_table' };
  try {
    map[tableKey]();
    return { ok: true, branchScoped: !!branchId };
  } catch (err) {
    return { ok: false, error: err.code || 'persist_failed', message: err.message };
  }
}

function persistKv(key, value) {
  const gate = assertOperationalWriteAllowed();
  if (!gate.ok) return gate;
  ensureDb();
  repos.kv.set(key, value);
  return { ok: true };
}

function readKv(key, def = null) {
  try {
    ensureDb();
    const v = repos.kv.get(key);
    return v === undefined || v === null ? def : v;
  } catch {
    return def;
  }
}

function createInitialOwner(input, trustedBootstrap) {
  // This function is intentionally main-only. It receives no renderer role, hash, or
  // precomputed authority data; main must validate the signed bootstrap proof first.
  if (!trustedBootstrap?.verified || !trustedBootstrap.centerId) {
    return { ok: false, error: 'trusted_bootstrap_required' };
  }
  const username = String(input?.username || '').trim().toLowerCase();
  const password = String(input?.password || '');
  const recoveryCode = String(input?.recoveryCode || '').trim();
  const fullName = String(input?.fullName || username).trim().slice(0, 200);
  if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) return { ok: false, error: 'username_invalid' };
  if (password.length < 8) return { ok: false, error: 'password_too_short', min: 8 };
  if (!recoveryCode || recoveryCode.length > 256) return { ok: false, error: 'recovery_required' };

  ensureDb();
  const now = new Date().toISOString();
  const branchId = String(trustedBootstrap.branchId || 'BR-MAIN').slice(0, 128);
  const result = { ok: false, error: 'owner_provision_failed' };
  const tx = db.transaction(() => {
    const existingUsers = repos.kv.get('users');
    if (Array.isArray(existingUsers) && existingUsers.length) {
      result.error = 'users_already_present';
      result.count = existingUsers.length;
      return;
    }
    if (repos.kv.get('__tdw_owner_profile__')) {
      result.error = 'owner_profile_already_present';
      return;
    }
    const bootstrapState = repos.kv.get('__tdw_owner_bootstrap_v2__');
    if (bootstrapState?.tokenConsumedAt || bootstrapState?.claimedBy) {
      result.error = 'bootstrap_already_consumed';
      return;
    }

    const userPasswordHash = `pbkdf2:${username}:${crypto.pbkdf2Sync(
      password,
      `tdw_pw_v1_${username}`,
      100000,
      32,
      'sha256'
    ).toString('hex')}`;
    const ownerSalt = crypto.randomBytes(16).toString('hex');
    const ownerHash = (value, purpose) => `sha256:${crypto.createHash('sha256')
      .update(`${value}|${ownerSalt}|${purpose}`)
      .digest('hex')}`;
    const profile = {
      schemaVersion: 1,
      role: 'owner',
      username,
      passwordHash: ownerHash(`${username}|${password}`, 'tdw-owner-v1'),
      salt: ownerSalt,
      recovery: { type: 'code', hash: ownerHash(recoveryCode, 'tdw-owner-recovery-v1') },
      orgId: trustedBootstrap.centerId,
      centerId: trustedBootstrap.centerId,
      cloudIdentity: {},
      sessionEpoch: 1,
      createdAt: now,
      updatedAt: now,
    };
    const owner = {
      id: `owner-${crypto.randomUUID()}`,
      fullName,
      username,
      password: userPasswordHash,
      role: 'owner',
      active: true,
      branchId,
      branchScope: ['*'],
      canSwitchBranch: true,
      createdAt: now,
      passwordChangedAt: now,
    };
    repos.kv.set('users', [owner]);
    repos.kv.set('__tdw_owner_profile__', profile);
    repos.kv.set('__tdw_owner_session_epoch__', 1);
    repos.kv.set('__tdw_owner_bootstrap_v2__', {
      tokenConsumedAt: now,
      claimedBy: username,
      method: trustedBootstrap.method || 'setup_token',
      centerId: trustedBootstrap.centerId,
    });
    result.ok = true;
    result.error = null;
    result.user = { id: owner.id, username, role: 'owner', branchScope: ['*'] };
    result.profile = { username, role: 'owner', centerId: trustedBootstrap.centerId };
  });
  try { tx(); } catch (err) { return { ok: false, error: err.code || 'owner_provision_failed' }; }
  return result;
}

function enableSqlitePrimary() {
  ensureDb();
  db.prepare(
    `INSERT INTO meta(key, value) VALUES('sqlitePrimary', 'true')
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run();
  return getStatus();
}

function migrateFromBackupObject(snapshot, options = {}) {
  const dbFile = getDbPath();
  const backupPath = path.join(
    app.getPath('userData'),
    'database',
    'backups',
    `pre-migrate-${Date.now()}.db`
  );
  // Close open handle before migrating file DB
  try { db?.close(); } catch { /* ignore */ }
  db = null;
  repos = null;

  if (fs.existsSync(dbFile) && !options.skipBackup) {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  }

  const report = migrateFromSnapshot({
    snapshot,
    dbPath: dbFile,
    backupPath: fs.existsSync(dbFile) ? backupPath : undefined,
    sourceLabel: options.sourceLabel || 'renderer-backup',
    dryRun: !!options.dryRun,
  });

  // Write report next to DB
  try {
    const reportPath = path.join(path.dirname(dbFile), `migration-report-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    report.reportPath = reportPath;
  } catch { /* ignore */ }

  if (!options.dryRun) ensureDb();
  return report;
}

function querySafe(request, sessionContext = null) {
  ensureDb();
  const req = request || {};
  const session = sessionContext || null;
  // Explicit allowlist — never accept arbitrary SQL from renderer
  switch (req.op) {
    case 'status':
      return getStatus();
    case 'count': {
      const table = String(req.table || '');
      const readScope = operationalScope.resolveReadScope(session, req);
      if (!readScope.ok) return { ok: false, error: readScope.error };
      const branchId = readScope.branchId;
      const allowed = {
        clients: () => readScope.aggregate ? repos.clients.count() : repos.clients.countForBranch(branchId),
        visits: () => readScope.aggregate ? repos.visits.count() : repos.visits.countForBranch(branchId),
        bookings: () => readScope.aggregate ? repos.bookings.count() : repos.bookings.countForBranch(branchId),
        employees: () => readScope.aggregate ? repos.employees.count() : repos.employees.countForBranch(branchId),
        attendance: () => readScope.aggregate ? repos.attendance.count() : repos.attendance.countForBranch(branchId),
        expenses: () => readScope.aggregate ? repos.expenses.count() : repos.expenses.countForBranch(branchId),
      };
      if (!allowed[table]) return { ok: false, error: 'table_not_allowed' };
      if (!readScope.aggregate) {
        const access = operationalScope.assertSessionBranchAccess(session, branchId);
        if (!access.ok) return { ok: false, error: access.error };
      }
      return { ok: true, count: allowed[table](), branchId: branchId || null, aggregate: !!readScope.aggregate };
    }
    case 'getById': {
      const table = String(req.table || '');
      const id = String(req.id || '');
      const readScope = operationalScope.resolveReadScope(session, req);
      if (!readScope.ok) return { ok: false, error: readScope.error };
      if (!id) return { ok: false, error: 'id_required' };
      const branchId = readScope.branchId;
      const scoped = {
        clients: () => readScope.aggregate ? repos.clients.getById(id) : repos.clients.getByIdScoped(id, branchId),
        visits: () => readScope.aggregate ? repos.visits.getById(id) : repos.visits.getByIdScoped(id, branchId),
        bookings: () => readScope.aggregate ? repos.bookings.getById(id) : repos.bookings.getByIdScoped(id, branchId),
        employees: () => readScope.aggregate ? repos.employees.getById(id) : repos.employees.getByIdScoped(id, branchId),
        attendance: () => readScope.aggregate
          ? repos.attendance.getAll().find((r) => String(r.id) === id) || null
          : repos.attendance.getByIdScoped(id, branchId),
        expenses: () => readScope.aggregate ? repos.expenses.getById(id) : repos.expenses.getByIdScoped(id, branchId),
      };
      if (!scoped[table]) return { ok: false, error: 'table_not_allowed' };
      if (!readScope.aggregate) {
        const access = operationalScope.assertSessionBranchAccess(session, branchId);
        if (!access.ok) return { ok: false, error: access.error };
      }
      const record = scoped[table]();
      if (!record) return { ok: false, error: 'not_found_or_branch_denied' };
      return { ok: true, record, branchId: branchId || null, aggregate: !!readScope.aggregate };
    }
    case 'listForBranch': {
      const table = String(req.table || '');
      const readScope = operationalScope.resolveReadScope(session, req);
      if (!readScope.ok) return { ok: false, error: readScope.error };
      if (readScope.aggregate) return { ok: false, error: 'aggregate_read_use_hydrate' };
      const branchId = readScope.branchId;
      const access = operationalScope.assertSessionBranchAccess(session, branchId);
      if (!access.ok) return { ok: false, error: access.error };
      const listMap = {
        clients: () => repos.clients.getAllForBranch(branchId),
        visits: () => repos.visits.getAllForBranch(branchId),
        bookings: () => repos.bookings.getAllForBranch(branchId),
        employees: () => repos.employees.getAllForBranch(branchId),
        attendance: () => repos.attendance.getAllForBranch(branchId),
        expenses: () => repos.expenses.getAllForBranch(branchId),
      };
      if (!listMap[table]) return { ok: false, error: 'table_not_allowed' };
      return { ok: true, records: listMap[table](), branchId, count: listMap[table]().length };
    }
    case 'sumVisits': {
      const readScope = operationalScope.resolveReadScope(session, req);
      if (!readScope.ok) return { ok: false, error: readScope.error };
      if (readScope.aggregate) {
        return { ok: true, sum: repos.visits.sumTotal(), aggregate: true };
      }
      const access = operationalScope.assertSessionBranchAccess(session, readScope.branchId);
      if (!access.ok) return { ok: false, error: access.error };
      return { ok: true, sum: repos.visits.sumTotalForBranch(readScope.branchId), branchId: readScope.branchId };
    }
    default:
      return { ok: false, error: 'op_not_allowed' };
  }
}

function ensureSync() {
  ensureDb();
  if (!syncPlatform) syncPlatform = createSyncPlatform(db);
  return syncPlatform;
}

const TABLE_PERSIST = {
  clientsRegistry: (list, branchId) => repos.clients.replaceBranchSlice(list, branchId),
  cases: (list, branchId) => repos.visits.replaceBranchSlice(list, branchId),
  bookings: (list, branchId) => repos.bookings.replaceBranchSlice(list, branchId),
  doctors: (list, branchId) => repos.employees.replaceBranchSlice(list, branchId),
  attendance: (list, branchId) => repos.attendance.replaceBranchSlice(list, branchId),
  expenses: (list, branchId) => repos.expenses.replaceBranchSlice(list, branchId),
};

function applyBundleSteps(steps) {
  const list = Array.isArray(steps) ? steps : [];
  for (const step of list) {
    if (!step || typeof step !== 'object') continue;
    if (step.type === 'table') {
      const tableKey = String(step.tableKey || '');
      const branchId = step.branchId ? String(step.branchId) : null;
      if (operationalScope.isOperationalTable(tableKey)) {
        operationalScope.assertWriteBranchId(branchId);
        operationalScope.assertOperationalRecordsBranch(Array.isArray(step.records) ? step.records : [], branchId);
      }
      const fn = TABLE_PERSIST[tableKey];
      if (!fn) throw Object.assign(new Error('unknown_table'), { code: 'unknown_table' });
      fn(Array.isArray(step.records) ? step.records : [], branchId);
    } else if (step.type === 'kv') {
      const key = String(step.key || '');
      if (!key) throw Object.assign(new Error('kv_key_required'), { code: 'kv_key_required' });
      repos.kv.set(key, step.value);
    }
  }
}

function syncOp(request) {
  const req = request || {};
  const writeOps = new Set([
    'enqueueAtomicPersistKv',
    'enqueueAtomicPersistTable',
    'enqueueAtomicBundle',
    'persistBundle',
  ]);
  if (writeOps.has(req.op)) {
    const gate = assertOperationalWriteAllowed();
    if (!gate.ok) return gate;
  }
  const sp = ensureSync();
  switch (req.op) {
    case 'enqueue':
      return sp.enqueue(req.entry || {});
    case 'enqueueAtomicPersistKv': {
      // mutate kv then outbox atomically
      return sp.enqueueAtomic(req.entry || {}, () => {
        if (req.kvKey != null) repos.kv.set(req.kvKey, req.kvValue);
      });
    }
    case 'enqueueAtomicPersistTable': {
      const tableKey = String(req.tableKey || '');
      const records = Array.isArray(req.records) ? req.records : [];
      const branchId = req.branchId ? String(req.branchId) : null;
      if (operationalScope.isOperationalTable(tableKey)) {
        if (!branchId) return { ok: false, error: 'branch_id_required' };
        try {
          operationalScope.assertOperationalRecordsBranch(records, branchId);
        } catch (err) {
          return { ok: false, error: err.code || 'branch_scope_denied', message: err.message };
        }
      }
      const map = {
        clientsRegistry: () => repos.clients.replaceBranchSlice(records, branchId),
        cases: () => repos.visits.replaceBranchSlice(records, branchId),
        bookings: () => repos.bookings.replaceBranchSlice(records, branchId),
        doctors: () => repos.employees.replaceBranchSlice(records, branchId),
        attendance: () => repos.attendance.replaceBranchSlice(records, branchId),
        expenses: () => repos.expenses.replaceBranchSlice(records, branchId),
      };
      if (!map[tableKey]) return { ok: false, error: 'unknown_table' };
      return sp.enqueueAtomic(req.entry || {}, () => {
        map[tableKey]();
      });
    }
    case 'enqueueAtomicBundle': {
      const steps = Array.isArray(req.steps) ? req.steps : [];
      const entries = Array.isArray(req.entries) ? req.entries : [];
      if (!steps.length) return { ok: false, error: 'bundle_steps_required' };
      return sp.enqueueAtomicBundle(() => applyBundleSteps(steps), entries);
    }
    case 'persistBundle': {
      const steps = Array.isArray(req.steps) ? req.steps : [];
      if (!steps.length) return { ok: false, error: 'bundle_steps_required' };
      return sp.persistAtomic(() => applyBundleSteps(steps));
    }
    case 'claimPending':
      return { ok: true, rows: sp.claimPending(req.options || {}) };
    case 'ack':
      return sp.ack(req.eventId, req.remoteFileId, req.leaseToken || req.options?.leaseToken);
    case 'fail':
      return sp.fail(req.eventId, req.error, req.options || {});
    case 'counts':
      return { ok: true, counts: sp.countByStatus(req.branchId || null) };
    case 'listDeadLetters':
      return { ok: true, rows: sp.listDeadLetters(req.options || {}) };
    case 'requeueDeadLetter':
      return sp.requeueDeadLetter(req.eventId);
    case 'requeueDeadLetters':
      return sp.requeueDeadLetters(req.options || {});
    case 'markApplied':
      return sp.markRemoteApplied(req.entry || {});
    case 'openConflict':
      return sp.openConflict(req.entry || {});
    case 'resolveConflict':
      return sp.resolveConflictById(req.conflictId, req.resolution, req.resolvedRevision, req.actorId);
    case 'listOpenConflicts':
      return { ok: true, rows: sp.listOpenConflicts(req.options || {}) };
    case 'audit':
      return sp.audit(req.entry || {});
    case 'metaGet':
      return { ok: true, value: sp.metaGet(req.key, req.def) };
    case 'metaSet':
      sp.metaSet(req.key, req.value);
      return { ok: true };
    default:
      return { ok: false, error: 'sync_op_not_allowed' };
  }
}

function close() {
  try { db?.close(); } catch { /* ignore */ }
  db = null;
  repos = null;
  syncPlatform = null;
}

module.exports = {
  getDbPath,
  ensureDb,
  getStatus,
  hydrate,
  persistTable,
  persistKv,
  readKv,
  createInitialOwner,
  enableSqlitePrimary,
  migrateFromBackupObject,
  querySafe,
  syncOp,
  exportSnapshot: () => exportSnapshot(getDbPath()),
  close,
  getUpgradeAssessment,
  runUpgradePipeline: (options = {}) => {
    ensureDb();
    return upgradeOrchestrator.runUpgradePipeline(db, repos, {
      ...options,
      dbPath: getDbPath(),
      syncPlatform: ensureSync(),
    });
  },
  resumeUpgradePipeline: (options = {}) => {
    ensureDb();
    return upgradeOrchestrator.resumeInProgressRun(db, repos, {
      ...options,
      dbPath: getDbPath(),
      syncPlatform: ensureSync(),
    });
  },
};
