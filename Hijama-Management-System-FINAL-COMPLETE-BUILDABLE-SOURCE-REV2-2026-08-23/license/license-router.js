(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  function isV5Key(code) {
    const norm = CL.codecV5.normalizeKey(code);
    return CL.codecV5.detectKeyVersion(norm) === 'v5';
  }

  function isV5KeyFromNorm(norm) {
    return CL.codecV5.detectKeyVersion(norm) === 'v5';
  }

  function isV6Input(code) {
    return !!(CL.codecV6 && CL.codecV6.isV6Input(code));
  }

  async function applyV6Activation(raw, errEl, okEl) {
    if (!isV6Input(raw)) return { handled: false };

    if (!CL.v6Verify || !CL.codecV6) {
      if (errEl) {
        errEl.textContent = '✗ وحدة ترخيص V6 غير محمّلة';
        errEl.style.display = 'block';
      }
      return { handled: true, ok: false, error: 'v6_unavailable' };
    }

    let fingerprint = null;
    try {
      let extra = {};
      if (global.cuppingElectron?.app?.getDeviceFingerprintParts) {
        const parts = await global.cuppingElectron.app.getDeviceFingerprintParts();
        if (parts && parts.ok !== false) extra = parts;
      }
      fingerprint = await CL.deviceFingerprint.buildFingerprint(extra);
    } catch { /* optional */ }

    const verified = await CL.v6Verify.verifyPayload(raw, { fingerprint });
    if (!verified.ok) {
      if (errEl) {
        errEl.textContent = '✗ ' + (verified.userMessage || 'تعذر التحقق من الترخيص');
        errEl.style.display = 'block';
      }
      return { handled: true, ok: false, error: verified.error, reasonCode: verified.reasonCode };
    }

    const lic = CL.v6Verify.toLegacyRuntimeLicense(verified, raw);
    // Preserve previous V5 license for rollback until explicitly cleared
    try {
      if (typeof localStorage !== 'undefined') {
        const prev = localStorage.getItem('commercial_license_data_v2');
        localStorage.setItem('commercial_license_v6_prev_marker', JSON.stringify({
          keptV5Store: !!prev,
          activatedAt: new Date().toISOString(),
          licenseId: verified.licenseId,
        }));
      }
    } catch { /* ignore */ }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          CL.v6Constants.STORAGE_KEY,
          JSON.stringify({ license: verified.license, activatedAt: new Date().toISOString() })
        );
      }
    } catch { /* ignore */ }

    if (typeof licSave === 'function') licSave(lic);

    let realNow = new Date();
    try {
      if (typeof licFetchRealTime === 'function') realNow = await licFetchRealTime();
    } catch { /* use local */ }

    const meta = typeof licLoadMeta === 'function' ? licLoadMeta() : {};
    meta.lastSuccessfulOnlineValidation = realNow.toISOString();
    meta.highestTrustedDate = realNow.toISOString();
    meta.lastActivationDate = lic.activationDate;
    meta.lastRenewalDate = realNow.toISOString();
    meta.lastDeviceFingerprint = fingerprint?.hash || '';
    meta.activationCount = (meta.activationCount || 0) + 1;
    meta.licenseSchemaVersion = 6;
    if (!meta.licenseCreatedAt) meta.licenseCreatedAt = lic.issued;
    if (typeof licSaveMeta === 'function') licSaveMeta(meta);

    if (typeof licFinalizeFeatureState === 'function') await licFinalizeFeatureState();
    if (typeof licLog === 'function') licLog('renew', `تفعيل V6 ناجح — ينتهي ${lic.expiry}`);
    if (CL.auditLog?.log) CL.auditLog.log('v6_activation', verified.licenseId, { schema: 6 });

    if (okEl) {
      okEl.textContent = `✓ تم تفعيل الترخيص V6 — صالح حتى: ${lic.expiry}`;
      okEl.style.display = 'block';
    }

    if (typeof _licStatus !== 'undefined') {
      global._licStatus = 'valid';
      global._licBlocked = false;
    }

    const loginBtn = document.querySelector('.login-btn');
    if (loginBtn) { loginBtn.disabled = false; loginBtn.style.opacity = ''; loginBtn.style.cursor = ''; }

    const statusEl = document.getElementById('login-license-status');
    if (statusEl) {
      statusEl.textContent = `✅ البرنامج مفعل (V6) حتى: ${lic.expiry}`;
      statusEl.style.color = '#5dde8a';
    }

    if (typeof _appAuthed !== 'undefined' && _appAuthed && typeof applyLicensedFeatures === 'function') {
      applyLicensedFeatures();
    }

    return { handled: true, ok: true, lic, verified };
  }

  async function applyActivation(code, errEl, okEl) {
    // Prefer V6 when input matches V6 format
    if (isV6Input(code)) {
      return applyV6Activation(code, errEl, okEl);
    }
    if (!isV5Key(code)) return { handled: false };

    await CL.engine.ensureReady();
    const validation = await CL.validator.validateKey(code);
    if (!validation.ok) {
      const msgs = {
        signature: '✗ تم التلاعب بالترخيص — التوقيع غير صحيح',
        format: '✗ صيغة مفتاح المنتج غير صحيحة',
        bundle_missing: '✗ حزمة التفعيل غير متوفرة — اطلب من المطور تفعيل Vault أو ملف bundle',
        bundle_tampered: '✗ تم التلاعب بحزمة التفعيل',
        license_not_found: '✗ الترخيص غير مسجل',
        expired: '✗ انتهت صلاحية الترخيص'
      };
      if (errEl) {
        errEl.textContent = msgs[validation.error] || '✗ مفتاح المنتج غير صالح';
        errEl.style.display = 'block';
      }
      return { handled: true, ok: false, error: validation.error };
    }

    const payload = validation.payload;
    const token = 'V5-ACT-' + (validation.record?.licenseId || '') + '-' + Date.now();
    payload.token = token;

    if (typeof licIsTokenUsed === 'function' && licIsTokenUsed(token)) {
      if (errEl) {
        errEl.textContent = '✗ تم استخدام مفتاح التفعيل مسبقاً';
        errEl.style.display = 'block';
      }
      return { handled: true, ok: false, error: 'token_reused' };
    }

    const fp = typeof licGetFingerprint === 'function' ? licGetFingerprint() : '';

    if (typeof global.LicenseActivationGate !== 'undefined') {
      const gate = await global.LicenseActivationGate.preActivateCheck(validation.record, {
        requireGoogle: validation.record?.deviceBinding === 'DEVICE_ANY' || (validation.record?.branches || 1) > 1,
        productKey: code,
        bundle: validation.bundle
      });
      if (!gate.ok) {
        const msg = gate.message || global.LicenseActivationGate.ERR_AR?.[gate.error] || gate.error;
        if (errEl) {
          errEl.textContent = '✗ ' + msg;
          errEl.style.display = 'block';
        }
        return { handled: true, ok: false, error: gate.error };
      }
      if (gate.recovery) {
        if (typeof global.notify === 'function') {
          global.notify('ℹ️ الترخيص مُفعَّل — تم استرداد حالة التفعيل', 'info');
        }
      }
      global._lastActivationGateResult = gate;
    }

    if (payload.device !== 'DEVICE_ANY' && typeof payload.device === 'string' && payload.device.length > 4) {
      /* Fingerprint lock disabled — Spreadsheet vault enforces one-time key use; other devices pull from Google. */
    }

    let realNow = new Date();
    try {
      if (typeof licFetchRealTime === 'function') realNow = await licFetchRealTime();
    } catch { /* use local */ }

    const newExpiry = new Date(payload.expiry);
    if (newExpiry <= realNow) {
      if (errEl) {
        errEl.textContent = '✗ انتهت صلاحية الترخيص';
        errEl.style.display = 'block';
      }
      return { handled: true, ok: false, error: 'expired' };
    }

    const startDate = payload.activationDate || payload.issue || (typeof formatDateISO === 'function' ? formatDateISO(realNow) : realNow.toISOString().slice(0, 10));
    const bindFirst = false;
    const isAnyDevice = true;
    const lic = {
      type: payload.licType || 'renew',
      licType: payload.licType || 'renew',
      licenseId: payload.licenseId || validation.record?.licenseUuid || '',
      productKey: typeof licFormatStoredProductKey === 'function' ? licFormatStoredProductKey(code) : code,
      start: startDate,
      activationDate: startDate,
      expiry: payload.expiry,
      fingerprint: 'DEVICE_ANY',
      device: 'DEVICE_ANY',
      deviceMode: 'any',
      boundDevice: '',
      issued: payload.issued || startDate,
      v: 5,
      commercial: payload.commercial
    };

    try {
      if (typeof licAttachFeaturesToLicense === 'function') {
        await licAttachFeaturesToLicense(lic, payload);
      } else {
        lic.edition = payload.edition;
        lic.features = payload.features;
        lic.featureSig = payload.featureSig;
      }
    } catch {
      if (errEl) {
        errEl.textContent = '✗ تم التلاعب بخصائص الترخيص في المفتاح';
        errEl.style.display = 'block';
      }
      return { handled: true, ok: false, error: 'features_tampered' };
    }

    if (typeof licSave === 'function') licSave(lic);

    if (typeof global.LicenseActivationGate !== 'undefined' && validation.record) {
      try {
        const committed = await global.LicenseActivationGate.commitActivation(validation.record, lic);
        global._lastActivationGateResult = {
          ...(global._lastActivationGateResult || {}),
          ...(committed || {})
        };
      } catch (e) {
        console.warn('LicenseActivationGate.commitActivation:', e);
      }
    }

    if (typeof licMarkTokenUsed === 'function') licMarkTokenUsed(token);

    if (typeof global.CloudV2 !== 'undefined' && validation.record) {
      try {
        const resolved = { featureKeys: payload.features || {} };
        const after = await global.CloudV2.afterLicenseActivation(validation.record, resolved);
        if (after?.drivePush) {
          global._lastActivationGateResult = {
            ...(global._lastActivationGateResult || {}),
            drivePush: after.drivePush
          };
        }
      } catch (e) {
        console.warn('CloudV2.afterLicenseActivation:', e);
      }
    }

    // Final guarantee: push signed license.json if Google is connected
    try {
      if (global.LicenseCloud?.ensurePushedToDrive && global.DriveAdapter) {
        await global.DriveAdapter.ensureConnected?.();
        if (global.DriveAdapter.isConnected?.()) {
          const finalPush = await global.LicenseCloud.ensurePushedToDrive();
          global._lastActivationGateResult = {
            ...(global._lastActivationGateResult || {}),
            drivePush: finalPush
          };
        }
      }
    } catch (e) {
      console.warn('ensurePushedToDrive:', e);
    }

    const meta = typeof licLoadMeta === 'function' ? licLoadMeta() : {};
    meta.lastSuccessfulOnlineValidation = realNow.toISOString();
    meta.highestTrustedDate = realNow.toISOString();
    meta.lastActivationDate = startDate;
    meta.lastRenewalDate = realNow.toISOString();
    meta.lastDeviceFingerprint = fp;
    meta.activationCount = (meta.activationCount || 0) + 1;
    if (!meta.licenseCreatedAt) meta.licenseCreatedAt = lic.issued || startDate;
    if (typeof licSaveMeta === 'function') licSaveMeta(meta);

    if (typeof licFinalizeFeatureState === 'function') await licFinalizeFeatureState();
    if (typeof licLog === 'function') licLog('renew', `تفعيل V5 ناجح — ينتهي ${payload.expiry}`);
    CL.auditLog.log('v5_activation', validation.record?.licenseId || '', { key: code.slice(0, 15) });

    const gateRes = global._lastActivationGateResult || {};
    const pendingRemoteConfirmation = !!gateRes.pendingRemoteConfirmation;
    const pendingDriveReplication = !!(gateRes.drivePush?.pendingRemote || gateRes.drivePush?.remotePublished === false);
    const localPending = pendingRemoteConfirmation || pendingDriveReplication;
    const localPendingMessage = '⚠️ تم التفعيل محلياً، لكن تأكيد Google/Drive ما زال معلقاً. أعد المحاولة بعد عودة الاتصال.';

    if (okEl) {
      okEl.textContent = localPending
        ? localPendingMessage
        : `✓ تم تفعيل الترخيص V5 — صالح حتى: ${payload.expiry}`;
      okEl.style.display = 'block';
    }

    // Surface the exact remote outcome; never imply that an offline/local commit
    // was successfully confirmed by Vault or Drive.
    try {
      if (localPending && typeof global.notify === 'function') {
        global.notify(localPendingMessage, 'warning');
      } else if (gateRes.drivePush?.ok && gateRes.drivePush.remotePublished !== false && typeof global.notify === 'function') {
        global.notify('☁️ تم رفع الترخيص إلى Google Drive', 'success');
      }
    } catch { /* empty */ }

    if (typeof _licStatus !== 'undefined') {
      global._licStatus = 'valid';
      global._licBlocked = false;
    }

    const loginBtn = document.querySelector('.login-btn');
    if (loginBtn) { loginBtn.disabled = false; loginBtn.style.opacity = ''; loginBtn.style.cursor = ''; }

    const statusEl = document.getElementById('login-license-status');
    if (statusEl) {
      const editionNote = lic.edition === 'custom' ? ' — إصدار مخصص' : '';
      statusEl.textContent = localPending
        ? `⚠️ البرنامج مفعل محلياً حتى: ${payload.expiry}${editionNote} — انتظار تأكيد Google/Drive`
        : `✅ البرنامج مفعل حتى: ${payload.expiry}${editionNote}`;
      statusEl.style.color = localPending ? '#c88719' : '#5dde8a';
    }

    if (typeof _appAuthed !== 'undefined' && _appAuthed && typeof applyLicensedFeatures === 'function') {
      applyLicensedFeatures();
    }

    return {
      handled: true,
      ok: true,
      lic,
      payload,
      validation,
      pendingRemoteConfirmation,
      pendingDriveReplication,
      remotePublished: !localPending
    };
  }

  function route(code) {
    if (isV6Input(code)) return { version: 'v6', norm: String(code).trim().slice(0, 64) };
    const norm = CL.codecV5.normalizeKey(code);
    const version = CL.codecV5.detectKeyVersion(norm);
    return { version, norm };
  }

  CL.router = {
    isV5Key,
    isV5KeyFromNorm,
    isV6Input,
    applyActivation,
    applyV6Activation,
    route,
  };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
