(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  async function downgrade(existingLicenseId, config) {
    if (!config?.confirmed) {
      return { ok: false, error: 'confirmation_required', message: 'Downgrade requires explicit confirmation' };
    }

    const record = CL.store.getLicense(existingLicenseId);
    if (!record) throw new Error('license_not_found');

    const targetPackageId = config.targetPackageId;
    if (!targetPackageId) throw new Error('target_package_required');

    const currentResolved = record.packageId === '99' && record.customPackageId
      ? CL.featureResolver.resolveCustomPackage(record.customPackageId)
      : CL.featureResolver.resolvePackageCached(record.packageId);

    const targetResolved = CL.featureResolver.resolvePackageCached(targetPackageId);
    const diff = CL.upgrade.compareFeatureSets(currentResolved.featureIds, targetResolved.featureIds);

    const updated = { ...record };
    updated.packageId = targetPackageId;
    updated.customPackageId = null;
    updated.actionId = '04';
    updated.devices = config.devices ?? targetResolved.devices ?? updated.devices;
    updated.branches = config.branches ?? targetResolved.branches ?? updated.branches;
    updated.maxUsers = config.maxUsers ?? targetResolved.maxUsers ?? updated.maxUsers;
    updated.updatedAt = new Date().toISOString();
    updated.renewHistory = updated.renewHistory || [];
    updated.renewHistory.push({
      date: new Date().toISOString().slice(0, 10),
      fromPackage: record.packageId,
      toPackage: targetPackageId,
      mode: 'downgrade',
      actionId: '04'
    });

    const bundle = await CL.activationBundle.buildBundle(updated, targetResolved);
    const encoded = await CL.codecV5.encodeV5Key({
      packageId: updated.packageId,
      actionId: 4,
      subscriptionId: updated.subscriptionId,
      licenseSeq: updated.licenseSeq,
      expiry: updated.expiryDate,
      devices: updated.devices,
      branches: updated.branches,
      deviceAny: updated.deviceBinding === 'DEVICE_ANY',
      flags: 0
    });

    const token = 'V5-DWG-' + updated.licenseId + '-' + Date.now();
    updated.productKey = encoded.key;
    updated.tokens = updated.tokens || [];
    updated.tokens.push(token);
    CL.store.saveLicense(updated);
    CL.store.writeShard(updated.licenseId, updated);
    if (CL.persistence?.syncLicense) {
      await CL.persistence.syncLicense(updated, bundle);
    }
    CL.auditLog.log('license_downgrade', updated.licenseId, {
      from: record.packageId,
      to: targetPackageId,
      diff
    });

    return {
      ok: true,
      record: updated,
      key: encoded.key,
      bundle,
      token,
      diff,
      resolved: targetResolved,
      summary: CL.generator.buildSummary(updated, targetResolved)
    };
  }

  CL.downgrade = { downgrade };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
