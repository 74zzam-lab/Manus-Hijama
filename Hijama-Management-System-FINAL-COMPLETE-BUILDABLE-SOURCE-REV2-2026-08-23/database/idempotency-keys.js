'use strict';

/**
 * Stable outbox idempotency keys — duplicate enqueue with same logical op must not double-insert.
 */
const crypto = require('crypto');

function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function payloadHashFromEntry(entry) {
  if (entry.payload_hash) return String(entry.payload_hash);
  if (entry.payload_json == null) return '';
  const raw = typeof entry.payload_json === 'string'
    ? entry.payload_json
    : JSON.stringify(entry.payload_json);
  return sha256Hex(raw);
}

function buildTableBumpKey(entry) {
  const payloadHash = payloadHashFromEntry(entry);
  return [
    String(entry.center_id || ''),
    String(entry.branch_id || 'BR-MAIN'),
    String(entry.table_name || ''),
    'TABLE_BUMP',
    Number(entry.base_revision || 0),
    Number(entry.new_revision || 0),
    payloadHash,
  ].join(':');
}

function buildRecordOpKey(entry) {
  const opId = entry.operation_id || entry.operationId || '';
  if (opId) {
    return [
      String(entry.center_id || ''),
      String(entry.branch_id || 'BR-MAIN'),
      String(entry.table_name || ''),
      String(entry.record_id || ''),
      String(entry.operation || 'UPDATE'),
      String(opId),
    ].join(':');
  }
  const payloadHash = payloadHashFromEntry(entry);
  return [
    String(entry.center_id || ''),
    String(entry.branch_id || 'BR-MAIN'),
    String(entry.table_name || ''),
    String(entry.record_id || ''),
    String(entry.operation || 'UPDATE'),
    Number(entry.new_revision || 0),
    payloadHash,
  ].join(':');
}

function buildOutboxIdempotencyKey(entry) {
  if (entry.idempotency_key) return String(entry.idempotency_key);
  const op = String(entry.operation || 'TABLE_BUMP');
  if (op === 'TABLE_BUMP' || entry.record_id == null || entry.record_id === '') {
    return buildTableBumpKey(entry);
  }
  return buildRecordOpKey(entry);
}

module.exports = {
  sha256Hex,
  payloadHashFromEntry,
  buildTableBumpKey,
  buildRecordOpKey,
  buildOutboxIdempotencyKey,
};
