/**
 * License lifecycle helpers (V2-5.3) — upgrade / downgrade / refresh
 * without deleting business data. Feature/limit changes only.
 */
(function (global) {
  'use strict';

  function cloneDoc(doc) {
    return JSON.parse(JSON.stringify(doc || {}));
  }

  function ensureLimits(doc) {
    if (!doc.limits || typeof doc.limits !== 'object') doc.limits = {};
    return doc.limits;
  }

  function applyLimitPatch(doc, patch) {
    patch = patch || {};
    const limits = ensureLimits(doc);
    const keys = ['maxDevices', 'maxBranches', 'maxUsers', 'offlineGraceDays'];
    for (const k of keys) {
      if (patch[k] != null && patch[k] !== '') limits[k] = patch[k];
    }
    if (Array.isArray(patch.features)) {
      doc.features = patch.features.slice();
    } else if (patch.addFeatures || patch.removeFeatures) {
      const set = new Set(Array.isArray(doc.features) ? doc.features : []);
      (patch.addFeatures || []).forEach((f) => set.add(f));
      (patch.removeFeatures || []).forEach((f) => set.delete(f));
      doc.features = Array.from(set);
    }
    if (patch.expiresAt) doc.expiresAt = patch.expiresAt;
    if (patch.packageId) doc.packageId = patch.packageId;
    if (patch.subscriptionId) doc.subscriptionId = patch.subscriptionId;
    doc.licenseVersion = (Number(doc.licenseVersion) || 0) + 1;
    doc.updatedAt = new Date().toISOString();
    return doc;
  }

  /** Refresh metadata timestamps; does not wipe devices/users/branches data. */
  function refreshLicense(doc, options) {
    options = options || {};
    doc = cloneDoc(doc || global.LicenseCloud?.loadLocal?.() || {});
    if (!doc || !Object.keys(doc).length) return { ok: false, error: 'no_license' };
    doc.lastRefreshedAt = new Date().toISOString();
    if (options.expiresAt) doc.expiresAt = options.expiresAt;
    doc.licenseVersion = (Number(doc.licenseVersion) || 0) + 1;
    global.LicenseCloud?.saveLocal?.(doc);
    global.AuditLogger?.log?.({
      action: 'LICENSE_REFRESHED',
      entity: 'license',
      entityId: doc.centerId || doc.licenseId || '',
      summary: 'License refreshed; business data preserved'
    });
    return { ok: true, doc, dataPreserved: true };
  }

  function upgradeLicense(doc, patch) {
    doc = cloneDoc(doc || global.LicenseCloud?.loadLocal?.() || {});
    if (!doc || !Object.keys(doc).length) return { ok: false, error: 'no_license' };
    const beforeUsers = Array.isArray(global.DB?.get?.('users', null)) ? global.DB.get('users').length : null;
    applyLimitPatch(doc, patch || {});
    doc.lifecycle = Object.assign({}, doc.lifecycle || {}, {
      lastUpgradeAt: new Date().toISOString(),
      lastAction: 'upgrade'
    });
    global.LicenseCloud?.saveLocal?.(doc);
    const afterUsers = Array.isArray(global.DB?.get?.('users', null)) ? global.DB.get('users').length : null;
    global.AuditLogger?.log?.({
      action: 'LICENSE_UPGRADED',
      entity: 'license',
      entityId: doc.centerId || doc.licenseId || '',
      summary: 'License upgraded; limits/features only'
    });
    return {
      ok: true,
      doc,
      dataPreserved: true,
      usersUnchanged: beforeUsers == null || beforeUsers === afterUsers
    };
  }

  /**
   * Downgrade reduces limits/features only. Does NOT delete users, devices, or DB rows.
   * Enforcement happens at create/register time via LicenseLimits.
   */
  function downgradeLicense(doc, patch) {
    doc = cloneDoc(doc || global.LicenseCloud?.loadLocal?.() || {});
    if (!doc || !Object.keys(doc).length) return { ok: false, error: 'no_license' };
    const devicesBefore = (doc.devices?.registered || []).length;
    applyLimitPatch(doc, patch || {});
    doc.lifecycle = Object.assign({}, doc.lifecycle || {}, {
      lastDowngradeAt: new Date().toISOString(),
      lastAction: 'downgrade'
    });
    // Explicitly do not prune devices/users arrays.
    global.LicenseCloud?.saveLocal?.(doc);
    const devicesAfter = (doc.devices?.registered || []).length;
    global.AuditLogger?.log?.({
      action: 'LICENSE_DOWNGRADED',
      entity: 'license',
      entityId: doc.centerId || doc.licenseId || '',
      summary: 'License downgraded; data retained, new creates may be blocked'
    });
    return {
      ok: true,
      doc,
      dataPreserved: true,
      devicesUnchanged: devicesBefore === devicesAfter
    };
  }

  function isExpired(doc, now) {
    doc = doc || global.LicenseCloud?.loadLocal?.() || {};
    if (!doc.expiresAt) return false;
    const exp = Date.parse(doc.expiresAt);
    if (Number.isNaN(exp)) return false;
    return (now || Date.now()) > exp;
  }

  function evaluateLicenseState(doc, options) {
    options = options || {};
    doc = doc || global.LicenseCloud?.loadLocal?.() || {};
    if (!doc || !Object.keys(doc).length) {
      return { ok: false, status: 'none', error: 'no_license' };
    }
    if (options.invalidSignature) {
      return { ok: false, status: 'invalid', error: 'invalid_license' };
    }
    if (isExpired(doc, options.nowMs)) {
      return { ok: false, status: 'expired', error: 'license_expired', expiresAt: doc.expiresAt };
    }
    const deviceUuid = options.deviceUuid || global.DeviceConfig?.load?.()?.deviceUuid;
    if (options.enforceDeviceBinding && doc.activation?.deviceUuid && deviceUuid) {
      if (doc.activation.deviceUuid !== deviceUuid) {
        return { ok: false, status: 'device_mismatch', error: 'device_mismatch' };
      }
    }
    const branchId = options.branchId || global.DeviceConfig?.getLockedBranchId?.();
    if (options.enforceBranchBinding && branchId && global.LicenseLimits?.isBranchLicensed) {
      const branches = global.LicenseLimits.getLicensedBranches(doc);
      if (branches.length && !global.LicenseLimits.isBranchLicensed(doc, branchId)) {
        return { ok: false, status: 'branch_mismatch', error: 'branch_mismatch', branchId };
      }
    }
    return { ok: true, status: 'valid', doc };
  }

  global.LicenseLifecycle = {
    refreshLicense,
    upgradeLicense,
    downgradeLicense,
    isExpired,
    evaluateLicenseState,
    applyLimitPatch
  };
})(typeof window !== 'undefined' ? window : globalThis);
