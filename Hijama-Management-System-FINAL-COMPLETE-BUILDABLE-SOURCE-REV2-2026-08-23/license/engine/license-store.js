(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};
  const STORAGE_KEY = CL.constants.STORAGE_KEY;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* empty */ }
    return {
      index: {
        schemaVersion: 1,
        registryVersion: '1.2.0',
        nextLicenseSeq: 1,
        nextCustomSeq: 1,
        count: 0,
        entries: []
      },
      licenses: {},
      customPackages: {},
      bundles: {},
      backups: {}
    };
  }

  function saveState(state) {
    const prev = localStorage.getItem(STORAGE_KEY + '.bak');
    if (!prev) localStorage.setItem(STORAGE_KEY + '.bak', localStorage.getItem(STORAGE_KEY) || '{}');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const day = new Date().toISOString().slice(0, 10);
    localStorage.setItem(STORAGE_KEY + '.snapshot.' + day, JSON.stringify(state));
  }

  function formatLicenseId(seq) {
    return 'L' + String(seq).padStart(6, '0');
  }

  function parseLicenseSeq(licenseId) {
    return parseInt(String(licenseId).replace(/\D/g, ''), 10) || 0;
  }

  function uuidV4() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function allocateLicenseId(state) {
    if (!state) state = loadState();
    const seq = state.index.nextLicenseSeq++;
    saveState(state);
    return { licenseId: formatLicenseId(seq), licenseSeq: seq, licenseUuid: uuidV4() };
  }

  function allocateCustomPackageId(state) {
    if (!state) state = loadState();
    const n = state.index.nextCustomSeq++;
    saveState(state);
    return 'CP' + String(n).padStart(3, '0');
  }

  function getLicense(licenseId) {
    const state = loadState();
    return state.licenses[licenseId] || null;
  }

  function saveLicense(record) {
    const state = loadState();
    state.licenses[record.licenseId] = record;
    const idx = state.index.entries.findIndex(e => e.licenseId === record.licenseId);
    const entry = {
      licenseId: record.licenseId,
      licenseUuid: record.licenseUuid,
      packageId: record.packageId,
      customPackageId: record.customPackageId || null,
      status: record.status,
      customer: record.customer?.name || '',
      company: record.customer?.company || '',
      expiryDate: record.expiryDate,
      file: record.licenseId + '.json',
      activationBundleRef: 'activations/' + record.licenseId + '.bundle.json'
    };
    if (idx >= 0) state.index.entries[idx] = entry;
    else state.index.entries.push(entry);
    state.index.count = state.index.entries.length;
    saveState(state);
    if (CL.persistence?.updateLicenseIndex) {
      CL.persistence.updateLicenseIndex(state.index).catch(() => {});
    }
    return record;
  }

  function getCustomPackage(id) {
    return loadState().customPackages[id] || null;
  }

  function saveCustomPackage(cp) {
    const state = loadState();
    state.customPackages[cp.customPackageId] = cp;
    saveState(state);
    if (CL.persistence?.writeCustomPackage) {
      CL.persistence.writeCustomPackage(cp).catch(() => {});
    }
    return cp;
  }

  function saveUserPackage(pkgDef) {
    const state = loadState();
    if (!state.userPackages) state.userPackages = {};
    state.userPackages[pkgDef.id] = pkgDef;
    saveState(state);
    return pkgDef;
  }

  function getUserPackages() {
    return loadState().userPackages || {};
  }

  function saveBundle(licenseId, bundle) {
    const state = loadState();
    state.bundles[licenseId] = bundle;
    saveState(state);
    return bundle;
  }

  function getBundle(licenseId) {
    return loadState().bundles[licenseId] || null;
  }

  function listLicenses() {
    return loadState().index.entries || [];
  }

  function exportData() {
    return loadState();
  }

  function importData(data) {
    saveState(data);
  }

  function writeShard(licenseId, record) {
    const state = loadState();
    state.licenses[licenseId] = record;
    saveState(state);
    try {
      localStorage.setItem(STORAGE_KEY + '.shard.' + licenseId, JSON.stringify(record));
    } catch { /* quota */ }
    if (CL.persistence?.writeLicenseShard) {
      CL.persistence.writeLicenseShard(licenseId, record).catch(() => {});
    }
    return record;
  }

  function readShard(licenseId) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY + '.shard.' + licenseId);
      if (raw) return JSON.parse(raw);
    } catch { /* empty */ }
    return getLicense(licenseId);
  }

  function createBackup(label) {
    const state = loadState();
    const day = new Date().toISOString().slice(0, 10);
    const key = STORAGE_KEY + '.backup.' + (label || day);
    const backup = {
      schemaVersion: 1,
      registryVersion: '1.2.0',
      createdAt: new Date().toISOString(),
      label: label || day,
      state
    };
    localStorage.setItem(key, JSON.stringify(backup));
    state.backups = state.backups || {};
    state.backups[label || day] = backup.createdAt;
    saveState(state);
    return backup;
  }

  function restoreBackup(label) {
    const day = label || new Date().toISOString().slice(0, 10);
    const key = STORAGE_KEY + '.backup.' + day;
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error('backup_not_found:' + day);
    const backup = JSON.parse(raw);
    saveState(backup.state);
    return backup;
  }

  CL.store = {
    loadState, saveState, formatLicenseId, parseLicenseSeq,
    allocateLicenseId, allocateCustomPackageId,
    getLicense, saveLicense, getCustomPackage, saveCustomPackage, saveUserPackage, getUserPackages,
    saveBundle, getBundle, listLicenses, exportData, importData,
    writeShard, readShard, createBackup, restoreBackup
  };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
