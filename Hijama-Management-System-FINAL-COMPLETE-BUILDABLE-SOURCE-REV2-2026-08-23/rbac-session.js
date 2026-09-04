'use strict';

const { SYNC_OP_MIN_RANK, isOwnerKvKey, isOwnerRole } = require('../database/operational-rbac-policy');

/**
 * V2-5.4 — Electron main RBAC session + channel policy.
 * Session is bound per webContents; privileged channels require an active session.
 */

const ROLE_RANK = {
  employee: 1,
  reception: 2,
  accountant: 3,
  admin: 4,
  hq_admin: 5,
  owner: 6,
  custom: 2,
};

/** Channels that anyone (even pre-login) may call — boot / Google bind / license pull. */
const PUBLIC_CHANNELS = new Set([
  'app:getRuntimeInfo',
  'app:relaunch',
  'app:consumeLicenseWipeFlag',
  'app:getDeviceFingerprintParts',
  'database:status',
  'database:hydrate',
  'database:autoCompleteUpgrade',
  'messaging:getStatus',
  'devices:getStatus',
  'devices:listPrinters',
  'backup:listCloudProviders',
  'backup:v2:health',
  'backup:v2:formatPolicy',
  'backup:v2:gate',
  'cache:getStatus',
  'cache:readLicense',
  'cache:readVersions',
  'cache:readBranchConfig',
  'communication:getStatus',
  'communication:listProviders',
  'cloudOAuth:getSettings',
  'cloudOAuth:testConnection',
  'license:readActivationBundle',
  'rbac:bindSession',
  'rbac:clearSession',
  'rbac:getSession',
  'dialog:confirmSync',
  'dialog:promptSync',
  'database:enableSqlitePrimary',
]);

/** Minimum role rank (or capability tags) for privileged channels. */
const CHANNEL_POLICY = {
  // Every main-process handler declares an authority policy; unclassified channels are denied.
  'app:openExternal': { minRank: 1 },
  // Dedicated packaged uninstaller window uses this before a clinic user session exists.
  'app:writeUninstallCenterMeta': { allowWithoutSession: true, uninstallOnly: true },
  'database:persistTable': { minRank: 2 },
  'database:persistKv': { minRank: 2 },
  'database:migrateFromBackup': { minRank: 4 },
  'database:exportSnapshot': { minRank: 3 },
  'database:syncOp': { minRank: 2 },
  'database:querySafe': { minRank: 1 },
  'backup:saveLocal': { minRank: 4 },
  'backup:pickLocalFolder': { minRank: 4 },
  // Setup connection + pre-login license/restore discovery are bootstrap-bound by main.
  'backup:getCloudStatus': { minRank: 4, allowWithoutSession: true, bootstrapOnly: true },
  'backup:startOAuth': { minRank: 4, allowWithoutSession: true, bootstrapOnly: true },
  'backup:connectGoogle': { minRank: 4, allowWithoutSession: true, bootstrapOnly: true },
  'backup:registerCloudAccount': { minRank: 4, allowWithoutSession: true, bootstrapOnly: true },
  'backup:disconnectCloud': { minRank: 4, allowWithoutSession: true, bootstrapOnly: true },
  'backup:listCloudBackups': { minRank: 4, allowWithoutSession: true, bootstrapOnly: true },
  'backup:discoverCloudRestorePoints': { minRank: 4, allowWithoutSession: true, bootstrapOnly: true },
  'backup:downloadCloudBackup': { minRank: 4, allowWithoutSession: true, bootstrapOnly: true },
  'backup:listDbBackups': { minRank: 4 },
  'backup:verifyCloudBackup': { minRank: 4 },
  'backup:verifyDbBackup': { minRank: 4 },
  'backup:v2:readiness': { minRank: 4, allowWithoutSession: true, bootstrapOnly: true },
  'backup:v2:listCloud': { minRank: 4, allowWithoutSession: true, bootstrapOnly: true },
  'backup:v2:pickFile': { minRank: 4, allowWithoutSession: true, bootstrapOnly: true },
  'backup:v2:pickLatest': { minRank: 4, allowWithoutSession: true, bootstrapOnly: true },
  'backup:v2:inspect': { minRank: 4, allowWithoutSession: true, bootstrapOnly: true },
  'backup:v2:stageRemote': { minRank: 4, allowWithoutSession: true, bootstrapOnly: true },
  // Pre-login activation gate pushes signed license.json to Drive (PR38 public path).
  'backup:uploadCloud': { minRank: 4, allowWithoutSession: true, bootstrapOnly: true },
  'backup:uploadSyncFile': { minRank: 2, allowWithoutSession: true, bootstrapOnly: true },
  'backup:downloadSyncFile': { minRank: 2, allowWithoutSession: true, bootstrapOnly: true },
  'backup:uploadDbBackup': { minRank: 4 },
  'backup:syncDbBackup': { minRank: 4 },
  'backup:deleteCloudBackup': { minRank: 4 },
  'backup:v2:create': { minRank: 4 },
  'backup:v2:restore': { minRank: 4 },
  'backup:v2:restoreLatest': { minRank: 4 },
  'backup:v2:pruneCloud': { minRank: 4 },
  'backup:v2:downloadAndRestore': { minRank: 4 },
  'backup:v2:downloadCloud': { minRank: 4 },
  'backup:v2:restoreUnified': { minRank: 4, bootstrapCapability: 'restore' },
  'backup:v2:restoreFromCloudRemote': { minRank: 4, bootstrapCapability: 'restore' },
  'backup:v2:deleteLocal': { minRank: 6, roles: ['owner'] },
  'backup:v2:prune': { minRank: 6, roles: ['owner'] },
  'backup:v2:scheduleConfigure': { minRank: 6, roles: ['owner'] },
  'backup:v2:importLegacy': { minRank: 6, roles: ['owner'] },
  'backup:v2:verify': { minRank: 4 },
  'backup:v2:listLocal': { minRank: 4 },
  // Pre-login restore is a narrow main-authorized bootstrap action; it never accepts renderer authority.
  'bootstrap:issueRestoreCapability': { allowWithoutSession: true, bootstrapOnly: true },
  'bootstrap:syncWizardState': { allowWithoutSession: true, bootstrapOnly: true },
  // Main verifies a signed cached license and one-time setup token; renderer may supply
  // only the plaintext credential inputs to be hashed by main.
  'owner:provisionInitial': { allowWithoutSession: true, bootstrapOnly: true },
  'backup:restoreDbBackup': { minRank: 4 },
  'attachments:validate': { minRank: 2 },
  'attachments:hashBuffer': { minRank: 2 },
  'attachments:writeLocal': { minRank: 2 },
  'attachments:readLocal': { minRank: 2 },
  'attachments:existsLocal': { minRank: 2 },
  'cache:writeLicense': { minRank: 5, roles: ['owner', 'hq_admin'], allowWithoutSession: true, bootstrapOnly: true },
  'cache:writeVersions': { minRank: 5, roles: ['owner', 'hq_admin'], allowWithoutSession: true, bootstrapOnly: true },
  'cache:writeBranchConfig': { minRank: 5, roles: ['owner', 'hq_admin'], allowWithoutSession: true, bootstrapOnly: true },
  'app:wipePersistentLicenseData': { minRank: 5, roles: ['owner', 'hq_admin'] },
  'license:writeLicenseShard': { minRank: 4 },
  'license:writeActivationBundle': { minRank: 4 },
  'license:updateLicenseIndex': { minRank: 4 },
  'license:writeCustomPackage': { minRank: 5, roles: ['owner', 'hq_admin'] },
  'license:appendPackageToRegistry': { minRank: 5, roles: ['owner', 'hq_admin'] },
  'cloudOAuth:saveSettings': { minRank: 4 },
  'messaging:sendWhatsApp': { minRank: 2 },
  'messaging:sendSMS': { minRank: 2 },
  'communication:init': { minRank: 4 },
  'communication:testProvider': { minRank: 4 },
  'communication:send': { minRank: 2 },
  'communication:processQueue': { minRank: 4 },
  'communication:getQueue': { minRank: 2 },
  'communication:clearQueue': { minRank: 4 },
  'whatsapp:embedShow': { minRank: 2 },
  'whatsapp:embedHide': { minRank: 2 },
  'whatsapp:embedBounds': { minRank: 2 },
  'whatsapp:openChat': { minRank: 2 },
  'whatsapp:writeContacts': { minRank: 2 },
  'whatsapp:openContactsFolder': { minRank: 2 },
  'whatsapp:openVcard': { minRank: 2 },
  'cloudOAuth:restoreDefaults': { minRank: 4 },
  'devices:openCashDrawer': { minRank: 2, permissions: ['cash.edit', 'cash.view'] },
  'devices:printWithDialog': { minRank: 2, permissions: ['reports.print'] },
  'devices:writeRaw': { minRank: 4, permissions: ['reports.print'] },
  'devices:openCashDrawerDirect': { minRank: 2, permissions: ['cash.edit'] },
  'devices:printThermal': { minRank: 2, permissions: ['reports.print', 'cases.view'] },
  'devices:printA4': { minRank: 2, permissions: ['reports.print'] },
  'devices:exportA4Pdf': { minRank: 2, permissions: ['reports.print'] },
};

const sessions = new Map(); // webContents.id -> session
let runtime = { isProduction: false };

function configureRuntime(options = {}) {
  runtime = { ...runtime, isProduction: options.isProduction === true };
}

function rankOf(role) {
  return ROLE_RANK[String(role || '').toLowerCase()] || 0;
}

function getSession(event) {
  const id = event?.sender?.id;
  if (id == null) return null;
  return sessions.get(id) || null;
}

function bindSession(event, claim) {
  claim = claim || {};
  const id = event?.sender?.id;
  if (id == null) return { ok: false, error: 'no_sender' };
  const userId = String(claim.userId || claim.id || '').trim();
  const role = String(claim.role || '').trim().toLowerCase();
  if (!userId) return { ok: false, error: 'user_id_required' };
  if (!ROLE_RANK[role] && role !== 'custom') return { ok: false, error: 'invalid_role' };

  // Authoritative lookup from main-process KV. Renderer claims are NEVER trusted when KV is empty.
  let authoritativeRole = role;
  let branchScope = Array.isArray(claim.branchScope) ? claim.branchScope.slice() : ['*'];
  let permissions = claim.permissions && typeof claim.permissions === 'object' ? claim.permissions : null;
  // Synthetic developer account is never stored in KV users (local support only).
  const isDevAccount = userId === '__dev__' && (role === 'admin' || role === 'owner');
  if (isDevAccount && runtime.isProduction) {
    return { ok: false, error: 'dev_account_disabled_in_production' };
  }
  if (!isDevAccount) {
    if (typeof claim.lookupUsers !== 'function') {
      return { ok: false, error: 'authoritative_lookup_required', action: 'refresh_users' };
    }
    let users = [];
    try {
      users = claim.lookupUsers() || [];
    } catch {
      return { ok: false, error: 'authoritative_lookup_failed', action: 'refresh_users' };
    }
    if (!users.length) {
      // DENY — caller must seedUsersIfEmpty then retry. Never trust renderer claim.
      return { ok: false, error: 'users_kv_empty', action: 'refresh_users' };
    }
    const real = users.find((u) => u && String(u.id) === userId && u.active !== false);
    if (!real) return { ok: false, error: 'user_not_found', action: 'refresh_users' };
    if (real.active === false) return { ok: false, error: 'user_disabled' };
    authoritativeRole = String(real.role || '').toLowerCase();
    if (Array.isArray(real.branchScope)) branchScope = real.branchScope.slice();
    if (real.permissions) permissions = real.permissions;
    if (role && role !== authoritativeRole) {
      return { ok: false, error: 'tampered_role', expected: authoritativeRole, claimed: role };
    }
  }

  const session = {
    userId,
    role: authoritativeRole,
    branchScope,
    permissions,
    boundAt: new Date().toISOString(),
    rank: rankOf(authoritativeRole),
  };
  sessions.set(id, session);
  return { ok: true, session: { userId: session.userId, role: session.role, boundAt: session.boundAt } };
}

function clearSession(event) {
  const id = event?.sender?.id;
  if (id != null) sessions.delete(id);
  return { ok: true };
}

function sessionAllowsChannel(session, channel, opts = null) {
  if (PUBLIC_CHANNELS.has(channel)) return { ok: true, public: true };
  const policy = CHANNEL_POLICY[channel];
  if (policy && policy.public === true) return { ok: true, public: true };
  if (!policy) {
    // Default-deny: every production IPC channel must declare its authority requirement.
    return { ok: false, error: 'rbac_channel_unclassified' };
  }
  if (!session) {
    // `allowWithoutSession` is never a generic bypass. The main process must attach a
    // non-forgeable runtime context for one of the explicitly bounded pre-session flows.
    const trusted = opts?.__trustedIpcContext || {};
    if (policy.uninstallOnly === true) {
      return trusted.uninstallMode === true
        ? { ok: true, uninstall: true }
        : { ok: false, error: 'rbac_uninstall_mode_required' };
    }
    if (policy.bootstrapOnly === true) {
      return trusted.bootstrapPhase === true
        ? { ok: true, bootstrap: true }
        : { ok: false, error: 'rbac_bootstrap_phase_required' };
    }
    return { ok: false, error: 'rbac_session_required' };
  }
  if (Array.isArray(policy.roles) && policy.roles.length) {
    if (!policy.roles.includes(session.role)) {
      return { ok: false, error: 'rbac_role_denied', required: policy.roles, role: session.role };
    }
  }
  if (policy.minRank != null && session.rank < policy.minRank) {
    return { ok: false, error: 'rbac_rank_denied', minRank: policy.minRank, rank: session.rank };
  }
  if (Array.isArray(policy.permissions) && policy.permissions.length) {
    // Managers/owner bypass permission tags.
    if (session.rank >= 4) return { ok: true };
    const perms = session.permissions || {};
    const ok = policy.permissions.some((p) => perms[p]);
    if (!ok) return { ok: false, error: 'rbac_permission_denied', permissions: policy.permissions };
  }
  return { ok: true };
}

function assertSyncOpAllowed(event, op) {
  const minRank = SYNC_OP_MIN_RANK[String(op || '')];
  if (!minRank) return { ok: true };
  const session = getSession(event);
  if (!session) {
    const err = new Error('rbac_session_required');
    err.code = 'rbac_session_required';
    err.ok = false;
    err.rbac = { ok: false, error: 'rbac_session_required', op };
    throw err;
  }
  if (session.rank < minRank) {
    const err = new Error('rbac_rank_denied');
    err.code = 'rbac_rank_denied';
    err.ok = false;
    err.rbac = { ok: false, error: 'rbac_rank_denied', minRank, rank: session.rank, op };
    throw err;
  }
  return { ok: true, session };
}

function assertChannelAllowed(event, channel, opts) {
  if (PUBLIC_CHANNELS.has(channel)) return { ok: true, public: true };
  const policy = CHANNEL_POLICY[channel];
  if (policy && policy.public === true) return { ok: true, public: true };

  const session = getSession(event);
  if (session) {
    const gate = sessionAllowsChannel(session, channel, opts);
    if (!gate.ok) {
      const err = new Error(gate.error || 'rbac_denied');
      err.code = gate.error || 'RBAC_DENIED';
      err.ok = false;
      err.rbac = gate;
      throw err;
    }
    return gate;
  }

  if (policy?.bootstrapCapability) {
    const bootstrapRestoreCap = require('./bootstrap-restore-capability');
    const capGate = bootstrapRestoreCap.tryAuthorizeChannel(event, channel, opts);
    if (capGate.ok) return capGate;
    if (opts?.bootstrapRestoreCapabilityId) {
      const err = new Error(capGate.error || 'restore_authorization_required');
      err.code = capGate.error || 'restore_authorization_required';
      err.ok = false;
      err.rbac = capGate;
      throw err;
    }
    const err = new Error('rbac_session_required');
    err.code = 'rbac_session_required';
    err.ok = false;
    err.rbac = { ok: false, error: 'rbac_session_required' };
    throw err;
  }

  const gate = sessionAllowsChannel(session, channel, opts);
  if (!gate.ok) {
    const err = new Error(gate.error || 'rbac_denied');
    err.code = gate.error || 'RBAC_DENIED';
    err.ok = false;
    err.rbac = gate;
    throw err;
  }
  return gate;
}

function assertBranchInSession(event, branchId) {
  if (!branchId) return { ok: true };
  const session = getSession(event);
  if (!session) return { ok: false, error: 'rbac_session_required' };
  const scope = session.branchScope || [];
  if (scope.includes('*') || scope.includes(branchId)) return { ok: true };
  return { ok: false, error: 'branch_access_denied', branchId };
}

function assertOwnerKvWrite(event, key) {
  if (!isOwnerKvKey(key)) return { ok: true };
  const session = getSession(event);
  if (!session) {
    const err = new Error('rbac_session_required');
    err.code = 'rbac_session_required';
    err.ok = false;
    throw err;
  }
  if (!isOwnerRole(session.role)) {
    const err = new Error('owner_kv_denied');
    err.code = 'owner_kv_denied';
    err.ok = false;
    throw err;
  }
  return { ok: true, session };
}

module.exports = {
  ROLE_RANK,
  PUBLIC_CHANNELS,
  CHANNEL_POLICY,
  bindSession,
  clearSession,
  getSession,
  sessionAllowsChannel,
  assertChannelAllowed,
  assertSyncOpAllowed,
  assertBranchInSession,
  assertOwnerKvWrite,
  rankOf,
  configureRuntime,
};
