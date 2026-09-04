(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  function readV1License() {
    try {
      const raw = localStorage.getItem('lic');
      if (raw) return JSON.parse(raw);
    } catch { /* empty */ }
    return null;
  }

  function featureKeysToIds(featureKeys) {
    const features = CL.registries?.feature?.features || [];
    const ids = [];
    Object.keys(featureKeys || {}).forEach(key => {
      if (!featureKeys[key]) return;
      const f = features.find(x => x.key === key);
      if (f) ids.push(f.id);
    });
    return ids;
  }

  async function importV1License(opts) {
    const v1 = readV1License();
    if (!v1) return { ok: false, error: 'no_v1_license' };

    const state = CL.store.loadState();
    const ids = CL.store.allocateLicenseId(state);
    const isFull = v1.edition === 'full' || (typeof licIsFullEdition === 'function' && licIsFullEdition(v1.features));

    const record = {
      licenseId: ids.licenseId,
      licenseUuid: ids.licenseUuid,
      licenseSeq: ids.licenseSeq,
      packageId: isFull ? '06' : '99',
      customPackageId: null,
      subscriptionId: mapV1TypeToSub(v1.licType || v1.type),
      actionId: '01',
      status: 'active',
      issueDate: v1.issued || v1.start || new Date().toISOString().slice(0, 10),
      expiryDate: v1.expiry,
      devices: 1,
      branches: 1,
      maxUsers: 10,
      deviceBinding: v1.device || 'DEVICE_ANY',
      customer: { name: '', company: '', phone: '', email: '' },
      notes: 'Migrated from V1 localStorage',
      renewHistory: [],
      tokens: [],
      migratedFrom: 'v1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    let resolved;
    if (isFull) {
      resolved = CL.featureResolver.resolvePackageCached('06');
    } else {
      const featureIds = featureKeysToIds(v1.features);
      const cpId = CL.store.allocateCustomPackageId(state);
      const featureHash = await CL.crypto.computeFeatureHash(featureIds);
      const cp = {
        customPackageId: cpId,
        displayName: 'Migrated Custom',
        featureIds,
        featureHash,
        createdAt: new Date().toISOString()
      };
      CL.store.saveCustomPackage(cp);
      record.customPackageId = cpId;
      resolved = CL.featureResolver.resolveCustomPackage(cpId);
    }

    await CL.activationBundle.buildBundle(record, resolved);
    CL.store.saveLicense(record);
    CL.store.writeShard(record.licenseId, record);
    CL.auditLog.log('migration_v1_import', record.licenseId, { dryRun: !!opts?.dryRun });

    return { ok: true, record, resolved };
  }

  function mapV1TypeToSub(licType) {
    const map = {
      trial: '01', monthly: '02', quarterly: '03', biannual: '04',
      annual: '05', custom: '09', renew: '05'
    };
    return map[licType] || '05';
  }

  async function exportRegistryBackup() {
    const data = CL.store.exportData();
    const audit = CL.auditLog.loadAudit();
    const day = new Date().toISOString().slice(0, 10);
    const backup = {
      schemaVersion: 1,
      registryVersion: '1.2.0',
      exportedAt: new Date().toISOString(),
      data,
      audit
    };
    localStorage.setItem(CL.constants.STORAGE_KEY + '.backup.' + day, JSON.stringify(backup));
    return backup;
  }

  async function restoreRegistryBackup(day) {
    const key = CL.constants.STORAGE_KEY + '.backup.' + (day || new Date().toISOString().slice(0, 10));
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error('backup_not_found');
    const backup = JSON.parse(raw);
    CL.store.importData(backup.data);
    if (backup.audit) CL.auditLog.saveAudit(backup.audit);
    return backup;
  }

  CL.migration = {
    importV1License, exportRegistryBackup, restoreRegistryBackup, featureKeysToIds
  };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
