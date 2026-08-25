/**
 * Google Drive path layout — simplified Cloud V2 structure.
 * NajjarTech/{Center Name}/License|Center|Branches/{Branch Name}/Configuration|Operational|Backup|versions.json|Shared/
 * Internal IDs live in JSON only; folder names are display names via DriveFolderRegistry.
 */
(function (global) {
  'use strict';

  const ROOT = 'NajjarTech';

  const LAYERS = {
    LICENSE: 'License',
    CENTER: 'Center',
    BRANCHES: 'Branches',
    CONFIGURATION: 'Configuration',
    OPERATIONAL: 'Operational',
    BACKUP: 'Backup',
    SHARED: 'Shared',
    SYNC: 'Sync',
    BACKUPS: 'Backups',
    LOGS: 'Logs'
  };

  function sanitizeSegment(s) {
    return String(s || '').replace(/[<>:"|?*\\/]/g, '_').trim() || 'unknown';
  }

  function centerFolderName(centerId) {
    if (global.DriveFolderRegistry?.getCenterFolderName) {
      return global.DriveFolderRegistry.getCenterFolderName(centerId);
    }
    const license = global.LicenseCloud?.loadLocal?.();
    if (license?.centerId === centerId && license.centerName) return sanitizeSegment(license.centerName);
    return sanitizeSegment(centerId || global.settings?.centerName || 'Center');
  }

  function centerRoot(centerId) {
    return `${ROOT}/${centerFolderName(centerId)}`;
  }

  function legacyCenterRoot(centerId) {
    return `${ROOT}/${sanitizeSegment(centerId)}`;
  }

  /** V2-4 stable identity path — keyed by centerId (rename-safe). */
  function idCenterRoot(centerId) {
    return `${ROOT}/centers/${sanitizeSegment(centerId)}`;
  }

  function idBranchRoot(centerId, branchId) {
    return `${idCenterRoot(centerId)}/branches/${sanitizeSegment(branchId)}`;
  }

  function centerRootCandidates(centerId) {
    if (global.DriveFolderRegistry?.centerRootCandidates) {
      return global.DriveFolderRegistry.centerRootCandidates(centerId);
    }
    const names = new Set([idCenterRoot(centerId), centerRoot(centerId), legacyCenterRoot(centerId)]);
    return [...names];
  }

  function resolveBranchFolderName(branchId, branchName) {
    if (global.DriveFolderRegistry?.getBranchFolderName) {
      return global.DriveFolderRegistry.getBranchFolderName(branchId, branchName);
    }
    if (branchName) return sanitizeSegment(branchName);
    const license = global.LicenseCloud?.loadLocal?.();
    if (license?.branches?.length) {
      const b = license.branches.find(x => x && x.id === branchId);
      if (b?.name) return sanitizeSegment(b.name);
    }
    return sanitizeSegment(branchId);
  }

  function branchRootDir(centerId, branchId, branchName) {
    const folder = resolveBranchFolderName(branchId, branchName);
    return `${centerRoot(centerId)}/${LAYERS.BRANCHES}/${folder}`;
  }

  function licenseJson(centerId) {
    return `${centerRoot(centerId)}/${LAYERS.LICENSE}/license.json`;
  }

  function licenseJsonCandidates(centerId) {
    const paths = centerRootCandidates(centerId).map(r => `${r}/${LAYERS.LICENSE}/license.json`);
    return [...new Set(paths)];
  }

  function licenseSig(centerId) {
    return `${centerRoot(centerId)}/${LAYERS.LICENSE}/license.sig`;
  }

  function configCenterJson(centerId) {
    return `${centerRoot(centerId)}/${LAYERS.CENTER}/center.json`;
  }

  function legacyConfigCenterJson(centerId) {
    return `${legacyCenterRoot(centerId)}/${LAYERS.CONFIGURATION}/center.json`;
  }

  function configCenterJsonCandidates(centerId) {
    const primary = configCenterJson(centerId);
    const legacy = legacyConfigCenterJson(centerId);
    return primary === legacy ? [primary] : [primary, legacy];
  }

  function configBranchDir(centerId, branchId, branchName) {
    return `${branchRootDir(centerId, branchId, branchName)}/${LAYERS.CONFIGURATION}`;
  }

  function configBranchFile(centerId, branchId, name, branchName) {
    return `${configBranchDir(centerId, branchId, branchName)}/${name}`;
  }

  function operationalBranchDir(centerId, branchId, branchName) {
    return `${branchRootDir(centerId, branchId, branchName)}/${LAYERS.OPERATIONAL}`;
  }

  function operationalBranchFile(centerId, branchId, table, branchName) {
    const base = String(table || '').replace(/\.json$/i, '');
    return `${operationalBranchDir(centerId, branchId, branchName)}/${base}.json`;
  }

  function backupBranchDir(centerId, branchId, branchName) {
    return `${branchRootDir(centerId, branchId, branchName)}/${LAYERS.BACKUP}`;
  }

  function backupBranchFile(centerId, branchId, dateKey, branchName) {
    return `${backupBranchDir(centerId, branchId, branchName)}/${sanitizeSegment(dateKey || 'backup')}.tdw`;
  }

  function sharedDir(centerId) {
    return `${centerRoot(centerId)}/${LAYERS.SHARED}`;
  }

  function legacyConfigBranchDir(centerId, branchId) {
    return `${legacyCenterRoot(centerId)}/${LAYERS.CONFIGURATION}/branches/${sanitizeSegment(branchId)}`;
  }

  function legacyConfigBranchFile(centerId, branchId, name) {
    return `${legacyConfigBranchDir(centerId, branchId)}/${name}`;
  }

  function legacyOperationalBranchDir(centerId, branchId) {
    return `${legacyCenterRoot(centerId)}/${LAYERS.OPERATIONAL}/branches/${sanitizeSegment(branchId)}`;
  }

  function legacyOperationalBranchFile(centerId, branchId, table) {
    const base = String(table || '').replace(/\.json$/i, '');
    return `${legacyOperationalBranchDir(centerId, branchId)}/${base}.json`;
  }

  function configBranchFileCandidates(centerId, branchId, name) {
    const branchName = resolveBranchFolderName(branchId);
    const primary = configBranchFile(centerId, branchId, name, branchName);
    const legacy = legacyConfigBranchFile(centerId, branchId, name);
    return primary === legacy ? [primary] : [primary, legacy];
  }

  function operationalBranchFileCandidates(centerId, branchId, table) {
    const branchName = resolveBranchFolderName(branchId);
    const base = String(table || '').replace(/\.json$/i, '');
    const idPath = `${idBranchRoot(centerId, branchId)}/Operational/${base}.json`;
    const primary = operationalBranchFile(centerId, branchId, table, branchName);
    const legacy = legacyOperationalBranchFile(centerId, branchId, table);
    return [...new Set([idPath, primary, legacy])];
  }

  function syncVersionsJson(centerId, branchId, branchName) {
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    // Prefer stable ID path for V2-4 sync (center rename must not move cloud root)
    return `${idBranchRoot(centerId, branchId)}/versions.json`;
  }

  function syncVersionsJsonCandidates(centerId, branchId, branchName) {
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    const idPath = `${idBranchRoot(centerId, branchId)}/versions.json`;
    const displayPath = `${branchRootDir(centerId, branchId, branchName)}/versions.json`;
    const legacyCenter = `${legacyCenterRoot(centerId)}/${LAYERS.SYNC}/versions.json`;
    const legacyRoot = `${centerRoot(centerId)}/${LAYERS.SYNC}/versions.json`;
    return [...new Set([idPath, displayPath, legacyRoot, legacyCenter])];
  }

  function attachmentBlobPath(centerId, branchId, sha256) {
    const h = String(sha256 || '').toLowerCase();
    return `${idBranchRoot(centerId, branchId)}/attachments/${h}`;
  }

  function devicesRegistryJson(centerId) {
    return `${idCenterRoot(centerId)}/devices/registry.json`;
  }

  function quarantineDir(centerId, branchId) {
    return `${idBranchRoot(centerId, branchId)}/quarantine`;
  }

  function syncLocksJson(centerId, branchId) {
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    const branchName = resolveBranchFolderName(branchId);
    return `${branchRootDir(centerId, branchId, branchName)}/locks.json`;
  }

  function backupAutoDir(centerId, branchId, branchName) {
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    return backupBranchDir(centerId, branchId, branchName);
  }

  function backupManualDir(centerId) {
    return `${centerRoot(centerId)}/${LAYERS.BACKUPS}/Manual`;
  }

  function auditLogMonth(centerId, yearMonth) {
    return `${centerRoot(centerId)}/${LAYERS.LOGS}/audit-${yearMonth}.json`;
  }

  function backupAutoFile(centerId, dateKey, branchId, branchName) {
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    return backupBranchFile(centerId, branchId, dateKey, branchName);
  }

  function legacyCenterFolder(centerName) {
    return `NajjarTech Hijama Management/${sanitizeSegment(centerName)}`;
  }

  global.DriveLayout = {
    ROOT,
    LAYERS,
    centerFolderName,
    centerRoot,
    legacyCenterRoot,
    idCenterRoot,
    idBranchRoot,
    centerRootCandidates,
    resolveBranchFolderName,
    branchRootDir,
    licenseJson,
    licenseJsonCandidates,
    licenseSig,
    configCenterJson,
    legacyConfigCenterJson,
    configCenterJsonCandidates,
    configBranchDir,
    configBranchFile,
    operationalBranchDir,
    operationalBranchFile,
    backupBranchDir,
    backupBranchFile,
    sharedDir,
    legacyConfigBranchDir,
    legacyConfigBranchFile,
    legacyOperationalBranchDir,
    legacyOperationalBranchFile,
    configBranchFileCandidates,
    operationalBranchFileCandidates,
    syncVersionsJson,
    syncVersionsJsonCandidates,
    syncLocksJson,
    backupAutoDir,
    backupManualDir,
    backupAutoFile,
    auditLogMonth,
    legacyCenterFolder,
    attachmentBlobPath,
    devicesRegistryJson,
    quarantineDir
  };
})(typeof window !== 'undefined' ? window : globalThis);
