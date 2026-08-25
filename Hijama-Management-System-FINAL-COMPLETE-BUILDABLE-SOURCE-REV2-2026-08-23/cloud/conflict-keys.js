/**
 * PR10 — Renderer mirror of database/conflict-keys.js
 */
(function (global) {
  'use strict';

  function normalizePart(value, fallback) {
    return String(value == null ? fallback : value).trim();
  }

  function buildConflictId(entry) {
    const center = normalizePart(entry.center_id || entry.centerId, 'CTR');
    const branch = normalizePart(entry.branch_id || entry.branchId, 'BR-MAIN');
    const table = normalizePart(entry.table_name || entry.table, '');
    const recordId = normalizePart(entry.record_id || entry.recordId, '');
    if (!table || !recordId) return null;
    return `cf:${center}:${branch}:${table}:${recordId}`;
  }

  global.ConflictKeys = {
    buildConflictId,
  };
})(typeof window !== 'undefined' ? window : globalThis);
