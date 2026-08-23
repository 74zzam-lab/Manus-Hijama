'use strict';

/**
 * Local QR image helper — CSP-safe offline data URLs.
 * Requires assets/vendor/qrcode-generator.js (+ utf8 helper).
 */
(function (global) {
  function getFactory() {
    return typeof global.qrcode === 'function' ? global.qrcode : null;
  }

  /**
   * @param {string} data
   * @param {object} [opts]
   * @param {number} [opts.size=96] target pixel size (approx)
   * @param {string} [opts.ecc='M'] L|M|Q|H
   * @param {number} [opts.marginModules] quiet-zone in modules (default ~2)
   * @returns {string} data:image/... URL or empty string on failure
   */
  function makeDataUrl(data, opts) {
    opts = opts || {};
    const factory = getFactory();
    if (!factory) {
      console.warn('[CuppingQr] qrcode factory missing');
      return '';
    }
    const text = String(data == null ? '' : data);
    if (!text) return '';

    const target = Math.max(parseInt(opts.size, 10) || 96, 64);
    const ecc = opts.ecc || 'M';
    try {
      const qr = factory(0, ecc);
      qr.addData(text);
      qr.make();
      const modules = qr.getModuleCount();
      const marginModules = (opts.marginModules != null)
        ? Math.max(0, parseInt(opts.marginModules, 10) || 0)
        : 2;
      // cellSize is pixels per module; margin arg is pixels (library API)
      const cell = Math.max(2, Math.floor(target / Math.max(modules + marginModules * 2, 1)));
      const marginPx = cell * marginModules;
      return qr.createDataURL(cell, marginPx);
    } catch (err) {
      console.warn('[CuppingQr] encode failed', err && err.message ? err.message : err);
      return '';
    }
  }

  function makeImgTag(data, opts) {
    opts = opts || {};
    const src = makeDataUrl(data, opts);
    if (!src) return '';
    const display = Math.max(parseInt(opts.display, 10) || parseInt(opts.size, 10) || 96, 24);
    const alt = String(opts.alt || 'QR');
    return `<img src="${src}" width="${display}" height="${display}" alt="${alt}">`;
  }

  global.CuppingQr = {
    makeDataUrl,
    makeImgTag,
    isAvailable: function () { return !!getFactory(); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
