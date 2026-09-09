/**
 * V2-5.10 — Unified document preview before print (A4 + thermal HTML).
 */
(function (global) {
  'use strict';

  function shouldPreviewFirst(options) {
    options = options || {};
    if (options.preview === true || options.previewFirst === true) return true;
    if (options.silent === true || options.skipPreview === true) return false;
    return !!(global.settings?.devices?.previewBeforePrint);
  }

  function isThermalReceiptHtml(html) {
    const s = String(html || '').trim();
    if (!s) return false;
    return /<div[^>]*class="[^"]*\breceipt\b/i.test(s)
      || /\br-brand\b/.test(s)
      || /\br-total-box\b/.test(s)
      || /\br-tagline\b/.test(s);
  }

  function openPreview(html, title, options) {
    options = options || {};
    const thermal = options.thermal || isThermalReceiptHtml(html);
    if (thermal && typeof global.showThermalReceiptPreview === 'function') {
      return global.showThermalReceiptPreview(html, title || 'معاينة فاتورة حرارية', options);
    }
    if (typeof global.openReportPreview === 'function') {
      global.openReportPreview(html, title || 'معاينة المستند');
      return { ok: true, mode: 'report_preview' };
    }
    const frame = document.getElementById('reportPreviewFrame');
    const modal = document.getElementById('reportPreviewModal');
    if (frame && modal) {
      frame.srcdoc = html;
      modal.classList.add('open');
      const t = document.getElementById('reportPreviewTitle');
      if (t) t.textContent = title || 'معاينة المستند';
      return { ok: true, mode: 'iframe_fallback' };
    }
    return { ok: false, error: 'preview_unavailable' };
  }

  async function printOrPreview(html, options) {
    options = options || {};
    const isThermal = !!options.thermal || isThermalReceiptHtml(html);
    const title = options.title || (isThermal ? 'معاينة فاتورة حرارية' : 'معاينة مستند');
    if (shouldPreviewFirst(options)) {
      const prev = openPreview(html, title, { ...options, thermal: isThermal });
      if (prev.ok) return { ok: true, preview: true, ...prev };
    }
    if (isThermal && typeof global.printThermalDoc === 'function') {
      await global.printThermalDoc(html, options.successMsg || null, { ...options, thermal: true, skipPreview: true });
      return { ok: true, printed: true, mode: 'thermal' };
    }
    if (typeof global.printHTML === 'function') {
      await global.printHTML(html, false, options);
      return { ok: true, printed: true, mode: 'a4' };
    }
    return { ok: false, error: 'print_unavailable' };
  }

  global.DocumentPreviewBridge = {
    shouldPreviewFirst,
    isThermalReceiptHtml,
    openPreview,
    printOrPreview,
  };
})(typeof window !== 'undefined' ? window : globalThis);
