'use strict';

/**
 * PR10 — SQLite conflict authority: one open conflict per record identity.
 */
module.exports = {
  version: 6,
  id: '003_conflict_authority',
  sql: `
CREATE UNIQUE INDEX IF NOT EXISTS idx_conflicts_open_record
  ON sync_conflicts(center_id, branch_id, table_name, record_id)
  WHERE status = 'open';
`,
};
