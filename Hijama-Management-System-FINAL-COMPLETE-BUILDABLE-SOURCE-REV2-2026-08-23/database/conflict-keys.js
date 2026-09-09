'use strict';

/**
 * PR10 — Deterministic conflict identity (SQLite authority).
 * One open conflict per center + branch + table + record.
 */
function normalizePart(value, fallback = '') {
  return String(value == null ? fallback : value).trim();
}

function buildConflictId(entry) {
  const center = normalizePart(entry.center_id || entry.centerId, 'CTR');
  const branch = normalizePart(entry.branch_id || entry.branchId, 'BR-MAIN');
  const table = normalizePart(entry.table_name || entry.table, '');
  const recordId = normalizePart(entry.record_id || entry.recordId, '');
  if (!table || !recordId) {
    throw new Error('conflict_key_parts_required');
  }
  return `cf:${center}:${branch}:${table}:${recordId}`;
}

module.exports = {
  buildConflictId,
};
