'use strict';

/**
 * V2-4 sync platform schema: durable outbox, inbox ledger, conflicts, device registry mirror.
 */
module.exports = {
  version: 5,
  id: '002_sync_platform',
  sql: `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sync_outbox (
  event_id TEXT PRIMARY KEY,
  center_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  operation TEXT NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE','TABLE_BUMP')),
  base_revision INTEGER NOT NULL DEFAULT 0,
  new_revision INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT,
  payload_hash TEXT,
  device_id TEXT NOT NULL,
  actor_id TEXT,
  created_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','inflight','sent','dead-letter','acked')),
  idempotency_key TEXT NOT NULL UNIQUE,
  last_error TEXT,
  acked_at TEXT,
  remote_file_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_next
  ON sync_outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_outbox_branch
  ON sync_outbox(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_outbox_table
  ON sync_outbox(table_name, branch_id);

CREATE TABLE IF NOT EXISTS sync_inbox_applied (
  apply_id TEXT PRIMARY KEY,
  center_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  remote_revision INTEGER NOT NULL,
  remote_file_id TEXT,
  payload_hash TEXT,
  source_device_id TEXT,
  applied_at TEXT NOT NULL,
  UNIQUE(center_id, branch_id, table_name, remote_revision, payload_hash)
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  conflict_id TEXT PRIMARY KEY,
  center_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  base_revision INTEGER,
  local_json TEXT NOT NULL,
  remote_json TEXT NOT NULL,
  base_json TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','resolved','superseded')),
  resolution TEXT,
  resolved_revision INTEGER,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  actor_id TEXT,
  device_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_conflicts_open
  ON sync_conflicts(status, branch_id);

CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_registry_local (
  device_uuid TEXT PRIMARY KEY,
  display_name TEXT,
  platform TEXT,
  app_version TEXT,
  branch_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','revoked')),
  first_seen_at TEXT,
  last_seen_at TEXT,
  last_sync_at TEXT,
  remote_json TEXT
);

CREATE TABLE IF NOT EXISTS sync_audit (
  event_id TEXT PRIMARY KEY,
  timestamp_utc TEXT NOT NULL,
  center_id TEXT,
  branch_id TEXT,
  device_id TEXT,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  result TEXT,
  correlation_id TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_audit_ts ON sync_audit(timestamp_utc);
`
};
