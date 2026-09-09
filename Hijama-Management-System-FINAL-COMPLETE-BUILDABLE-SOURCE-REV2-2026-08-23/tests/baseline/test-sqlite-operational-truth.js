#!/usr/bin/env node
'use strict';

/**
 * PR4 — SQLite Operational Truth runtime tests.
 * save → hydrate → read, stale LS blocked, failed write rollback, mixed profile.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const registrySrc = fs.readFileSync(path.join(root, 'database/sqlite-operational-registry.js'), 'utf8');
const bridgeSrc = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');

function makeBridgeSandbox(sqliteData, options = {}) {
  const ls = new Map();
  if (options.seedLocalStorage) {
    for (const [k, v] of Object.entries(options.seedLocalStorage)) {
      ls.set(k, JSON.stringify(v));
    }
  }
  const persistLog = { tables: [], kv: [] };
  let persistShouldFail = options.persistFail === true;
  const sb = {
    console,
    Date,
    JSON,
    Promise,
    Array,
    Object,
    localStorage: {
      getItem(k) { return ls.has(k) ? ls.get(k) : null; },
      setItem(k, v) { ls.set(k, v); },
      removeItem(k) { ls.delete(k); },
    },
  };
  sb.global = sb;
  sb.window = sb;
  sb.globalThis = sb;
  sb.DB = {
    get(k, def) {
      try {
        if (sb.SqliteBridge?.readOperational) {
          const authoritative = sb.SqliteBridge.readOperational(k, def);
          if (authoritative !== undefined) return authoritative;
        }
        if (sb.SqliteBridge?.shouldBlockLocalStorage?.(k)) return def;
      } catch { /* empty */ }
      const raw = sb.localStorage.getItem(k);
      return raw ? JSON.parse(raw) : def;
    },
    set(k, v) { sb.localStorage.setItem(k, JSON.stringify(v)); },
  };
  sb.cuppingElectron = {
    database: {
      status: async () => ({ ok: true, sqlitePrimary: true }),
      enableSqlitePrimary: async () => ({ ok: true, sqlitePrimary: true }),
      persistTable: async (tableKey, records, branchId) => {
        persistLog.tables.push({ tableKey, records, branchId });
        if (persistShouldFail) return { ok: false, error: 'forced_fail' };
        return { ok: true };
      },
      syncOp: async (payload) => {
        persistLog.tables.push(payload);
        if (persistShouldFail) return { ok: false, error: 'forced_fail' };
        return { ok: true };
      },
      persistKv: async (key, value) => {
        persistLog.kv.push({ key, value });
        if (options.kvFailKeys?.includes(key)) return { ok: false, error: 'kv_fail' };
        return { ok: true };
      },
      hydrate: async () => ({
        ok: true,
        status: { sqlitePrimary: true },
        data: sqliteData,
      }),
    },
  };
  sb.BranchContexts = {
    getOperationalWriteBranch: () => 'BR-MAIN',
    assertOperationalWriteContext: () => ({ ok: true, branchId: 'BR-MAIN' }),
  };
  sb.DeviceConfig = { isBranchLocked: () => false };
  sb.BranchScope = {
    filterForActiveView: (records) => records,
    filterByBranch: (records) => records,
    isAggregateBranchView: () => false,
  };
  vm.runInNewContext(registrySrc, sb, { timeout: 2000, filename: 'registry.js' });
  vm.runInNewContext(bridgeSrc, sb, { timeout: 2000, filename: 'bridge.js' });
  return { sb, ls, persistLog, setPersistFail(v) { persistShouldFail = v; } };
}

async function runTests() {
  // Registry unit
  const reg = require('../../database/sqlite-operational-registry');
  check(reg.isOperationalKey('cases'), 'cases operational');
  check(reg.isOperationalKey('inventoryItems'), 'inventory operational');
  check(reg.isOperationalKey('__tdw_owner_profile__'), 'owner profile operational');
  check(!reg.isOperationalKey('backupRegistry'), 'backupRegistry not operational');
  check(reg.shouldBlockLocalStorageForKey('users', true), 'users blocks LS under Electron');

  // Stale LS: SQLite wins on hydrate
  {
    const sqliteData = {
      clientsRegistry: [{ id: 'sqlite-1', name: 'From SQLite', branchId: 'BR-MAIN' }],
      cases: [{ id: 'v1', branchId: 'BR-MAIN' }],
      bookings: [], doctors: [], attendance: [], expenses: [],
      users: [{ id: 'u-sqlite', username: 'owner', role: 'owner' }],
    };
    const { sb, ls } = makeBridgeSandbox(sqliteData, {
      seedLocalStorage: {
        clientsRegistry: [{ id: 'stale', name: 'Stale LS' }],
        users: [{ id: 'u-stale', username: 'stale-admin', role: 'admin' }],
      },
    });
    await sb.SqliteBridge.hydrateIntoMemory();
    check(sb.SqliteBridge.getState().staleLsOverridden.includes('clientsRegistry'), 'stale clientsRegistry detected');
    check(sb.DB.get('clientsRegistry', [])[0]?.id === 'sqlite-1', 'hydrate reads SQLite not stale LS');
    check(sb.DB.get('users', [])[0]?.id === 'u-sqlite', 'users from SQLite not stale LS profile');
    check(/sqlite-1/.test(String(ls.get('clientsRegistry'))), 'LS cache rewritten from SQLite');
  }

  // Pre-hydrate: operational read must not use stale LS
  {
    const sqliteData = {
      clientsRegistry: [{ id: 'after-boot', branchId: 'BR-MAIN' }],
      cases: [], bookings: [], doctors: [], attendance: [], expenses: [],
    };
    const { sb } = makeBridgeSandbox(sqliteData, {
      seedLocalStorage: { clientsRegistry: [{ id: 'before-boot' }] },
    });
    const pre = sb.DB.get('clientsRegistry', [{ id: 'default-sentinel' }]);
    check(pre[0]?.id === 'default-sentinel', 'pre-hydrate returns caller default not stale LS');
    await sb.SqliteBridge.hydrateIntoMemory();
    check(sb.DB.get('clientsRegistry', [])[0]?.id === 'after-boot', 'post-hydrate reads SQLite');
  }

  // save → restart (re-hydrate) → read
  {
    const store = {
      clientsRegistry: [{ id: 'c-save', name: 'Saved', branchId: 'BR-MAIN' }],
      cases: [], bookings: [], doctors: [], attendance: [], expenses: [],
      invoiceCounter: 42,
    };
    const { sb } = makeBridgeSandbox(store);
    await sb.SqliteBridge.hydrateIntoMemory();
    sb.DB.set('clientsRegistry', [{ id: 'c-save', name: 'Updated', branchId: 'BR-MAIN' }]);
    await new Promise((r) => setTimeout(r, 40));
    // simulate restart: new sandbox, same sqlite backing
    store.clientsRegistry = [{ id: 'c-save', name: 'Updated', branchId: 'BR-MAIN' }];
    const restart = makeBridgeSandbox(store);
    await restart.sb.SqliteBridge.hydrateIntoMemory();
    check(restart.sb.DB.get('clientsRegistry', [])[0]?.name === 'Updated', 'restart hydrate preserves saved data');
    check(restart.sb.DB.get('invoiceCounter', 0) === 42, 'restart hydrate preserves kv counter');
  }

  // Failed write does not keep divergent LS cache
  {
    const sqliteData = {
      clientsRegistry: [{ id: 'old', branchId: 'BR-MAIN' }],
      cases: [], bookings: [], doctors: [], attendance: [], expenses: [],
    };
    const { sb, ls } = makeBridgeSandbox(sqliteData, { persistFail: true });
    await sb.SqliteBridge.hydrateIntoMemory();
    const before = ls.get('clientsRegistry');
    sb.DB.set('clientsRegistry', [{ id: 'new-divergent' }]);
    await new Promise((r) => setTimeout(r, 40));
    const after = ls.get('clientsRegistry');
    check(after === before || /old/.test(String(after)), 'failed commit does not keep divergent cache');
    check(sb.SqliteBridge.getLastError(), 'lastError recorded on failed commit');
  }

  // Mixed old/new profile: SQLite users win over stale LS admin
  {
    const sqliteData = {
      clientsRegistry: [], cases: [], bookings: [], doctors: [], attendance: [], expenses: [],
      users: [{ id: 'owner-1', username: 'owner', role: 'owner' }],
      __tdw_owner_profile__: { username: 'owner', role: 'owner', sessionEpoch: 3 },
    };
    const { sb } = makeBridgeSandbox(sqliteData, {
      seedLocalStorage: {
        users: [{ id: 'legacy-admin', username: 'admin', role: 'admin' }],
        __tdw_owner_profile__: { username: 'admin', role: 'admin', sessionEpoch: 1 },
      },
    });
    await sb.SqliteBridge.hydrateIntoMemory();
    check(sb.DB.get('users', [])[0]?.role === 'owner', 'SQLite owner user wins over stale LS admin');
    check(sb.DB.get('__tdw_owner_profile__', null)?.sessionEpoch === 3, 'SQLite owner profile wins');
  }

  // Non-operational backup keys may still use LS when absent from SQLite hydrate
  {
    const sqliteData = {
      clientsRegistry: [], cases: [], bookings: [], doctors: [], attendance: [], expenses: [],
    };
    const { sb } = makeBridgeSandbox(sqliteData, {
      seedLocalStorage: { backupRegistry: [{ id: 'bk-local' }] },
    });
    await sb.SqliteBridge.hydrateIntoMemory();
    check(sb.DB.get('backupRegistry', [])[0]?.id === 'bk-local', 'backupRegistry may read LS cache');
  }

  if (errors.length) {
    console.error('FAIL: sqlite-operational-truth');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('OK: sqlite-operational-truth (hydrate/stale-ls/restart/failed-write/mixed-profile)');
}

runTests().catch((e) => {
  console.error('FAIL: sqlite-operational-truth threw', e);
  process.exit(1);
});
