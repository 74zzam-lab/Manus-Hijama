/**
 * Center Setup — unified state for license, Google, branch, device (pre/post login).
 */
(function (global) {
  'use strict';

  function hasLegacyLicense() {
    return !!(typeof global.licLoad === 'function' && global.licLoad());
  }

  function hasCloudLicense() {
    const doc = global.LicenseCloud?.loadLocal?.();
    return !!(doc && doc.centerId);
  }

  function hasGoogle() {
    return !!(global.settings?.backup?.providers?.google?.connected);
  }

  function needsBranchSetup() {
    return global.DeviceConfig?.needsBranchSelection?.() !== false;
  }

  function getSetupState() {
    const doc = global.LicenseCloud?.loadLocal?.() || {};
    const cfg = global.DeviceConfig?.load?.() || {};
    const lic = typeof global.licLoad === 'function' ? global.licLoad() : null;
    const cv2 = global.CloudMeta?.isCloudV2Enabled?.() || global.settings?.cloudV2Enabled;
    return {
      hasLegacyLicense: !!lic,
      hasCloudLicense: !!doc.centerId,
      hasGoogle: hasGoogle(),
      centerId: doc.centerId || global.ConfigLayer?.getCenterId?.() || '',
      needsBranchSetup: needsBranchSetup(),
      branchLocked: !!(cfg.branchLocked && cfg.lockedBranchId),
      lockedBranchId: cfg.lockedBranchId || '',
      deviceName: cfg.deviceName || global.settings?.backup?.deviceName || '',
      cloudV2Enabled: !!cv2,
      maxBranches: global.LicenseLimits?.getMaxBranches?.(doc) || 1,
      branchCount: (doc.branches || []).filter(b => b && b.active !== false).length,
      deviceCount: global.DeviceRegistry?.listDevices?.(doc)?.length || 0,
      isElectron: !!(global.BackupBridge?.isElectron?.() || global.cuppingElectron?.backup || global.tadawiElectron?.backup)
    };
  }

  async function ensureCloudLicenseFromLegacy() {
    let doc = global.LicenseCloud?.loadLocal?.();
    if (doc?.centerId) return { ok: true, doc };

    const lic = typeof global.licLoad === 'function' ? global.licLoad() : null;
    if (!lic) return { ok: false, error: 'no_license' };

    const meta = lic.commercialMeta || lic.commercial || {};
    const CL = global.CommercialLicense;
    let record = null;
    if (meta.licenseId && CL?.store?.getLicense) {
      record = CL.store.getLicense(meta.licenseId);
    }
    if (!record) {
      record = {
        licenseId: meta.licenseId || lic.licenseId || 'L-LOCAL',
        licenseUuid: lic.licenseId || meta.licenseUuid || '',
        centerId: meta.centerId || global.CenterId?.ensureCenterId?.(),
        packageId: meta.packageId || lic.commercial?.packageId || '01',
        subscriptionId: meta.subscriptionId || '05',
        expiryDate: lic.expiry,
        devices: meta.devices != null ? meta.devices : 0,
        branches: meta.branches || 1,
        deviceBinding: lic.device === 'DEVICE_ANY' ? 'DEVICE_ANY' : 'DEVICE_BIND_FIRST',
        customer: { company: global.settings?.centerName || '' },
        status: 'active'
      };
    }

    if (!global.LicenseCloud?.buildFromRecord) {
      return { ok: false, error: 'license_cloud_unavailable' };
    }

    const featKeys = lic.features ? Object.keys(lic.features).filter(k => lic.features[k]) : [];
    doc = await global.LicenseCloud.buildFromRecord(record, {
      centerName: global.settings?.centerName,
      features: featKeys,
      mergeLocal: true
    });
    global.LicenseCloud.saveLocal(doc);
    global.CloudV2?.maybeAutoEnableCloudV2?.();
    return { ok: true, doc, migrated: true };
  }

  async function prepareForBranchSetup() {
    const state = getSetupState();
    if (!state.hasLegacyLicense && !state.hasCloudLicense) {
      return { ok: false, error: 'no_license', message: 'فعّل الترخيص أو اسحبه من Google أولاً' };
    }
    const mig = await ensureCloudLicenseFromLegacy();
    if (!mig.ok && !state.hasCloudLicense) return mig;
    if (!global.CloudMeta?.isCloudV2Enabled?.()) {
      const auto = global.CloudV2?.maybeAutoEnableCloudV2?.();
      if (auto && typeof auto.then === 'function') await auto;
      else if (auto && !auto.ok && auto.reason === 'drive_not_connected' && !state.hasGoogle) {
        return { ok: false, error: 'google_required', message: 'اربط Google Drive أولاً من تبويب Google في المعالج' };
      }
    }
    return { ok: true, state: getSetupState() };
  }

  async function removeBranch(branchId, options) {
    options = options || {};
    branchId = String(branchId || '').trim();
    if (!branchId) return { ok: false, error: 'branch_id_required' };

    if (!options.skipOwnerCheck && !global.RolePolicy?.isOrganizationOwner?.(global.currentUser)) {
      return { ok: false, error: 'owner_required', message: 'حذف الفروع وإلغاء ربط الجهاز للمالك فقط' };
    }
    const ownerGate = global.OwnerTrustedAuthority?.assertOwnerMutation?.({
      action: 'removeBranch',
      branchId,
      centerId: options.centerId,
    });
    if (ownerGate && !ownerGate.ok) return ownerGate;

    let doc = global.LicenseCloud?.loadLocal?.();
    if (!doc?.centerId) return { ok: false, error: 'no_license' };

    const branches = (doc.branches || []).filter(b => b && b.active !== false);
    if (branches.length <= 1 && !options.allowLast) {
      return { ok: false, error: 'last_branch', message: 'لا يمكن حذف آخر فرع' };
    }

    const devs = global.DeviceRegistry?.getRegistered?.(doc)?.filter(d => d.active !== false && d.branchId === branchId) || [];
    if (devs.length && !options.force) {
      return { ok: false, error: 'branch_has_devices', count: devs.length, message: `الفرع عليه ${devs.length} جهاز — أوقف الأجهزة أولاً أو force` };
    }

    doc.branches = (doc.branches || []).map(b => {
      if (b.id !== branchId) return b;
      return { ...b, active: false, removedAt: new Date().toISOString() };
    });
    doc.licenseVersion = (Number(doc.licenseVersion) || 0) + 1;

    if (global.LicenseCloud?.verifyLicenseDoc) {
      const CL = global.CommercialLicense;
      if (CL?.crypto?.hmacSha256Hex && CL.crypto.canonicalJson) {
        const { signature, ...body } = doc;
        body.updatedAt = new Date().toISOString();
        const sig = await CL.crypto.hmacSha256Hex(CL.crypto.canonicalJson(body));
        doc = { ...body, signature: sig };
      }
    }

    global.LicenseCloud.saveLocal(doc);
    await global.LicenseCloud.pushToDrive?.(doc).catch(() => {});

    const locked = global.DeviceConfig?.getLockedBranchId?.();
    if (locked === branchId) {
      const unlock = global.DeviceConfig?.trySetBranchLock?.(locked, false, global.DeviceConfig?.load?.()?.deviceName);
      if (unlock?.ok === false) {
        return { ok: false, error: unlock.error || 'owner_required', message: 'لا يمكن إلغاء ربط الجهاز إلا للمالك' };
      }
      if (!unlock) {
        global.DeviceConfig?.setBranchLock?.(locked, false, global.DeviceConfig?.load?.()?.deviceName);
      }
    }

    return { ok: true, branchId };
  }

  async function deactivateDevice(deviceUuid, options) {
    options = options || {};
    deviceUuid = String(deviceUuid || '').trim();
    if (!deviceUuid) return { ok: false, error: 'device_uuid_required' };

    const ownerGate = global.OwnerTrustedAuthority?.assertOwnerMutation?.({
      action: 'deactivateDevice',
      deviceUuid,
      branchId: options.branchId,
    });
    if (ownerGate && !ownerGate.ok) return ownerGate;

    const selfUuid = global.DeviceConfig?.load?.()?.deviceUuid;
    if (deviceUuid === selfUuid && !options.allowSelf) {
      return { ok: false, error: 'cannot_deactivate_self', message: 'لا يمكن إيقاف هذا الجهاز من نفسه — استخدم جهازاً آخر' };
    }

    let doc = global.LicenseCloud?.loadLocal?.();
    if (!doc) return { ok: false, error: 'no_license' };

    const list = global.DeviceRegistry?.getRegistered?.(doc) || [];
    const idx = list.findIndex(d => d && d.deviceUuid === deviceUuid);
    if (idx < 0) return { ok: false, error: 'device_not_found' };

    list[idx] = { ...list[idx], active: false, deactivatedAt: new Date().toISOString() };
    doc.devices = { registered: list };
    doc.licenseVersion = (Number(doc.licenseVersion) || 0) + 1;

    if (global.LicenseCloud?.verifyLicenseDoc) {
      const CL = global.CommercialLicense;
      if (CL?.crypto?.hmacSha256Hex && CL.crypto.canonicalJson) {
        const { signature, ...body } = doc;
        body.updatedAt = new Date().toISOString();
        const sig = await CL.crypto.hmacSha256Hex(CL.crypto.canonicalJson(body));
        doc = { ...body, signature: sig };
      }
    }

    global.LicenseCloud.saveLocal(doc);
    await global.LicenseCloud.pushToDrive?.(doc).catch(() => {});

    return { ok: true, deviceUuid };
  }

  function shouldAutoPromptSetup() {
    // V2-5.10: auto CenterSetup prompts retired — BootFlow + Owner Hub own the paths.
    return false;
  }

  global.CenterSetup = {
    getSetupState,
    hasLegacyLicense,
    hasCloudLicense,
    hasGoogle,
    needsBranchSetup,
    ensureCloudLicenseFromLegacy,
    prepareForBranchSetup,
    removeBranch,
    deactivateDevice,
    shouldAutoPromptSetup
  };
})(typeof window !== 'undefined' ? window : globalThis);
