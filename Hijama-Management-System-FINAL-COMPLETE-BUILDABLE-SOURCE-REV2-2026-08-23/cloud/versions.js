/**
 * versions.json — granular revision index for Push/Poll (Cloud V2).
 */
(function (global) {
  'use strict';

  const LOCAL_VERSIONS_KEY = '__tdw_versions__';

  const TABLE_VERSION_MAP = {
    settings: 'settingsVersion',
    services: 'servicesVersion',
    packages: 'packagesVersion',
    users: 'usersVersion',
    cases: 'databaseVersion',
    clientsRegistry: 'databaseVersion',
    bookings: 'databaseVersion',
    expenses: 'databaseVersion',
    attendance: 'databaseVersion',
    doctors: 'databaseVersion',
    inventoryItems: 'databaseVersion',
    inventorySuppliers: 'databaseVersion',
    inventoryMovements: 'databaseVersion',
    attachments_meta: 'databaseVersion',
    messageLog: 'databaseVersion',
    activityLog: 'databaseVersion',
    nextSessions: 'databaseVersion',
    otRecords: 'databaseVersion',
    employeeLeaveRequests: 'databaseVersion',
    employeeLedgerAccruals: 'databaseVersion',
    employeeLedgerPayments: 'databaseVersion',
    employeeLedgerEntries: 'databaseVersion',
    importHistory: 'databaseVersion',
    communicationWebhookLog: 'databaseVersion',
    opsKv: 'databaseVersion'
  };

  const BRANCH_CONFIG_FIELDS = ['settingsVersion', 'pricesVersion', 'servicesVersion', 'packagesVersion', 'usersVersion'];

  function defaultVersions(centerId) {
    return {
      centerId: centerId || '',
      schemaVersion: global.CloudMeta?.APP_SCHEMA_VERSION || 1,
      updatedAt: new Date().toISOString(),
      licenseVersion: 0,
      settingsVersion: 0,
      pricesVersion: 0,
      servicesVersion: 0,
      packagesVersion: 0,
      usersVersion: 0,
      databaseVersion: 0,
      branches: {}
    };
  }

  function loadLocal(centerId) {
    const db = global.DB;
    const stored = db?.get?.(LOCAL_VERSIONS_KEY, null);
    if (stored && typeof stored === 'object') return stored;
    return defaultVersions(centerId);
  }

  function saveLocal(versions) {
    versions.updatedAt = new Date().toISOString();
    global.DB?.set?.(LOCAL_VERSIONS_KEY, versions);
    return versions;
  }

  function ensureBranch(versions, branchId) {
    if (!versions.branches) versions.branches = {};
    if (!versions.branches[branchId]) {
      versions.branches[branchId] = {
        databaseVersion: 0,
        settingsVersion: 0,
        pricesVersion: 0,
        servicesVersion: 0,
        packagesVersion: 0,
        usersVersion: 0
      };
    }
    return versions.branches[branchId];
  }

  function bump(versions, field, branchId) {
    versions = versions || defaultVersions();
    if (branchId && field === 'databaseVersion') {
      const b = ensureBranch(versions, branchId);
      b.databaseVersion = (Number(b.databaseVersion) || 0) + 1;
      versions.databaseVersion = (Number(versions.databaseVersion) || 0) + 1;
    } else if (branchId && BRANCH_CONFIG_FIELDS.includes(field)) {
      const b = ensureBranch(versions, branchId);
      b[field] = (Number(b[field]) || 0) + 1;
      if (field in versions) versions[field] = (Number(versions[field]) || 0) + 1;
    } else if (field in versions) {
      versions[field] = (Number(versions[field]) || 0) + 1;
    }
    return saveLocal(versions);
  }

  function bumpConfig(field, branchId) {
    const centerId = global.ConfigLayer?.getCenterId?.() || global.CenterId?.getStoredCenterId?.() || '';
    let versions = loadLocal(centerId);
    if (centerId && !versions.centerId) versions.centerId = centerId;
    return bump(versions, field, branchId);
  }

  function onRepositoryBump(table, branchId) {
    if (!global.CloudMeta?.isCloudV2Enabled?.()) return null;
    const field = TABLE_VERSION_MAP[table];
    if (!field) return null;
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    const versions = bumpConfig(field, field === 'databaseVersion' ? branchId : branchId);
    if (typeof global.SyncEngine?.schedulePush === 'function') {
      try { global.SyncEngine.schedulePush(table, branchId); } catch { /* empty */ }
    }
    return versions;
  }

  function syncFromRepository(repo, centerId, branchId) {
    repo = repo || global.Repository;
    centerId = centerId || global.ConfigLayer?.getCenterId?.() || '';
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    if (!repo?.getAllRevisions) return loadLocal(centerId);

    const revs = repo.getAllRevisions();
    let versions = loadLocal(centerId);
    versions.centerId = centerId || versions.centerId;
    versions.schemaVersion = global.CloudMeta?.APP_SCHEMA_VERSION || versions.schemaVersion;

    Object.entries(TABLE_VERSION_MAP).forEach(([table, field]) => {
      const n = Number(revs[table]) || 0;
      if (field === 'databaseVersion') {
        const b = ensureBranch(versions, branchId);
        if (n > (Number(b.databaseVersion) || 0)) b.databaseVersion = n;
        const maxDb = Math.max(
          Number(versions.databaseVersion) || 0,
          ...Object.values(versions.branches || {}).map(x => Number(x.databaseVersion) || 0),
          n
        );
        versions.databaseVersion = maxDb;
      } else if (n > (Number(versions[field]) || 0)) {
        versions[field] = n;
        const b = ensureBranch(versions, branchId);
        if (field in b && n > (Number(b[field]) || 0)) b[field] = n;
      }
    });

    const license = global.LicenseCloud?.loadLocal?.();
    if (license?.licenseVersion != null) {
      versions.licenseVersion = Math.max(Number(versions.licenseVersion) || 0, Number(license.licenseVersion) || 0);
    }

    return saveLocal(versions);
  }

  function toDriveJson(versions) {
    versions = versions || loadLocal();
    const cfg = global.DeviceConfig?.load?.() || {};
    return {
      ...versions,
      updatedAt: new Date().toISOString(),
      updatedBy: {
        deviceUuid: cfg.deviceUuid || '',
        deviceName: cfg.deviceName || global.settings?.backup?.deviceName || 'Device'
      }
    };
  }

  function drivePath(centerId, branchId) {
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    return global.DriveLayout?.syncVersionsJson?.(centerId, branchId) || '';
  }

  function drivePathCandidates(centerId, branchId) {
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    return global.DriveLayout?.syncVersionsJsonCandidates?.(centerId, branchId) || [drivePath(centerId, branchId)];
  }

  function diff(remote, local) {
    remote = remote || {};
    local = local || {};
    const changed = [];
    const scalar = ['licenseVersion', 'settingsVersion', 'pricesVersion', 'servicesVersion', 'packagesVersion', 'usersVersion', 'databaseVersion'];
    scalar.forEach(k => {
      if ((Number(remote[k]) || 0) > (Number(local[k]) || 0)) changed.push({ layer: 'config', field: k, remote: remote[k], local: local[k] });
    });
    const rb = remote.branches || {};
    const lb = local.branches || {};
    Object.keys(rb).forEach(bid => {
      const r = rb[bid] || {};
      const l = lb[bid] || {};
      Object.keys(r).forEach(fk => {
        if ((Number(r[fk]) || 0) > (Number(l[fk]) || 0)) {
          changed.push({ layer: 'branch', branchId: bid, field: fk, remote: r[fk], local: l[fk] });
        }
      });
    });
    return changed;
  }

  global.VersionsIndex = {
    LOCAL_VERSIONS_KEY,
    TABLE_VERSION_MAP,
    defaultVersions,
    loadLocal,
    saveLocal,
    bump,
    bumpConfig,
    onRepositoryBump,
    syncFromRepository,
    toDriveJson,
    drivePath,
    drivePathCandidates,
    diff
  };
})(typeof window !== 'undefined' ? window : globalThis);
