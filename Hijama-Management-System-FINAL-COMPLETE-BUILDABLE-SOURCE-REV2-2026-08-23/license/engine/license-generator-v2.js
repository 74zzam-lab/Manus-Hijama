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

  function resolveExpiry(config) {
    if (config.expiryDate) return config.expiryDate;
    const sub = (CL.registries?.subscription?.subscriptions || [])
      .find(s => s.id === config.subscriptionId);
    if (config.subscriptionId === '08') return '2099-12-31';
    if (config.subscriptionId === '09' && config.customDays) {
      return addDays(todayISO(), config.customDays);
    }
    const days = sub?.days ?? CL.constants.SUBSCRIPTION_DAYS[config.subscriptionId];
    if (!days) return addDays(todayISO(), 365);
    return addDays(todayISO(), days);
  }

  async function resolveFeatures(config) {
    if (config.packageId === '99' || config.customPackageId) {
      if (config.customPackageId) {
        return CL.featureResolver.resolveCustomPackage(config.customPackageId);
      }
      const cpId = CL.store.allocateCustomPackageId(CL.store.loadState());
      const featureIds = config.featureIds || [];
      const featureHash = await CL.crypto.computeFeatureHash(featureIds);
      const cp = {
        customPackageId: cpId,
        displayName: config.customPackageName || cpId,
        featureIds,
        featureHash,
        createdAt: new Date().toISOString()
      };
      CL.store.saveCustomPackage(cp);
      config.customPackageId = cpId;
      return CL.featureResolver.resolveCustomPackage(cpId);
    }
    if (config.templateId) {
      return CL.featureResolver.resolveTemplate(config.templateId);
    }
    return CL.featureResolver.resolvePackageCached(config.packageId, config.templateOverrides);
  }

  async function generate(config) {
    if (!config?.packageId) throw new Error('package_required');
    const state = CL.store.loadState();
    const ids = CL.store.allocateLicenseId(state);
    const resolved = await resolveFeatures(config);
    const expiryDate = resolveExpiry(config);
    const pkg = (CL.registries?.package?.packages || []).find(p => p.id === config.packageId) || {};

    const centerId = config.centerId
      || (typeof global.CenterId !== 'undefined' && global.CenterId.generateCenterId
        ? global.CenterId.generateCenterId()
        : 'NJR-CLINIC-' + Array.from(crypto.getRandomValues(new Uint8Array(4)))
            .map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(''));

    const branchCount = config.branches ?? resolved.branches ?? pkg.branches ?? 1;

    const record = {
      licenseId: ids.licenseId,
      licenseUuid: ids.licenseUuid,
      licenseSeq: ids.licenseSeq,
      centerId,
      packageId: config.packageId,
      customPackageId: config.customPackageId || null,
      subscriptionId: config.subscriptionId || '05',
      actionId: config.actionId || '01',
      status: 'active',
      issueDate: todayISO(),
      expiryDate,
      devices: 0,
      branches: branchCount,
      branchesList: null,
      maxUsers: config.maxUsers ?? resolved.maxUsers ?? pkg.maxUsers ?? 10,
      deviceBinding: config.deviceBinding || 'DEVICE_ANY',
      templatePackageId: config.packageId || null,
      templateCustomPackageId: config.customPackageId || null,
      customer: {
        name: config.customer?.name || '',
        company: config.customer?.company || '',
        phone: config.customer?.phone || '',
        email: config.customer?.email || '',
        deviceReference: config.customer?.deviceReference || ''
      },
      notes: config.notes || '',
      renewHistory: [],
      tokens: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const deviceAny = record.deviceBinding === 'DEVICE_ANY';

    const bundle = await CL.activationBundle.buildBundle(record, resolved);
    record.bundleSig = bundle.bundleSig;

    const encoded = await CL.codecV5.encodeV5Key({
      packageId: record.packageId,
      customPackageId: record.customPackageId,
      actionId: record.actionId,
      subscriptionId: record.subscriptionId,
      licenseSeq: record.licenseSeq,
      expiry: record.expiryDate,
      devices: record.devices,
      branches: record.branches,
      deviceAny: deviceAny,
      deviceHash: deviceAny ? 0xFF : 0xFF,
      flags: 0
    });

    const token = 'V5-' + record.licenseId + '-' + Date.now();
    record.productKey = encoded.key;
    record.tokens.push(token);
    CL.store.saveLicense(record);
    CL.store.writeShard(record.licenseId, record);
    if (CL.persistence?.syncLicense) {
      await CL.persistence.syncLicense(record, bundle);
    }
    CL.auditLog.log('license_generate', record.licenseId, {
      packageId: record.packageId,
      actionId: record.actionId,
      subscriptionId: record.subscriptionId,
      branches: record.branches,
      deviceBinding: record.deviceBinding
    });

    if (global.LicenseCloud?.buildFromRecord) {
      try {
        const featKeys = (resolved.featureIds || []).map(id => {
          const f = (CL.registries?.feature?.features || []).find(x => x.id === id);
          return f?.key || id;
        });
        const doc = await global.LicenseCloud.buildFromRecord(record, {
          centerName: record.customer.company || record.customer.name,
          features: featKeys
        });
        global.LicenseCloud.saveLocal(doc);
      } catch { /* optional */ }
    }

    return {
      ok: true,
      record,
      key: encoded.key,
      bundle,
      token,
      resolved,
      summary: buildSummary(record, resolved)
    };
  }

  function buildSummary(record, resolved) {
    const pkg = (CL.registries?.package?.packages || []).find(p => p.id === record.packageId);
    const sub = (CL.registries?.subscription?.subscriptions || []).find(s => s.id === record.subscriptionId);
    return {
      licenseId: record.licenseId,
      centerId: record.centerId || '',
      key: record.productKey,
      package: pkg?.displayName || record.packageId,
      packageId: record.packageId,
      subscription: sub?.nameEn || record.subscriptionId,
      actionId: record.actionId,
      expiry: record.expiryDate,
      devices: record.devices,
      branches: record.branches,
      deviceBinding: record.deviceBinding,
      featureCount: (resolved?.featureIds || []).length,
      customer: record.customer,
      edition: resolved?.featureKeys && typeof licIsFullEdition === 'function' && licIsFullEdition(resolved.featureKeys) ? 'full' : 'custom'
    };
  }

  async function generateBatch(config, count) {
    const n = Math.max(1, Math.min(Number(count) || 1, 100));
    const items = [];
    for (let i = 0; i < n; i++) {
      const itemConfig = {
        ...config,
        customer: n > 1
          ? { name: '', company: '', phone: '', email: '', deviceReference: '' }
          : { ...(config.customer || {}) },
        notes: n > 1 ? (config.notes || '') : (config.notes || '')
      };
      items.push(await generate(itemConfig));
    }
    const templateLabel = buildSummary(items[0]?.record, items[0]?.resolved)?.package || config.packageId;
    return { ok: true, batch: true, count: n, items, templateLabel, summary: { count: n, template: templateLabel } };
  }

  CL.generator = { generate, generateBatch, buildSummary, resolveExpiry, resolveFeatures };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
