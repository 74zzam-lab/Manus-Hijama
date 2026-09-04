'use strict';

const DEFAULT_BRANCH_ID = 'BR-MAIN';

function normalizeBranchId(branchId) {
  const bid = String(branchId || '').trim();
  if (!bid) throw Object.assign(new Error('branch_id_required'), { code: 'branch_id_required' });
  return bid;
}

function assertRecordBranch(record, branchId) {
  const bid = normalizeBranchId(branchId);
  const recBranch = record?.branchId || null;
  if (!record || typeof record !== 'object') {
    throw Object.assign(new Error('record_invalid'), { code: 'record_invalid' });
  }
  if (recBranch !== bid) {
    throw Object.assign(new Error('branch_id_tamper'), { code: 'branch_id_tamper' });
  }
}

function recordMatchesBranch(record, branchId) {
  const bid = normalizeBranchId(branchId);
  if (!record || typeof record !== 'object') return false;
  return String(record.branchId || '') === bid;
}

function selectIdsForBranch(db, tableName, branchId) {
  const bid = normalizeBranchId(branchId);
  return db.prepare(`SELECT id FROM ${tableName} WHERE branch_id = ?`).all(bid);
}

function countForBranch(db, tableName, branchId) {
  const bid = normalizeBranchId(branchId);
  return db.prepare(`SELECT COUNT(*) AS c FROM ${tableName} WHERE branch_id = ?`).get(bid).c;
}

function getByIdScoped(db, tableName, id, branchId) {
  const row = db.prepare(
    `SELECT payload_json, branch_id FROM ${tableName} WHERE id = ?`
  ).get(String(id));
  if (!row) return null;
  const bid = normalizeBranchId(branchId);
  if (String(row.branch_id || '') !== bid) return null;
  try {
    return JSON.parse(row.payload_json);
  } catch {
    return null;
  }
}

function assertNoBranchIdCollision(db, tableName, id, branchId) {
  const existing = db.prepare(`SELECT branch_id, payload_json FROM ${tableName} WHERE id = ?`).get(String(id));
  if (!existing) return;
  let existingBranch = existing.branch_id || null;
  if (!existingBranch && existing.payload_json) {
    try { existingBranch = JSON.parse(existing.payload_json)?.branchId || null; } catch { /* corrupt payload is handled elsewhere */ }
  }
  if (existingBranch && String(existingBranch) !== String(branchId)) {
    throw Object.assign(new Error('branch_id_collision'), {
      code: 'branch_id_collision', table: tableName, id: String(id), existingBranchId: existingBranch, incomingBranchId: branchId,
    });
  }
  if (!existingBranch) {
    throw Object.assign(new Error('legacy_branch_migration_required'), {
      code: 'legacy_branch_migration_required', table: tableName, id: String(id), incomingBranchId: branchId,
    });
  }
}

function replaceBranchSlice(db, tableName, repo, list, branchId, onBeforeDelete) {
  const bid = normalizeBranchId(branchId);
  const tx = db.transaction((items, b) => {
    const ids = new Set();
    for (const item of items || []) {
      assertRecordBranch(item, b);
      assertNoBranchIdCollision(db, tableName, item.id, b);
      repo.upsert(item);
      ids.add(String(item.id));
    }
    for (const row of selectIdsForBranch(db, tableName, b)) {
      if (ids.has(String(row.id))) continue;
      if (onBeforeDelete) onBeforeDelete(row.id);
      db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(row.id);
    }
  });
  tx(list, bid);
}

function listForBranch(db, tableName, branchId) {
  const bid = normalizeBranchId(branchId);
  const rows = selectIdsForBranch(db, tableName, bid);
  const out = [];
  for (const row of rows) {
    const full = db.prepare(
      `SELECT payload_json FROM ${tableName} WHERE id = ?`
    ).get(String(row.id));
    if (!full) continue;
    try {
      out.push(JSON.parse(full.payload_json));
    } catch { /* skip corrupt */ }
  }
  return out;
}

function sumTotalForBranch(db, branchId) {
  const bid = normalizeBranchId(branchId);
  return db.prepare(
    `SELECT COALESCE(SUM(total),0) AS s FROM visits WHERE branch_id = ?`
  ).get(bid).s;
}

function replaceAttendanceBranchSlice(db, repo, list, branchId) {
  const bid = normalizeBranchId(branchId);
  const tx = db.transaction((items, b) => {
    const ids = new Set();
    for (const item of items || []) {
      assertRecordBranch(item, b);
      assertNoBranchIdCollision(db, 'attendance', item.id, b);
      repo.upsert(item);
      ids.add(String(item.id));
    }
    for (const row of db.prepare('SELECT id, payload_json FROM attendance').all()) {
      let payload;
      try { payload = JSON.parse(row.payload_json); } catch { continue; }
      if (!recordMatchesBranch(payload, b)) continue;
      if (!ids.has(String(row.id))) {
        db.prepare('DELETE FROM attendance WHERE id = ?').run(row.id);
      }
    }
  });
  tx(list, bid);
}

module.exports = {
  DEFAULT_BRANCH_ID,
  normalizeBranchId,
  assertRecordBranch,
  recordMatchesBranch,
  selectIdsForBranch,
  countForBranch,
  getByIdScoped,
  replaceBranchSlice,
  replaceAttendanceBranchSlice,
  listForBranch,
  sumTotalForBranch,
  assertNoBranchIdCollision,
};
