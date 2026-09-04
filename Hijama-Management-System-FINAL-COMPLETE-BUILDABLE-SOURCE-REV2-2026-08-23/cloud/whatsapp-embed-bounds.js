/**
 * Align the in-app WhatsApp BrowserView/WebContentsView with a DOM host.
 *
 * getBoundingClientRect() is always physical (left = smallest X). Electron's
 * overlay view inside an RTL BrowserWindow mirrors X, so we pre-mirror using
 * the renderer viewport width. Coordinates stay in CSS/DIP pixels (zoom=1).
 */
(function (global) {
  'use strict';

  function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function isRtl(value) {
    if (value === true || value === 'rtl' || value === 'true') return true;
    if (value === false || value === 'ltr' || value === 'false') return false;
    return false;
  }

  function clip(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeWhatsAppEmbedBounds(input) {
    const src = input && typeof input === 'object' ? input : {};
    const zoom = toNumber(src.zoom, 1) > 0 ? toNumber(src.zoom, 1) : 1;
    let width = Math.round(toNumber(src.width, 0) * zoom);
    let height = Math.round(toNumber(src.height, 0) * zoom);
    let x = Math.round(toNumber(src.x, 0) * zoom);
    let y = Math.round(toNumber(src.y, 0) * zoom);
    const viewportWidth = Math.round(toNumber(src.viewportWidth, 0) * zoom);
    const viewportHeight = Math.round(toNumber(src.viewportHeight, 0) * zoom);
    const rtl = isRtl(src.rtl);

    if (rtl && viewportWidth > 0 && width > 0) {
      x = viewportWidth - x - width;
    }

    if (viewportWidth > 0) {
      width = clip(width, 1, viewportWidth);
      x = clip(x, 0, Math.max(0, viewportWidth - width));
      width = Math.min(width, viewportWidth - x);
    } else {
      x = Math.max(0, x);
      width = Math.max(1, width);
    }

    if (viewportHeight > 0) {
      height = clip(height, 1, viewportHeight);
      y = clip(y, 0, Math.max(0, viewportHeight - height));
      height = Math.min(height, viewportHeight - y);
    } else {
      y = Math.max(0, y);
      height = Math.max(1, height);
    }

    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
  }

  const api = { normalizeWhatsAppEmbedBounds: normalizeWhatsAppEmbedBounds };
  global.WhatsAppEmbedBounds = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
