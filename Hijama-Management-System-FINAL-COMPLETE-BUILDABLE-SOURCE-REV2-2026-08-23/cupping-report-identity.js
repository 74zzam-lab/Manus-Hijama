/**
 * Unified medical-center report identity — logo, center name, title, date, branch.
 * Operational reports use center branding only (never NajjarTech / product logos).
 */
(function (global) {
  'use strict';

  const DEFAULT_LOGO = 'branding/Center-Logo.png';

  function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function resolvePrintAssetUrl(src) {
    const raw = String(src || '').trim();
    if (!raw) return '';
    if (/^(data:|https?:|file:|blob:)/i.test(raw)) return raw;
    try {
      const base = (typeof global !== 'undefined' && global.location?.href) || 'file:///';
      return new URL(raw.replace(/^\//, ''), base).href;
    } catch (_) {
      return raw;
    }
  }

  function getCenterBrandLogo() {
    const s = global.settings || {};
    if (s.brandLogo) return resolvePrintAssetUrl(s.brandLogo);
    return resolvePrintAssetUrl(DEFAULT_LOGO);
  }

  function formatReportDate(input) {
    if (!input) {
      return new Date().toLocaleString('ar-SA-u-ca-gregory', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    }
    if (input instanceof Date) {
      return input.toLocaleString('ar-SA-u-ca-gregory', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    }
    return String(input);
  }

  /**
   * @param {string} titleAr
   * @param {string} [titleEn]
   * @param {string[]} [metaLines] - extra subtitle lines (HTML allowed if pre-escaped)
   * @param {{ date?: string|Date, branch?: string, logo?: boolean }} [opts]
   */
  function buildUnifiedReportHeader(titleAr, titleEn, metaLines, opts) {
    opts = opts || {};
    const s = global.settings || {};
    const cn = (s.centerName || 'مركز الحجامة').trim();
    const branch = (opts.branch || s.branchName || '').trim();
    const dateStr = formatReportDate(opts.date);
    const showLogo = opts.logo !== false;
    const logoSrc = getCenterBrandLogo();
    const title = [titleAr, titleEn].filter(Boolean).join(titleAr && titleEn ? ' — ' : '');
    const meta = (metaLines || []).filter(Boolean);

    return `<div class="hdr report-identity-hdr">
      ${showLogo ? `<img src="${escHtml(logoSrc)}" alt="" class="report-logo" style="max-height:72px;max-width:180px;object-fit:contain;margin:0 auto 8px;display:block">` : ''}
      <h1>${escHtml(cn)}</h1>
      ${branch ? `<p class="meta report-branch">${escHtml(branch)}</p>` : ''}
      ${title ? `<p class="meta report-title" style="font-weight:900;font-size:11pt;margin-top:4px">${escHtml(title)}</p>` : ''}
      <p class="meta report-date">${escHtml(dateStr)}</p>
      ${meta.map(l => `<p class="meta">${l}</p>`).join('')}
    </div>`;
  }

  /** Shorthand for inline report templates */
  function urepHdr(titleAr, titleEn, metaLines, opts) {
    return buildUnifiedReportHeader(titleAr, titleEn, metaLines, opts);
  }

  global.resolvePrintAssetUrl = resolvePrintAssetUrl;
  global.getCenterBrandLogo = getCenterBrandLogo;
  global.buildUnifiedReportHeader = buildUnifiedReportHeader;
  global.urepHdr = urepHdr;
  global.formatReportDate = formatReportDate;
})(typeof window !== 'undefined' ? window : globalThis);
