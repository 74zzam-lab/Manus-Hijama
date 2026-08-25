(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  async function validateKey(key, bundleOverride) {
    const decoded = await CL.codecV5.decodeV5Key(key);
    if (!decoded.ok) return decoded;

    let bundle = bundleOverride;
    const licenseId = CL.store.formatLicenseId(decoded.fields.licenseSeq);
    let record = CL.store.getLicense(licenseId);

    if (!bundle) {
      bundle = CL.store.getBundle(licenseId);
      if (!bundle && CL.persistence?.loadActivationBundle) {
        bundle = await CL.persistence.loadActivationBundle(licenseId);
      }
    }

    if (!bundle && (global.GoogleSheetsOps?.fetchBundle || global.LicenseVaultClient?.fetchBundleFromVault)) {
      const vaultBundle = global.GoogleSheetsOps?.fetchBundle
        ? await global.GoogleSheetsOps.fetchBundle(key)
        : await global.LicenseVaultClient.fetchBundleFromVault(key);
      if (vaultBundle?.ok && vaultBundle.bundle) {
        bundle = vaultBundle.bundle;
      } else if (vaultBundle?.skipped || vaultBundle?.soft) {
        // Soft vault/network — continue to local-only failure path below.
      } else if (vaultBundle?.error === 'bundle_not_found' || vaultBundle?.error === 'bundles_sheet_missing'
        || vaultBundle?.code === 'not_found' || vaultBundle?.code === 'missing_sheet') {
        return { ok: false, error: 'bundle_missing', decoded, record, vaultHint: 'add_bundle_to_sheet' };
      }
    }

    if (!bundle) return { ok: false, error: 'bundle_missing', decoded, record };

    if (!record && bundle) {
      record = {
        licenseId: bundle.licenseId,
        licenseUuid: bundle.licenseUuid,
        licenseSeq: bundle.licenseSeq,
        centerId: bundle.centerId || null,
        packageId: bundle.packageId,
        customPackageId: bundle.customPackageId || null,
        subscriptionId: bundle.subscriptionId,
        actionId: bundle.actionId,
        expiryDate: bundle.expiryDate,
        devices: bundle.devices,
        branches: bundle.branches,
        maxUsers: bundle.maxUsers,
        deviceBinding: bundle.deviceBinding || ((bundle.branches || 1) > 1 ? 'DEVICE_ANY' : 'DEVICE_BIND_FIRST'),
        customer: bundle.customer || {},
        status: 'active'
      };
    }
    if (!record) return { ok: false, error: 'license_not_found', decoded };

    try {
      await CL.activationBundle.verifyBundle(bundle);
    } catch (e) {
      return { ok: false, error: e.message || 'bundle_invalid', decoded };
    }

    if (bundle.licenseSeq && bundle.licenseSeq !== decoded.fields.licenseSeq) {
      return { ok: false, error: 'license_seq_mismatch', decoded };
    }

    if (!record) record = CL.store.getLicense(bundle.licenseId);
    const expiry = decoded.expiry || record?.expiryDate;
    if (expiry && new Date(expiry + 'T23:59:59Z') < new Date()) {
      return { ok: false, error: 'expired', decoded, record, bundle };
    }

    const activation = await CL.bridge.applyV5Activation(key, bundle);
    if (!activation.ok) return activation;

    return {
      ok: true,
      decoded,
      record: activation.record || record,
      bundle,
      payload: activation.payload
    };
  }

  async function validateRecord(record) {
    if (!record?.licenseId) return { ok: false, error: 'record_invalid' };
    const bundle = CL.store.getBundle(record.licenseId);
    if (!bundle) return { ok: false, error: 'bundle_missing' };
    await CL.activationBundle.verifyBundle(bundle);
    if (record.productKey) {
      const keyCheck = await validateKey(record.productKey, bundle);
      if (!keyCheck.ok) return keyCheck;
    }
    return { ok: true, record, bundle };
  }

  CL.validator = { validateKey, validateRecord };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
