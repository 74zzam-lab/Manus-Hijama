(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  function electronLicenseApi() {
    return global.cuppingElectron?.license || global.tadawiElectron?.license || null;
  }

  function fsBackend() {
    return global.__licenseFsBackend || null;
  }

  function isDesktop() {
    return !!(electronLicenseApi() || fsBackend());
  }

  function canPersistRegistry() {
    return !!(electronLicenseApi()?.appendPackageToRegistry || fsBackend()?.appendPackageToRegistry);
  }

  CL.env = {
    isDesktop,
    isBrowser: () => !isDesktop(),
    canPersistRegistry,
    canWriteLicenseData: () => !!(electronLicenseApi()?.writeLicenseShard || fsBackend()?.writeLicenseShard),
    modalHost() {
      return document.getElementById('lic-v2-modal-host')
        || document.getElementById('licenseScreen')
        || document.body;
    },
    closeAllModals() {
      ['lic-v2-overlay', 'lic-v2-upgrade-overlay', 'lic-v2-pkg-overlay'].forEach(id => {
        const o = document.getElementById(id);
        if (o) o.classList.remove('open');
      });
    },
    isLicenseScreenOpen() {
      const lic = document.getElementById('licenseScreen');
      return !!(lic && !lic.classList.contains('hidden'));
    }
  };

  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
