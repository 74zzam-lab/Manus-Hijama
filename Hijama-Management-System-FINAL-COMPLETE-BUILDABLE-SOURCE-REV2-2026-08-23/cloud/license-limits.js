/**
 * License limits — branches + devices + users + offline grace.
 * Phase 26: enforce maxDevices with grandfather-safe behavior.
 * V2-5.3: maxUsers + offline grace evaluation.
 */
(function (global) {
  'use strict';

  const CLOUD_FEATURE_KEYS = new Set([
    'cloud_multi_device', 'cloud_owner_hub', 'bk_drive', 'cap_cloud',
    '073', '074'
  ]);

  const DEFAULT_OFFLINE_GRACE_DAYS = 30;

  function isUnlimitedDevices(maxDevices) {
    if (maxDevices == null) return true;
    return Number(maxDevices) === 0;
  }

  function isUnlimitedUsers(maxUsers) {
    if (maxUsers == null) return true;
    return Number(maxUsers) === 0;
  }

  /** null = unlimited */
  function getEffectiveMaxDevices(limits) {
    limits = limits || {};
    if (isUnlimitedDevices(limits.maxDevices)) return null;
    const n = Number(limits.maxDevices);
    if (Number.isNaN(n) || n < 1) return null;
    return n;
  }

  /** null = unlimited */
  function getEffectiveMaxUsers(limits) {
    limits = limits || {};
    if (isUnlimitedUsers(limits.maxUsers)) return null;
    const n = Number(limits.maxUsers);
    if (Number.isNaN(n) || n < 1) return null;
    return n;
  }

  function getMaxDevicesFromLicense(lic) {
    lic = lic || global.LicenseCloud?.loadLocal?.() || {};
    return getEffectiveMaxDevices(lic.limits);
  }

  function getMaxUsersFromLicense(lic) {
    lic = lic || global.LicenseCloud?.loadLocal?.() || {};
    // Prefer limits.maxUsers; fall back to top-level maxUsers from activation records.
    const limits = lic.limits || {};
    if (limits.maxUsers != null && limits.maxUsers !== '') {
      return getEffectiveMaxUsers(limits);
    }
    if (lic.maxUsers != null && lic.maxUsers !== '') {
      return getEffectiveMaxUsers({ maxUsers: lic.maxUsers });
    }
    return null;
  }

  function formatDeviceCount(current, limits) {
    current = Number(current) || 0;
    const max = getEffectiveMaxDevices(limits);
    if (max == null) return `${current} (غير محدود)`;
    return `${current}/${max}`;
  }

  function hasCloudSyncFeature(lic) {
    const feats = lic?.features || [];
    return feats.some(f => {
      const s = String(f);
      if (CLOUD_FEATURE_KEYS.has(s)) return true;
      if (/cloud/i.test(s)) return true;
      return false;
    });
  }

  function isMultiDeviceLicense(lic) {
    if (!lic) return false;
    if (isUnlimitedDevices(lic.limits?.maxDevices)) return true;
    if (Number(lic.limits?.maxDevices) >= 2) return true;
    if (hasCloudSyncFeature(lic)) return true;
    return false;
  }

  function isCloudSyncEligible(lic) {
    return isMultiDeviceLicense(lic);
  }

  function getLicensedBranches(lic) {
    return (lic?.branches || []).filter(b => b && b.active !== false);
  }

  function getMaxBranches(lic) {
    lic = lic || {};
    const fromLimits = lic.limits?.maxBranches;
    if (fromLimits != null && fromLimits !== '') {
      const n = Number(fromLimits);
      if (!Number.isNaN(n) && n >= 1) return Math.min(15, n);
    }
    const branches = getLicensedBranches(lic);
    return branches.length ? branches.length : 1;
  }

  function countLicensedBranches(lic) {
    return getLicensedBranches(lic).length;
  }

  function isBranchLicensed(lic, branchId) {
    branchId = branchId || 'BR-MAIN';
    const branches = getLicensedBranches(lic);
    if (!branches.length) return false;
    return branches.some(b => b.id === branchId);
  }

  function canRegisterDevice(doc, options) {
    options = options || {};
    const branchId = options.branchId || global.DeviceConfig?.getLockedBranchId?.() || 'BR-MAIN';
    const branches = getLicensedBranches(doc);
    if (branches.length && !isBranchLicensed(doc, branchId)) {
      return { ok: false, error: 'branch_not_licensed', branchId };
    }
    const all = (doc?.devices?.registered || []).filter(d => d);
    const active = all.filter(d => d.active !== false);
    const current = active.length;
    const max = getEffectiveMaxDevices(doc?.limits || {});
    if (max == null) {
      return { ok: true, unlimited: true, max: null, current };
    }

    const uuid = String(options.deviceUuid || global.DeviceConfig?.load?.()?.deviceUuid || '').trim();
    const existing = uuid ? all.find((d) => d.deviceUuid === uuid) : null;
    if (existing) {
      // Grandfather/same-device reactivation should remain allowed.
      return { ok: true, existing: true, grandfathered: true, max, current };
    }

    if (current >= max) {
      return {
        ok: false,
        error: 'device_limit_reached',
        max,
        current,
        message: `تم بلوغ الحد الأقصى للأجهزة (${current}/${max})`
      };
    }
    return { ok: true, max, current };
  }

  /**
   * Enforce maxUsers at user-create time. Editing existing users always allowed.
   * options.users — current user list; options.isNew — true when creating.
   */
  function canCreateUser(doc, options) {
    options = options || {};
    doc = doc || global.LicenseCloud?.loadLocal?.() || {};
    if (options.isNew === false || options.editUserId) {
      return { ok: true, edit: true };
    }
    const list = Array.isArray(options.users)
      ? options.users
      : (Array.isArray(global.users) ? global.users : (global.DB?.get?.('users', []) || []));
    const active = list.filter((u) => u && u.active !== false);
    const current = active.length;
    const max = getMaxUsersFromLicense(doc);
    if (max == null) {
      return { ok: true, unlimited: true, max: null, current };
    }
    if (current >= max) {
      return {
        ok: false,
        error: 'user_limit_reached',
        max,
        current,
        message: `تم بلوغ الحد الأقصى للمستخدمين (${current}/${max})`
      };
    }
    return { ok: true, max, current };
  }

  function getOfflineGraceDays(lic) {
    lic = lic || global.LicenseCloud?.loadLocal?.() || {};
    const n = Number(lic?.limits?.offlineGraceDays);
    if (Number.isFinite(n) && n >= 0) return n;
    return DEFAULT_OFFLINE_GRACE_DAYS;
  }

  /**
   * Evaluate offline grace against lastSuccessfulOnlineValidation.
   * Returns ok:false when grace exceeded (caller should hard-block).
   */
  function evaluateOfflineGrace(meta, now, lic) {
    now = now || new Date();
    const grace = getOfflineGraceDays(lic);
    const last = meta?.lastSuccessfulOnlineValidation;
    if (!last) {
      return { ok: true, unknown: true, graceDays: grace };
    }
    const lastOnline = new Date(last);
    if (Number.isNaN(lastOnline.getTime())) {
      return { ok: true, unknown: true, graceDays: grace };
    }
    const offlineDays = (now.getTime() - lastOnline.getTime()) / 86400000;
    if (offlineDays > grace) {
      return {
        ok: false,
        error: 'offline_grace_exceeded',
        offlineDays,
        graceDays: grace,
        message: `انتهت فترة السماح للأوفلاين (${Math.round(offlineDays)}/${grace} يوم)`
      };
    }
    return { ok: true, offlineDays, graceDays: grace };
  }

  function formatDevicesLabel(value) {
    if (isUnlimitedDevices(value)) return 'غير محدود';
    if (value == null || value === '') return 'غير محدود';
    return String(value);
  }

  global.LicenseLimits = {
    CLOUD_FEATURE_KEYS,
    DEFAULT_OFFLINE_GRACE_DAYS,
    isUnlimitedDevices,
    isUnlimitedUsers,
    getEffectiveMaxDevices,
    getEffectiveMaxUsers,
    getMaxDevicesFromLicense,
    getMaxUsersFromLicense,
    formatDeviceCount,
    formatDevicesLabel,
    hasCloudSyncFeature,
    isMultiDeviceLicense,
    isCloudSyncEligible,
    getLicensedBranches,
    getMaxBranches,
    countLicensedBranches,
    isBranchLicensed,
    canRegisterDevice,
    canCreateUser,
    getOfflineGraceDays,
    evaluateOfflineGrace
  };
})(typeof window !== 'undefined' ? window : globalThis);
