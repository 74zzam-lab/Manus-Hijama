/**
 * License V6 full verification (signature + schema + dates + device + features + revocation).
 */
(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  function loadRevocations() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(CL.v6Constants?.REVOCATION_KEY || 'commercial_license_v6_revocations');
        if (raw) {
          const doc = JSON.parse(raw);
          return Array.isArray(doc.revoked) ? doc.revoked : (Array.isArray(doc) ? doc : []);
        }
      }
    } catch { /* ignore */ }
    return CL._v6Revocations || [];
  }

  function saveRevocations(list) {
    CL._v6Revocations = list;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          CL.v6Constants?.REVOCATION_KEY || 'commercial_license_v6_revocations',
          JSON.stringify({ schemaVersion: 1, revoked: list, updatedAt: new Date().toISOString() })
        );
      }
    } catch { /* ignore */ }
  }

  function isRevoked(licenseId, list) {
    const id = String(licenseId || '');
    return (list || loadRevocations()).some((r) => {
      if (typeof r === 'string') return r === id;
      return r && (r.licenseId === id || r.id === id);
    });
  }

  async function verifyPayload(raw, opts) {
    const options = opts || {};
    const decoded = await CL.codecV6.decodeAndVerify(raw, options);
    if (!decoded.ok) {
      return {
        ok: false,
        error: decoded.error || 'signature',
        reasonCode: decoded.message || decoded.error,
        // User-facing: do not leak crypto details
        userMessage: 'تعذر التحقق من الترخيص',
      };
    }

    const lic = decoded.license;
    const now = options.now ? new Date(options.now) : new Date();

    if (!lic.licenseId || !lic.packageId) {
      return { ok: false, error: 'payload', reasonCode: 'missing_fields', userMessage: 'ملف الترخيص غير مكتمل' };
    }

    if (lic.issuedAt) {
      const issued = new Date(lic.issuedAt);
      if (isNaN(issued.getTime())) {
        return { ok: false, error: 'payload', reasonCode: 'issuedAt_invalid', userMessage: 'تاريخ الإصدار غير صالح' };
      }
      if (issued.getTime() - now.getTime() > 24 * 3600 * 1000) {
        return { ok: false, error: 'payload', reasonCode: 'issued_in_future', userMessage: 'تاريخ الإصدار غير صالح' };
      }
    }

    if (!lic.expiresAt) {
      return { ok: false, error: 'payload', reasonCode: 'expires_missing', userMessage: 'تاريخ الانتهاء مفقود' };
    }
    const exp = new Date(lic.expiresAt);
    if (isNaN(exp.getTime())) {
      return { ok: false, error: 'payload', reasonCode: 'expires_invalid', userMessage: 'تاريخ الانتهاء غير صالح' };
    }
    if (exp.getTime() <= now.getTime()) {
      return { ok: false, error: 'expired', reasonCode: 'expired', userMessage: 'انتهت صلاحية الترخيص' };
    }

    const revList = options.revocations || loadRevocations();
    if (isRevoked(lic.licenseId, revList)) {
      return { ok: false, error: 'revoked', reasonCode: 'revoked', userMessage: 'تم إلغاء هذا الترخيص' };
    }

    if (!Array.isArray(lic.features)) {
      return { ok: false, error: 'payload', reasonCode: 'features_invalid', userMessage: 'خصائص الترخيص غير صالحة' };
    }

    const limits = lic.limits || {};
    if (limits.branches != null && Number(limits.branches) < 0) {
      return { ok: false, error: 'payload', reasonCode: 'limits_invalid', userMessage: 'حدود الترخيص غير صالحة' };
    }
    if (limits.users != null && Number(limits.users) < 0) {
      return { ok: false, error: 'payload', reasonCode: 'limits_invalid', userMessage: 'حدود الترخيص غير صالحة' };
    }

    // Device binding
    const binding = lic.deviceBinding || { mode: 'any' };
    if (binding.mode === 'single-device' || binding.mode === 'bound') {
      const currentFp = options.fingerprint || null;
      if (!currentFp || !currentFp.hash) {
        return { ok: false, error: 'device', reasonCode: 'fingerprint_missing', userMessage: 'تعذر قراءة بصمة الجهاز' };
      }
      if (binding.fingerprintHash) {
        const stored = {
          hash: binding.fingerprintHash,
          shortHash: String(binding.fingerprintHash).slice(0, 16),
          components: binding.components || {},
        };
        const maxDrift = binding.maxDrift != null ? Number(binding.maxDrift) : 2;
        if (!CL.deviceFingerprint.fingerprintsCompatible(stored, currentFp, maxDrift)) {
          return {
            ok: false,
            error: 'device',
            reasonCode: 'device_mismatch',
            userMessage: 'الترخيص مرتبط بجهاز آخر — اطلب إعادة التفعيل',
          };
        }
      }
    }

    return {
      ok: true,
      license: lic,
      packageId: lic.packageId,
      features: lic.features,
      limits,
      expiresAt: lic.expiresAt,
      licenseId: lic.licenseId,
    };
  }

  function toLegacyRuntimeLicense(verified, codeOrRaw) {
    const lic = verified.license;
    const start = (lic.issuedAt || new Date().toISOString()).slice(0, 10);
    const expiry = String(lic.expiresAt).slice(0, 10);
    const binding = lic.deviceBinding || { mode: 'any' };
    const isAny = !binding.mode || binding.mode === 'any' || binding.mode === 'multi-device';
    return {
      type: 'renew',
      licType: 'renew',
      licenseId: lic.licenseId,
      productKey: typeof codeOrRaw === 'string' ? String(codeOrRaw).slice(0, 200) : lic.licenseId,
      start,
      activationDate: start,
      expiry,
      fingerprint: isAny ? 'DEVICE_ANY' : (binding.fingerprintHash || ''),
      device: isAny ? 'DEVICE_ANY' : (binding.fingerprintHash || ''),
      deviceMode: isAny ? 'any' : 'bound',
      boundDevice: isAny ? '' : (binding.fingerprintHash || ''),
      issued: start,
      v: 6,
      schemaVersion: 6,
      features: lic.features,
      edition: lic.packageId,
      commercial: {
        version: 'V6',
        packageId: lic.packageId,
        customerId: lic.customerId,
        customerName: lic.customerName,
        limits: lic.limits || {},
        nonce: lic.nonce,
      },
    };
  }

  CL.v6Verify = {
    loadRevocations,
    saveRevocations,
    isRevoked,
    verifyPayload,
    toLegacyRuntimeLicense,
  };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
