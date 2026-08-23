'use strict';

/**
 * V2-5.5 — SQLite maintenance: ANALYZE, indexes, query plans, VACUUM policy, WAL, FK, integrity.
 */

const EXPECTED_INDEXES = [
  { table: 'clients', columns: ['phone'], nameHint: 'clients' },
  { table: 'clients', columns: ['file_no'], nameHint: 'clients' },
  { table: 'visits', columns: ['date'], nameHint: 'visits' },
  { table: 'visits', columns: ['invoice'], nameHint: 'visits' },
  { table: 'visits', columns: ['client_id'], nameHint: 'visits' },
  { table: 'appointments', columns: ['date'], nameHint: 'appointments' },
  { table: 'attendance', columns: ['employee_id', 'date'], nameHint: 'attendance' },
  { table: 'expenses', columns: ['date'], nameHint: 'expenses' },
  { table: 'sync_outbox', columns: ['status'], nameHint: 'outbox' },
];

const VACUUM_POLICY = {
  autoVacuumOnEveryStart: false,
  reason: 'VACUUM rewrites whole DB and can be slow/unsafe mid-session',
  allowedModes: ['manual', 'scheduled_idle', 'vacuum_into_backup'],
  safe: true,
};

function applyOpenPragmas(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return {
    journalMode: String(db.pragma('journal_mode', { simple: true })),
    busyTimeout: Number(db.pragma('busy_timeout', { simple: true })),
    foreignKeys: Number(db.pragma('foreign_keys', { simple: true })),
  };
}

function runAnalyze(db, options) {
  options = options || {};
  const started = Date.now();
  if (options.table) {
    db.exec(`ANALYZE ${options.table}`);
  } else {
    db.exec('ANALYZE');
  }
  return {
    ok: true,
    strategy: options.table ? 'table' : 'full',
    table: options.table || null,
    ms: Date.now() - started,
    policy: 'run after bulk load / weekly idle; not every open',
  };
}

function listIndexes(db) {
  const rows = db.prepare(
    `SELECT name, tbl_name AS tableName, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name`
  ).all();
  return { ok: true, count: rows.length, indexes: rows };
}

function detectMissingIndexes(db) {
  const inventory = listIndexes(db);
  const names = inventory.indexes.map((i) => String(i.name || '').toLowerCase());
  const sqlBlob = inventory.indexes.map((i) => String(i.sql || '').toLowerCase()).join('\n');
  const missing = [];
  for (const exp of EXPECTED_INDEXES) {
    const cols = exp.columns.map((c) => c.toLowerCase());
    const covered = names.some((n) => n.includes(exp.nameHint) && cols.every((c) => n.includes(c.replace('_', ''))))
      || cols.every((c) => sqlBlob.includes(c) && sqlBlob.includes(exp.table));
    // Heuristic: table has an index whose SQL mentions all columns
    const bySql = inventory.indexes.some((idx) => {
      if (String(idx.tableName).toLowerCase() !== exp.table) return false;
      const s = String(idx.sql || '').toLowerCase();
      return cols.every((c) => s.includes(c));
    });
    if (!bySql && !covered) {
      missing.push({ table: exp.table, columns: exp.columns, reason: 'no_matching_index_sql' });
    }
  }
  return { ok: true, expected: EXPECTED_INDEXES.length, missing, inventoryCount: inventory.count };
}

function explainQueryPlan(db, sql, params) {
  // Prefer literal SQL for EXPLAIN (better-sqlite3 rejects unbound ? in some builds).
  const planSql = `EXPLAIN QUERY PLAN ${sql}`;
  let plan;
  if (params != null) {
    plan = db.prepare(planSql).all(params);
  } else if (/\?/.test(sql)) {
    plan = db.prepare(planSql.replace(/\?/g, "'__plan__'")).all();
  } else {
    plan = db.prepare(planSql).all();
  }
  const usesIndex = plan.some((p) => /using (covering )?index/i.test(String(p.detail || '')));
  const scans = plan.filter((p) => /scan/i.test(String(p.detail || '')));
  return { ok: true, sql, plan, usesIndex, tableScans: scans.length };
}

function vacuumPolicy() {
  return { ...VACUUM_POLICY };
}

function runVacuum(db, options) {
  options = options || {};
  if (!options.force && !options.allowManual) {
    return { ok: false, error: 'vacuum_requires_explicit_allow', policy: VACUUM_POLICY };
  }
  const started = Date.now();
  if (options.intoPath) {
    db.exec(`VACUUM INTO '${String(options.intoPath).replace(/'/g, "''")}'`);
  } else {
    db.exec('VACUUM');
  }
  return { ok: true, ms: Date.now() - started, mode: options.intoPath ? 'vacuum_into' : 'vacuum' };
}

function walCheckpoint(db, mode) {
  mode = mode || 'PASSIVE';
  const started = Date.now();
  const row = db.pragma(`wal_checkpoint(${mode})`);
  return {
    ok: true,
    mode,
    ms: Date.now() - started,
    result: row,
    journalMode: String(db.pragma('journal_mode', { simple: true })),
  };
}

function foreignKeyCheck(db) {
  const rows = db.prepare('PRAGMA foreign_key_check').all();
  return { ok: rows.length === 0, violations: rows.length, rows: rows.slice(0, 50) };
}

function integrityCheck(db) {
  const row = db.prepare('PRAGMA integrity_check').get();
  const detail = row && (row.integrity_check || Object.values(row)[0]);
  const ok = String(detail || '').toLowerCase() === 'ok';
  return { ok, detail };
}

function maintenanceReport(db) {
  const pragmas = applyOpenPragmas(db);
  const indexes = listIndexes(db);
  const missing = detectMissingIndexes(db);
  const analyze = runAnalyze(db);
  const fk = foreignKeyCheck(db);
  const integ = integrityCheck(db);
  const wal = walCheckpoint(db, 'PASSIVE');
  const samplePlan = explainQueryPlan(db, 'SELECT id, name, phone FROM clients WHERE phone = ?');
  return {
    at: new Date().toISOString(),
    pragmas,
    analyze,
    indexes,
    missing,
    foreignKeyCheck: fk,
    integrityCheck: integ,
    wal,
    vacuumPolicy: vacuumPolicy(),
    samplePlan,
  };
}

module.exports = {
  EXPECTED_INDEXES,
  VACUUM_POLICY,
  applyOpenPragmas,
  runAnalyze,
  listIndexes,
  detectMissingIndexes,
  explainQueryPlan,
  vacuumPolicy,
  runVacuum,
  walCheckpoint,
  foreignKeyCheck,
  integrityCheck,
  maintenanceReport,
};
