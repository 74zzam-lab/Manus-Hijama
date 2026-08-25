/**
 * Renderer mirror of database/idempotency-keys.js
 */
(function (global) {
  'use strict';

  function sha256Hex(text) {
    try {
      if (global.crypto?.subtle) {
        // sync path: use simple hash for idempotency (matches Node when payload provided)
        let h = 0;
        const s = String(text || '');
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        return `djb2-${(h >>> 0).toString(16)}`;
      }
    } catch { /* empty */ }
    return String(text || '').slice(0, 64);
  }

  function payloadHashFromEntry(entry) {
    if (entry.payload_hash) return String(entry.payload_hash);
    if (entry.payload_json == null) return '';
    const raw = typeof entry.payload_json === 'string'
      ? entry.payload_json
      : JSON.stringify(entry.payload_json);
    if (global.SyncPushGuards?.sha256) return global.SyncPushGuards.sha256(raw);
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

  global.IdempotencyKeys = {
    payloadHashFromEntry,
    buildTableBumpKey,
    buildRecordOpKey,
    buildOutboxIdempotencyKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
