/**
 * Owner Profile Store (Phase 23 / V2-5.3)
 * Additive storage for organization owner credentials metadata.
 * V2-5.3: recovery, emergency recovery, ownership transfer, session epoch invalidation.
 */
(function (global) {
  'use strict';

  const OWNER_PROFILE_KEY = '__tdw_owner_profile__';
  const SESSION_EPOCH_KEY = '__tdw_owner_session_epoch__';

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeUsername(username) {
    return String(username || '').trim().toLowerCase();
  }

  function normalizeRecoveryCode(code) {
    return String(code || '').trim();
  }

  function hasCryptoSubtle() {
    return !!(global.crypto && global.crypto.subtle && global.TextEncoder);
  }

  function randomSaltHex(size) {
    size = Number(size) || 16;
    const bytes = new Uint8Array(Math.max(8, size));
    if (global.crypto?.getRandomValues) global.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function sha256Hex(text) {
    if (hasCryptoSubtle()) {
      const msg = new TextEncoder().encode(String(text || ''));
      const digest = await global.crypto.subtle.digest('SHA-256', msg);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback for non-browser test contexts.
    let hash = 2166136261 >>> 0;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
  }

  async function derivePasswordHash(username, password, salt) {
    const payload = `${normalizeUsername(username)}|${String(password || '')}|${String(salt || '')}|tdw-owner-v1`;
    const hash = await sha256Hex(payload);
    return `sha256:${hash}`;
  }

  async function deriveRecoveryHash(recoveryCode, salt) {
    const payload = `${normalizeRecoveryCode(recoveryCode)}|${String(salt || '')}|tdw-owner-recovery-v1`;
    const hash = await sha256Hex(payload);
    return `sha256:${hash}`;
  }

  function loadProfile() {
    const data = global.DB?.get?.(OWNER_PROFILE_KEY, null);
    if (!data || typeof data !== 'object') return null;
    return data;
  }

  function hasProfile() {
    return !!loadProfile();
  }

  function getRole() {
    // Prefer the logged-in user — profile.role alone would let any caller pass as owner.
    const user = global.Auth?.getCurrentUser?.() || global.currentUser;
    if (user?.role) return String(user.role).toLowerCase();
    const profile = loadProfile();
    if (profile?.role) return String(profile.role).toLowerCase();
    return null;
  }

  /** True only when the *current session user* is an organization owner. */
  function currentUserIsOwner() {
    const user = global.Auth?.getCurrentUser?.() || global.currentUser;
    if (!user) return false;
    if (global.RolePolicy?.canManageOrganization?.(user)) return true;
    return String(user.role || '').toLowerCase() === 'owner';
  }

  function getSessionEpoch() {
    const fromProfile = Number(loadProfile()?.sessionEpoch);
    if (Number.isFinite(fromProfile) && fromProfile > 0) return fromProfile;
    const fromKey = Number(global.DB?.get?.(SESSION_EPOCH_KEY, 0));
    return Number.isFinite(fromKey) ? fromKey : 0;
  }

  function bumpSessionEpoch(profile) {
    const next = (Number(profile?.sessionEpoch) || getSessionEpoch() || 0) + 1;
    if (profile) profile.sessionEpoch = next;
    try { global.DB?.set?.(SESSION_EPOCH_KEY, next); } catch { /* empty */ }
    return next;
  }

  function invalidateSessions(reason) {
    const profile = loadProfile();
    const epoch = bumpSessionEpoch(profile || {});
    if (profile) {
      profile.updatedAt = nowIso();
      profile.passwordChangedAt = nowIso();
      global.DB?.set?.(OWNER_PROFILE_KEY, profile);
    }
    try {
      if (typeof global.clearUserSession === 'function') global.clearUserSession();
      else if (typeof global.terminateSession === 'function') global.terminateSession(reason || 'password_reset');
    } catch { /* empty */ }
    global.AuditLogger?.log?.({
      action: 'OWNER_SESSIONS_INVALIDATED',
      entity: 'owner_profile',
      entityId: profile?.username || '',
      summary: `Sessions invalidated (${reason || 'unknown'}) epoch=${epoch}`
    });
    return { ok: true, sessionEpoch: epoch };
  }

  function clearProfile() {
    try { global.DB?.set?.(OWNER_PROFILE_KEY, null); } catch { /* empty */ }
    return { ok: true };
  }

  function getCloudIdentity() {
    const lic = global.LicenseCloud?.loadLocal?.() || {};
    const id = lic.ownerIdentity || {};
    return {
      authorizedEmail: id.authorizedEmail || '',
      authorizedEmailDigest: id.authorizedEmailDigest || '',
      boundGoogleEmail: id.boundGoogleEmail || '',
      boundAt: id.boundAt || '',
      identityRevision: id.identityRevision || 0
    };
  }

  const MIN_PASSWORD_LENGTH = 8;

  async function createProfile(input) {
    input = input || {};
    const username = normalizeUsername(input.username);
    const password = String(input.password || '');
    const recoveryCode = normalizeRecoveryCode(input.recoveryCode || input.recoveryPin || '');

    if (!username) return { ok: false, error: 'username_required' };
    if (!password) return { ok: false, error: 'password_required' };
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, error: 'password_too_short', min: MIN_PASSWORD_LENGTH };
    }
    if (!recoveryCode) return { ok: false, error: 'recovery_required' };
    if (hasProfile()) return { ok: false, error: 'profile_exists' };

    const salt = randomSaltHex(16);
    const passwordHash = await derivePasswordHash(username, password, salt);
    const recoveryHash = await deriveRecoveryHash(recoveryCode, salt);
    const orgId = global.Organization?.getId?.() || global.CenterId?.getStoredCenterId?.() || '';
    const centerId = global.CenterId?.getStoredCenterId?.() || orgId || '';
    const profile = {
      schemaVersion: 1,
      role: 'owner',
      username,
      passwordHash,
      salt,
      recovery: {
        type: input.recoveryPin ? 'pin' : 'code',
        hash: recoveryHash
      },
      orgId,
      centerId,
      cloudIdentity: getCloudIdentity(),
      sessionEpoch: 1,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    global.DB?.set?.(OWNER_PROFILE_KEY, profile);
    try { global.DB?.set?.(SESSION_EPOCH_KEY, 1); } catch { /* empty */ }
    return { ok: true, profile };
  }

  async function verifyPassword(username, password) {
    const profile = loadProfile();
    if (!profile) return false;
    if (normalizeUsername(username) !== profile.username) return false;
    const hash = await derivePasswordHash(username, password, profile.salt);
    return hash === profile.passwordHash;
  }

  async function verifyRecoveryCode(code) {
    const profile = loadProfile();
    if (!profile) return false;
    const hash = await deriveRecoveryHash(code, profile.salt);
    return hash === profile?.recovery?.hash;
  }

  async function rotatePassword(nextPassword, options) {
    options = options || {};
    const profile = loadProfile();
    if (!profile) return { ok: false, error: 'profile_missing' };
    const p = String(nextPassword || '');
    if (!p) return { ok: false, error: 'password_required' };
    if (p.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, error: 'password_too_short', min: MIN_PASSWORD_LENGTH };
    }
    profile.passwordHash = await derivePasswordHash(profile.username, p, profile.salt);
    profile.updatedAt = nowIso();
    profile.passwordChangedAt = nowIso();
    const epoch = bumpSessionEpoch(profile);
    global.DB?.set?.(OWNER_PROFILE_KEY, profile);
    if (options.invalidateSessions !== false) {
      try {
        if (typeof global.clearUserSession === 'function') global.clearUserSession();
      } catch { /* empty */ }
    }
    global.AuditLogger?.log?.({
      action: 'OWNER_PASSWORD_ROTATED',
      entity: 'owner_profile',
      entityId: profile.username,
      summary: `Owner password rotated; sessionEpoch=${epoch}`
    });
    return { ok: true, profile, sessionEpoch: epoch, sessionsInvalidated: options.invalidateSessions !== false };
  }

  /**
   * Password reset via recovery code when profile exists.
   */
  async function resetPasswordWithRecovery(input) {
    input = input || {};
    const profile = loadProfile();
    if (!profile) return { ok: false, error: 'profile_missing' };
    const code = normalizeRecoveryCode(input.recoveryCode);
    if (!code) return { ok: false, error: 'recovery_required' };
    if (!(await verifyRecoveryCode(code))) return { ok: false, error: 'recovery_invalid' };
    const rotated = await rotatePassword(input.newPassword, { invalidateSessions: true });
    if (!rotated.ok) return rotated;
    global.AuditLogger?.log?.({
      action: 'OWNER_PASSWORD_RESET',
      entity: 'owner_profile',
      entityId: profile.username,
      summary: 'Owner password reset via recovery code; prior sessions invalidated'
    });
    return rotated;
  }

  /**
   * Recreate Owner profile when local metadata missing (e.g. after partial restore)
   * using emergency recovery hash stored on the license doc + authorized identity.
   */
  async function emergencyRecoverOwner(input) {
    input = input || {};
    if (hasProfile()) return { ok: false, error: 'profile_exists' };
    // Google alone must never authorize recovery.
    if (input.googleOnly === true || (input.googleEmail && !input.recoveryCode && !input.emergencyCode)) {
      return { ok: false, error: 'google_not_authorized' };
    }

    const doc = global.LicenseCloud?.loadLocal?.() || {};
    const rawBoot = doc.ownerBootstrap && typeof doc.ownerBootstrap === 'object' ? doc.ownerBootstrap : {};
    const cfg = global.OwnerBootstrap?.getBootstrapConfig?.(doc) || {};
    const emergencyCode = normalizeRecoveryCode(input.recoveryCode || input.emergencyCode);
    if (!emergencyCode) return { ok: false, error: 'recovery_required' };

    const email = String(input.authorizedEmail || '').trim().toLowerCase();
    let authorized = false;
    const storedHash = cfg.emergencyRecoveryHash || rawBoot.emergencyRecoveryHash || '';
    const recoverySalt = String(input.salt || rawBoot.recoverySalt || '').trim();

    if (storedHash && recoverySalt) {
      const h = await deriveRecoveryHash(emergencyCode, recoverySalt);
      if (h === storedHash) authorized = true;
    }
    // Explicit proveHash path for restore tooling (must still match stored hash).
    if (!authorized && storedHash && input.proveHash && String(input.proveHash) === String(storedHash)) {
      authorized = true;
    }

    // Google email / unauthorized accounts never authorize alone.
    if (!authorized) {
      global.AuditLogger?.log?.({
        action: 'OWNER_EMERGENCY_RECOVERY_DENIED',
        entity: 'owner_profile',
        entityId: email || 'unknown',
        summary: 'Unauthorized emergency owner recovery attempt'
      });
      return { ok: false, error: 'recovery_unauthorized' };
    }

    const username = normalizeUsername(input.username || cfg.claimedBy || 'owner');
    const password = String(input.password || '');
    const newRecovery = normalizeRecoveryCode(input.newRecoveryCode || emergencyCode);
    if (!username || !password || !newRecovery) {
      return { ok: false, error: 'profile_fields_required' };
    }

    const created = await createProfile({
      username,
      password,
      recoveryCode: newRecovery
    });
    if (!created?.ok) return created;

    try {
      const next = global.LicenseCloud?.loadLocal?.() || doc;
      next.ownerBootstrap = {
        ...(next.ownerBootstrap || {}),
        emergencyRecoveryHash: created.profile.recovery.hash,
        recoverySalt: created.profile.salt || null,
        claimedBy: username,
        emergencyRecoveredAt: nowIso()
      };
      if (global.OwnerHub?.saveLicenseDoc) await global.OwnerHub.saveLicenseDoc(next);
      else global.LicenseCloud?.saveLocal?.(next);
    } catch { /* empty */ }

    global.OwnerMigration?.promoteUserToOwnerRole?.(username);
    try { global.OwnerSetupState?.clearRequired?.(); } catch { /* empty */ }

    global.AuditLogger?.log?.({
      action: 'OWNER_EMERGENCY_RECOVERY',
      entity: 'owner_profile',
      entityId: username,
      summary: 'Owner profile recreated via authorized emergency recovery'
    });
    return { ok: true, profile: created.profile, method: 'emergency_recovery' };
  }

  /**
   * Transfer ownership to a new username; demote old owner; invalidate sessions.
   */
  async function transferOwnership(input) {
    input = input || {};
    const ownerGate = global.OwnerTrustedAuthority?.assertOwnerMutation?.({ action: 'transferOwnership' });
    if (ownerGate && !ownerGate.ok) return ownerGate;
    const profile = loadProfile();
    if (!profile) return { ok: false, error: 'profile_missing' };

    const currentPassword = String(input.currentPassword || '');
    if (!currentPassword) return { ok: false, error: 'password_required' };
    if (!(await verifyPassword(profile.username, currentPassword))) {
      return { ok: false, error: 'password_invalid' };
    }

    const newUsername = normalizeUsername(input.newUsername);
    const newPassword = String(input.newPassword || '');
    const newRecovery = normalizeRecoveryCode(input.newRecoveryCode || input.recoveryCode);
    if (!newUsername || !newPassword || !newRecovery) {
      return { ok: false, error: 'profile_fields_required' };
    }
    if (newUsername === profile.username) {
      return { ok: false, error: 'same_owner' };
    }

    const oldUsername = profile.username;
    global.OwnerMigration?.demoteOwnerRole?.(oldUsername, { toRole: input.demoteToRole || 'admin' });

    clearProfile();
    const created = await createProfile({
      username: newUsername,
      password: newPassword,
      recoveryCode: newRecovery
    });
    if (!created?.ok) {
      // Best-effort: try to restore old profile marker is gone — re-promote old via migration is caller's concern.
      return created || { ok: false, error: 'create_failed' };
    }

    global.OwnerMigration?.promoteUserToOwnerRole?.(newUsername, { noCurrentUserFallback: true });
    invalidateSessions('ownership_transfer');

    try {
      const doc = global.LicenseCloud?.loadLocal?.();
      if (doc) {
        doc.ownerBootstrap = {
          ...(doc.ownerBootstrap || {}),
          claimedBy: newUsername,
          emergencyRecoveryHash: created.profile.recovery.hash,
          transferredAt: nowIso(),
          previousOwner: oldUsername
        };
        doc.licenseVersion = (Number(doc.licenseVersion) || 0) + 1;
        if (global.OwnerHub?.saveLicenseDoc) await global.OwnerHub.saveLicenseDoc(doc);
        else global.LicenseCloud?.saveLocal?.(doc);
      }
    } catch { /* empty */ }

    global.AuditLogger?.log?.({
      action: 'OWNER_TRANSFER',
      entity: 'owner_profile',
      entityId: newUsername,
      summary: `Ownership transferred from ${oldUsername} to ${newUsername}`
    });
    return {
      ok: true,
      previousOwner: oldUsername,
      profile: created.profile,
      sessionEpoch: getSessionEpoch()
    };
  }

  function summarize() {
    const profile = loadProfile();
    if (!profile) return { exists: false };
    return {
      exists: true,
      role: profile.role || 'owner',
      username: profile.username || '',
      orgId: profile.orgId || '',
      centerId: profile.centerId || '',
      createdAt: profile.createdAt || '',
      updatedAt: profile.updatedAt || '',
      sessionEpoch: profile.sessionEpoch || getSessionEpoch(),
      passwordChangedAt: profile.passwordChangedAt || null,
      recoveryType: profile?.recovery?.type || 'code',
      hasCloudIdentity: !!(
        profile?.cloudIdentity?.boundGoogleEmail ||
        profile?.cloudIdentity?.authorizedEmail ||
        profile?.cloudIdentity?.authorizedEmailDigest
      )
    };
  }

  function isSessionEpochValid(sessionEpoch) {
    const current = getSessionEpoch();
    if (!current) return true;
    const s = Number(sessionEpoch);
    if (!Number.isFinite(s)) return false;
    return s === current;
  }

  /**
   * Heal missing OwnerProfile after seeded/restored Owner password change.
   * Creates a one-time recovery code (returned) so Hub leaves RECOVERY/مطلوب state.
   */
  async function ensureProfileFromOwnerUser(user, password, options) {
    options = options || {};
    if (hasProfile()) {
      const p = loadProfile();
      const uname = normalizeUsername(user?.username || p?.username);
      if (p && uname && p.username === uname && password) {
        try { await rotatePassword(password, { invalidateSessions: false }); } catch { /* empty */ }
      }
      return { ok: true, already: true, profile: p };
    }
    const username = normalizeUsername(user?.username);
    if (!username || !password) return { ok: false, error: 'username_or_password_required' };
    const recoveryCode = String(options.recoveryCode || ('OWN-' + randomSaltHex(4).toUpperCase()));
    const created = await createProfile({
      username,
      password,
      recoveryCode,
      fullName: user?.fullName || user?.name || username
    });
    if (!created?.ok) return created;
    try { global.OwnerSetupState?.clearRequired?.(); } catch { /* empty */ }
    try { global.OwnerManagement?.clearBootstrapOpenRequest?.(); } catch { /* empty */ }
    return { ok: true, profile: created.profile, recoveryCode, created: true };
  }

  global.OwnerProfile = {
    OWNER_PROFILE_KEY,
    SESSION_EPOCH_KEY,
    MIN_PASSWORD_LENGTH,
    normalizeUsername,
    normalizeRecoveryCode,
    hasProfile,
    loadProfile,
    clearProfile,
    createProfile,
    ensureProfileFromOwnerUser,
    verifyPassword,
    verifyRecoveryCode,
    rotatePassword,
    resetPasswordWithRecovery,
    emergencyRecoverOwner,
    transferOwnership,
    invalidateSessions,
    getSessionEpoch,
    isSessionEpochValid,
    getRole,
    currentUserIsOwner,
    summarize,
    deriveRecoveryHash,
    derivePasswordHash
  };
})(typeof window !== 'undefined' ? window : globalThis);
