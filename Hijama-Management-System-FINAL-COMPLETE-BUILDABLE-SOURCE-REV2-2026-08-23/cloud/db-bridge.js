/**
 * DB Bridge — synced tables MUST go through Repository (metadata + merge policy).
 */
(function (global) {
  'use strict';

  function syncedTables() {
    return global.Repository?.SYNCED_TABLES
      || global.RepositoryFactory?.SYNCED_TABLES
      || [];
  }

  function syncedSet() {
    return new Set(syncedTables());
  }

  function rawDb() {
    return global.DB?.__tdwBridged ? global.DB.raw : global.DB;
  }

  function hasSqliteAuthority() {
    return !!(global.SqliteBridge?.getCommittedRaw && global.SqliteBridge?.setAuthoritative);
  }

  function ensureRepository() {
    const sqliteAuthority = hasSqliteAuthority();
    if (global.Repository && (!sqliteAuthority || global.Repository.adapter?.authoritative === true)) {
      return global.Repository;
    }
    if (!global.RepositoryFactory) return global.Repository || null;
    if (sqliteAuthority) {
      global.Repository = global.RepositoryFactory.createRepository(
        global.RepositoryFactory.createSqliteAdapter(global.SqliteBridge)
      );
      return global.Repository;
    }
    const store = rawDb();
    if (store) {
      global.Repository = global.RepositoryFactory.createRepository(
        global.RepositoryFactory.createLocalStorageAdapter(store)
      );
    }
    return global.Repository || null;
  }

  function isSyncedKey(key) {
    return syncedSet().has(key);
  }

  function get(key, def) {
    const repo = ensureRepository();
    if (repo && isSyncedKey(key)) {
      const val = repo.get(key);
      return val == null ? def : val;
    }
    if (hasSqliteAuthority() && global.SqliteBridge.isOperationalKey?.(key)) {
      const val = global.SqliteBridge.getCommittedRaw(key);
      return val === undefined ? def : val;
    }
    return rawDb()?.get?.(key, def) ?? def;
  }

  function set(key, value) {
    if (typeof global.dbSetGuarded === 'function' && !global.dbSetGuarded(key, value)) {
      return Promise.resolve({ ok: false, error: 'db_write_guarded' });
    }
    const repo = ensureRepository();
    if (repo && isSyncedKey(key) && repo.adapter?.authoritative === true) {
      return repo.setAllAuthoritative(key, value);
    }
    if (hasSqliteAuthority() && global.SqliteBridge.isOperationalKey?.(key)) {
      return global.SqliteBridge.setAuthoritative(key, value);
    }
    rawDb()?.set?.(key, value);
    return Promise.resolve({ ok: true, local: true });
  }

  function install() {
    const store = rawDb();
    if (!store || store.__tdwBridged) {
      ensureRepository();
      return store;
    }
    const bridged = {
      __tdwBridged: true,
      get: (k, def) => get(k, def),
      set: (k, v) => set(k, v),
      raw: store
    };
    global.DB = bridged;
    // Recreate Repository after the bridge is installed so it cannot retain a raw adapter.
    global.Repository = null;
    ensureRepository();
    return bridged;
  }

  global.DbBridge = {
    ensureRepository,
    get,
    set,
    install,
    isSyncedKey,
    syncedTables,
    rawDb,
    hasSqliteAuthority
  };
})(typeof window !== 'undefined' ? window : globalThis);
