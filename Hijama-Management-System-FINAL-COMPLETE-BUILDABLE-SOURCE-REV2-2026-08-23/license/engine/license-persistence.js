(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};
  const C = CL.constants;

  function electronApi() {
    return global.cuppingElectron?.license || global.tadawiElectron?.license || null;
  }

  function fsBackend() {
    return global.__licenseFsBackend || null;
  }

  async function writeLicenseShard(licenseId, record) {
    const api = electronApi();
    if (api?.writeLicenseShard) return api.writeLicenseShard(licenseId, record);
    const fs = fsBackend();
    if (fs?.writeLicenseShard) return fs.writeLicenseShard(licenseId, record);
    return null;
  }

  async function writeActivationBundle(licenseId, bundle) {
    const api = electronApi();
    if (api?.writeActivationBundle) return api.writeActivationBundle(licenseId, bundle);
    const fs = fsBackend();
    if (fs?.writeActivationBundle) return fs.writeActivationBundle(licenseId, bundle);
    return null;
  }

  async function loadActivationBundle(licenseId) {
    const cached = CL.store?.getBundle(licenseId);
    if (cached) return cached;

    const api = electronApi();
    if (api?.readActivationBundle) {
      const b = await api.readActivationBundle(licenseId);
      if (b) return b;
    }

    const fs = fsBackend();
    if (fs?.readActivationBundle) {
      const b = fs.readActivationBundle(licenseId);
      if (b) return b;
    }

    if (typeof fetch !== 'undefined') {
      try {
        const base = C?.DATA_BASE || 'license/data/';
        const res = await fetch(`${base}activations/${licenseId}.bundle.json`, { cache: 'no-store' });
        if (res.ok) return res.json();
      } catch { /* offline */ }
    }
    return null;
  }

  async function writeCustomPackage(cp) {
    const api = electronApi();
    if (api?.writeCustomPackage) return api.writeCustomPackage(cp);
    const fs = fsBackend();
    if (fs?.writeCustomPackage) return fs.writeCustomPackage(cp);
    return null;
  }

  async function updateLicenseIndex(index) {
    const api = electronApi();
    if (api?.updateLicenseIndex) return api.updateLicenseIndex(index);
    const fs = fsBackend();
    if (fs?.updateLicenseIndex) return fs.updateLicenseIndex(index);
    return null;
  }

  async function appendPackageToRegistry(pkgDef) {
    const api = electronApi();
    if (api?.appendPackageToRegistry) return api.appendPackageToRegistry(pkgDef);
    const fs = fsBackend();
    if (fs?.appendPackageToRegistry) return fs.appendPackageToRegistry(pkgDef);
    throw new Error('package_registry_persist_unavailable');
  }

  async function syncLicense(record, bundle) {
    await writeLicenseShard(record.licenseId, record);
    if (bundle) await writeActivationBundle(record.licenseId, bundle);
    const state = CL.store.loadState();
    await updateLicenseIndex(state.index);
    return { licenseId: record.licenseId, shard: true, bundle: !!bundle };
  }

  CL.persistence = {
    writeLicenseShard,
    writeActivationBundle,
    loadActivationBundle,
    writeCustomPackage,
    updateLicenseIndex,
    appendPackageToRegistry,
    syncLicense
  };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
