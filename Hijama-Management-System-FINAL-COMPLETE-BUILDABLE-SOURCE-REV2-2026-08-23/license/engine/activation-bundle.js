(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  async function buildBundle(record, resolved) {
    const featureKeys = { ...resolved.featureKeys };
    let featureSig = null;
    let edition = 'custom';

    if (typeof licSignFeaturesObject === 'function') {
      featureSig = await licSignFeaturesObject(featureKeys);
      if (typeof licIsFullEdition === 'function' && licIsFullEdition(featureKeys)) {
        edition = 'full';
      }
    }

    const body = {
      schemaVersion: 1,
      bundleVersion: '1.3.0',
      licenseId: record.licenseId,
      licenseUuid: record.licenseUuid,
      licenseSeq: record.licenseSeq,
      centerId: record.centerId || null,
      packageId: record.packageId,
      packageInternalName: resolved.internalName || record.packageId,
      customPackageId: record.customPackageId || null,
      subscriptionId: record.subscriptionId,
      actionId: record.actionId,
      expiryDate: record.expiryDate,
      devices: record.devices,
      branches: record.branches,
      maxUsers: record.maxUsers,
      deviceBinding: record.deviceBinding || 'DEVICE_ANY',
      customer: {
        name: record.customer?.name || '',
        company: record.customer?.company || '',
        phone: record.customer?.phone || '',
        email: record.customer?.email || '',
        deviceReference: record.customer?.deviceReference || ''
      },
      resolvedFeatureKeys: featureKeys,
      featureSig,
      edition
    };

    const { bundleSig, ...unsigned } = body;
    const sigPayload = await CL.crypto.hmacSha256Hex(CL.crypto.canonicalJson(unsigned));
    const bundle = { ...body, bundleSig: sigPayload };
    CL.store.saveBundle(record.licenseId, bundle);
    if (CL.persistence?.writeActivationBundle) {
      CL.persistence.writeActivationBundle(record.licenseId, bundle).catch(() => {});
    }
    return bundle;
  }

  async function verifyBundle(bundle) {
    if (!bundle?.bundleSig) throw new Error('bundle_sig_missing');
    const { bundleSig, ...body } = bundle;
    const expected = await CL.crypto.hmacSha256Hex(CL.crypto.canonicalJson(body));
    if (bundleSig !== expected) throw new Error('bundle_tampered');
    return true;
  }

  async function bundleToActivationPayload(bundle) {
    await verifyBundle(bundle);
    return {
      type: 'renew',
      v: 5,
      edition: bundle.edition,
      features: bundle.resolvedFeatureKeys,
      featureSig: bundle.featureSig,
      expiry: bundle.expiryDate,
      licType: CL.constants.SUB_TO_V1[bundle.subscriptionId] || 'annual',
      licenseId: bundle.licenseSeq || CL.store.parseLicenseSeq(bundle.licenseId),
      commercial: {
        licenseId: bundle.licenseId,
        packageId: bundle.packageId,
        version: 'V5'
      }
    };
  }

  CL.activationBundle = { buildBundle, verifyBundle, bundleToActivationPayload };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
