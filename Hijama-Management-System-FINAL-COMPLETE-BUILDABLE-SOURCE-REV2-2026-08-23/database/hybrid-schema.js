'use strict';

/**
 * Hybrid schema adapter — presents Cursor migrations in a shape Backup V2 expects,
 * without adopting Codex schema v11 cutover.
 *
 * Feature flag (future cutover): HYBRID_SQLITE_SOT=1
 */
const connection = require('./connection');

const MIGRATIONS = (connection.MIGRATIONS || []).map((migration) => ({
  version: Number(migration.version) || 0,
  name: String(migration.id || migration.name || `v${migration.version}`),
  id: migration.id,
  sql: migration.sql,
}));

function readSchemaVersion(db) {
  try {
    const row = db.prepare(`SELECT value FROM meta WHERE key = 'schemaVersion'`).get();
    if (row && row.value != null) return Number(row.value) || 0;
  } catch {
    /* meta may not exist yet */
  }
  try {
    const cols = db.prepare(`PRAGMA table_info(schema_migrations)`).all();
    if (cols.some((c) => c.name === 'version')) {
      return Number(db.prepare('SELECT COALESCE(MAX(version), 0) FROM schema_migrations').pluck().get() || 0);
    }
  } catch {
    /* ignore */
  }
  return 0;
}

function runSchemaMigrations(db, now = new Date()) {
  // Cursor migrate() understands TEXT id schema_migrations + meta.schemaVersion.
  connection.migrate(db);
  return MIGRATIONS.map((migration) => ({
    version: migration.version,
    name: migration.name,
    applied_at: now.toISOString(),
  }));
}

function isSqliteSotEnabled() {
  return String(process.env.HYBRID_SQLITE_SOT || '0') === '1';
}

module.exports = {
  MIGRATIONS,
  runSchemaMigrations,
  readSchemaVersion,
  isSqliteSotEnabled,
  CURRENT_SCHEMA_VERSION: Math.max(0, ...MIGRATIONS.map((m) => m.version || 0)),
};
