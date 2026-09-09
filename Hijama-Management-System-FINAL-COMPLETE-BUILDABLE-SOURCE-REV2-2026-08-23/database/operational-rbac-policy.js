'use strict';

/**
 * Operational RBAC policy constants — shared Node (main) + verifier.
 */
const MANAGER_MIN_RANK = 4; // admin / hq_admin / owner
const OWNER_MIN_RANK = 6;

/** database:syncOp operations that require manager rank (admin+). */
const SYNC_OP_MIN_RANK = Object.freeze({
  resolveConflict: MANAGER_MIN_RANK,
  requeueDeadLetter: MANAGER_MIN_RANK,
  requeueDeadLetters: MANAGER_MIN_RANK,
  metaSet: MANAGER_MIN_RANK,
});

const MANAGER_ROLES = new Set(['admin', 'owner', 'hq_admin']);
const OWNER_ROLES = new Set(['owner', 'hq_admin']);

/** KV keys that require owner session to persist via IPC (PR12). */
const OWNER_KV_KEYS = new Set([
  '__tdw_cloud_license__',
  '__tdw_owner_profile__',
  '__tdw_owner_lifecycle__',
  '__tdw_owner_lifecycle_commit__',
  '__tdw_owner_bootstrap_v2__',
  '__tdw_owner_bootstrap_claim_lock__',
]);

const OWNER_KV_PREFIXES = ['__tdw_owner_'];

function isOwnerKvKey(key) {
  const k = String(key || '');
  if (OWNER_KV_KEYS.has(k)) return true;
  return OWNER_KV_PREFIXES.some((p) => k.startsWith(p));
}

function isManagerRole(role) {
  return MANAGER_ROLES.has(String(role || '').toLowerCase());
}

function isOwnerRole(role) {
  return OWNER_ROLES.has(String(role || '').toLowerCase());
}

module.exports = {
  MANAGER_MIN_RANK,
  OWNER_MIN_RANK,
  SYNC_OP_MIN_RANK,
  MANAGER_ROLES,
  OWNER_ROLES,
  OWNER_KV_KEYS,
  OWNER_KV_PREFIXES,
  isManagerRole,
  isOwnerRole,
  isOwnerKvKey,
};
