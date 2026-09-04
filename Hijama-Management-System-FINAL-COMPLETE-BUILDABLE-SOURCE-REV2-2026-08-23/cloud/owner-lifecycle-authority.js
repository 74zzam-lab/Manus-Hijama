/**
 * PR11 — Owner Lifecycle Authority (SQLite operational SoT via DB abstraction).
 * Single deterministic lifecycle: NEW create once | EXISTING/RESTORE/REPLACEMENT recover only.
 */
(function (global) {
  'use strict';

  const LIFECYCLE_KEY = '__tdw_owner_lifecycle__';
  const COMMIT_KEY = '__tdw_owner_lifecycle_commit__';

  const MODES = Object.freeze({
    NEW: 'new',
    EXISTING: 'existing',
    RESTORE: 'restore',
    REPLACEMENT: 'replacement',
  });

  function loadLifecycle() {
    const raw = global.DB?.get?.(LIFECYCLE_KEY, null);
    return raw && typeof raw === 'object' ? raw : {};
  }

  function saveLifecycle(patch) {
    const next = {
      ...loadLifecycle(),
      ...(patch || {}),
      updatedAt: new Date().toISOString(),
    };
    global.DB?.set?.(LIFECYCLE_KEY, next);
    return next;
  }

  function readBootPath() {
    try {
      const w = global.DB?.get?.('__tdw_boot_wizard__', null);
      if (w?.path) return String(w.path);
    } catch { /* empty */ }
    return null;
  }

  function getMode() {
    const lc = loadLifecycle();
    if (lc.mode) return lc.mode;
    const bootPath = readBootPath();
    if (bootPath === 'existing') return MODES.EXISTING;
    if (bootPath === 'new') return MODES.NEW;
    return null;
  }

  function setMode(mode, meta) {
    meta = meta || {};
    return saveLifecycle({
      mode: mode || null,
      createBlocked: meta.createBlocked === true
        || mode === MODES.EXISTING
        || mode === MODES.RESTORE
        || mode === MODES.REPLACEMENT,
      ...meta,
    });
  }

  function markRestorePreserve(meta) {
    return saveLifecycle({
      mode: MODES.RESTORE,
      restorePreserved: true,
      createBlocked: true,
      ...(meta || {}),
    });
  }

  function markReplacementHydrate(meta) {
    return saveLifecycle({
      mode: MODES.REPLACEMENT,
      createBlocked: true,
      ...(meta || {}),
    });
  }

  function getUsers() {
    if (global.OwnerManagement?.getUsers) return global.OwnerManagement.getUsers();
    if (Array.isArray(global.users)) return global.users;
    return global.DB?.get?.('users', []) || [];
  }

  function listActiveOwners(users) {
    users = users || getUsers();
    return users.filter((u) => {
      if (!u || u.isDev || u.active === false) return false;
      const role = String(u.role || '').toLowerCase();
      return role === 'owner' || role === 'hq_admin';
    });
  }

  function getPrimaryOwnerRecord(users) {
    users = users || getUsers();
    const profile = global.OwnerProfile?.loadProfile?.() || null;
    const owners = listActiveOwners(users);
    if (profile?.username) {
      const matched = owners.filter(
        (u) => String(u.username || '').toLowerCase() === String(profile.username).toLowerCase()
      );
      if (matched.length === 1) {
        return { user: matched[0], profile, source: 'profile_match' };
      }
      if (matched.length > 1) {
        return {
          user: matched[0],
          profile,
          source: 'profile_match',
          violation: 'duplicate_primary_owner',
          count: matched.length,
        };
      }
    }
    if (owners.length === 1) return { user: owners[0], profile, source: 'sole_owner' };
    if (owners.length > 1 && profile?.username) {
      return { user: null, profile, source: 'ambiguous', violation: 'profile_user_mismatch', count: owners.length };
    }
    return null;
  }

  function assertOwnerCountInvariant(users) {
    users = users || getUsers();
    const profile = global.OwnerProfile?.hasProfile?.();
    const activeOwners = listActiveOwners(users);
    if (profile) {
      const profileUsername = String(global.OwnerProfile.loadProfile()?.username || '').toLowerCase();
      const matched = activeOwners.filter(
        (u) => String(u.username || '').toLowerCase() === profileUsername
      );
      if (matched.length > 1) {
        return {
          ok: false,
          error: 'owner_count_invariant_violation',
          code: 'DUPLICATE_PRIMARY_OWNER',
          count: matched.length,
        };
      }
    }
    const primary = getPrimaryOwnerRecord(users);
    if (primary?.violation === 'duplicate_primary_owner') {
      return {
        ok: false,
        error: 'owner_count_invariant_violation',
        code: 'DUPLICATE_PRIMARY_OWNER',
        count: primary.count || 2,
      };
    }
    return {
      ok: true,
      primaryOwnerId: primary?.user?.id || null,
      primaryUsername: primary?.user?.username || null,
      activeOwnerCount: activeOwners.length,
    };
  }

  function ownerExistsInDb(users) {
    users = users || getUsers();
    return listActiveOwners(users).length > 0 || !!global.OwnerProfile?.hasProfile?.();
  }

  function isCreateBlocked() {
    const lc = loadLifecycle();
    if (lc.createBlocked === true && ownerExistsInDb()) return true;
    const mode = getMode();
    if (
      (mode === MODES.EXISTING || mode === MODES.RESTORE || mode === MODES.REPLACEMENT)
      && ownerExistsInDb()
    ) {
      return true;
    }
    return false;
  }

  function buildCreateIdempotencyKey(input) {
    input = input || {};
    const org = global.Organization?.getId?.()
      || global.CenterId?.getStoredCenterId?.()
      || 'CTR';
    const username = String(input.username || '').trim().toLowerCase();
    return `owner-create:${org}:${username || 'bootstrap'}`;
  }

  function loadCommitRecord(key) {
    const all = global.DB?.get?.(COMMIT_KEY, {}) || {};
    return all[key] || null;
  }

  function saveCommitRecord(key, record) {
    const all = global.DB?.get?.(COMMIT_KEY, {}) || {};
    all[key] = {
      ...(record || {}),
      committedAt: new Date().toISOString(),
    };
    global.DB?.set?.(COMMIT_KEY, all);
    return all[key];
  }

  function findCommittedOwner(input) {
    const key = buildCreateIdempotencyKey(input);
    const committed = loadCommitRecord(key);
    if (!committed?.userId) return null;
    const users = getUsers();
    const user = users.find((u) => u && String(u.id) === String(committed.userId));
    if (!user) return null;
    return {
      ok: true,
      idempotent: true,
      userId: user.id,
      username: user.username,
      commitKey: key,
    };
  }

  /**
   * Canonical first-owner commit (NEW path only). Idempotent on retry/restart.
   */
  async function setupCommitOwner(input) {
    input = input || {};
    if (input.additionalOwner === true) {
      return global.OwnerManagement?.createOwner?.({ ...input, additionalOwner: true, skipLifecycleGate: true });
    }

    const prior = findCommittedOwner(input);
    if (prior) return prior;

    if (isCreateBlocked()) {
      return {
        ok: false,
        error: 'owner_create_blocked',
        code: 'EXISTING_NO_CREATE',
        mode: getMode(),
      };
    }

    const invariant = assertOwnerCountInvariant();
    if (!invariant.ok && !input.forceRecovery) return invariant;

    const state = global.OwnerManagement?.getOwnerState?.();
    if (state?.state === 'OWNER_EXISTS') {
      const primary = getPrimaryOwnerRecord();
      if (primary?.user) {
        return {
          ok: true,
          idempotent: true,
          userId: primary.user.id,
          username: primary.user.username,
          reason: 'owner_already_exists',
        };
      }
      return { ok: false, error: 'owner_already_exists', code: 'OWNER_EXISTS' };
    }

    const mode = getMode();
    if (
      (mode === MODES.EXISTING || mode === MODES.RESTORE || mode === MODES.REPLACEMENT)
      && ownerExistsInDb()
    ) {
      return { ok: false, error: 'owner_create_blocked', code: 'EXISTING_NO_CREATE', mode };
    }

    const res = await global.OwnerManagement?.createOwner?.({
      ...input,
      skipLifecycleGate: true,
      lifecycleCommit: true,
    });
    if (res?.ok) {
      saveCommitRecord(buildCreateIdempotencyKey(input), {
        ok: true,
        userId: res.userId,
        username: res.username,
      });
    }
    return res;
  }

  function reconcileAfterRestore(options) {
    options = options || {};
    markRestorePreserve({ gateId: options.gateId || null });

    const users = getUsers();
    const invariant = assertOwnerCountInvariant(users);
    if (!invariant.ok) {
      try { global.OwnerSetupState?.markRequired?.('restore'); } catch { /* empty */ }
      return { ok: false, readyBlocked: true, ...invariant };
    }

    const primary = getPrimaryOwnerRecord(users);
    if (primary?.user) {
      try { global.OwnerSetupState?.clearRequired?.(); } catch { /* empty */ }
      saveLifecycle({
        mode: MODES.RESTORE,
        preservedOwnerId: primary.user.id,
        preservedUsername: primary.user.username,
        createBlocked: true,
        restorePreserved: true,
      });
      return {
        ok: true,
        preserved: true,
        ownerId: primary.user.id,
        username: primary.user.username,
      };
    }

    try { global.OwnerSetupState?.ensureMissingOwner?.('restore'); } catch { /* empty */ }
    return { ok: true, preserved: false, needsRecovery: true };
  }

  function reconcileExistingCustomer() {
    setMode(MODES.EXISTING, { createBlocked: true });
    const primary = getPrimaryOwnerRecord();
    if (primary?.user) {
      try { global.OwnerSetupState?.clearRequired?.(); } catch { /* empty */ }
      return {
        ok: true,
        recover: true,
        ownerId: primary.user.id,
        username: primary.user.username,
      };
    }
    return { ok: true, recover: false, needsRecovery: true };
  }

  global.OwnerLifecycleAuthority = {
    LIFECYCLE_KEY,
    COMMIT_KEY,
    MODES,
    getMode,
    setMode,
    markRestorePreserve,
    markReplacementHydrate,
    getUsers,
    listActiveOwners,
    getPrimaryOwnerRecord,
    assertOwnerCountInvariant,
    ownerExistsInDb,
    isCreateBlocked,
    buildCreateIdempotencyKey,
    loadCommitRecord,
    saveCommitRecord,
    findCommittedOwner,
    setupCommitOwner,
    reconcileAfterRestore,
    reconcileExistingCustomer,
  };
})(typeof window !== 'undefined' ? window : globalThis);
