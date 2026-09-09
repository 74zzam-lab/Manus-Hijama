/**
 * RC Hotfix Round 2 — authoritative user credentials before login (post-restore).
 */
(function (global) {
  'use strict';

  const OWNER_SEED_HASH = 'pbkdf2:owner:f28c4134eec2cebf7631ab559ec0eb794280730d728919f259438a3441f5266b';

  function readAuthoritativeUsers() {
    // Electron credentials are read from the committed SQLite mirror only. Renderer globals,
    // localStorage and cloud cache can be mirrors but must never win an authority decision.
    const sqliteUsers = global.SqliteBridge?.getCommittedRaw?.('users');
    if (Array.isArray(sqliteUsers)) return sqliteUsers.slice();

    const runningElectron = !!(global.cuppingElectron || global.tadawi);
    if (runningElectron) return [];

    // Browser-only compatibility mode has no main-process SQLite authority.
    const fromDb = global.DB?.get?.('users', null);
    if (Array.isArray(fromDb)) return fromDb.slice();
    return Array.isArray(global.users) ? global.users.slice() : [];
  }

  function hasRestoredOwnerCredential(list) {
    return (list || []).some((u) => u
      && String(u.role || '').toLowerCase() === 'owner'
      && u.active !== false
      && u.password
      && u.password !== OWNER_SEED_HASH
      && !u.seedDefaultPassword);
  }

  /**
   * Reload in-memory users from SQLite/KV — call before login and after hydrate.
   */
  function syncUsersFromAuthoritativeStore() {
    const store = readAuthoritativeUsers();
    if (!store.length) return store;
    global.users = store;
    if (typeof global.__assignUsersClosure === 'function') {
      global.__assignUsersClosure(store);
    }
    return store;
  }

  async function ensureAuthCredentialsReady() {
    if (global.SqliteBridge?.bootFromSQLiteSoTOnce) {
      let hydrate;
      try {
        hydrate = await Promise.race([
          global.SqliteBridge.bootFromSQLiteSoTOnce(),
          new Promise((resolve) => setTimeout(() => resolve({ ok: false, timedOut: true }), 12000)),
        ]);
      } catch (error) {
        return {
          ok: false,
          error: 'auth_hydration_failed',
          cause: String(error?.message || error || 'hydrate_failed'),
        };
      }
      if (hydrate?.ok === false) {
        return {
          ok: false,
          error: hydrate.timedOut ? 'auth_hydration_timeout' : (hydrate.error || 'auth_hydration_failed'),
          timedOut: !!hydrate.timedOut,
          cause: hydrate.cause || hydrate.message || null,
        };
      }
    }
    const users = syncUsersFromAuthoritativeStore();
    if (hasRestoredOwnerCredential(users)) {
      try {
        global.OwnerLifecycleAuthority?.markRestorePreserve?.();
      } catch { /* empty */ }
    }
    return { ok: true, users };
  }

  function shouldBlockOwnerSeed(list) {
    return hasRestoredOwnerCredential(list || readAuthoritativeUsers());
  }

  global.AuthCredentialTruth = {
    OWNER_SEED_HASH,
    readAuthoritativeUsers,
    hasRestoredOwnerCredential,
    syncUsersFromAuthoritativeStore,
    ensureAuthCredentialsReady,
    shouldBlockOwnerSeed,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.AuthCredentialTruth;
  }
})(typeof window !== 'undefined' ? window : globalThis);
