/**
 * Device Cache — renderer bridge to Electron cache dir (Cloud V2 Sprint 3).
 */
(function (global) {
  'use strict';

  function getCacheApi() {
    return global.getCuppingElectron?.()?.cache || global.cuppingElectron?.cache;
  }

  function isElectron() {
    return !!getCacheApi()?.writeBranchConfig;
  }

  function getCenterId() {
    return global.ConfigLayer?.getCenterId?.() || global.DeviceConfig?.getCenterIdFromConfig?.() || '';
  }

  async function snapshotFromLocal(branchId) {
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    const centerId = getCenterId();
    const pack = global.ConfigLayer?.exportBranchPack?.(branchId);
    if (!pack) return { ok: false, error: 'no_config_layer' };

    const api = getCacheApi();
    const softWrite = async (fn) => {
      try {
        const res = await fn();
        if (res && res.ok === false) return res;
        return res || { ok: true };
      } catch (err) {
        return { ok: false, soft: true, crash: false, message: err?.message || String(err) };
      }
    };

    if (api?.writeBranchConfig && centerId) {
      await softWrite(() => api.writeBranchConfig(centerId, branchId, pack));
    }

    const license = global.LicenseCloud?.loadLocal?.();
    if (license && api?.writeLicense && centerId) {
      await softWrite(() => api.writeLicense(centerId, license));
    }

    const versions = global.VersionsIndex?.toDriveJson?.() || global.VersionsIndex?.loadLocal?.(centerId);
    if (versions && api?.writeVersions && centerId) {
      await softWrite(() => api.writeVersions(centerId, versions));
    }

    return { ok: true, centerId, branchId, pack, cached: !!api };
  }

  async function hydrateBranch(branchId, options) {
    options = options || {};
    const centerId = getCenterId();
    const api = getCacheApi();
    if (!api?.readBranchConfig || !centerId) {
      return { ok: false, skipped: true, reason: 'no_electron_cache' };
    }
    const cached = await api.readBranchConfig(centerId, branchId);
    if (!cached?.ok) return { ok: false, missing: true };

    const pack = {
      branchId,
      settings: cached.files['settings.json'],
      prices: cached.files['prices.json'],
      services: cached.files['services.json'],
      packages: cached.files['packages.json'],
      users: cached.files['users.json']
    };

    if (options.apply !== false && global.ConfigLayer?.importBranchPack) {
      return global.ConfigLayer.importBranchPack(pack, { branchId, mergeUsers: true });
    }
    return { ok: true, pack, fromCache: true };
  }

  async function getStatus() {
    const api = getCacheApi();
    if (!api?.getStatus) return { ok: false, electron: false };
    return api.getStatus(getCenterId());
  }

  /** Push renderer license into main-process device cache (bootstrap restore authority). */
  async function syncLicenseToMainCache(licenseDoc) {
    const license = licenseDoc || global.LicenseCloud?.loadLocal?.();
    const centerId = String(license?.centerId || getCenterId() || '').trim();
    if (!license || !centerId) return { ok: false, error: 'no_license' };
    const api = getCacheApi();
    if (!api?.writeLicense) return { ok: false, skipped: true, reason: 'no_electron_cache' };
    try {
      const res = await api.writeLicense(centerId, license);
      if (res && res.ok === false) return res;
      return res || { ok: true, centerId };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  global.DeviceCache = {
    isElectron,
    getCenterId,
    snapshotFromLocal,
    syncLicenseToMainCache,
    hydrateBranch,
    getStatus
  };
})(typeof window !== 'undefined' ? window : globalThis);
