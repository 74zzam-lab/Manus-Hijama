/**
 * Split local-only vs cloud-synced settings (Cloud V2 Sprint 3).
 */
(function (global) {
  'use strict';

  /** Top-level settings keys that never leave this device */
  const SETTINGS_LOCAL_KEYS = new Set([
    'devices',
    'backup',
    'driveSync',
    'altSync',
    'firstRun',
    'cloudV2Enabled',
    'cloudV2'
  ]);

  /** DB keys excluded from portable backup payload */
  const DB_LOCAL_KEYS = new Set([
    '__tdw_device_config__',
    '__tdw_user_session__'
  ]);

  const BRANCH_SETTINGS_KEYS = [
    'centerName', 'centerNameEn', 'address', 'phone', 'taxNum', 'brandLogo',
    'centerCity', 'centerEmail', 'centerWebsite', 'branchName', 'siteUrl',
    'crNum', 'waNumber', 'defaultBranchId', 'clientOverdueDays',
    'simplifiedTaxInvoice', 'invoiceSystem', 'messaging', 'communication',
    'leavePolicy', 'attendanceDefaults', 'waTemplate', 'promoTemplate',
    'appointmentTemplate', 'printReports'
  ];

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj == null ? {} : obj));
  }

  function sanitizeSettingsForSync(settings) {
    settings = deepClone(settings);
    SETTINGS_LOCAL_KEYS.forEach(k => delete settings[k]);
    return settings;
  }

  function sanitizeSettingsForBackup(settings) {
    settings = sanitizeSettingsForSync(settings);
    if (settings.backup?.providers) {
      Object.keys(settings.backup.providers).forEach(p => {
        const prov = settings.backup.providers[p];
        if (prov && typeof prov === 'object') {
          delete prov.tokenEnc;
          delete prov.refreshToken;
        }
      });
    }
    return settings;
  }

  function extractBranchSettings(settings) {
    settings = sanitizeSettingsForSync(settings || global.settings || {});
    const out = { branchId: settings.defaultBranchId || global.BranchScope?.DEFAULT_BRANCH_ID || 'BR-MAIN' };
    BRANCH_SETTINGS_KEYS.forEach(k => {
      if (settings[k] !== undefined) out[k] = settings[k];
    });
    return out;
  }

  function extractPrices(settings) {
    settings = settings || global.settings || {};
    return {
      cupPrice: settings.cupPrice ?? 50,
      vatRate: settings.vatRate ?? 15,
      threshold: settings.threshold ?? 6,
      commissionRate: settings.commissionRate ?? 10
    };
  }

  function filterUsersForBranch(users, branchId) {
    if (!Array.isArray(users)) return [];
    branchId = branchId || global.BranchScope?.getActiveBranchId?.() || 'BR-MAIN';
    if (global.BranchDataIsolation?.userBelongsToBranch) {
      return users.filter((u) => global.BranchDataIsolation.userBelongsToBranch(u, branchId)).map((u) => {
        const copy = { ...u };
        delete copy.password;
        return copy;
      });
    }
    return users.filter(u => {
      if (!u || !u.active) return false;
      if (u.branchId) return u.branchId === branchId;
      if (typeof global.BranchScope?.userCanAccessBranch === 'function') {
        return global.BranchScope.userCanAccessBranch(u, branchId);
      }
      return true;
    }).map(u => {
      const copy = { ...u };
      delete copy.password;
      return copy;
    });
  }

  function filterRecordsForBranch(records, branchId) {
    if (!Array.isArray(records)) return [];
    if (typeof global.BranchScope?.filterByBranch === 'function') {
      return global.BranchScope.filterByBranch(records, branchId);
    }
    return records.slice();
  }

  function isLocalDbKey(key) {
    return DB_LOCAL_KEYS.has(key);
  }

  global.SettingsSplit = {
    SETTINGS_LOCAL_KEYS,
    DB_LOCAL_KEYS,
    BRANCH_SETTINGS_KEYS,
    sanitizeSettingsForSync,
    sanitizeSettingsForBackup,
    extractBranchSettings,
    extractPrices,
    filterUsersForBranch,
    filterRecordsForBranch,
    isLocalDbKey
  };
})(typeof window !== 'undefined' ? window : globalThis);
