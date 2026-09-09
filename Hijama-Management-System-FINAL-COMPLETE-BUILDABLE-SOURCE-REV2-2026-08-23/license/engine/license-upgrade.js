(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  function addDays(iso, days) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function compareFeatureSets(currentIds, targetIds) {
    const cur = new Set(currentIds || []);
    const tgt = new Set(targetIds || []);
    const added = [...tgt].filter(id => !cur.has(id));
    const removed = [...cur].filter(id => !tgt.has(id));
    const unchanged = [...cur].filter(id => tgt.has(id));
    return { added, removed, unchanged };
  }

  async function upgrade(existingLicenseId, config) {
    const record = CL.store.getLicense(existingLicenseId);
    if (!record) throw new Error('license_not_found');
    if (record.status === 'suspended') throw new Error('license_suspended');

    const mode = config.mode || 'upgrade_only';
    const keepExpiration = config.keepExpiration !== false;
    const keepDevices = config.keepDevices !== false;
    const keepBranches = config.keepBranches !== false;

    const currentResolved = record.packageId === '99' && record.customPackageId
      ? CL.featureResolver.resolveCustomPackage(record.customPackageId)
      : CL.featureResolver.resolvePackageCached(record.packageId);

    const targetPackageId = config.targetPackageId || record.packageId;
    const targetResolved = config.templateId
      ? CL.featureResolver.resolveTemplate(config.templateId)
      : CL.featureResolver.resolvePackageCached(targetPackageId, config.templateOverrides);

    const diff = compareFeatureSets(currentResolved.featureIds, targetResolved.featureIds);

    const updated = { ...record };
    updated.packageId = targetPackageId;
    updated.customPackageId = config.customPackageId || null;
    updated.actionId = '03';
    updated.updatedAt = new Date().toISOString();

    if (!keepDevices) updated.devices = config.devices ?? targetResolved.devices ?? updated.devices;
    if (!keepBranches) updated.branches = config.branches ?? targetResolved.branches ?? updated.branches;
    if (config.maxUsers != null) updated.maxUsers = config.maxUsers;

    if (mode === 'upgrade_lifetime') {
      updated.subscriptionId = '08';
      updated.expiryDate = '2099-12-31';
    } else if (!keepExpiration || mode === 'upgrade_renew' || mode === 'upgrade_extend') {
      const subId = config.subscriptionId || record.subscriptionId || '05';
      updated.subscriptionId = subId;
      if (subId === '08') {
        updated.expiryDate = '2099-12-31';
      } else {
        const sub = (CL.registries?.subscription?.subscriptions || []).find(s => s.id === subId);
        const days = sub?.days ?? CL.constants.SUBSCRIPTION_DAYS[subId] ?? 365;
        updated.expiryDate = addDays(todayISO(), days);
      }
    }

    updated.renewHistory = updated.renewHistory || [];
    updated.renewHistory.push({
      date: todayISO(),
      fromPackage: record.packageId,
      toPackage: targetPackageId,
      mode,
      actionId: '03',
      keepExpiration
    });

    const bundle = await CL.activationBundle.buildBundle(updated, targetResolved);
    const encoded = await CL.codecV5.encodeV5Key({
      packageId: updated.packageId,
      customPackageId: updated.customPackageId,
      actionId: 3,
      subscriptionId: updated.subscriptionId,
      licenseSeq: updated.licenseSeq,
      expiry: updated.expiryDate,
      devices: updated.devices,
      branches: updated.branches,
      deviceAny: updated.deviceBinding === 'DEVICE_ANY',
      flags: 0
    });

    const token = 'V5-UPG-' + updated.licenseId + '-' + Date.now();
    updated.productKey = encoded.key;
    updated.tokens = updated.tokens || [];
    updated.tokens.push(token);
    CL.store.saveLicense(updated);
    CL.store.writeShard(updated.licenseId, updated);
    if (CL.persistence?.syncLicense) {
      await CL.persistence.syncLicense(updated, bundle);
    }
    CL.auditLog.log('license_upgrade', updated.licenseId, {
      from: record.packageId,
      to: targetPackageId,
      mode,
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

  CL.upgrade = { upgrade, compareFeatureSets };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
