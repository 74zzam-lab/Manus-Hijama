/**
 * Online licensing client interface (Phase 3 design — no server required yet).
 * Endpoints:
 *   POST /licenses/activate
 *   POST /licenses/validate
 *   POST /licenses/deactivate
 *   GET  /licenses/revocations
 */
(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  function createOnlineClient(config) {
    const cfg = {
      baseUrl: (config && config.baseUrl) || '',
      fetchImpl: (config && config.fetchImpl) || (typeof fetch !== 'undefined' ? fetch.bind(global) : null),
      enabled: !!(config && config.enabled && config.baseUrl),
    };

    async function request(method, path, body) {
      if (!cfg.enabled || !cfg.fetchImpl) {
        return { ok: false, error: 'online_disabled', offline: true };
      }
      const url = String(cfg.baseUrl).replace(/\/+$/, '') + path;
      const res = await cfg.fetchImpl(url, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body == null ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
      if (!res.ok) return { ok: false, error: 'http_' + res.status, data };
      return { ok: true, data };
    }

    return {
      isEnabled: () => cfg.enabled,
      activate: (payload) => request('POST', '/licenses/activate', payload),
      validate: (payload) => request('POST', '/licenses/validate', payload),
      deactivate: (payload) => request('POST', '/licenses/deactivate', payload),
      revocations: () => request('GET', '/licenses/revocations'),
    };
  }

  CL.createOnlineLicenseClient = createOnlineClient;
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
