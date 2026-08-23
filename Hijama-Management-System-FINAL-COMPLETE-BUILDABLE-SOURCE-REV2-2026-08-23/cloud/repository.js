/**
 * Repository Layer — single write path for synced operational data (SQLite-ready).
 */
(function (global) {
  'use strict';

  const REVISIONS_KEY = '__tdw_repo_revisions__';

  const SYNCED_TABLES = [
    'cases', 'clientsRegistry', 'bookings', 'users', 'doctors',
    'settings', 'expenses', 'packages', 'services',
    'attendance', 'inventoryItems', 'inventorySuppliers', 'inventoryMovements',
    'attachments_meta',
  ];

  const SYNCED_SET = new Set(SYNCED_TABLES);

  function createLocalStorageAdapter(db) {
    const store = db || global.DB;
    const raw = store?.__tdwBridged ? store.raw : store;
    if (!raw?.get || !raw?.set) {
      throw new Error('Repository requires DB.get/set');
    }
    return {
      name: 'localStorage',
      get(key, def) { return raw.get(key, def); },
      set(key, val) { raw.set(key, val); },
      remove(key) {
        try { localStorage.removeItem(key); } catch { /* empty */ }
      }
    };
  }

  function createSqliteAdapter(sqliteBridge) {
    if (!sqliteBridge?.getCommittedRaw || !sqliteBridge?.setAuthoritative) {
      throw new Error('Repository requires SqliteBridge authoritative API');
    }
    return {
      name: 'sqlite-authoritative',
      authoritative: true,
      get(key, def) {
        const value = sqliteBridge.getCommittedRaw(key);
        return value === undefined ? def : value;
      },
      async set(key, val) {
        const result = await sqliteBridge.setAuthoritative(key, val);
        if (!result?.ok) {
          const error = new Error(result?.error || 'sqlite_commit_failed');
          error.code = result?.error || 'sqlite_commit_failed';
          error.result = result;
          throw error;
        }
        return result;
      },
      async remove(key) {
        // Deletions must be represented as authoritative tombstones, never a raw localStorage erase.
        return this.set(key, null);
      }
    };
  }

  function loadRevisions(adapter) {
    return adapter.get(REVISIONS_KEY, {}) || {};
  }

  function saveRevisions(adapter, rev) {
    adapter.set(REVISIONS_KEY, rev);
  }

  function isSyncedTable(table) {
    return SYNCED_SET.has(table);
  }

  function syncGlobal(table, data) {
    if (!Array.isArray(data)) return;
    if (table === 'cases') global.cases = data;
    if (table === 'clientsRegistry') global.clientsRegistry = data;
    if (table === 'bookings') global.bookings = data;
    if (table === 'users') global.users = data;
    if (table === 'doctors') global.doctors = data;
    if (table === 'services') global.services = data;
    if (table === 'packages') global.packages = data;
    if (table === 'settings' && data && !Array.isArray(data)) global.settings = data;
    if (table === 'inventoryItems') global.inventoryItems = data;
    if (table === 'inventorySuppliers') global.inventorySuppliers = data;
    if (table === 'inventoryMovements') global.inventoryMovements = data;
  }

  function createRepository(adapter) {
    adapter = adapter || createLocalStorageAdapter();

    const repository = {
      adapter,
      SYNCED_TABLES,
      isSyncedTable,
      _tables: {},

      init() {
        this._revisions = loadRevisions(adapter);
        return this;
      },

      tableKey(table) {
        const map = {
          cases: 'cases',
          clientsRegistry: 'clientsRegistry',
          bookings: 'bookings',
          users: 'users',
          doctors: 'doctors',
          settings: 'settings',
          expenses: 'expenses',
          packages: 'packages',
          services: 'services',
          activityLog: 'activityLog',
          attendance: 'attendance',
          inventoryItems: 'inventoryItems',
          inventorySuppliers: 'inventorySuppliers',
          inventoryMovements: 'inventoryMovements'
        };
        return map[table] || table;
      },

      get(table, id, options) {
        options = options || {};
        const key = this.tableKey(table);
        let data = adapter.get(key, Array.isArray(this._defaultFor(table)) ? [] : {});
        const enforce = options.enforceScope === true;
        if (id == null) {
          if (enforce && Array.isArray(data) && global.BranchScope?.filterByUserScope) {
            const user = global.RbacGuard?.resolveAuthoritativeUser?.(global.currentUser) || global.currentUser;
            if (user && !user.isDev) data = global.BranchScope.filterByUserScope(data, user);
          }
          return data;
        }
        let row = null;
        if (Array.isArray(data)) row = data.find(r => r && r.id === id) || null;
        else if (typeof data === 'object') row = data[id] ?? null;
        if (row && enforce && global.BranchScope?.userCanAccessBranch) {
          const user = global.RbacGuard?.resolveAuthoritativeUser?.(global.currentUser) || global.currentUser;
          const bid = row.branchId || global.BranchScope.DEFAULT_BRANCH_ID;
          if (user && !user.isDev && !global.BranchScope.userCanAccessBranch(user, bid)) {
            try {
              global.RbacGuard?.auditDenial?.({
                userId: user.id, role: user.role, resource: `${table}:${id}`,
                reason: 'cross_branch_read_denied', entity: table,
              });
            } catch { /* empty */ }
            return null;
          }
        }
        return row;
      },

      getScoped(table, id) {
        return this.get(table, id, { enforceScope: true });
      },

      query(table, predicate, options) {
        options = options || {};
        const all = this.get(table, null, options);
        if (!Array.isArray(all)) return all;
        if (typeof predicate !== 'function') return all;
        return all.filter(predicate);
      },

      queryScoped(table, predicate) {
        return this.query(table, predicate, { enforceScope: true });
      },

      upsert(table, record, options) {
        options = options || {};
        if (!record?.id) return { ok: false, error: 'missing_id' };
        if (global.BranchScope?.ensureRecordBranch) {
          record = global.BranchScope.ensureRecordBranch(record, options.branchId);
        }
        if (global.BranchScope?.assertWriteAllowed) {
          const access = global.BranchScope.assertWriteAllowed(
            global.currentUser,
            record.branchId || options.branchId,
            options
          );
          if (!access.ok) return access;
        }
        const key = this.tableKey(table);
        let data = adapter.get(key, Array.isArray(this._defaultFor(table)) ? [] : {});
        const RM = global.RecordMetadata;
        if (Array.isArray(data)) {
          const idx = data.findIndex(r => r && r.id === record.id);
          if (idx >= 0) {
            const prev = data[idx];
            const resurrection = global.TombstonePolicy?.assertNotResurrecting?.(prev, record, options);
            if (resurrection && !resurrection.ok) return resurrection;
            record = RM?.stampUpdate ? RM.stampUpdate(record, data[idx], options) : record;
            data[idx] = record;
          } else {
            record = RM?.stampNew ? RM.stampNew(record, options) : record;
            data.push(record);
          }
        } else if (typeof data === 'object' && data !== null) {
          const prev = data[record.id];
          record = prev && RM?.stampUpdate ? RM.stampUpdate(record, prev, options) : (RM?.stampNew ? RM.stampNew(record, options) : record);
          data = { ...data, [record.id]: record };
        } else {
          record = RM?.stampNew ? RM.stampNew(record, options) : record;
          data = [record];
        }
        const writeOptions = {
          ...options,
          payload: data,
          operation: Array.isArray(data) && data.find(r => r && r.id === record.id) ? 'UPDATE' : 'CREATE',
          recordId: record.id,
          branchId: record.branchId || options.branchId,
        };
        if (adapter.authoritative) {
          return this.setAllAuthoritative(table, data, writeOptions)
            .then((result) => result?.ok ? { ok: true, record, revision: result.revision, authoritative: true } : result);
        }
        adapter.set(key, data);
        syncGlobal(table, data);
        this.bumpRevision(table, writeOptions);
        return { ok: true, record };
      },

      set(table, id, record) {
        return this.upsert(table, { ...record, id: id || record.id });
      },

      async setAllAuthoritative(table, value, options) {
        options = options || {};
        if (!adapter.authoritative) return { ok: false, error: 'repository_not_authoritative' };
        const key = this.tableKey(table);
        const RM = global.RecordMetadata;
        if (Array.isArray(value) && isSyncedTable(table) && !options.skipMetadata) {
          value = value.map((r) => {
            if (!r || !r.id) return r;
            return RM?.migrateLegacy ? RM.migrateLegacy(r, options.branchId) : r;
          });
        }
        try {
          await adapter.set(key, value);
          const base = Number(this._revisions?.[table]) || 0;
          const nextRevisions = { ...(this._revisions || {}), [table]: base + 1 };
          await adapter.set(REVISIONS_KEY, nextRevisions);
          this._revisions = nextRevisions;
          syncGlobal(table, value);
          this.enqueueOutbox(table, base, base + 1, { ...options, payload: value });
          if (typeof global.VersionsIndex?.onRepositoryBump === 'function') {
            try { global.VersionsIndex.onRepositoryBump(table); } catch { /* observer */ }
          }
          return { ok: true, value, revision: base + 1, authoritative: true };
        } catch (error) {
          return { ok: false, error: error.code || error.message || 'sqlite_commit_failed' };
        }
      },

      setAll(table, value, options) {
        options = options || {};
        if (adapter.authoritative) return this.setAllAuthoritative(table, value, options);
        const key = this.tableKey(table);
        const RM = global.RecordMetadata;
        if (Array.isArray(value) && isSyncedTable(table) && !options.skipMetadata) {
          value = value.map(r => {
            if (!r || !r.id) return r;
            return RM?.migrateLegacy ? RM.migrateLegacy(r, options.branchId) : r;
          });
        }
        adapter.set(key, value);
        syncGlobal(table, value);
        const rev = this.bumpRevision(table, {
          payload: value,
          operation: 'TABLE_BUMP',
          branchId: options.branchId,
        });
        return value;
      },

      delete(table, id, options) {
        options = options || {};
        const key = this.tableKey(table);
        let data = adapter.get(key, []);
        if (!Array.isArray(data)) return false;
        const idx = data.findIndex(r => r && r.id === id);
        if (idx < 0) return false;
        // Soft delete / tombstone for synced tables (V2-4)
        if (isSyncedTable(table) && options.hard !== true) {
          const prev = data[idx];
          const row = global.TombstonePolicy?.applyTombstone
            ? global.TombstonePolicy.applyTombstone(prev, prev, options)
            : (() => {
              let r = { ...prev, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
              if (global.RecordMetadata?.stampUpdate) {
                try { r = global.RecordMetadata.stampUpdate(r, prev, options); } catch { /* empty */ }
              }
              return r;
            })();
          data = data.slice();
          data[idx] = row;
          const writeOptions = {
            ...options,
            payload: data,
            operation: 'DELETE',
            recordId: id,
            branchId: options.branchId || row.branchId,
          };
          if (adapter.authoritative) {
            return this.setAllAuthoritative(table, data, writeOptions).then((result) => !!result?.ok);
          }
          adapter.set(key, data);
          syncGlobal(table, data);
          this.bumpRevision(table, writeOptions);
          return true;
        }
        const next = data.filter(r => r && r.id !== id);
        const writeOptions = {
          ...options,
          payload: next,
          operation: 'DELETE',
          recordId: id,
          branchId: options.branchId,
        };
        if (adapter.authoritative) {
          return this.setAllAuthoritative(table, next, writeOptions).then((result) => !!result?.ok);
        }
        adapter.set(key, next);
        syncGlobal(table, next);
        this.bumpRevision(table, writeOptions);
        return true;
      },

      query(table, filter) {
        const data = this.get(table);
        if (!Array.isArray(data)) return [];
        if (!filter || typeof filter !== 'object') return data.slice();
        return data.filter(row => {
          if (!row) return false;
          return Object.keys(filter).every(k => row[k] === filter[k]);
        });
      },

      getRevision(table) {
        if (!this._revisions) this.init();
        return Number(this._revisions[table]) || 0;
      },

      enqueueOutbox(table, base, nextRevision, options) {
        options = options || {};
        if (!isSyncedTable(table) || options.skipOutbox || !global.SqliteOutboxBridge?.enqueue) return;
        try {
          const centerId =
            global.ConfigLayer?.getCenterId?.() ||
            global.CenterId?.getStoredCenterId?.() ||
            global.LicenseCloud?.loadLocal?.()?.centerId ||
            '';
          const branchId =
            options.branchId ||
            global.BranchScope?.getActiveBranchId?.() ||
            global.DeviceConfig?.getLockedBranchId?.() ||
            'BR-MAIN';
          const deviceId =
            global.DeviceConfig?.getDeviceId?.() ||
            global.DeviceConfig?.load?.()?.deviceUuid ||
            'unknown-device';
          if (centerId) {
            const payload = options.payload != null ? options.payload : this.get(table);
            const payloadJson = typeof payload === 'string' ? payload : JSON.stringify(payload ?? null);
            Promise.resolve(global.SqliteOutboxBridge.enqueue({
              center_id: centerId,
              branch_id: branchId,
              table_name: table,
              record_id: options.recordId || null,
              operation: options.operation || 'TABLE_BUMP',
              base_revision: base,
              new_revision: nextRevision,
              device_id: deviceId,
              payload_json: payloadJson,
            })).catch(() => {});
          }
        } catch { /* outbox never rolls back a committed local write */ }
      },

      bumpRevision(table, options) {
        options = options || {};
        if (adapter.authoritative) {
          throw Object.assign(new Error('authoritative_revision_requires_async_commit'), { code: 'authoritative_revision_requires_async_commit' });
        }
        if (!this._revisions) this.init();
        const base = Number(this._revisions[table]) || 0;
        const n = base + 1;
        this._revisions[table] = n;
        saveRevisions(adapter, this._revisions);
        this.enqueueOutbox(table, base, n, options);
        if (typeof global.VersionsIndex?.onRepositoryBump === 'function') {
          try { global.VersionsIndex.onRepositoryBump(table); } catch { /* empty */ }
        }
        return n;
      },

      getAllRevisions() {
        if (!this._revisions) this.init();
        return { ...this._revisions };
      },

      _defaultFor(table) {
        return ['cases', 'bookings', 'clientsRegistry', 'doctors', 'users', 'expenses',
          'attendance', 'inventoryItems', 'inventorySuppliers', 'inventoryMovements'].includes(table) ? [] : {};
      }
    };

    repository.init();
    return repository;
  }

  global.RepositoryFactory = {
    REVISIONS_KEY,
    SYNCED_TABLES,
    createLocalStorageAdapter,
    createSqliteAdapter,
    createRepository,
    isSyncedTable
  };

  if (!global.Repository && global.DB) {
    global.Repository = createRepository(createLocalStorageAdapter(global.DB));
  }
})(typeof window !== 'undefined' ? window : globalThis);
