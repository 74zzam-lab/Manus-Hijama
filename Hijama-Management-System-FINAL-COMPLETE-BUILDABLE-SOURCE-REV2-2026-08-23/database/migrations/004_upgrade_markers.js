'use strict';

/**
 * PR13 — Upgrade migration run tracking + step markers (schema v7).
 */
module.exports = {
  version: 7,
  id: '004_upgrade_markers',
  sql: `
CREATE TABLE IF NOT EXISTS upgrade_migration_runs (
  id TEXT PRIMARY KEY,
  source_version TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  backup_path TEXT,
  error_code TEXT,
  details_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_upgrade_runs_status ON upgrade_migration_runs(status);
`,
};
