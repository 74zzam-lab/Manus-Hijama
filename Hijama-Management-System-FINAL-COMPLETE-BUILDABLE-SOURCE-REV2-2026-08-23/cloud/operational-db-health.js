/**
 * Operational DB health — renderer cache + readiness integration.
 */
(function (global) {
  'use strict';

  let cached = null;
  let cachedAt = 0;
  const CACHE_MS = 15000;

  async function refresh(options) {
    options = options || {};
    const st = await global.SqliteBridge?.status?.();
    const health = st?.operationalHealth || st?.integrity
      ? {
          ok: !!(st.operationalHealth?.ok ?? st.integrity?.ok),
          ...st.operationalHealth,
          integrity: st.integrity || st.operationalHealth?.integrity,
        }
      : null;
    if (health) {
      cached = health;
      cachedAt = Date.now();
    }
    return health;
  }

  function getCached(options) {
    options = options || {};
    if (!options.force && cached && Date.now() - cachedAt < CACHE_MS) return cached;
    return cached;
  }

  async function ensureFresh(options) {
    return refresh(options);
  }

  function isOperationalAllowed() {
    const health = getCached();
    if (!health) return { ok: true, unknown: true };
    if (health.ok) return { ok: true, health };
    return {
      ok: false,
      error: 'database_unhealthy',
      blocked: true,
      reasons: health.reasons || [],
      messageAr: health.messageAr,
      health,
    };
  }

  global.OperationalDbHealth = {
    refresh,
    getCached,
    ensureFresh,
    isOperationalAllowed,
  };
})(typeof window !== 'undefined' ? window : globalThis);
