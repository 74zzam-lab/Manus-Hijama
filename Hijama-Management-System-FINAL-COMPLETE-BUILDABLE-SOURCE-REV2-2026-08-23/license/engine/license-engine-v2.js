(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};
  const C = CL.constants;
  let _ready = null;
  let _initPromise = null;
  let _enabled = true;

  function featureResolver() {
    return global.CommercialLicense?.featureResolver || CL.featureResolver;
  }

  function refreshFeatureCache() {
    const fr = featureResolver();
    if (fr && typeof fr.invalidateCache === 'function') {
      fr.invalidateCache();
      return;
    }
    console.warn('CommercialLicense.featureResolver unavailable — skip cache invalidation');
  }

  const REGISTRY_FILES = {
    feature: 'feature-registry.json',
    capability: 'capability-registry.json',
    package: 'package-registry.json',
    subscription: 'subscription-registry.json',
    action: 'action-registry.json',
    template: 'template-registry.json'
  };

  async function fetchJson(path) {
    if (typeof fetch === 'undefined') {
      throw new Error('fetch_unavailable');
    }
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`fetch_failed:${path}:${res.status}`);
    return res.json();
  }

  async function loadRegistries(basePath) {
    const base = basePath || C.REGISTRY_BASE;
    CL.registries = CL.registries || {};
    for (const [key, file] of Object.entries(REGISTRY_FILES)) {
      const doc = await fetchJson(base + file);
      await CL.registryIntegrity.verifyRegistry(doc, key);
      CL.registries[key] = doc;
      if (key === 'package') {
        CL.registryIntegrity.validatePackageInheritance(doc.packages);
      }
    }
    refreshFeatureCache();
    mergeUserPackagesIntoRegistry();
    return CL.registries;
  }

  function mergeUserPackagesIntoRegistry() {
    const userPkgs = Object.values(CL.store?.getUserPackages?.() || {});
    if (!userPkgs.length || !CL.registries?.package) return;
    const pkgs = CL.registries.package.packages || [];
    const byId = Object.fromEntries(pkgs.map(p => [p.id, p]));
    userPkgs.forEach(p => { byId[p.id] = { ...byId[p.id], ...p, visible: p.visible !== false }; });
    CL.registries.package.packages = Object.values(byId).sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  async function loadDataIndex() {
    try {
      const index = await fetchJson(C.DATA_BASE + 'license-registry/index.json');
      await CL.registryIntegrity.verifyRegistry(index, 'license-index');
      CL.dataIndex = index;
    } catch {
      CL.dataIndex = null;
    }
    try {
      const audit = await fetchJson(C.DATA_BASE + 'audit-log.json');
      await CL.registryIntegrity.verifyRegistry(audit, 'audit-log-file');
      CL.auditFile = audit;
    } catch {
      CL.auditFile = null;
    }
  }

  async function initialize(opts) {
    if (opts?.enabled === false) _enabled = false;
    if (!_enabled) return { ok: true, enabled: false };
    if (_ready) return { ok: true, enabled: true, cacheVersion: featureResolver()?.getCacheVersion?.() || '' };
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
      try {
        await loadRegistries(opts?.registryBase);
        await loadDataIndex();
        _ready = true;
        return { ok: true, enabled: true, cacheVersion: featureResolver()?.getCacheVersion?.() || '' };
      } catch (err) {
        _initPromise = null;
        throw err;
      }
    })();
    return _initPromise;
  }

  function isReady() {
    return !!_ready;
  }

  function setEnabled(flag) {
    _enabled = !!flag;
  }

  function isEnabled() {
    return _enabled;
  }

  async function ensureReady() {
    if (_ready) return true;
    if (!_enabled) return false;
    await initialize();
    return !!_ready;
  }

  CL.engine = {
    initialize, loadRegistries, loadDataIndex, isReady, ensureReady, setEnabled, isEnabled,
    refreshFeatureCache, mergeUserPackagesIntoRegistry
  };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
