/**
 * Optional Google Apps Script vault — validates first activation (Spreadsheet).
 * URL configured in settings.licenseVault.webAppUrl (developer panel).
 *
 * Network / CSP failures must NOT hard-block local key activation when a
 * local activation bundle is available. Vault is best-effort.
 */
(function (global) {
  'use strict';

  const AR = {
    vault_unreachable: 'تعذّر الوصول لبوابة الترخيص السحابية (شبكة/CSP). سيتم التفعيل محلياً إن وُجدت الحزمة.',
    failed_to_fetch: 'تعذّر الاتصال بـ Google Sheets Vault — تحقق من الإنترنت أو أعد نشر Web App.'
  };

  function getConfig() {
    let cfg;
    if (global.LicenseVaultConfig?.getConfig) {
      cfg = global.LicenseVaultConfig.getConfig();
    } else {
      const lv = global.settings?.licenseVault || {};
      const dc = global.settings?.devContact || global.DB?.get?.('devContact', {}) || {};
      cfg = {
        webAppUrl: String(lv.webAppUrl || dc.licenseVaultUrl || '').trim(),
        enabled: lv.enabled !== false
      };
    }
    return {
      url: cfg.webAppUrl || cfg.url || '',
      enabled: cfg.enabled !== false
    };
  }

  function isNetworkFailure(err) {
    const msg = String(err?.message || err || '');
    return /failed to fetch|networkerror|load failed|network request failed|csp|blocked/i.test(msg);
  }

  async function postVault(body) {
    const cfg = getConfig();
    if (!cfg.url || cfg.enabled === false) return { ok: true, skipped: true, reason: 'vault_not_configured' };

    try {
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || 'vault_http_' + res.status, data };
      return data;
    } catch (e) {
      // Soft-skip: local activation must still work offline / if CSP blocks vault.
      return {
        ok: true,
        skipped: true,
        reason: 'vault_unreachable',
        error: 'vault_unreachable',
        message: isNetworkFailure(e) ? AR.failed_to_fetch : (e.message || AR.vault_unreachable),
        soft: true
      };
    }
  }

  function normalizeProductKey(key) {
    const CL = global.CommercialLicense;
    if (CL?.codecV5?.normalizeKey) return CL.codecV5.normalizeKey(key);
    return String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function packageLabelFromBundle(bundle, record) {
    if (bundle?.packageInternalName) return bundle.packageInternalName;
    if (bundle?.customPackageId) return 'Custom ' + bundle.customPackageId;
    const CL = global.CommercialLicense;
    const pkg = (CL?.registries?.package?.packages || []).find(p => p.id === (bundle?.packageId || record?.packageId));
    return pkg?.displayName || bundle?.packageId || record?.packageId || '';
  }

  async function fetchBundleFromVault(productKey) {
    const normalized = normalizeProductKey(productKey);
    if (!normalized) return { ok: false, error: 'no_product_key' };
    const result = await postVault({ action: 'fetchBundle', productKey: normalized });
    if (result.skipped) return result;
    if (!result.ok) return result;
    if (!result.bundle) return { ok: false, error: 'bundle_not_found' };
    return { ok: true, bundle: result.bundle };
  }

  async function checkStatus(licenseId, productKey) {
    if (!licenseId && !productKey) return { ok: false, error: 'no_license_ref' };
    return postVault({
      action: 'status',
      licenseId: licenseId || '',
      productKey: normalizeProductKey(productKey || '')
    });
  }

  async function activateOnVault(options) {
    options = options || {};
    const licenseId = options.licenseId;
    const productKey = normalizeProductKey(options.productKey || options.productKeyRaw || '');
    if (!licenseId && !productKey) return { ok: true, skipped: true, reason: 'no_license_ref' };

    const identity = global.LicenseActivationGate?.getDeviceIdentity?.()
      || {
        fingerprint: typeof global.licGetFingerprint === 'function' ? global.licGetFingerprint() : '',
        deviceUuid: global.DeviceConfig?.load?.()?.deviceUuid || ''
      };

    const result = await postVault({
      action: 'activate',
      productKey,
      fingerprint: identity.fingerprint || '',
      deviceUuid: identity.deviceUuid || '',
      deviceReference: options.deviceReference || options.customerDeviceRef || '',
      googleEmail: global.settings?.backup?.providers?.google?.email || '',
      licenseId: licenseId || '',
      centerId: options.centerId || global.CenterId?.getStoredCenterId?.() || '',
      packageLabel: options.packageLabel || ''
    });

    if (result.skipped) return result;
    if (!result.ok && result.error === 'not_found') {
      if (productKey) {
        return {
          ok: false,
          error: 'not_found',
          message: 'الكود غير مسجّل في Spreadsheet — أضف المفتاح في عمود A'
        };
      }
      return { ok: true, skipped: true, reason: 'not_in_spreadsheet' };
    }
    return result;
  }

  async function patchActivationOnVault(options) {
    options = options || {};
    const productKey = normalizeProductKey(options.productKey || '');
    if (!productKey) return { ok: true, skipped: true, reason: 'no_product_key' };
    return postVault({
      action: 'patchActivation',
      productKey,
      centerId: options.centerId || '',
      licenseId: options.licenseId || '',
      packageLabel: options.packageLabel || ''
    });
  }

  global.LicenseVaultClient = {
    getConfig,
    normalizeProductKey,
    packageLabelFromBundle,
    fetchBundleFromVault,
    checkStatus,
    activateOnVault,
    patchActivationOnVault,
    AR
  };
})(typeof window !== 'undefined' ? window : globalThis);
