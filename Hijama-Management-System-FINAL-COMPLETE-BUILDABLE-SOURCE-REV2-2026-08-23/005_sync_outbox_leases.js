'use strict';

/**
 * Durable ownership lease for sync_outbox workers. A crashed worker's inflight
 * item becomes recoverable after lease expiry; stale workers cannot ack a newer claim.
 */
module.exports = {
  version: 8,
  id: '005_sync_outbox_leases',
  sql: `
ALTER TABLE sync_outbox ADD COLUMN lease_token TEXT;
ALTER TABLE sync_outbox ADD COLUMN lease_expires_at TEXT;
ALTER TABLE sync_outbox ADD COLUMN claimed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_outbox_inflight_lease
  ON sync_outbox(status, lease_expires_at);
`,
};
