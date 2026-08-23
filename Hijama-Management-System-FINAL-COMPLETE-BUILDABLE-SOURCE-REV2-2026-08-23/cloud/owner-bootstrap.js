/**
 * Owner Bootstrap (V2-3 / V2-5.3) — safe first-Owner paths.
 * Google Login is Authentication only; never Authorization / Owner claim.
 *
 * Supported claim paths (local/interim until server invitations land):
 *  1. One-time organization setup token (license.ownerBootstrap.tokenHash + TTL)
 *  2. Pre-provisioned owner email allowlist (license.ownerBootstrap.emails)
 *  3. Explicit OwnerMigration interactive create (manager + no profile yet)
 *
 * Rejected: first Google account to connect becomes Owner.
 *
 * V2-5.3: token TTL, atomic once-only claim (CAS on licenseVersion + local claim lock).
 */
(function (global) {
  'use strict';

  const BOOTSTRAP_STATE_KEY = '__tdw_owner_bootstrap_v2__';
  const CLAIM_LOCK_KEY = '__tdw_owner_bootstrap_claim_lock__';
  const CLAIM_LOCK_TTL_MS = 30 * 1000;

  function loadState() {
    const raw = global.DB?.get?.(BOOTSTRAP_STATE_KEY, null);
    if (!raw || typeof raw !== 'object') {
      return { tokenConsumedAt: null, claimedBy: null, method: null };
    }
    return {
      tokenConsumedAt: raw.tokenConsumedAt || null,
      claimedBy: raw.claimedBy || null,
      method: raw.method || null
    };
  }

  function saveState(next) {
    const state = { ...loadState(), ...(next || {}) };
    global.DB?.set?.(BOOTSTRAP_STATE_KEY, state);
    return state;
  }

  function getBootstrapConfig(doc) {
    doc = doc || global.LicenseCloud?.loadLocal?.() || {};
    const cfg = doc.ownerBootstrap && typeof doc.ownerBootstrap === 'object'
      ? doc.ownerBootstrap
      : {};
    const emails = Array.isArray(cfg.emails)
      ? cfg.emails.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const ttlHours = cfg.ttlHours != null && cfg.ttlHours !== ''
      ? Number(cfg.ttlHours)
      : null;
    return {
      tokenHash: cfg.tokenHash ? String(cfg.tokenHash) : '',
      emails,
      consumed: !!cfg.consumed,
      consumedAt: cfg.consumedAt || null,
      method: cfg.method || null,
      claimedBy: cfg.claimedBy || null,
      expiresAt: cfg.expiresAt || null,
      issuedAt: cfg.issuedAt || null,
      ttlHours: Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : null,
      emergencyRecoveryHash: cfg.emergencyRecoveryHash || null,
      recoverySalt: cfg.recoverySalt || null
    };
  }

  function resolveTokenExpiry(cfg) {
    if (cfg.expiresAt) {
      const t = Date.parse(cfg.expiresAt);
      if (!Number.isNaN(t)) return t;
    }
    if (cfg.issuedAt && cfg.ttlHours) {
      const issued = Date.parse(cfg.issuedAt);
      if (!Number.isNaN(issued)) return issued + cfg.ttlHours * 3600 * 1000;
    }
    return null;
  }

  function isTokenExpired(cfg, nowMs) {
    const exp = resolveTokenExpiry(cfg);
    if (exp == null) return false;
    return (nowMs == null ? Date.now() : nowMs) > exp;
  }

  async function hashToken(token) {
    const raw = String(token || '').trim();
    if (!raw) return '';
    const CL = global.CommercialLicense;
    if (CL?.crypto?.hmacSha256Hex) {
      return CL.crypto.hmacSha256Hex(raw);
    }
    // Fallback: Web Crypto SHA-256 hex when CommercialLicense crypto unavailable.
    if (global.crypto?.subtle) {
      const buf = await global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return '';
  }

  /** Explicitly false — Google identity alone never proves Owner. */
  function googleLoginImpliesOwner() {
    return false;
  }

  function isProductionBootstrapLocked() {
    // When an Owner Profile already exists, no further bootstrap claims.
    if (global.OwnerProfile?.hasProfile?.()) return true;
    const cfg = getBootstrapConfig();
    if (cfg.consumed) return true;
    const st = loadState();
    return !!(st.tokenConsumedAt || st.claimedBy);
  }

  function matchPreProvisionedEmail(email) {
    const needle = String(email || '').trim().toLowerCase();
    if (!needle) return { ok: false, error: 'email_required' };
    if (isProductionBootstrapLocked()) return { ok: false, error: 'bootstrap_already_consumed' };
    const cfg = getBootstrapConfig();
    if (!cfg.emails.length) return { ok: false, error: 'no_preprovisioned_emails' };
    if (!cfg.emails.includes(needle)) return { ok: false, error: 'email_not_allowlisted' };
    return { ok: true, email: needle };
  }

  async function verifySetupToken(token, options) {
    options = options || {};
    if (isProductionBootstrapLocked()) return { ok: false, error: 'bootstrap_already_consumed' };
    const cfg = getBootstrapConfig(options.doc);
    if (!cfg.tokenHash) return { ok: false, error: 'no_setup_token_configured' };
    if (isTokenExpired(cfg, options.nowMs)) {
      return { ok: false, error: 'token_expired', expiresAt: cfg.expiresAt || null };
    }
    const hash = await hashToken(token);
    if (!hash || hash !== cfg.tokenHash) return { ok: false, error: 'invalid_setup_token' };
    return { ok: true, expiresAt: cfg.expiresAt || null };
  }

  function acquireClaimLock(claimedBy) {
    const now = Date.now();
    const existing = global.DB?.get?.(CLAIM_LOCK_KEY, null);
    if (existing && typeof existing === 'object' && Number(existing.expiresAt) > now) {
      return { ok: false, error: 'claim_conflict', lockedBy: existing.claimedBy || null };
    }
    global.DB?.set?.(CLAIM_LOCK_KEY, {
      claimedBy: claimedBy || null,
      expiresAt: now + CLAIM_LOCK_TTL_MS,
      at: new Date().toISOString()
    });
    return { ok: true };
  }

  function releaseClaimLock() {
    try { global.DB?.set?.(CLAIM_LOCK_KEY, null); } catch { /* empty */ }
  }

  /**
   * Atomic once-only consume of bootstrap on the shared license doc.
   * Uses licenseVersion compare-and-swap + local claim lock for races.
   */
  async function tryConsumeBootstrap(method, claimedBy, options) {
    options = options || {};
    if (typeof global.LicenseCloud?.pullLatest === 'function') {
      try { await global.LicenseCloud.pullLatest(); } catch { /* offline ok */ }
    } else if (typeof global.LicenseCloud?.pullFromDrive === 'function') {
      try { await global.LicenseCloud.pullFromDrive(); } catch { /* offline ok */ }
    }

    const lock = acquireClaimLock(claimedBy);
    if (!lock.ok) return lock;

    try {
      const snap = global.LicenseCloud?.loadLocal?.();
      if (!snap) return { ok: false, error: 'no_license' };
      if (global.OwnerProfile?.hasProfile?.()) {
        return { ok: false, error: 'owner_already_exists' };
      }
      if (getBootstrapConfig(snap).consumed) {
        return { ok: false, error: 'bootstrap_already_consumed' };
      }

      const expectedVersion = Number(snap.licenseVersion) || 0;
      // Re-read immediately before write (shared-doc race).
      const latest = global.LicenseCloud.loadLocal();
      if (!latest) return { ok: false, error: 'no_license' };
      if ((Number(latest.licenseVersion) || 0) !== expectedVersion) {
        return { ok: false, error: 'claim_conflict' };
      }
      if (getBootstrapConfig(latest).consumed) {
        return { ok: false, error: 'bootstrap_already_consumed' };
      }

      const now = new Date().toISOString();
      // Synchronous CAS: check + mutate + saveLocal with no await between.
      // Prevents Promise.all races from both passing an async gate.
      const gate = global.LicenseCloud.loadLocal();
      if (!gate) return { ok: false, error: 'no_license' };
      if ((Number(gate.licenseVersion) || 0) !== expectedVersion || getBootstrapConfig(gate).consumed) {
        return {
          ok: false,
          error: getBootstrapConfig(gate).consumed ? 'bootstrap_already_consumed' : 'claim_conflict'
        };
      }
      const next = JSON.parse(JSON.stringify(gate));
      next.ownerBootstrap = {
        ...(next.ownerBootstrap && typeof next.ownerBootstrap === 'object' ? next.ownerBootstrap : {}),
        consumed: true,
        consumedAt: now,
        method: method || 'unknown',
        claimedBy: claimedBy || null
      };
      next.licenseVersion = expectedVersion + 1;
      global.LicenseCloud?.saveLocal?.(next);

      const after = global.LicenseCloud?.loadLocal?.() || next;
      const afterCfg = getBootstrapConfig(after);
      if (!afterCfg.consumed) {
        return { ok: false, error: 'claim_conflict' };
      }
      if (afterCfg.claimedBy && claimedBy && afterCfg.claimedBy !== claimedBy) {
        return { ok: false, error: 'claim_conflict' };
      }

      // Optional durable push (async) after local CAS won.
      if (global.OwnerHub?.saveLicenseDoc) {
        try { await global.OwnerHub.saveLicenseDoc(after); } catch { /* offline ok */ }
      } else if (typeof global.LicenseCloud?.pushToDrive === 'function') {
        try { await global.LicenseCloud.pushToDrive(after); } catch { /* offline ok */ }
      }

      saveState({ tokenConsumedAt: now, claimedBy: claimedBy || null, method: method || 'unknown' });
      return { ok: true, doc: after, consumedAt: now };
    } finally {
      releaseClaimLock();
    }
  }

  async function markBootstrapConsumed(doc, method, claimedBy) {
    // Backward-compatible wrapper — prefer atomic path.
    const res = await tryConsumeBootstrap(method, claimedBy, { doc });
    return res;
  }

  /**
   * Redeem a one-time setup token and create Owner profile + role.
   * Does NOT use Google login as proof.
   * Consume is atomic before profile create (two-device race → one winner).
   */
  async function redeemSetupToken(token, profileInput) {
    const mainProvision = global.cuppingElectron?.owner?.provisionInitial || global.tadawi?.owner?.provisionInitial;
    if (mainProvision) {
      const centerId = String(global.LicenseCloud?.loadLocal?.()?.centerId || global.CenterId?.getStoredCenterId?.() || '').trim();
      if (!centerId) return { ok: false, error: 'center_id_required' };
      return mainProvision({
        centerId,
        setupToken: String(token || ''),
        username: String(profileInput?.username || ''),
        password: String(profileInput?.password || ''),
        recoveryCode: String(profileInput?.recoveryCode || ''),
        fullName: String(profileInput?.fullName || profileInput?.username || ''),
      });
    }
    if (global.cuppingElectron || global.tadawi) {
      return { ok: false, error: 'main_owner_provisioning_unavailable' };
    }

    const gate = await verifySetupToken(token);
    if (!gate.ok) return gate;
    if (global.OwnerProfile?.hasProfile?.()) return { ok: false, error: 'owner_already_exists' };
    if (global.OwnerLifecycleAuthority?.isCreateBlocked?.()) {
      return { ok: false, error: 'owner_create_blocked', code: 'EXISTING_NO_CREATE' };
    }

    const username = String(profileInput?.username || '').trim();
    const password = String(profileInput?.password || '').trim();
    const recoveryCode = String(profileInput?.recoveryCode || '').trim();
    if (!username || !password || !recoveryCode) {
      return { ok: false, error: 'profile_fields_required' };
    }

    const claimed = await tryConsumeBootstrap('setup_token', username);
    if (!claimed.ok) return claimed;

    const created = await global.OwnerProfile?.createProfile?.({ username, password, recoveryCode });
    if (!created?.ok) {
      return created || { ok: false, error: 'create_failed', bootstrapConsumed: true };
    }

    // Persist emergency recovery hash + salt on license for profile-loss recovery.
    try {
      const doc = global.LicenseCloud?.loadLocal?.();
      if (doc && created.profile?.recovery?.hash) {
        doc.ownerBootstrap = {
          ...(doc.ownerBootstrap || {}),
          emergencyRecoveryHash: created.profile.recovery.hash,
          recoverySalt: created.profile.salt || null,
          claimedBy: username
        };
        if (global.OwnerHub?.saveLicenseDoc) await global.OwnerHub.saveLicenseDoc(doc);
        else global.LicenseCloud?.saveLocal?.(doc);
      }
    } catch { /* empty */ }

    global.OwnerMigration?.promoteUserToOwnerRole?.(username);
    try { global.OwnerSetupState?.clearRequired?.(); } catch { /* empty */ }

    global.AuditLogger?.log?.({
      action: 'OWNER_BOOTSTRAP_TOKEN_REDEEMED',
      entity: 'owner_profile',
      entityId: username,
      summary: 'Owner created via one-time organization setup token'
    });
    return { ok: true, method: 'setup_token', profile: created.profile };
  }

  /**
   * Claim Owner via pre-provisioned email (must match allowlist on license).
   * Google email is an input identity string — not authorization by itself.
   */
  async function claimViaPreProvisionedEmail(email, profileInput) {
    // Electron must use the signed-token main workflow. Retaining a renderer-side
    // email allowlist claim there would recreate a parallel authority root.
    if (global.cuppingElectron || global.tadawi) {
      return { ok: false, error: 'preprovisioned_email_requires_main_workflow' };
    }
    const match = matchPreProvisionedEmail(email);
    if (!match.ok) return match;
    if (global.OwnerProfile?.hasProfile?.()) return { ok: false, error: 'owner_already_exists' };
    if (global.OwnerLifecycleAuthority?.isCreateBlocked?.()) {
      return { ok: false, error: 'owner_create_blocked', code: 'EXISTING_NO_CREATE' };
    }

    const user = global.currentUser;
    const allow =
      global.RolePolicy?.canBootstrapOwner?.(user) ||
      global.RolePolicy?.isDev?.(user) ||
      !user; // pre-login claim with allowlisted email + profile fields
    if (!allow && user && !global.RolePolicy?.canBootstrapOwner?.(user)) {
      return { ok: false, error: 'bootstrap_not_permitted' };
    }

    const username = String(profileInput?.username || email.split('@')[0] || '').trim();
    const password = String(profileInput?.password || '').trim();
    const recoveryCode = String(profileInput?.recoveryCode || '').trim();
    if (!username || !password || !recoveryCode) {
      return { ok: false, error: 'profile_fields_required' };
    }

    const claimed = await tryConsumeBootstrap('preprovisioned_email', email);
    if (!claimed.ok) return claimed;

    const created = await global.OwnerProfile?.createProfile?.({ username, password, recoveryCode });
    if (!created?.ok) {
      return created || { ok: false, error: 'create_failed', bootstrapConsumed: true };
    }

    try {
      const doc = global.LicenseCloud?.loadLocal?.();
      if (doc && created.profile?.recovery?.hash) {
        doc.ownerBootstrap = {
          ...(doc.ownerBootstrap || {}),
          emergencyRecoveryHash: created.profile.recovery.hash,
          recoverySalt: created.profile.salt || null,
          claimedBy: username
        };
        if (global.OwnerHub?.saveLicenseDoc) await global.OwnerHub.saveLicenseDoc(doc);
        else global.LicenseCloud?.saveLocal?.(doc);
      }
    } catch { /* empty */ }

    global.OwnerMigration?.promoteUserToOwnerRole?.(username);
    try { global.OwnerSetupState?.clearRequired?.(); } catch { /* empty */ }

    global.AuditLogger?.log?.({
      action: 'OWNER_BOOTSTRAP_EMAIL_CLAIMED',
      entity: 'owner_profile',
      entityId: username,
      summary: `Owner created via pre-provisioned email ${email}`
    });
    return { ok: true, method: 'preprovisioned_email', profile: created.profile };
  }

  function describeAvailableMethods(doc) {
    const cfg = getBootstrapConfig(doc);
    const locked = isProductionBootstrapLocked();
    const expired = isTokenExpired(cfg);
    return {
      locked,
      googleLoginImpliesOwner: false,
      setupTokenConfigured: !!cfg.tokenHash && !cfg.consumed && !expired,
      setupTokenExpired: !!(cfg.tokenHash && expired),
      preProvisionedEmails: cfg.emails.length,
      interactiveMigration: !locked && !!global.RolePolicy?.canBootstrapOwner?.(global.currentUser)
    };
  }

  global.OwnerBootstrap = {
    BOOTSTRAP_STATE_KEY,
    CLAIM_LOCK_KEY,
    loadState,
    getBootstrapConfig,
    resolveTokenExpiry,
    isTokenExpired,
    googleLoginImpliesOwner,
    isProductionBootstrapLocked,
    matchPreProvisionedEmail,
    verifySetupToken,
    tryConsumeBootstrap,
    redeemSetupToken,
    claimViaPreProvisionedEmail,
    markBootstrapConsumed,
    describeAvailableMethods,
    hashToken
  };
})(typeof window !== 'undefined' ? window : globalThis);
