/**
 * V5 → V6 migration helpers (client creates a migration request; admin signs V6).
 * Never deletes V5 data until a verified V6 license is applied successfully.
 */
(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  function detectStoredLicenseVersion(lic) {
    if (!lic || typeof lic !== 'object') return null;
    if (Number(lic.v) === 6 || Number(lic.schemaVersion) === 6) return 6;
    if (Number(lic.v) === 5 || lic.commercial?.version === 'V5' || String(lic.productKey || '').includes('TDWI2')) return 5;
    if (lic.commercial?.version === 'V6') return 6;
    if (lic.v) return Number(lic.v);
    return null;
  }

  /**
   * Build an unsigned migration request for License Admin.
   * Admin signs the resulting V6 license offline / online.
   */
  async function buildMigrationRequest(v5License, opts) {
    const options = opts || {};
    if (!v5License) throw new Error('v5_license_required');
    const fp = options.fingerprint || (CL.deviceFingerprint
      ? await CL.deviceFingerprint.buildFingerprint(options.extraParts || {})
      : null);

    const features = Array.isArray(v5License.features)
      ? v5License.features
      : (v5License.features && typeof v5License.features === 'object'
        ? Object.keys(v5License.features).filter((k) => v5License.features[k])
        : []);

    return {
      schemaVersion: 1,
      type: 'v5_to_v6_migration_request',
      createdAt: new Date().toISOString(),
      source: {
        version: 5,
        licenseId: v5License.licenseId || v5License.commercial?.licenseId || '',
        productKey: v5License.productKey || '',
        packageId: v5License.edition || v5License.commercial?.packageId || '',
        expiry: v5License.expiry || '',
        customerName: v5License.commercial?.customerName || '',
        features,
      },
      deviceBinding: {
        mode: options.bindDevice === false ? 'any' : 'single-device',
        fingerprintHash: fp?.hash || '',
        components: fp?.components || {},
        maxDrift: 2,
      },
      note: 'Do not delete V5 license until V6 activation succeeds.',
    };
  }

  function shouldKeepV5(v5License, v6License) {
    if (!v6License) return true;
    if (!v5License) return false;
    return true; // keep until explicit cleanup
  }

  CL.v6Migrate = {
    detectStoredLicenseVersion,
    buildMigrationRequest,
    shouldKeepV5,
  };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
