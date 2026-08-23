/**
 * Organization Facade (Phase 1)
 * Maps organization semantics to existing immutable Center ID.
 * No schema changes, no flow changes.
 */
(function (global) {
  'use strict';

  const META_KEY = '__tdw_meta__';
  const ORG_NAME_KEY = '__tdw_org_name__';

  function normalizeName(name) {
    return String(name || '').trim();
  }

  function getCenterId() {
    try {
      const fromCenter = global.CenterId?.getStoredCenterId?.();
      if (fromCenter) return fromCenter;
    } catch { /* empty */ }
    try {
      const meta = global.CloudMeta?.loadMeta?.() || global.DB?.get?.(META_KEY, null) || null;
      const id = String(meta?.centerId || '').trim();
      return id || '';
    } catch {
      return '';
    }
  }

  function getId() {
    // Phase 1 decision: organization identity == center identity.
    return getCenterId();
  }

  function getDisplayName() {
    try {
      const explicit = normalizeName(global.DB?.get?.(ORG_NAME_KEY, ''));
      if (explicit) return explicit;
    } catch { /* empty */ }
    const fromSettings = normalizeName(global.settings?.centerName);
    if (fromSettings) return fromSettings;
    const fromLicense = normalizeName(global.LicenseCloud?.loadLocal?.()?.centerName);
    if (fromLicense) return fromLicense;
    return '';
  }

  function saveDisplayName(name) {
    name = normalizeName(name);
    try { global.DB?.set?.(ORG_NAME_KEY, name); } catch { /* empty */ }
    return name;
  }

  function hasIdentity() {
    return !!getId();
  }

  function getSummary() {
    const id = getId();
    const name = getDisplayName();
    return {
      id,
      centerId: id,
      name,
      hasIdentity: !!id
    };
  }

  global.Organization = {
    META_KEY,
    ORG_NAME_KEY,
    getCenterId,
    getId,
    getDisplayName,
    saveDisplayName,
    hasIdentity,
    getSummary
  };
})(typeof window !== 'undefined' ? window : globalThis);
