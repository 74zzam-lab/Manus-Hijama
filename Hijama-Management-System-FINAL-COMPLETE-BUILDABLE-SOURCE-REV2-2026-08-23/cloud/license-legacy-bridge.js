/**
 * Sync LicenseCloud document (Drive) → legacy __tdw_lic__ for licCheck / login gating.
 */
(function (global) {
  'use strict';

  function featureKeysFromCloudDoc(doc) {
    const raw = doc?.features || [];
    if (!raw.length) return [];
    const reg = global.CommercialLicense?.registries?.feature?.features || [];
    return raw.map(entry => {
      const s = String(entry);
      const byId = reg.find(f => f.id === s);
      if (byId?.key) return byId.key;
      if (reg.some(f => f.key === s)) return s;
      return s;
    }).filter(Boolean);
  }

  async function buildLegacyLicenseFromCloudDoc(doc) {
    if (!doc?.expiresAt && !doc?.expiry) {
      return { ok: false, error: 'missing_expiry' };
    }
    const verify = await global.LicenseCloud?.verifyLicenseDoc?.(doc);
    if (verify && verify.ok === false) return verify;

    const expiry = doc.expiresAt || doc.expiry;
    const issued = doc.issuedAt || doc.issueDate || new Date().toISOString().slice(0, 10);
    const fp = typeof global.licGetFingerprint === 'function' ? global.licGetFingerprint() : '';
    const keys = featureKeysFromCloudDoc(doc);
    const isMultiDevice = global.LicenseLimits?.isMultiDeviceLicense?.(doc)
      ?? (Number(doc.limits?.maxDevices) === 0 || Number(doc.limits?.maxDevices) >= 2);

    const lic = {
      type: 'renew',
      licType: 'renew',
      licenseId: doc.licenseUuid || doc.licenseId || '',
      start: issued,
      activationDate: issued,
      expiry,
      issued,
      fingerprint: isMultiDevice ? 'DEVICE_ANY' : fp,
      device: isMultiDevice ? 'DEVICE_ANY' : fp,
      deviceMode: isMultiDevice ? 'any' : 'locked',
      boundDevice: '',
      v: 5,
      fromCloudBootstrap: true,
      commercialMeta: {
        licenseId: doc.licenseId,
        packageId: doc.packageId,
        centerId: doc.centerId,
        devices: doc.limits?.maxDevices,
        branches: doc.limits?.maxBranches
      }
    };

    const addonCount = keys.filter(k => {
      const f = (global.FEATURE_REGISTRY || []).find(x => x.id === k);
      return f?.tier === 'addon' || (global.FEATURE_ADDON_IDS || []).includes(k);
    }).length;
    const totalAddons = (global.FEATURE_ADDON_IDS || []).length;
    const useFull = !keys.length || addonCount >= totalAddons * 0.85
      || ['04', '05', '06'].includes(String(doc.packageId));

    if (useFull) {
      lic.edition = 'full';
    } else if (typeof global.licNormalizeFeatures === 'function' && typeof global.licSignFeaturesObject === 'function') {
      const features = global.licNormalizeFeatures(null);
      keys.forEach(key => {
        const byKey = (global.FEATURE_REGISTRY || []).find(f => f.id === key);
        const id = byKey?.id || key;
        if ((global.FEATURE_ADDON_IDS || []).includes(id)) features[id] = true;
      });
      lic.edition = 'custom';
      lic.features = features;
      lic.featureSig = await global.licSignFeaturesObject(features);
    } else {
      lic.edition = 'full';
    }

    return { ok: true, lic };
  }

  async function applyFromCloudDoc(doc) {
    if (!doc) return { ok: false, error: 'no_doc' };

    // Verify + build FIRST — never overwrite local license / center binding on corrupt payload.
    const built = await buildLegacyLicenseFromCloudDoc(doc);
    if (!built?.ok) return built;

    global.LicenseCloud?.saveLocal?.(doc);
    if (doc.centerId && global.CloudMeta) {
      const meta = global.CloudMeta.loadMeta() || {};
      meta.centerId = doc.centerId;
      global.CloudMeta.saveMeta(meta);
    }
    if (doc.centerId && global.DeviceConfig?.ensureDeviceConfig) {
      global.DeviceConfig.ensureDeviceConfig({ centerId: doc.centerId });
    }
    if (doc.centerName && global.settings) {
      global.settings.centerName = doc.centerName;
      global.DB?.set?.('settings', global.settings);
    }

    if (typeof global.licSave === 'function') global.licSave(built.lic);

    const meta = typeof global.licLoadMeta === 'function' ? global.licLoadMeta() : {};
    meta.lastSuccessfulOnlineValidation = new Date().toISOString();
    meta.highestTrustedDate = meta.lastSuccessfulOnlineValidation;
    meta.lastActivationDate = built.lic.start;
    meta.lastRenewalDate = meta.lastSuccessfulOnlineValidation;
    meta.lastDeviceFingerprint = typeof global.licGetFingerprint === 'function' ? global.licGetFingerprint() : '';
    meta.activationCount = (meta.activationCount || 0) + 1;
    if (!meta.licenseCreatedAt) meta.licenseCreatedAt = built.lic.issued;
    if (typeof global.licSaveMeta === 'function') global.licSaveMeta(meta);

    if (typeof global.licFinalizeFeatureState === 'function') {
      await global.licFinalizeFeatureState();
    } else if (typeof global.licResolveLicensedFeatures === 'function') {
      global.licResolveLicensedFeatures(built.lic);
    }

    if (typeof global.licLog === 'function') {
      global.licLog('cloud_bootstrap', `ترخيص من Drive — ينتهي ${built.lic.expiry}`);
    }

    return { ok: true, lic: built.lic };
  }

  global.LicenseLegacyBridge = {
    featureKeysFromCloudDoc,
    buildLegacyLicenseFromCloudDoc,
    applyFromCloudDoc
  };
})(typeof window !== 'undefined' ? window : globalThis);
