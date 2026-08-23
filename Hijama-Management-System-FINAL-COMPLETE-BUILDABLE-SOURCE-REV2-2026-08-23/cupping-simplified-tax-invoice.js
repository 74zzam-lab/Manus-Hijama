/**
 * Simplified Tax Invoice (فاتورة ضريبية مبسطة) — optional ZATCA Phase-1 QR + A4 print.
 * Extends existing invoice data; does not replace accounting or thermal receipts.
 */
(function (global) {
  'use strict';

  const DEFAULT_TAX_CONFIG = { enabled: false, showContactQrOnThermal: true };
  const DEFAULT_INVOICE_CONFIG = { enabled: true };
  const DEFAULT_VAT_CALC = { mode: 'inclusive' };

  function ensureInvoiceSystemSettings() {
    const s = global.settings || {};
    if (!s.invoiceSystem) s.invoiceSystem = { ...DEFAULT_INVOICE_CONFIG };
    else s.invoiceSystem = { ...DEFAULT_INVOICE_CONFIG, ...s.invoiceSystem };
    return s.invoiceSystem;
  }

  function isInvoiceSystemEnabled() {
    ensureInvoiceSystemSettings();
    return global.settings.invoiceSystem.enabled !== false;
  }

  function toggleInvoiceSystemUI(enabled) {
    ensureInvoiceSystemSettings();
    global.settings.invoiceSystem.enabled = !!enabled;
    if (global.DB) global.DB.set('settings', global.settings);
    applyInvoiceSystemVisibility();
    if (!enabled && typeof global.toggleSimplifiedTaxInvoiceUI === 'function') {
      global.toggleSimplifiedTaxInvoiceUI(false);
      const taxCb = document.getElementById('set-simplified-tax-invoice');
      if (taxCb) taxCb.checked = false;
    }
  }

  function applyInvoiceSystemVisibility() {
    const on = isInvoiceSystemEnabled();
    document.body.classList.toggle('invoice-system-disabled', !on);
    document.querySelectorAll('.invoice-system-settings-detail').forEach(el => {
      el.style.display = on ? '' : 'none';
    });
    document.querySelectorAll('.invoice-system-action').forEach(el => {
      el.classList.toggle('invoice-system-hidden', !on);
    });
    if (on && typeof loadSimplifiedTaxInvoiceUI === 'function') loadSimplifiedTaxInvoiceUI();
  }

  function loadInvoiceSystemUI() {
    ensureInvoiceSystemSettings();
    const cb = document.getElementById('set-invoice-system-enabled');
    if (cb) cb.checked = isInvoiceSystemEnabled();
    const vatEl = document.getElementById('set-invoice-vat-rate');
    if (vatEl) vatEl.value = global.settings.vatRate != null ? global.settings.vatRate : 15;
    applyInvoiceSystemVisibility();
  }

  function saveInvoiceVatFromCenterSettings() {
    const vatEl = document.getElementById('set-invoice-vat-rate');
    if (vatEl && vatEl.value !== '') {
      const v = parseFloat(vatEl.value);
      if (Number.isFinite(v) && v >= 0) global.settings.vatRate = v;
    }
  }

  function ensureSimplifiedTaxSettings() {
    const s = global.settings || {};
    if (!s.simplifiedTaxInvoice) s.simplifiedTaxInvoice = { ...DEFAULT_TAX_CONFIG };
    else s.simplifiedTaxInvoice = { ...DEFAULT_TAX_CONFIG, ...s.simplifiedTaxInvoice };
    return s.simplifiedTaxInvoice;
  }

  function isSimplifiedTaxInvoiceEnabled() {
    ensureSimplifiedTaxSettings();
    return !!global.settings.simplifiedTaxInvoice.enabled;
  }

  function getVatRate() {
    const r = parseFloat(global.settings?.vatRate);
    return Number.isFinite(r) && r >= 0 ? r : 15;
  }

  function ensureVatCalcSettings() {
    const s = global.settings || {};
    if (!s.vatCalc) s.vatCalc = { ...DEFAULT_VAT_CALC };
    else s.vatCalc = { ...DEFAULT_VAT_CALC, ...s.vatCalc };
    if (s.vatCalcMode && !s.vatCalc.mode) s.vatCalc.mode = s.vatCalcMode;
    return s.vatCalc;
  }

  function getVatCalcMode() {
    ensureVatCalcSettings();
    const m = global.settings.vatCalc?.mode || global.settings.vatCalcMode || 'inclusive';
    return m === 'exclusive' ? 'exclusive' : 'inclusive';
  }

  function setVatCalcMode(mode) {
    ensureVatCalcSettings();
    global.settings.vatCalc.mode = mode === 'exclusive' ? 'exclusive' : 'inclusive';
    global.settings.vatCalcMode = global.settings.vatCalc.mode;
    if (global.DB) global.DB.set('settings', global.settings);
  }

  /** VAT-exclusive breakdown: VAT = preTax × rate/100 */
  function calcVatExclusiveBreakdown(preTax, vatRate) {
    const p = Math.max(0, parseFloat(preTax) || 0);
    const rate = vatRate != null ? parseFloat(vatRate) : getVatRate();
    const vat = p * rate / 100;
    return { preTax: p, vat, total: p + vat, vatRate: rate, mode: 'exclusive' };
  }

  /** Single source of truth — uses center vatCalc.mode setting */
  function calcVatBreakdown(amount, vatRate, stored) {
    const amt = Math.max(0, parseFloat(amount) || 0);
    const rate = vatRate != null ? parseFloat(vatRate) : getVatRate();
    const mode = getVatCalcMode();
    if (mode === 'exclusive') {
      if (stored && stored.preTax != null && stored.vat != null && stored.mode === 'exclusive') {
        return { preTax: stored.preTax, vat: stored.vat, total: stored.preTax + stored.vat, vatRate: rate, mode: 'exclusive' };
      }
      return calcVatExclusiveBreakdown(amt, rate);
    }
    const b = calcVatInclusiveBreakdown(amt, rate, stored);
    return { ...b, mode: 'inclusive' };
  }

  function isTaxInvoiceCase(c) {
    return !!(c && (c.isTaxInvoice || c.taxInvoiceIssued));
  }

  function getTaxInvoiceBreakdown(c) {
    if (!c) return calcVatBreakdown(0);
    const base = c.taxInvoiceBase != null ? c.taxInvoiceBase : (c.total || 0);
    return resolveTaxInvoiceBreakdown(c, base);
  }

  function isForeignClient(c) {
    if (!c) return false;
    const nat = (c.nationality || '').trim();
    if (nat === 'أجنبي') return true;
    const regList = global.clientsRegistry;
    if (c.clientRegistryId && Array.isArray(regList)) {
      const reg = regList.find(x => x.id === c.clientRegistryId);
      if (reg?.nationality === 'أجنبي') return true;
    }
    return false;
  }

  function resolveTaxInvoiceBreakdown(c, baseAmount) {
    const base = Math.max(0, parseFloat(baseAmount) || 0);
    if (isForeignClient(c)) {
      const b = calcVatExclusiveBreakdown(base, getVatRate());
      return { ...b, foreignTaxAdd: true };
    }
    const b = calcVatBreakdown(base, getVatRate());
    return { ...b, foreignTaxAdd: false };
  }

  function adjustCasePaymentToTotal(c, newTotal) {
    const total = Math.max(0, parseFloat(newTotal) || 0);
    c.total = total;
    const cash = c.cash || 0;
    const card = c.card || 0;
    const paid = cash + card;
    if (paid <= 0.001) {
      c.cash = total;
      return;
    }
    if (cash > 0 && card <= 0) c.cash = total;
    else if (card > 0 && cash <= 0) c.card = total;
    else {
      const ratio = cash / paid;
      c.cash = Math.round(total * ratio * 100) / 100;
      c.card = Math.round((total - c.cash) * 100) / 100;
    }
  }

  function applyTaxInvoiceFields(c, baseAmount) {
    if (!c) return null;
    const base = Math.max(0, parseFloat(baseAmount) || 0);
    const b = resolveTaxInvoiceBreakdown(c, base);
    c.isTaxInvoice = true;
    c.taxInvoiceIssued = true;
    c.taxInvoiceIssuedAt = c.taxInvoiceIssuedAt || new Date().toISOString();
    c.taxInvoiceBase = b.foreignTaxAdd ? b.preTax : (b.mode === 'exclusive' ? b.preTax : base);
    c.preTax = b.preTax;
    c.vat = b.vat;
    c.taxInvoiceTotal = b.total;
    const needsPayAdjust = b.foreignTaxAdd || (getVatCalcMode() === 'exclusive' && b.total > base + 0.01);
    if (needsPayAdjust && b.total > (parseFloat(c.total) || 0) + 0.01) {
      adjustCasePaymentToTotal(c, b.total);
      c.taxPaymentAdjusted = true;
    }
    return c;
  }

  function markCaseAsTaxInvoice(caseId, options) {
    const list = global.cases;
    if (!list) return null;
    const c = list.find(x => x.id === caseId);
    if (!c) return null;
    if (options?.confirm !== false && typeof global.confirm === 'function') {
      const foreign = isForeignClient(c);
      const extra = foreign
        ? '\n\nملاحظة: عميل أجنبي — سيتم إضافة ضريبة القيمة المضافة على المبلغ المدفوع ليتطابق مع التقارير.'
        : (getVatCalcMode() === 'exclusive' ? '\n\nملاحظة: الأسعار غير شاملة للضريبة — سيتم تحديث مبلغ الدفع.' : '');
      const msg = 'تأكيد إصدار فاتورة ضريبية؟\nسيتم تسجيلها في تقارير VAT وZATCA.' + extra;
      if (!global.confirm(msg)) return null;
    }
    applyTaxInvoiceFields(c, c.taxInvoiceBase != null ? c.taxInvoiceBase : (c.total || 0));
    if (global.SyncedWrite?.upsertRecord) global.SyncedWrite.upsertRecord('cases', c);
    else throw new Error('SyncedWrite unavailable');
    global.logAudit?.('TAX_INVOICE_ISSUED', `فاتورة ضريبية: ${c.invoice}`, { caseId, invoice: c.invoice, total: c.taxInvoiceTotal || c.total });
    return c;
  }

  /** Aggregate tax invoices: sum gross totals first, then extract VAT (reduces rounding drift) */
  function aggregateTaxInvoiceVat(taxCases) {
    const list = (taxCases || []).filter(isTaxInvoiceCase);
    const grossTotal = list.reduce((s, c) => s + (c.taxInvoiceTotal != null ? c.taxInvoiceTotal : (c.total || 0)), 0);
    const rate = getVatRate();
    const preTax = grossTotal / (1 + rate / 100);
    const vat = grossTotal - preTax;
    return { preTax, vat, total: grossTotal, vatRate: rate, mode: getVatCalcMode() };
  }

  function getTaxInvoiceCases(allCases) {
    return (allCases || global.cases || []).filter(isTaxInvoiceCase);
  }

  function getClientDefaultInvoiceType(client) {
    const t = client?.defaultInvoiceType || client?.invoiceType || 'normal';
    return t === 'tax' ? 'tax' : 'normal';
  }

  function clientWantsTaxInvoice(client) {
    return getClientDefaultInvoiceType(client) === 'tax';
  }

  function applyNormalCaseFinancials(c, baseAmount) {
    if (!c) return null;
    const base = Math.max(0, parseFloat(baseAmount) || 0);
    c.total = base;
    c.preTax = base;
    c.vat = 0;
    c.isTaxInvoice = false;
    c.taxInvoiceIssued = false;
    delete c.taxInvoiceTotal;
    delete c.taxInvoiceBase;
    delete c.taxInvoiceIssuedAt;
    return c;
  }

  /** Daily sale base amount — apply tax only when client default is tax invoice */
  function finalizeCaseFinancials(c, baseAmount, client) {
    if (!c) return null;
    if (clientWantsTaxInvoice(client)) return applyTaxInvoiceFields(c, baseAmount);
    return applyNormalCaseFinancials(c, baseAmount);
  }

  /** VAT-inclusive breakdown: Subtotal = Total ÷ (1 + rate/100) */
  function calcVatInclusiveBreakdown(total, vatRate, stored) {
    const t = Math.max(0, parseFloat(total) || 0);
    const rate = vatRate != null ? parseFloat(vatRate) : getVatRate();
    if (stored && stored.preTax != null && stored.vat != null && Math.abs((stored.preTax + stored.vat) - t) < 0.02) {
      return { preTax: stored.preTax, vat: stored.vat, total: t, vatRate: rate };
    }
    const preTax = t / (1 + rate / 100);
    const vat = t - preTax;
    return { preTax, vat, total: t, vatRate: rate };
  }

  function toTlvBytes(tag, value) {
    const enc = new TextEncoder();
    const valBytes = enc.encode(String(value));
    const out = new Uint8Array(2 + valBytes.length);
    out[0] = tag;
    out[1] = valBytes.length;
    out.set(valBytes, 2);
    return out;
  }

  function concatBytes(chunks) {
    const len = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(len);
    let off = 0;
    chunks.forEach(c => { out.set(c, off); off += c.length; });
    return out;
  }

  /** ZATCA simplified tax invoice QR — TLV tags 1–5, Base64 */
  function buildZatcaSimplifiedQrBase64(sellerName, vatNumber, timestampIso, totalWithVat, vatTotal) {
    const chunks = [
      toTlvBytes(1, sellerName || ''),
      toTlvBytes(2, vatNumber || ''),
      toTlvBytes(3, timestampIso || new Date().toISOString()),
      toTlvBytes(4, Number(totalWithVat).toFixed(2)),
      toTlvBytes(5, Number(vatTotal).toFixed(2))
    ];
    const bytes = concatBytes(chunks);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  function zatcaQrImageUrl(payloadBase64, size) {
    const display = parseInt(size, 10) || 160;
    const render = Math.max(Math.round(display * 2), 192);
    // Local data: URL — works offline and under CSP img-src 'self' data: blob:
    if (global.CuppingQr && typeof global.CuppingQr.makeDataUrl === 'function') {
      const local = global.CuppingQr.makeDataUrl(payloadBase64, {
        size: render,
        ecc: 'M',
        marginModules: 2,
      });
      if (local) return local;
    }
    return '';
  }

  function formatTaxInvoiceLabel(invoice) {
    if (typeof global.formatInvoiceDisplay === 'function') return global.formatInvoiceDisplay(invoice);
    const n = String(invoice ?? '').trim();
    return n ? `فاتورة: ${n}` : 'فاتورة';
  }

  function resolveReceiptCase(c) {
    if (!c) return null;
    if (c.sharedRole === 'partner' && c.sharedSessionId && global.cases) {
      const primary = global.cases.find(x => x.sharedSessionId === c.sharedSessionId && x.sharedRole === 'primary');
      if (primary) return primary;
    }
    return c;
  }

  function buildServiceLines(rc) {
    const fmt = global.fmtMoney || (v => String(v));
    const fmtN = global.fmtNum || (v => String(v));
    const rate = getVatRate();
    const svcType = rc.serviceType || 'حجامة رطبة';
    const hasPkg = !!(rc.packageId && rc.packageName);
    const lines = [];
    const lineAmount = (gross) => {
      const b = calcVatBreakdown(gross, rate);
      return { gross: b.total, preTax: b.preTax, vat: b.vat };
    };
    if (hasPkg) {
      const pkg = lineAmount((rc.packagePrice || 0) + (rc.extraPackageAmount || 0));
      lines.push(`<tr><td>باقة: ${rc.packageName}</td><td class="num" dir="ltr">${fmtN(rc.cups || rc.packageCups || 0, 0)}</td><td class="money" dir="ltr">${fmt(pkg.preTax)}</td><td class="money" dir="ltr">${fmt(pkg.vat)}</td><td class="money" dir="ltr">${fmt(pkg.gross)}</td></tr>`);
    } else {
      const gross = (rc.cups || 0) * (global.getServiceUnitPrice?.(svcType) || 0) || rc.total || 0;
      const main = lineAmount(gross);
      lines.push(`<tr><td>${svcType}</td><td class="num" dir="ltr">${fmtN(rc.cups, 0)}</td><td class="money" dir="ltr">${fmt(main.preTax)}</td><td class="money" dir="ltr">${fmt(main.vat)}</td><td class="money" dir="ltr">${fmt(main.gross)}</td></tr>`);
    }
    (rc.extraServices || []).filter(s => (s.price || 0) > 0).forEach(s => {
      const ex = lineAmount(s.price);
      lines.push(`<tr><td>${s.svc || s.name || 'خدمة'}</td><td class="num" dir="ltr">1</td><td class="money" dir="ltr">${fmt(ex.preTax)}</td><td class="money" dir="ltr">${fmt(ex.vat)}</td><td class="money" dir="ltr">${fmt(ex.gross)}</td></tr>`);
    });
    return lines.join('');
  }

  function stripThermalContactQrSection(html) {
    return html.replace(/\s*<!-- ══ QR CODES \(side by side\) ══ -->\s*<div class="rd"><\/div>\s*<div class="rqrrow">[\s\S]*?<\/div>/, '');
  }

  function buildSimplifiedTaxThermalHTML(caseInput) {
    const c = resolveReceiptCase(caseInput);
    if (!c || typeof global.buildReceiptHTML !== 'function') return '';
    const s = global.settings || {};
    const taxCfg = ensureSimplifiedTaxSettings();
    const cn = s.centerName || 'مركز الحجامة';
    const taxNum = s.taxNum || '';
    const fmt = global.fmtMoney || (v => String(v));
    const breakdown = getTaxInvoiceBreakdown(c);
    const qrTotal = breakdown.total;
    const qrVat = breakdown.vat;
    const ts = c.createdAt
      ? new Date(c.createdAt).toISOString()
      : new Date(`${c.date}T12:00:00`).toISOString();
    const qrPayload = buildZatcaSimplifiedQrBase64(cn, taxNum, ts, breakdown.total, breakdown.vat);
    const paperW = s.devices?.thermal?.paperWidth || 80;
    const qrSz = paperW <= 58 ? 120 : 160;
    const qrUrl = zatcaQrImageUrl(qrPayload, qrSz);
    let html = global.buildReceiptHTML(c);
    if (taxCfg.showContactQrOnThermal === false) {
      html = stripThermalContactQrSection(html);
    }
    const titleBlock = `<div class="rrow r-sec" style="text-align:center;font-weight:900"><span>فاتورة ضريبية مبسطة</span></div>
      <div class="rc" style="text-align:center;font-weight:800">${formatTaxInvoiceLabel(c.invoice)}</div><div class="rd"></div>`;
    html = html.replace('<div class="receipt">', `<div class="receipt">\n      ${titleBlock}`);
    const taxBlock = `
      <div class="rd"></div>
      ${taxNum ? `<div class="rrow"><span class="r-lbl">الرقم الضريبي / VAT No</span><span class="r-val" dir="ltr">${taxNum}</span></div>` : ''}
      <div class="rrow"><span class="r-lbl">قبل الضريبة / Before VAT</span><span class="r-val" dir="ltr">${fmt(breakdown.preTax)}</span></div>
      <div class="rrow"><span class="r-lbl">ضريبة ${breakdown.vatRate}% / VAT Amount</span><span class="r-val" dir="ltr">${fmt(breakdown.vat)}</span></div>
      <div class="rrow"><span class="r-lbl" style="font-weight:900">شامل الضريبة / Total Incl. VAT</span><span class="r-val" dir="ltr" style="font-weight:900">${fmt(breakdown.total)}</span></div>
      <div class="rd"></div>
      <div class="rqrrow" style="justify-content:center"><img src="${qrUrl}" width="${qrSz}" height="${qrSz}" alt="ZATCA QR"></div>`;
    if (html.includes('<div class="rfooter">')) {
      html = html.replace('<div class="rfooter">', taxBlock + '\n      <div class="rfooter">');
    } else {
      html += taxBlock;
    }
    return html;
  }

  function buildSimplifiedTaxInvoiceA4HTML(caseInput) {
    const c = resolveReceiptCase(caseInput);
    if (!c) return '';
    const s = global.settings || {};
    const cn = s.centerName || 'مركز الحجامة';
    const addr = s.address || '';
    const phone = s.phone || '';
    const taxNum = s.taxNum || '';
    const crNum = s.crNum || '';
    const fmt = global.fmtMoney || (v => String(v));
    const fmtD = global.fmtDate || (v => v);
    const breakdown = getTaxInvoiceBreakdown(c);
    const qrTotal = breakdown.total;
    const qrVat = breakdown.vat;
    const ts = c.createdAt
      ? new Date(c.createdAt).toISOString()
      : new Date(`${c.date}T12:00:00`).toISOString();
    const qrPayload = buildZatcaSimplifiedQrBase64(cn, taxNum, ts, breakdown.total, breakdown.vat);
    const qrSz = 160;
    const qrUrl = zatcaQrImageUrl(qrPayload, qrSz);
    const logoSrc = global.getCenterBrandLogo?.() || s.brandLogo || '';
    const hdr = global.buildUnifiedReportHeader
      ? global.buildUnifiedReportHeader('فاتورة ضريبية مبسطة', 'Simplified Tax Invoice', [
        `رقم الفاتورة: <span dir="ltr">${c.invoice}</span>`,
        taxNum ? `الرقم الضريبي: <span dir="ltr">${taxNum}</span>` : '',
        crNum ? `السجل التجاري: <span dir="ltr">${crNum}</span>` : ''
      ].filter(Boolean), { date: c.createdAt || c.date, logo: true })
      : `<div class="hdr"><h1>${cn}</h1><p class="meta">فاتورة ضريبية مبسطة</p></div>`;

    const customer = c.isSharedVisit && c.sharedPartner
      ? `${c.name} + ${c.sharedPartner.name} (جلسة مشتركة)`
      : (c.name || '—');

    return `${hdr}
      <style>
        .tax-inv-table{width:100%;border-collapse:collapse;margin:12px 0;font-size:11pt}
        .tax-inv-table th,.tax-inv-table td{border:1px solid #cfd8d3;padding:8px 10px;text-align:right;vertical-align:middle}
        .tax-inv-table thead th{background:#1a4a3a;color:#fff;font-weight:700;text-align:center}
        .tax-inv-table td.money,.tax-inv-table th.money{text-align:left;direction:ltr;white-space:nowrap;font-weight:700}
        .tax-inv-table td.num,.tax-inv-table th.num{text-align:center;direction:ltr;width:64px}
        .tax-inv-table tbody tr:nth-child(even){background:#f7faf9}
        .tax-inv-summary{width:100%;max-width:360px;margin-right:auto;margin-top:12px;border-collapse:collapse}
        .tax-inv-summary td{padding:7px 10px;border:1px solid #cfd8d3}
        .tax-inv-summary .lbl{font-weight:700;color:#1a4a3a}
        .tax-inv-summary .val{text-align:left;direction:ltr;font-weight:800}
        .tax-inv-summary .total{background:#1a4a3a;color:#fff}
      </style>
      <div class="boxes" style="margin-bottom:14px">
        <div class="box"><div class="lbl">العميل</div><div class="val" style="font-size:11pt">${customer}</div></div>
        <div class="box"><div class="lbl">التاريخ</div><div class="val" dir="ltr">${fmtD(c.date)}</div></div>
        <div class="box"><div class="lbl">الأخصائي</div><div class="val" style="font-size:11pt">${c.doctorName || '—'}</div></div>
        <div class="box"><div class="lbl">رقم الفاتورة</div><div class="val" dir="ltr">${c.invoice || '—'}</div></div>
      </div>
      <h2 style="font-size:14px;margin:8px 0">تفاصيل الخدمات / Services</h2>
      <table class="tax-inv-table">
        <thead><tr>
          <th style="width:38%">البيان / Description</th>
          <th class="num">الكمية</th>
          <th class="money">قبل الضريبة</th>
          <th class="money">الضريبة ${breakdown.vatRate}%</th>
          <th class="money">شامل الضريبة</th>
        </tr></thead>
        <tbody>
          ${buildServiceLines(c)}
          ${(c.discountAmt || 0) > 0 ? `<tr><td colspan="4" style="color:#c0392b;font-weight:700">خصم / Discount</td><td class="money" style="color:#c0392b">- ${fmt(c.discountAmt)}</td></tr>` : ''}
        </tbody>
      </table>
      <table class="tax-inv-summary">
        <tr><td class="lbl">الإجمالي قبل الضريبة</td><td class="val">${fmt(breakdown.preTax)}</td></tr>
        <tr><td class="lbl">ضريبة القيمة المضافة (${breakdown.vatRate}%)</td><td class="val">${fmt(breakdown.vat)}</td></tr>
        <tr class="total"><td class="lbl">الإجمالي شامل الضريبة</td><td class="val">${fmt(breakdown.total)}</td></tr>
      </table>
      <div style="text-align:center;margin:18px 0 8px">
        <div style="font-weight:900;margin-bottom:8px">رمز الاستجابة السريعة — ZATCA QR</div>
        <img src="${qrUrl}" width="${qrSz}" height="${qrSz}" alt="ZATCA QR" style="border:1px solid #ddd;padding:6px;border-radius:8px">
      </div>
      ${addr || phone ? `<p class="meta" style="margin-top:10px">${[addr, phone ? `📞 ${phone}` : ''].filter(Boolean).join(' · ')}</p>` : ''}
      <div style="margin-top:18px;padding-top:12px;border-top:1px solid #ddd;text-align:center;font-size:11px;color:#666;line-height:1.7">
        <div style="font-weight:800;color:#333;margin-bottom:4px">${cn}</div>
        <div>فاتورة ضريبية مبسطة — Simplified Tax Invoice</div>
        ${taxNum ? `<div dir="ltr">VAT: ${taxNum}</div>` : ''}
        <div style="margin-top:6px">هذه وثيقة ضريبية صادرة إلكترونياً</div>
      </div>
      ${global.printFooterDiv ? global.printFooterDiv() : ''}`;
  }

  async function printSimplifiedTaxThermal(caseId, options) {
    if (!isSimplifiedTaxInvoiceEnabled()) {
      global.notify?.('⚠️ الفاتورة الضريبية المبسطة غير مفعّلة — فعّلها من إعدادات المركز', 'warning');
      return { ok: false, reason: 'disabled' };
    }
    const c = global.cases?.find(x => x.id === caseId);
    if (!c) {
      global.notify?.('⚠️ لم يتم العثور على الفاتورة', 'danger');
      return { ok: false, reason: 'not_found' };
    }
    const marked = markCaseAsTaxInvoice(caseId, { confirm: options?.confirm !== false });
    if (!marked) return { ok: false, reason: 'cancelled' };
    const html = buildSimplifiedTaxThermalHTML(marked);
    if (global.printThermalDoc) {
      await global.printThermalDoc(html, '🖨️ تم إرسال الفاتورة الضريبية الحرارية للطباعة');
    } else if (global.printHTML) {
      await global.printHTML(html, false, { documentTitle: `Tax-Thermal-${c.invoice}` });
    }
    return { ok: true };
  }

  async function printSimplifiedTaxInvoiceA4(caseId, options) {
    if (!isSimplifiedTaxInvoiceEnabled()) {
      global.notify?.('⚠️ الفاتورة الضريبية المبسطة غير مفعّلة', 'warning');
      return { ok: false, reason: 'disabled' };
    }
    const c = global.cases?.find(x => x.id === caseId);
    if (!c) {
      global.notify?.('⚠️ لم يتم العثور على الفاتورة', 'danger');
      return { ok: false, reason: 'not_found' };
    }
    const marked = markCaseAsTaxInvoice(caseId, { confirm: options?.confirm !== false });
    if (!marked) return { ok: false, reason: 'cancelled' };
    const html = buildSimplifiedTaxInvoiceA4HTML(marked);
    if (global.printHTML) {
      await global.printHTML(html, false, { documentTitle: `Tax-Invoice-A4-${marked.invoice}` });
    } else if (global.HardwareBridge?.printA4) {
      await global.HardwareBridge.printA4(html, { documentTitle: `Tax-Invoice-A4-${marked.invoice}` });
    }
    global.notify?.('🖨️ تم إرسال الفاتورة الضريبية A4 للطباعة');
    return { ok: true };
  }

  /** @deprecated use printSimplifiedTaxThermal or printSimplifiedTaxInvoiceA4 */
  async function printSimplifiedTaxInvoice(caseId) {
    return printSimplifiedTaxThermal(caseId);
  }

  function exportSimplifiedTaxInvoiceA4(caseId, options) {
    if (!isSimplifiedTaxInvoiceEnabled()) {
      global.notify?.('⚠️ الفاتورة الضريبية المبسطة غير مفعّلة', 'warning');
      return;
    }
    const c = global.cases?.find(x => x.id === caseId);
    if (!c) return;
    const marked = markCaseAsTaxInvoice(caseId, { confirm: options?.confirm !== false });
    if (!marked) return;
    const html = buildSimplifiedTaxInvoiceA4HTML(marked);
    const blob = new Blob([`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>Tax A4 ${marked.invoice}</title></head><body>${html}</body></html>`], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `فاتورة-ضريبية-A4-${marked.invoice}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    global.notify?.('✅ تم تصدير الفاتورة الضريبية A4');
  }

  function exportSimplifiedTaxInvoice(caseId) {
    exportSimplifiedTaxInvoiceA4(caseId);
  }

  function toggleSimplifiedTaxInvoiceUI(enabled) {
    if (!isInvoiceSystemEnabled()) enabled = false;
    ensureSimplifiedTaxSettings();
    global.settings.simplifiedTaxInvoice.enabled = !!enabled;
    if (global.DB) global.DB.set('settings', global.settings);
    document.querySelectorAll('.simplified-tax-invoice-action').forEach(el => {
      el.style.display = enabled ? '' : 'none';
    });
    document.querySelectorAll('.simplified-tax-invoice-settings-detail').forEach(el => {
      el.style.display = enabled ? '' : 'none';
    });
  }

  function toggleTaxContactQrSetting(enabled) {
    ensureSimplifiedTaxSettings();
    global.settings.simplifiedTaxInvoice.showContactQrOnThermal = !!enabled;
    if (global.DB) global.DB.set('settings', global.settings);
  }

  function saveZatcaSettings() {
    const taxEl = document.getElementById('set-tax-num');
    if (taxEl) global.settings.taxNum = taxEl.value.trim();
    if (typeof saveInvoiceVatFromCenterSettings === 'function') saveInvoiceVatFromCenterSettings();
    const modeEl = document.getElementById('set-vat-calc-mode');
    if (modeEl) setVatCalcMode(modeEl.value);
    const qrCb = document.getElementById('set-tax-show-contact-qr');
    if (qrCb) {
      ensureSimplifiedTaxSettings();
      global.settings.simplifiedTaxInvoice.showContactQrOnThermal = !!qrCb.checked;
    }
    if (global.DB) global.DB.set('settings', global.settings);
    global.notify?.('✅ تم حفظ إعدادات ZATCA');
  }

  function loadVatCalcUI() {
    ensureVatCalcSettings();
    const modeEl = document.getElementById('set-vat-calc-mode');
    if (modeEl) modeEl.value = getVatCalcMode();
  }

  function renderZatcaQrPreview() {
    const host = document.getElementById('set-tax-qr-preview');
    const taxEl = document.getElementById('set-tax-num');
    if (!host || !taxEl) return;
    const taxNum = (taxEl.value || '').trim();
    if (!taxNum || taxNum.length < 10) {
      host.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">أدخل الرقم الضريبي لمعاينة رمز QR</div>';
      return;
    }
    const cn = global.settings?.centerName || 'مركز الحجامة';
    const payload = buildZatcaSimplifiedQrBase64(cn, taxNum, new Date().toISOString(), '100.00', '15.00');
    const url = zatcaQrImageUrl(payload, 132);
    host.innerHTML = `<img src="${url}" width="132" height="132" alt="ZATCA QR preview" style="display:block;margin:0 auto;border:1px solid var(--border);border-radius:8px;padding:6px;background:#fff">`;
  }

  function bindZatcaQrPreview() {
    const taxEl = document.getElementById('set-tax-num');
    if (!taxEl || taxEl.dataset.qrPreviewBound) return;
    taxEl.dataset.qrPreviewBound = '1';
    taxEl.addEventListener('input', renderZatcaQrPreview);
    taxEl.addEventListener('change', renderZatcaQrPreview);
    renderZatcaQrPreview();
  }

  function loadSimplifiedTaxInvoiceUI() {
    ensureSimplifiedTaxSettings();
    loadVatCalcUI();
    const cb = document.getElementById('set-simplified-tax-invoice');
    if (cb) cb.checked = !!global.settings.simplifiedTaxInvoice.enabled;
    const qrCb = document.getElementById('set-tax-show-contact-qr');
    if (qrCb) qrCb.checked = global.settings.simplifiedTaxInvoice.showContactQrOnThermal !== false;
    toggleSimplifiedTaxInvoiceUI(!!global.settings.simplifiedTaxInvoice.enabled);
    bindZatcaQrPreview();
  }

  /** Validation helper for tests */
  function validateVatMath(total, vatRate) {
    const b = calcVatInclusiveBreakdown(total, vatRate);
    const round2 = n => Math.round(n * 100) / 100;
    return {
      preTax: round2(b.preTax),
      vat: round2(b.vat),
      total: round2(b.total),
      check100: round2(b.preTax) === 86.96 && round2(b.vat) === 13.04 && round2(b.total) === 100
    };
  }

  global.ensureInvoiceSystemSettings = ensureInvoiceSystemSettings;
  global.isInvoiceSystemEnabled = isInvoiceSystemEnabled;
  global.toggleInvoiceSystemUI = toggleInvoiceSystemUI;
  global.applyInvoiceSystemVisibility = applyInvoiceSystemVisibility;
  global.loadInvoiceSystemUI = loadInvoiceSystemUI;
  global.ensureSimplifiedTaxSettings = ensureSimplifiedTaxSettings;
  global.isSimplifiedTaxInvoiceEnabled = isSimplifiedTaxInvoiceEnabled;
  global.calcVatInclusiveBreakdown = calcVatInclusiveBreakdown;
  global.calcVatBreakdown = calcVatBreakdown;
  global.calcVatExclusiveBreakdown = calcVatExclusiveBreakdown;
  global.getVatCalcMode = getVatCalcMode;
  global.setVatCalcMode = setVatCalcMode;
  global.ensureVatCalcSettings = ensureVatCalcSettings;
  global.isTaxInvoiceCase = isTaxInvoiceCase;
  global.isForeignClient = isForeignClient;
  global.resolveTaxInvoiceBreakdown = resolveTaxInvoiceBreakdown;
  global.adjustCasePaymentToTotal = adjustCasePaymentToTotal;
  global.getTaxInvoiceBreakdown = getTaxInvoiceBreakdown;
  global.markCaseAsTaxInvoice = markCaseAsTaxInvoice;
  global.applyTaxInvoiceFields = applyTaxInvoiceFields;
  global.applyNormalCaseFinancials = applyNormalCaseFinancials;
  global.finalizeCaseFinancials = finalizeCaseFinancials;
  global.getClientDefaultInvoiceType = getClientDefaultInvoiceType;
  global.clientWantsTaxInvoice = clientWantsTaxInvoice;
  global.aggregateTaxInvoiceVat = aggregateTaxInvoiceVat;
  global.getTaxInvoiceCases = getTaxInvoiceCases;
  global.loadVatCalcUI = loadVatCalcUI;
  global.buildZatcaSimplifiedQrBase64 = buildZatcaSimplifiedQrBase64;
  global.buildSimplifiedTaxThermalHTML = buildSimplifiedTaxThermalHTML;
  global.buildSimplifiedTaxInvoiceA4HTML = buildSimplifiedTaxInvoiceA4HTML;
  global.buildSimplifiedTaxInvoiceHTML = buildSimplifiedTaxInvoiceA4HTML;
  global.printSimplifiedTaxThermal = printSimplifiedTaxThermal;
  global.printSimplifiedTaxInvoiceA4 = printSimplifiedTaxInvoiceA4;
  global.printSimplifiedTaxInvoice = printSimplifiedTaxInvoice;
  global.exportSimplifiedTaxInvoiceA4 = exportSimplifiedTaxInvoiceA4;
  global.exportSimplifiedTaxInvoice = exportSimplifiedTaxInvoice;
  global.toggleSimplifiedTaxInvoiceUI = toggleSimplifiedTaxInvoiceUI;
  global.toggleTaxContactQrSetting = toggleTaxContactQrSetting;
  global.saveZatcaSettings = saveZatcaSettings;
  global.loadSimplifiedTaxInvoiceUI = loadSimplifiedTaxInvoiceUI;
  global.SimplifiedTaxInvoice = {
    enabled: isSimplifiedTaxInvoiceEnabled,
    calcBreakdown: calcVatBreakdown,
    buildThermalHtml: buildSimplifiedTaxThermalHTML,
    buildA4Html: buildSimplifiedTaxInvoiceA4HTML,
    buildHtml: buildSimplifiedTaxInvoiceA4HTML,
    printThermal: printSimplifiedTaxThermal,
    printA4: printSimplifiedTaxInvoiceA4,
    print: printSimplifiedTaxThermal,
    exportA4: exportSimplifiedTaxInvoiceA4,
    export: exportSimplifiedTaxInvoiceA4,
    validateVatMath
  };
})(typeof window !== 'undefined' ? window : globalThis);
