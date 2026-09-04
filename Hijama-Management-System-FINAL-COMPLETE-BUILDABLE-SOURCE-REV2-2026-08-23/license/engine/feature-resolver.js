(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};
  const OPT_IN = new Set(CL.constants.OPT_IN_FEATURE_IDS);
  let _cacheVersion = '';
  const _packageCache = new Map();

  function getCacheVersion() {
    const r = CL.registries || {};
    return [
      r.feature?.registryVersion,
      r.capability?.registryVersion,
      r.package?.registryVersion
    ].filter(Boolean).join('|');
  }

  function invalidateCache() {
    _packageCache.clear();
    _cacheVersion = '';
  }

  function getFeatureById(id) {
    return (CL.registries?.feature?.features || []).find(f => f.id === id);
  }

  function idsToKeys(ids) {
    const keys = {};
    (ids || []).forEach(id => {
      const f = getFeatureById(id);
      if (f?.key) keys[f.key] = true;
    });
    return keys;
  }

  function applyOptInPolicy(featureIds) {
    return (featureIds || []).filter(id => !OPT_IN.has(id));
  }

  function mergeIds(...lists) {
    const s = new Set();
    lists.flat().forEach(id => { if (id) s.add(id); });
    return [...s];
  }

  function resolveCapabilityIds(capIds) {
    const caps = CL.registries?.capability?.capabilities || [];
    let ids = [];
    (capIds || []).forEach(cid => {
      const cap = caps.find(c => c.id === cid);
      if (cap?.featureIds) ids = mergeIds(ids, cap.featureIds);
    });
    return ids;
  }

  function resolvePackageFeatures(packageId, templateOverrides) {
    const pkgs = CL.registries?.package?.packages || [];
    const pkg = pkgs.find(p => p.id === packageId);
    if (!pkg) throw new Error(`package_not_found:${packageId}`);

    let featureIds = [];
    if (pkg.inherits) {
      featureIds = resolvePackageFeatures(pkg.inherits).featureIds;
    }
    featureIds = mergeIds(featureIds, resolveCapabilityIds(pkg.capabilityIds), pkg.featureIds);
    featureIds = applyOptInPolicy(featureIds);
    featureIds = featureIds.filter(id => !(pkg.excludedOptIn || []).includes(id));

    if (templateOverrides) {
      if (templateOverrides.add) featureIds = mergeIds(featureIds, templateOverrides.add);
      if (templateOverrides.remove) {
        const rem = new Set(templateOverrides.remove);
        featureIds = featureIds.filter(id => !rem.has(id));
      }
    }

    const coreIds = (CL.registries?.feature?.features || [])
      .filter(f => f.tier === 'core' || f.id <= '008')
      .map(f => f.id);
    featureIds = mergeIds(coreIds, featureIds);

    return {
      packageId,
      internalName: pkg.internalName,
      displayName: pkg.displayName,
      featureIds,
      featureKeys: idsToKeys(featureIds),
      devices: pkg.devices,
      branches: pkg.branches,
      maxUsers: pkg.maxUsers
    };
  }

  function resolvePackageCached(packageId, templateOverrides) {
    const ver = getCacheVersion();
    if (ver !== _cacheVersion) {
      _packageCache.clear();
      _cacheVersion = ver;
    }
    const cacheKey = packageId + '|' + JSON.stringify(templateOverrides || null);
    if (_packageCache.has(cacheKey)) return _packageCache.get(cacheKey);
    const resolved = resolvePackageFeatures(packageId, templateOverrides);
    _packageCache.set(cacheKey, resolved);
    return resolved;
  }

  function resolveCustomPackage(customPackageId) {
    const cp = CL.store?.getCustomPackage(customPackageId);
    if (!cp) throw new Error(`custom_package_not_found:${customPackageId}`);
    const featureIds = applyOptInPolicy(cp.featureIds || []);
    const coreIds = (CL.registries?.feature?.features || [])
      .filter(f => parseInt(f.id, 10) <= 8)
      .map(f => f.id);
    const all = mergeIds(coreIds, featureIds);
    return {
      packageId: '99',
      customPackageId,
      featureIds: all,
      featureKeys: idsToKeys(all),
      featureHash: cp.featureHash
    };
  }

  function resolveTemplate(templateId) {
    const t = (CL.registries?.template?.templates || []).find(x => x.id === templateId);
    if (!t) throw new Error(`template_not_found:${templateId}`);
    return resolvePackageCached(t.package, t.overrides);
  }

  CL.featureResolver = {
    resolvePackageCached, resolvePackageFeatures, resolveCustomPackage,
    resolveTemplate, idsToKeys, applyOptInPolicy, invalidateCache, getCacheVersion
  };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
