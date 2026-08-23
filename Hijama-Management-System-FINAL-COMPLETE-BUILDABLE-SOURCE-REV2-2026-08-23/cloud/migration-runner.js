/**
 * Schema migrations — run on Local DB before sync (Cloud V2).
 */
(function (global) {
  'use strict';

  const Meta = global.CloudMeta;

  function migrate_v0_to_v1(ctx) {
    const meta = ctx.meta;
    if (!meta.centerId && global.CenterId) {
      meta.centerId = global.CenterId.ensureCenterId(meta.centerId);
    }
    if (global.settings && !global.settings.cloudV2) {
      global.settings.cloudV2 = { enabled: !!meta.cloudV2Enabled };
      ctx.db?.set?.('settings', global.settings);
    }
    return meta;
  }

  function migrate_v1_to_v2(ctx) {
    const meta = ctx.meta;
    const db = ctx.db;
    const DEFAULT_BRANCH = 'BR-MAIN';

    let license = global.LicenseCloud?.loadLocal?.();
    if (license) {
      if (!Array.isArray(license.branches) || !license.branches.length) {
        license.branches = global.LicenseCloud.defaultBranches(1, license.centerName);
      }
      const hasMain = license.branches.some(b => b && b.id === DEFAULT_BRANCH);
      if (!hasMain) {
        license.branches.unshift({
          id: DEFAULT_BRANCH,
          name: 'الفرع الرئيسي',
          code: 'MAIN',
          active: true
        });
      }
      global.LicenseCloud.saveLocal(license);
    }

    const tableKeys = ['cases', 'clientsRegistry', 'bookings', 'expenses', 'attendance'];
    tableKeys.forEach(key => {
      let rows = db?.get?.(key, null);
      if (!Array.isArray(rows)) return;
      let changed = false;
      rows = rows.map(row => {
        if (!row || typeof row !== 'object') return row;
        if (!row.branchId) {
          changed = true;
          return { ...row, branchId: DEFAULT_BRANCH };
        }
        return row;
      });
      if (changed) db.set(key, rows);
    });

    let users = db?.get?.('users', null);
    if (Array.isArray(users) && global.BranchScope?.migrateUsersScope) {
      const migrated = global.BranchScope.migrateUsersScope(users);
      db.set('users', migrated);
      if (global.users) global.users = migrated;
    }

    if (global.settings && !global.settings.defaultBranchId) {
      global.settings.defaultBranchId = DEFAULT_BRANCH;
      db?.set?.('settings', global.settings);
    }

    if (!meta.defaultBranchId) meta.defaultBranchId = DEFAULT_BRANCH;
    return meta;
  }

  function migrate_v2_to_v3(ctx) {
    const meta = ctx.meta;
    if (!meta.centerId && global.CenterId) {
      meta.centerId = global.CenterId.ensureCenterId(meta.centerId);
    }
    const centerId = meta.centerId || global.LicenseCloud?.loadLocal?.()?.centerId || '';
    const branchId = meta.defaultBranchId || 'BR-MAIN';
    if (global.VersionsIndex?.syncFromRepository) {
      global.VersionsIndex.syncFromRepository(global.Repository, centerId, branchId);
    }
    if (global.ConfigLayer?.exportBranchPack) {
      const pack = global.ConfigLayer.exportBranchPack(branchId);
      ctx.db?.set?.('__tdw_branch_config_cache__', {
        centerId: centerId || pack.centerId || '',
        branchId,
        cachedAt: new Date().toISOString(),
        pack
      });
    }
    meta.configLayerReady = true;
    return meta;
  }

  function migrate_v3_to_v4(ctx) {
    const meta = ctx.meta;
    if (global.SyncState?.load) {
      const st = global.SyncState.load();
      global.SyncState.save(st);
    }
    meta.syncEngineReady = true;
    return meta;
  }

  function migrate_v4_to_v5(ctx) {
    const meta = ctx.meta;
    if (global.settings) {
      if (!global.settings.cloudV2) global.settings.cloudV2 = {};
      if (global.settings.cloudV2.autoBackupEnabled == null) {
        global.settings.cloudV2.autoBackupEnabled = true;
      }
      ctx.db?.set?.('settings', global.settings);
    }
    meta.auditLogReady = true;
    meta.ownerHubReady = true;
    return meta;
  }

  function migrate_v5_to_v6(ctx) {
    const meta = ctx.meta;
    const db = ctx.db;
    const RM = global.RecordMetadata;
    const synced = global.RepositoryFactory?.SYNCED_TABLES
      || global.Repository?.SYNCED_TABLES
      || ['cases', 'clientsRegistry', 'bookings', 'users', 'doctors',
        'settings', 'expenses', 'packages', 'services', 'activityLog',
        'attendance', 'inventoryItems', 'inventorySuppliers', 'inventoryMovements'];
    const DEFAULT_BRANCH = meta.defaultBranchId || 'BR-MAIN';

    synced.forEach(key => {
      let rows = db?.get?.(key, null);
      if (!Array.isArray(rows)) return;
      let changed = false;
      rows = rows.map(row => {
        if (!row || typeof row !== 'object') return row;
        const migrated = RM?.migrateLegacy ? RM.migrateLegacy(row, row.branchId || DEFAULT_BRANCH) : row;
        if (migrated !== row) changed = true;
        else if (RM?.validate && !RM.validate(migrated).ok) changed = true;
        return migrated;
      });
      if (changed) db.set(key, rows);
    });

    meta.recordMetadataReady = true;
    meta.coreDataEngineReady = true;
    return meta;
  }

  const MIGRATIONS = [
    { from: 0, to: 1, name: 'cloud_v2_meta_center_id', run: migrate_v0_to_v1 },
    { from: 1, to: 2, name: 'cloud_v2_branch_id_on_records', run: migrate_v1_to_v2 },
    { from: 2, to: 3, name: 'cloud_v2_config_versions_cache', run: migrate_v2_to_v3 },
    { from: 3, to: 4, name: 'cloud_v2_sync_engine', run: migrate_v3_to_v4 },
    { from: 4, to: 5, name: 'cloud_v2_owner_hub_audit_backup', run: migrate_v4_to_v5 },
    { from: 5, to: 6, name: 'cloud_v2_record_metadata', run: migrate_v5_to_v6 }
  ];

  function runMigrations(options) {
    options = options || {};
    const target = options.targetVersion ?? Meta.APP_SCHEMA_VERSION;
    let meta = Meta.loadMeta();
    const from = meta.schemaVersion || 0;
    if (from >= target) return { ok: true, from, to: from, ran: [] };

    const db = global.DB;
    const ran = [];
    let cur = from;

    while (cur < target) {
      const step = MIGRATIONS.find(m => m.from === cur && m.to === cur + 1);
      if (!step) {
        return { ok: false, error: 'missing_migration', from: cur, to: target };
      }
      try {
        meta = step.run({ meta, db, global }) || meta;
        cur = step.to;
        meta.schemaVersion = cur;
        meta.migratedAt = new Date().toISOString();
        Meta.saveMeta(meta);
        ran.push(step.name);
        if (typeof global.AuditLogger?.log === 'function') {
          global.AuditLogger.log({
            action: 'SCHEMA_MIGRATED',
            entity: 'meta',
            entityId: String(cur),
            summary: `Migration ${step.name}: ${step.from} → ${step.to}`
          });
        }
      } catch (e) {
        return { ok: false, error: e.message || String(e), from: cur, ran };
      }
    }

    return { ok: true, from, to: cur, ran };
  }

  global.MigrationRunner = { MIGRATIONS, runMigrations };
})(typeof window !== 'undefined' ? window : globalThis);
