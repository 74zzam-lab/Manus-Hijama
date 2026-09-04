/**
 * License vault URL — same pattern as Google OAuth defaults + settings override.
 */
(function (global) {
  'use strict';

  const BUILTIN_DEFAULTS = {
    webAppUrl: 'https://script.google.com/macros/s/AKfycby7JXjFGAi3EuEjrh0jHTo2-W8AJ4neGMGgRARZQ840DzPO5OH4oEQ4x8EPLFECXdAh/exec',
    deploymentId: 'AKfycby7JXjFGAi3EuEjrh0jHTo2-W8AJ4neGMGgRARZQ840DzPO5OH4oEQ4x8EPLFECXdAh',
    enabled: true
  };

  function loadBuiltinDefaults() {
    try {
      if (typeof fetch !== 'undefined') {
        /* sync fallback — defaults inlined at build if fetch unavailable */
      }
    } catch { /* empty */ }
    if (global.__LICENSE_VAULT_DEFAULTS__) {
      return { ...BUILTIN_DEFAULTS, ...global.__LICENSE_VAULT_DEFAULTS__ };
    }
    return { ...BUILTIN_DEFAULTS };
  }

  function getConfig() {
    const builtin = loadBuiltinDefaults();
    const lv = global.settings?.licenseVault || {};
    const dc = global.settings?.devContact || global.DB?.get?.('devContact', {}) || {};
    const envUrl = global.process?.env?.LICENSE_VAULT_WEB_APP_URL || '';
    const url = String(
      lv.webAppUrl
      || dc.licenseVaultUrl
      || envUrl
      || builtin.webAppUrl
      || ''
    ).trim();
    const enabled = lv.enabled !== false && builtin.enabled !== false;
    return { webAppUrl: url, enabled, hasBuiltin: !!builtin.webAppUrl };
  }

  function saveOverride(webAppUrl, enabled) {
    if (!global.settings) global.settings = global.DB?.get?.('settings', {}) || {};
    if (!global.settings.licenseVault) global.settings.licenseVault = {};
    if (webAppUrl != null) global.settings.licenseVault.webAppUrl = String(webAppUrl || '').trim();
    if (enabled != null) global.settings.licenseVault.enabled = !!enabled;
    global.DB?.set?.('settings', global.settings);
    return getConfig();
  }

  global.LicenseVaultConfig = { getConfig, saveOverride, BUILTIN_DEFAULTS };
})(typeof window !== 'undefined' ? window : globalThis);
