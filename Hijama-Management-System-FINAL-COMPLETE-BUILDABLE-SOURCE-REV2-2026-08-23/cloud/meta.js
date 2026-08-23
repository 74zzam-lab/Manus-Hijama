/**
 * Local meta — schemaVersion, centerId, app version.
 */
(function (global) {
  'use strict';

  const META_KEY = '__tdw_meta__';
  const APP_SCHEMA_VERSION = 6;

  function defaultMeta() {
    return {
      schemaVersion: APP_SCHEMA_VERSION,
      appVersion: global.APP_VERSION || '0.0.0',
      centerId: '',
      migratedAt: null,
      cloudV2Enabled: false,
      createdAt: new Date().toISOString()
    };
  }

  function storage() {
    return global.DB || global.Repository?.storageAdapter?.raw || null;
  }

  function loadMeta() {
    try {
      const raw = storage()?.get?.(META_KEY, null);
      if (raw && typeof raw === 'object') return { ...defaultMeta(), ...raw };
    } catch { /* empty */ }
    try {
      const ls = localStorage.getItem(META_KEY);
      if (ls) return { ...defaultMeta(), ...JSON.parse(ls) };
    } catch { /* empty */ }
    return defaultMeta();
  }

  function saveMeta(meta) {
    meta = { ...meta, updatedAt: new Date().toISOString() };
    if (storage()?.set) storage().set(META_KEY, meta);
    else try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* empty */ }
    return meta;
  }

  function getSchemaVersion() {
    return loadMeta().schemaVersion || 0;
  }

  function setSchemaVersion(v) {
    const m = loadMeta();
    m.schemaVersion = v;
    m.migratedAt = new Date().toISOString();
    return saveMeta(m);
  }

  function isCloudV2Enabled() {
    const m = loadMeta();
    if (m.cloudV2Enabled) return true;
    if (global.settings?.cloudV2Enabled) return true;
    return false;
  }

  function setCloudV2Enabled(on) {
    const m = loadMeta();
    m.cloudV2Enabled = !!on;
    saveMeta(m);
    if (global.settings) {
      global.settings.cloudV2Enabled = !!on;
      global.DB?.set?.('settings', global.settings);
    }
    return m;
  }

  global.CloudMeta = {
    META_KEY,
    APP_SCHEMA_VERSION,
    defaultMeta,
    loadMeta,
    saveMeta,
    getSchemaVersion,
    setSchemaVersion,
    isCloudV2Enabled,
    setCloudV2Enabled
  };
})(typeof window !== 'undefined' ? window : globalThis);
