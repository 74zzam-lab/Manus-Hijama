/**
 * Configuration Layer — per-branch config packs for Drive (Cloud V2 Sprint 3).
 * Phase 1: record-level merge for array tables; safe settings merge.
 */
(function (global) {
  'use strict';

  const CONFIG_FILES = ['settings.json', 'prices.json', 'services.json', 'packages.json', 'users.json'];
  const ARRAY_TABLES = ['services', 'packages', 'users'];

  function getCenterId() {
    return global.DeviceConfig?.getCenterIdFromConfig?.()
      || global.CenterId?.getStoredCenterId?.()
      || global.LicenseCloud?.loadLocal?.()?.centerId
      || '';
  }

  function buildCenterJson() {
    const s = global.settings || {};
    const license = global.LicenseCloud?.loadLocal?.() || {};
    const branches = (license.branches || []).filter(b => b && b.active !== false).map(b => b.id);
    return {
      centerId: getCenterId(),
      centerName: license.centerName || s.centerName || '',
      taxNum: s.taxNum || '',
      crNum: s.crNum || '',
      defaultVatRate: s.vatRate ?? 15,
      branches: branches.length ? branches : [global.BranchScope?.DEFAULT_BRANCH_ID || 'BR-MAIN'],
      updatedAt: new Date().toISOString()
    };
  }

  function exportBranchPack(branchId) {
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    const Split = global.SettingsSplit;
    const services = global.services || global.DB?.get?.('services', []) || [];
    const packages = global.packages || global.DB?.get?.('packages', []) || [];
    const users = global.users || global.DB?.get?.('users', []) || [];

    return {
      centerId: getCenterId(),
      branchId,
      exportedAt: new Date().toISOString(),
      settings: Split?.extractBranchSettings?.(global.settings) || {},
      prices: Split?.extractPrices?.(global.settings) || {},
      services: Array.isArray(services) ? services.filter(s => s && s.active !== false) : [],
      packages: Array.isArray(packages) ? packages.filter(p => p && p.active !== false) : [],
      users: Split?.filterUsersForBranch?.(users, branchId) || []
    };
  }

  function packToDriveFiles(pack) {
    return {
      'settings.json': pack.settings,
      'prices.json': pack.prices,
      'services.json': pack.services,
      'packages.json': pack.packages,
      'users.json': pack.users
    };
  }

  function drivePathForFile(centerId, branchId, fileName) {
    return global.DriveLayout?.configBranchFile?.(centerId, branchId, fileName) || '';
  }

  function centerJsonPath(centerId) {
    return global.DriveLayout?.configCenterJson?.(centerId) || '';
  }

  function centerJsonPathCandidates(centerId) {
    return global.DriveLayout?.configCenterJsonCandidates?.(centerId) || [centerJsonPath(centerId)];
  }

  function mergeSettingsObject(localObj, remoteObj, branchId) {
    localObj = localObj || {};
    remoteObj = remoteObj || {};
    const localRec = { id: '__settings__', ...localObj, branchId };
    const remoteRec = { id: '__settings__', ...remoteObj, branchId };
    const merge = global.RecordMerger?.mergeRecords?.(
      [localRec],
      [remoteRec],
      { table: 'settings', branchId, enqueueConflicts: true, preserveOtherBranches: false }
    );
    if (merge?.hasConflict) {
      return { ok: false, blocked: true, hasConflict: true, conflicts: merge.conflicts };
    }
    const merged = merge?.merged?.[0] || { ...localObj, ...remoteObj };
    const { id, ...settings } = merged;
    return { ok: true, settings };
  }

  async function commitConfigTable(table, value, branchId) {
    const write = global.Repository?.setAll
      ? await global.Repository.setAll(table, value, { branchId, source: 'config_import' })
      : global.DB?.set?.(table, value);
    if (write?.ok === false) return { ok: false, error: write.error || 'config_commit_failed' };
    return { ok: true, write };
  }

  async function mergeArrayTable(table, incoming, branchId, options) {
    options = options || {};
    const repo = global.Repository;
    const existing = repo?.get?.(table) || global.DB?.get?.(table, []) || [];
    const merge = global.RecordMerger?.mergeRecords?.(existing, incoming, {
      table,
      branchId,
      enqueueConflicts: options.enqueueConflicts !== false,
      preserveOtherBranches: table === 'users'
    });
    if (merge?.hasConflict) {
      return { ok: false, blocked: true, hasConflict: true, conflicts: merge.conflicts };
    }
    const committed = await commitConfigTable(table, merge.merged, branchId);
    if (!committed.ok) return committed;
    if (table === 'services') global.services = merge.merged;
    if (table === 'packages') global.packages = merge.merged;
    if (table === 'users') global.users = merge.merged;
    return { ok: true, merged: merge.merged, stats: merge.stats };
  }

  async function importBranchPackAuthoritative(pack, options) {
    options = options || {};
    if (!pack || typeof pack !== 'object') return { ok: false, error: 'invalid_pack' };
    const branchId = pack.branchId || options.branchId || 'BR-MAIN';
    const conflicts = [];

    if (pack.settings && global.settings) {
      const settingsMerge = mergeSettingsObject(
        global.SettingsSplit?.extractBranchSettings?.(global.settings) || global.settings,
        pack.settings,
        branchId
      );
      if (!settingsMerge.ok) {
        conflicts.push(...(settingsMerge.conflicts || []));
        if (!options.allowConflict) {
          global.SyncGuard?.pause?.('conflict', { table: 'settings', conflicts: settingsMerge.conflicts });
          return { ok: false, blocked: true, hasConflict: true, conflicts: settingsMerge.conflicts };
        }
      } else {
        Object.assign(global.settings, settingsMerge.settings);
        global.settings.defaultBranchId = branchId;
        const committed = await commitConfigTable('settings', global.settings, branchId);
        if (!committed.ok) return committed;
      }
    }

    if (pack.prices && global.settings) {
      const pricesMerge = mergeSettingsObject(
        global.SettingsSplit?.extractPrices?.(global.settings) || {},
        pack.prices,
        branchId
      );
      if (!pricesMerge.ok) {
        conflicts.push(...(pricesMerge.conflicts || []));
        if (!options.allowConflict) {
          global.SyncGuard?.pause?.('conflict', { table: 'settings_prices', conflicts: pricesMerge.conflicts });
          return { ok: false, blocked: true, hasConflict: true, conflicts: pricesMerge.conflicts };
        }
      } else {
        Object.assign(global.settings, pricesMerge.settings);
        const committed = await commitConfigTable('settings', global.settings, branchId);
        if (!committed.ok) return committed;
      }
    }

    for (const table of ARRAY_TABLES) {
      if (!Array.isArray(pack[table])) continue;
      if (table === 'users' && options.mergeUsers === false) continue;
      const incoming = table === 'users'
        ? pack.users.map(u => {
          const existing = (global.users || []).find(x => x.id === u.id);
          if (!existing) return u;
          // Authoritative password = higher credentialRevision, else newer passwordChangedAt.
          // Never prefer stale local seed over synced revision.
          const er = Number(existing.credentialRevision || 0);
          const ir = Number(u.credentialRevision || 0);
          let password = existing.password || u.password;
          if (ir > er) password = u.password || existing.password;
          else if (er > ir) password = existing.password || u.password;
          else {
            const et = Date.parse(existing.passwordChangedAt || 0) || 0;
            const it = Date.parse(u.passwordChangedAt || 0) || 0;
            if (it > et) password = u.password || existing.password;
          }
          return {
            ...existing,
            ...u,
            password,
            credentialRevision: Math.max(er, ir),
            passwordChangedAt: (Date.parse(u.passwordChangedAt || 0) || 0) >= (Date.parse(existing.passwordChangedAt || 0) || 0)
              ? (u.passwordChangedAt || existing.passwordChangedAt)
              : (existing.passwordChangedAt || u.passwordChangedAt),
            mustChangePassword: false,
            seedDefaultPassword: false,
          };
        })
        : pack[table];
      const r = await mergeArrayTable(table, incoming, branchId, options);
      if (!r.ok) {
        // A durable-write error is not a merge conflict and must retain its truthful
        // failure code so applyRemoteVersions cannot advance after a lost commit.
        if (!r.hasConflict && !r.blocked) return r;
        conflicts.push(...(r.conflicts || []));
        if (!options.allowConflict) {
          return { ok: false, blocked: true, hasConflict: true, table, conflicts: r.conflicts };
        }
      }
    }

    if (conflicts.length && !options.allowConflict) {
      return { ok: false, blocked: true, hasConflict: true, conflicts };
    }

    if (global.VersionsIndex) {
      global.VersionsIndex.bumpConfig('settingsVersion', branchId);
      global.VersionsIndex.bumpConfig('pricesVersion', branchId);
      global.VersionsIndex.bumpConfig('servicesVersion', branchId);
      global.VersionsIndex.bumpConfig('packagesVersion', branchId);
      global.VersionsIndex.bumpConfig('usersVersion', branchId);
    }

    return { ok: true, branchId, hadConflicts: conflicts.length > 0 };
  }

  // Compatibility path for browser/localStorage deployments. Electron with a SQLite
  // authoritative Repository always receives the awaited function above instead.
  function mergeArrayTableLegacy(table, incoming, branchId, options) {
    options = options || {};
    const repo = global.Repository;
    const existing = repo?.get?.(table) || global.DB?.get?.(table, []) || [];
    const merge = global.RecordMerger?.mergeRecords?.(existing, incoming, {
      table,
      branchId,
      enqueueConflicts: options.enqueueConflicts !== false,
      preserveOtherBranches: table === 'users'
    });
    if (merge?.hasConflict) return { ok: false, blocked: true, hasConflict: true, conflicts: merge.conflicts };
    if (repo?.setAll) repo.setAll(table, merge.merged, { branchId, source: 'config_import' });
    else global.DB?.set?.(table, merge.merged);
    if (table === 'services') global.services = merge.merged;
    if (table === 'packages') global.packages = merge.merged;
    if (table === 'users') global.users = merge.merged;
    return { ok: true, merged: merge.merged, stats: merge.stats };
  }

  function importBranchPack(pack, options) {
    if (global.Repository?.adapter?.authoritative === true) {
      return importBranchPackAuthoritative(pack, options);
    }
    options = options || {};
    if (!pack || typeof pack !== 'object') return { ok: false, error: 'invalid_pack' };
    const branchId = pack.branchId || options.branchId || 'BR-MAIN';
    const conflicts = [];

    if (pack.settings && global.settings) {
      const settingsMerge = mergeSettingsObject(
        global.SettingsSplit?.extractBranchSettings?.(global.settings) || global.settings,
        pack.settings,
        branchId
      );
      if (!settingsMerge.ok) {
        conflicts.push(...(settingsMerge.conflicts || []));
        if (!options.allowConflict) {
          global.SyncGuard?.pause?.('conflict', { table: 'settings', conflicts: settingsMerge.conflicts });
          return { ok: false, blocked: true, hasConflict: true, conflicts: settingsMerge.conflicts };
        }
      } else {
        Object.assign(global.settings, settingsMerge.settings);
        global.settings.defaultBranchId = branchId;
        global.Repository?.setAll?.('settings', global.settings, { branchId, source: 'config_import' })
          || global.DB?.set?.('settings', global.settings);
      }
    }

    if (pack.prices && global.settings) {
      const pricesMerge = mergeSettingsObject(
        global.SettingsSplit?.extractPrices?.(global.settings) || {}, pack.prices, branchId
      );
      if (!pricesMerge.ok) {
        conflicts.push(...(pricesMerge.conflicts || []));
        if (!options.allowConflict) {
          global.SyncGuard?.pause?.('conflict', { table: 'settings_prices', conflicts: pricesMerge.conflicts });
          return { ok: false, blocked: true, hasConflict: true, conflicts: pricesMerge.conflicts };
        }
      } else {
        Object.assign(global.settings, pricesMerge.settings);
        global.Repository?.setAll?.('settings', global.settings, { branchId, source: 'config_import' })
          || global.DB?.set?.('settings', global.settings);
      }
    }

    for (const table of ARRAY_TABLES) {
      if (!Array.isArray(pack[table])) continue;
      if (table === 'users' && options.mergeUsers === false) continue;
      const incoming = table === 'users'
        ? pack.users.map((u) => {
          const existing = (global.users || []).find((x) => x.id === u.id);
          if (!existing) return u;
          const er = Number(existing.credentialRevision || 0);
          const ir = Number(u.credentialRevision || 0);
          let password = existing.password || u.password;
          if (ir > er) password = u.password || existing.password;
          else if (er > ir) password = existing.password || u.password;
          else if ((Date.parse(u.passwordChangedAt || 0) || 0) > (Date.parse(existing.passwordChangedAt || 0) || 0)) {
            password = u.password || existing.password;
          }
          return {
            ...existing, ...u, password,
            credentialRevision: Math.max(er, ir),
            passwordChangedAt: (Date.parse(u.passwordChangedAt || 0) || 0) >= (Date.parse(existing.passwordChangedAt || 0) || 0)
              ? (u.passwordChangedAt || existing.passwordChangedAt)
              : (existing.passwordChangedAt || u.passwordChangedAt),
            mustChangePassword: false,
            seedDefaultPassword: false,
          };
        })
        : pack[table];
      const result = mergeArrayTableLegacy(table, incoming, branchId, options);
      if (!result.ok) {
        conflicts.push(...(result.conflicts || []));
        if (!options.allowConflict) return { ok: false, blocked: true, hasConflict: true, table, conflicts: result.conflicts };
      }
    }

    if (conflicts.length && !options.allowConflict) return { ok: false, blocked: true, hasConflict: true, conflicts };
    if (global.VersionsIndex) {
      global.VersionsIndex.bumpConfig('settingsVersion', branchId);
      global.VersionsIndex.bumpConfig('pricesVersion', branchId);
      global.VersionsIndex.bumpConfig('servicesVersion', branchId);
      global.VersionsIndex.bumpConfig('packagesVersion', branchId);
      global.VersionsIndex.bumpConfig('usersVersion', branchId);
    }
    return { ok: true, branchId, hadConflicts: conflicts.length > 0 };
  }

  global.ConfigLayer = {
    CONFIG_FILES,
    ARRAY_TABLES,
    getCenterId,
    buildCenterJson,
    exportBranchPack,
    packToDriveFiles,
    drivePathForFile,
    centerJsonPath,
    centerJsonPathCandidates,
    importBranchPack,
    importBranchPackAuthoritative,
    mergeArrayTable,
    mergeArrayTableLegacy,
    mergeSettingsObject,
    commitConfigTable
  };
})(typeof window !== 'undefined' ? window : globalThis);
