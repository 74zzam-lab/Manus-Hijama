/**
 * Center ID — permanent identifier for a clinic/center.
 * Format: NJR-CLINIC-XXXXXXXX (8 hex chars)
 * V2-5.3: explicit confirmed center switch (no silent rebinding).
 */
(function (global) {
  'use strict';

  const PREFIX = 'NJR-CLINIC-';
  const META_KEY = '__tdw_meta__';
  const CENTER_ID_RE = /^NJR-CLINIC-[0-9A-F]{8}$/;
  const CONFIRM_TOKEN = 'CONFIRM_CENTER_SWITCH';

  function randomHex8() {
    const bytes = new Uint8Array(4);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
  }

  function generateCenterId() {
    return PREFIX + randomHex8();
  }

  function isValidCenterId(id) {
    return typeof id === 'string' && CENTER_ID_RE.test(id.trim());
  }

  function normalizeCenterId(id) {
    const s = String(id || '').trim().toUpperCase();
    return isValidCenterId(s) ? s : '';
  }

  function readMeta() {
    try {
      const fromDb = global.DB?.get?.(META_KEY, null);
      if (fromDb && typeof fromDb === 'object') return { ...fromDb };
    } catch { /* empty */ }
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(META_KEY) : null;
      if (raw) return JSON.parse(raw) || {};
    } catch { /* empty */ }
    return {};
  }

  function writeMeta(meta) {
    try { global.DB?.set?.(META_KEY, meta); } catch { /* empty */ }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(META_KEY, JSON.stringify(meta));
      }
    } catch { /* empty */ }
    return meta;
  }

  function getStoredCenterId() {
    try {
      const meta = readMeta();
      return meta?.centerId && isValidCenterId(meta.centerId) ? meta.centerId : '';
    } catch {
      return '';
    }
  }

  function ensureCenterId(existing) {
    const cur = normalizeCenterId(existing) || getStoredCenterId();
    if (cur) {
      // Persist on first establish so identity remains stable across restarts.
      if (getStoredCenterId() !== cur) {
        const meta = readMeta();
        meta.centerId = cur;
        writeMeta(meta);
      }
      return cur;
    }
    const generated = generateCenterId();
    const meta = readMeta();
    meta.centerId = generated;
    writeMeta(meta);
    return generated;
  }

  /**
   * Persist a center id. Switching away from an existing id requires
   * confirmToken === CONFIRM_CENTER_SWITCH (or options.confirmed === true).
   */
  function setCenterId(nextId, options) {
    options = options || {};
    const next = normalizeCenterId(nextId);
    if (!next) return { ok: false, error: 'invalid_center_id' };
    const current = getStoredCenterId();
    if (current && current === next) {
      return { ok: true, unchanged: true, centerId: current };
    }
    if (current && current !== next) {
      const confirmed = options.confirmed === true ||
        String(options.confirmToken || '') === CONFIRM_TOKEN;
      if (!confirmed) {
        return {
          ok: false,
          error: 'confirmation_required',
          current,
          requested: next,
          confirmToken: CONFIRM_TOKEN
        };
      }
    }
    const meta = readMeta();
    const previous = meta.centerId || null;
    meta.centerId = next;
    if (previous && previous !== next) {
      meta.previousCenterId = previous;
      meta.centerSwitchedAt = new Date().toISOString();
    }
    writeMeta(meta);
    try {
      const cfg = global.DeviceConfig?.load?.();
      if (cfg) global.DeviceConfig?.ensureDeviceConfig?.({ centerId: next });
    } catch { /* empty */ }
    global.AuditLogger?.log?.({
      action: previous && previous !== next ? 'CENTER_SWITCHED' : 'CENTER_ID_SET',
      entity: 'center',
      entityId: next,
      summary: previous && previous !== next
        ? `Center switched from ${previous} to ${next}`
        : `Center ID set to ${next}`
    });
    return { ok: true, centerId: next, previous: previous || null, switched: !!(previous && previous !== next) };
  }

  function requestCenterSwitch(nextId) {
    return setCenterId(nextId, { confirmed: false });
  }

  function confirmCenterSwitch(nextId) {
    return setCenterId(nextId, { confirmToken: CONFIRM_TOKEN });
  }

  global.CenterId = {
    PREFIX,
    META_KEY,
    CONFIRM_TOKEN,
    generateCenterId,
    isValidCenterId,
    normalizeCenterId,
    getStoredCenterId,
    ensureCenterId,
    setCenterId,
    requestCenterSwitch,
    confirmCenterSwitch
  };
})(typeof window !== 'undefined' ? window : globalThis);
