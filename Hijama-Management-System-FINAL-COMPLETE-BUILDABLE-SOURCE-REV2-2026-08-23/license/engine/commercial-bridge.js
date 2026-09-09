(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  async function commercialToV1License(record, bundle) {
    const payload = await CL.activationBundle.bundleToActivationPayload(bundle);
    payload.issue = record.issueDate;
    payload.issued = record.issueDate;
    payload.activationDate = record.issueDate;
    payload.device = 'DEVICE_ANY';
    payload.token = 'V5-' + record.licenseId + '-' + Date.now();

    const lic = {
      type: 'renew',
      licType: payload.licType,
      licenseId: record.licenseUuid,
      start: record.issueDate,
      activationDate: record.issueDate,
      expiry: record.expiryDate,
      issued: record.issueDate,
      device: payload.device,
      deviceMode: (payload.device === 'DEVICE_ANY') ? 'any' : 'locked',
      v: 5,
      commercialMeta: {
        licenseId: record.licenseId,
        packageId: record.packageId,
        subscriptionId: record.subscriptionId,
        devices: record.devices,
        branches: record.branches,
        centerId: record.centerId || ''
      }
    };

    if (typeof licAttachFeaturesToLicense === 'function') {
      await licAttachFeaturesToLicense(lic, payload);
    } else if (payload.features) {
      lic.edition = payload.edition;
      lic.features = payload.features;
      lic.featureSig = payload.featureSig;
    }
    return lic;
  }

  async function applyV5Activation(key, bundle) {
    const decoded = await CL.codecV5.decodeV5Key(key);
    if (!decoded.ok) return decoded;

    if (bundle) {
      await CL.activationBundle.verifyBundle(bundle);
    } else {
      const record = CL.store.getLicense(
        CL.store.formatLicenseId(decoded.licenseSeq)
      );
      if (!record) return { ok: false, error: 'license_not_found' };
      bundle = CL.store.getBundle(record.licenseId);
      if (!bundle && CL.persistence?.loadActivationBundle) {
        bundle = await CL.persistence.loadActivationBundle(record.licenseId);
      }
      if (!bundle) return { ok: false, error: 'bundle_missing' };
      await CL.activationBundle.verifyBundle(bundle);
    }

    const record = CL.store.getLicense(bundle.licenseId);
    const payload = await CL.activationBundle.bundleToActivationPayload(bundle);
    payload.device = 'DEVICE_ANY';

    return {
      ok: true,
      payload,
      bundle,
      decoded,
      record
    };
  }

  CL.bridge = { commercialToV1License, applyV5Activation };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
