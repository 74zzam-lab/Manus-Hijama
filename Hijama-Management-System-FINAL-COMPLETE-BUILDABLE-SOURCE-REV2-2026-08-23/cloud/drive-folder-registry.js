/**
 * Drive folder registry — maps stable IDs to human-readable Drive folder names.
 * Internal relations use centerId / branchId only; folder names are display paths.
 */
(function (global) {
  'use strict';

  const REGISTRY_KEY = '__tdw_drive_folders__';

  function loadRegistry() {
    const raw = global.DB?.get?.(REGISTRY_KEY, null);
    if (raw && typeof raw === 'object') return raw;
    return { centerId: '', centerFolder: '', branches: {}, updatedAt: null };
  }

  function saveRegistry(reg) {
    reg.updatedAt = new Date().toISOString();
    global.DB?.set?.(REGISTRY_KEY, reg);
    return reg;
  }

  function sanitizeSegment(s) {
    return String(s || '').replace(/[<>:"|?*\\/]/g, '_').trim() || 'unknown';
  }

  function resolveCenterDisplayName(centerId) {
    const license = global.LicenseCloud?.loadLocal?.() || {};
    if (license.centerId === centerId && license.centerName) return license.centerName;
    return global.settings?.centerName || '';
  }

  function resolveBranchDisplayName(branchId, branchName) {
    if (branchName) return branchName;
    const license = global.LicenseCloud?.loadLocal?.() || {};
    const b = (license.branches || []).find(x => x && x.id === branchId);
    return b?.name || '';
  }

  function ensureRegistry(centerId) {
    centerId = centerId || global.CenterId?.getStoredCenterId?.()
      || global.LicenseCloud?.loadLocal?.()?.centerId || '';
    let reg = loadRegistry();
    const centerName = resolveCenterDisplayName(centerId) || centerId;
    if (centerId && (!reg.centerId || reg.centerId === centerId)) {
      reg.centerId = centerId;
      if (!reg.centerFolder) reg.centerFolder = sanitizeSegment(centerName);
    }
    const license = global.LicenseCloud?.loadLocal?.() || {};
    (license.branches || []).forEach(b => {
      if (!b?.id) return;
      if (!reg.branches[b.id]) {
        reg.branches[b.id] = sanitizeSegment(b.name || b.id);
      }
    });
    return saveRegistry(reg);
  }

  function getCenterFolderName(centerId) {
    centerId = centerId || global.CenterId?.getStoredCenterId?.()
      || global.LicenseCloud?.loadLocal?.()?.centerId || '';
    const reg = ensureRegistry(centerId);
    if (reg.centerId === centerId && reg.centerFolder) return reg.centerFolder;
    const name = resolveCenterDisplayName(centerId);
    return sanitizeSegment(name || centerId || 'Center');
  }

  function getBranchFolderName(branchId, branchName) {
    const reg = ensureRegistry();
    if (reg.branches?.[branchId]) return reg.branches[branchId];
    const name = resolveBranchDisplayName(branchId, branchName);
    return sanitizeSegment(name || branchId || 'Branch');
  }

  function centerRootCandidates(centerId) {
    centerId = centerId || global.CenterId?.getStoredCenterId?.() || '';
    const root = global.DriveLayout?.ROOT || 'NajjarTech';
    const names = new Set();
    const reg = loadRegistry();
    if (reg.centerFolder) names.add(`${root}/${reg.centerFolder}`);
    const display = sanitizeSegment(resolveCenterDisplayName(centerId));
    if (display) names.add(`${root}/${display}`);
    if (centerId) names.add(`${root}/${sanitizeSegment(centerId)}`);
    return [...names];
  }

  async function renameDriveFolder(oldPath, newPath) {
    const bridge = global.BackupBridge;
    if (!bridge?.renameCloudFolder) {
      return { ok: false, error: 'rename_unavailable', skipped: true };
    }
    return bridge.renameCloudFolder(oldPath, newPath, 'google');
  }

  async function renameCenterFolder(newCenterName, options) {
    options = options || {};
    const centerId = global.CenterId?.getStoredCenterId?.()
      || global.LicenseCloud?.loadLocal?.()?.centerId || '';
    if (!centerId) return { ok: false, error: 'no_center_id' };

    const reg = ensureRegistry(centerId);
    const oldFolder = reg.centerFolder || sanitizeSegment(resolveCenterDisplayName(centerId) || centerId);
    const newFolder = sanitizeSegment(newCenterName);
    if (oldFolder === newFolder) return { ok: true, unchanged: true, folder: newFolder };

    const root = global.DriveLayout?.ROOT || 'NajjarTech';
    const oldPath = `${root}/${oldFolder}`;
    const newPath = `${root}/${newFolder}`;
    const snapshot = JSON.parse(JSON.stringify(reg));

    if (!options.dryRun && global.DriveAdapter?.isConnected?.()) {
      const renamed = await renameDriveFolder(oldPath, newPath);
      if (!renamed.ok && !renamed.skipped) {
        return { ok: false, error: renamed.error || 'rename_failed', rollback: true };
      }
    }

    reg.centerFolder = newFolder;
    saveRegistry(reg);

    if (typeof global.AuditLogger?.log === 'function') {
      global.AuditLogger.log({
        action: 'DRIVE_CENTER_RENAMED',
        entity: 'center',
        entityId: centerId,
        summary: `Center folder: ${oldFolder} → ${newFolder}`
      });
    }

    return { ok: true, centerId, oldFolder, newFolder, snapshot };
  }

  async function renameBranchFolder(branchId, newBranchName, options) {
    options = options || {};
    branchId = String(branchId || '').trim();
    if (!branchId) return { ok: false, error: 'branch_id_required' };

    const centerId = global.CenterId?.getStoredCenterId?.()
      || global.LicenseCloud?.loadLocal?.()?.centerId || '';
    const reg = ensureRegistry(centerId);
    const oldFolder = reg.branches?.[branchId] || sanitizeSegment(branchId);
    const newFolder = sanitizeSegment(newBranchName);
    if (oldFolder === newFolder) return { ok: true, unchanged: true, folder: newFolder };

    const centerFolder = getCenterFolderName(centerId);
    const root = global.DriveLayout?.ROOT || 'NajjarTech';
    const oldPath = `${root}/${centerFolder}/Branches/${oldFolder}`;
    const newPath = `${root}/${centerFolder}/Branches/${newFolder}`;
    const snapshot = JSON.parse(JSON.stringify(reg));

    if (!options.dryRun && global.DriveAdapter?.isConnected?.()) {
      const renamed = await renameDriveFolder(oldPath, newPath);
      if (!renamed.ok && !renamed.skipped) {
        saveRegistry(snapshot);
        return { ok: false, error: renamed.error || 'rename_failed', rolledBack: true };
      }
    }

    reg.branches = reg.branches || {};
    reg.branches[branchId] = newFolder;
    saveRegistry(reg);

    if (typeof global.AuditLogger?.log === 'function') {
      global.AuditLogger.log({
        action: 'DRIVE_BRANCH_RENAMED',
        entity: 'branch',
        entityId: branchId,
        summary: `Branch folder: ${oldFolder} → ${newFolder}`
      });
    }

    return { ok: true, branchId, oldFolder, newFolder, snapshot };
  }

  function onCenterOrBranchNameChanged(patch) {
    patch = patch || {};
    const tasks = [];
    if (patch.centerName) {
      tasks.push(renameCenterFolder(patch.centerName, { dryRun: !global.DriveAdapter?.isConnected?.() }));
    }
    if (patch.branchId && patch.branchName) {
      tasks.push(renameBranchFolder(patch.branchId, patch.branchName, { dryRun: !global.DriveAdapter?.isConnected?.() }));
    }
    return Promise.all(tasks);
  }

  global.DriveFolderRegistry = {
    REGISTRY_KEY,
    loadRegistry,
    saveRegistry,
    ensureRegistry,
    getCenterFolderName,
    getBranchFolderName,
    centerRootCandidates,
    renameCenterFolder,
    renameBranchFolder,
    onCenterOrBranchNameChanged
  };
})(typeof window !== 'undefined' ? window : globalThis);
