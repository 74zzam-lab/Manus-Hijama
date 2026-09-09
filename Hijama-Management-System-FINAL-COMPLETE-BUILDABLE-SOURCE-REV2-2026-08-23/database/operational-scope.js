'use strict';

/**
 * Trusted operational scope — organization (center) + branch enforcement for main-process boundaries.
 * Renderer/UI filters are not sufficient; IPC and SQLite paths use this module.
 */
const { DEFAULT_BRANCH_ID } = require('./repositories/branch-slice');

const OPERATIONAL_TABLE_KEYS = Object.freeze([
  'clientsRegistry',
  'cases',
  'bookings',
  'doctors',
  'attendance',
  'expenses',
]);

const AGGREGATE_BRANCH_MARKERS = new Set(['*', '__ALL__']);

function isOperationalTable(tableKey) {
  return OPERATIONAL_TABLE_KEYS.includes(String(tableKey || ''));
}

function normalizeBranchId(branchId) {
  const bid = String(branchId || '').trim();
  if (!bid || AGGREGATE_BRANCH_MARKERS.has(bid)) return null;
  return bid;
}

function assertWriteBranchId(branchId) {
  const bid = normalizeBranchId(branchId);
  if (!bid) {
    const err = new Error('branch_id_required');
    err.code = 'branch_id_required';
    throw err;
  }
  return bid;
}

function sessionHasAggregateScope(session) {
  const scope = session?.branchScope;
  return Array.isArray(scope) && scope.includes('*');
}

function isOwnerLikeSession(session) {
  const role = String(session?.role || '').toLowerCase();
  return role === 'owner' || role === 'hq_admin';
}

/**
 * Owner aggregate read is allowed when session has * scope and caller requests aggregateRead.
 * Operational writes always require an explicit branch id (never *).
 */
function resolveReadScope(session, request = {}) {
  const requestedBranch = normalizeBranchId(request.branchId);
  const aggregateRead = request.aggregateRead === true;

  if (aggregateRead) {
    if (!session) {
      return { ok: false, error: 'rbac_session_required' };
    }
    if (!sessionHasAggregateScope(session) || !isOwnerLikeSession(session)) {
      return { ok: false, error: 'aggregate_read_denied' };
    }
    return { ok: true, aggregate: true, branchId: null };
  }

  if (!requestedBranch) {
    return { ok: false, error: 'branch_id_required' };
  }
  return { ok: true, aggregate: false, branchId: requestedBranch };
}

function assertSessionBranchAccess(session, branchId) {
  const bid = normalizeBranchId(branchId);
  if (!bid) {
    return { ok: false, error: 'branch_id_required' };
  }
  if (!session) {
    return { ok: false, error: 'rbac_session_required' };
  }
  const scope = session.branchScope || [];
  if (scope.includes('*') || scope.includes(bid)) {
    return { ok: true, branchId: bid };
  }
  return { ok: false, error: 'branch_access_denied', branchId: bid };
}

function assertOwnerOperationalWrite(session, branchId) {
  const bid = assertWriteBranchId(branchId);
  if (!session) {
    const err = new Error('rbac_session_required');
    err.code = 'rbac_session_required';
    throw err;
  }
  if (isOwnerLikeSession(session) && sessionHasAggregateScope(session) && !bid) {
    const err = new Error('owner_write_branch_required');
    err.code = 'owner_write_branch_required';
    throw err;
  }
  const access = assertSessionBranchAccess(session, bid);
  if (!access.ok) {
    const err = new Error(access.error || 'branch_access_denied');
    err.code = access.error || 'branch_access_denied';
    throw err;
  }
  return bid;
}

function assertOperationalRecordsBranch(records, branchId) {
  const bid = assertWriteBranchId(branchId);
  const list = Array.isArray(records) ? records : [];
  for (const row of list) {
    const recBranch = normalizeBranchId(row?.branchId);
    if (!recBranch) {
      const err = new Error('record_branch_id_required');
      err.code = 'record_branch_id_required';
      throw err;
    }
    if (recBranch !== bid) {
      const err = new Error('branch_id_tamper');
      err.code = 'branch_id_tamper';
      throw err;
    }
  }
  return { ok: true, branchId: bid, count: list.length };
}

function legacyNullBranchMatches(branchId) {
  return normalizeBranchId(branchId) === DEFAULT_BRANCH_ID;
}

module.exports = {
  OPERATIONAL_TABLE_KEYS,
  DEFAULT_BRANCH_ID,
  isOperationalTable,
  normalizeBranchId,
  assertWriteBranchId,
  sessionHasAggregateScope,
  isOwnerLikeSession,
  resolveReadScope,
  assertSessionBranchAccess,
  assertOwnerOperationalWrite,
  assertOperationalRecordsBranch,
  legacyNullBranchMatches,
};
