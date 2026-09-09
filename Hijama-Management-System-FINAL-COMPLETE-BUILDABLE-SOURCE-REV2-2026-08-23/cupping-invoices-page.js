/**
 * صفحة إدارة الفواتير — يعتمد على بيانات الحالات (cases) الحالية دون تغيير قاعدة البيانات.
 */
(function (global) {
  'use strict';

  let invoicesPage = global._invoicesListPage || 1;

  function el(id) { return document.getElementById(id); }

  function canViewInvoices() {
    return typeof hasPermission === 'function' ? hasPermission('cases.view') : true;
  }

  function canEditInvoices() {
    return typeof hasPermission === 'function' ? hasPermission('cases.edit') : true;
  }

  function taxEnabled() {
    return typeof isSimplifiedTaxInvoiceEnabled === 'function' && isSimplifiedTaxInvoiceEnabled();
  }

  function rowUnified(primary, more) {
    if (typeof global.actionBtnRowUnified === 'function') {
      return global.actionBtnRowUnified(primary, more, { maxPrimary: 4 });
    }
    const ab = global.actionBtn || (() => '');
    const html = [...(primary || []), ...(more || [])].map(a =>
      ab(a.icon, a.short || a.label, { cls: a.cls, title: a.title || a.label, onclick: a.onclick, feature: a.feature, extraClass: a.extraClass })
    ).join('');
    return typeof global.actionBtnRow === 'function' ? global.actionBtnRow(html) : `<div class="table-action-btns">${html}</div>`;
  }

  function getInvoiceFilters() {
    return {
      q: (el('inv-filter-q')?.value || '').trim().toLowerCase(),
      field: el('inv-filter-field')?.value || 'all',
      dateFrom: el('inv-filter-from')?.value || '',
      dateTo: el('inv-filter-to')?.value || '',
      payment: el('inv-filter-payment')?.value || 'all',
      type: el('inv-filter-type')?.value || 'all'
    };
  }

  function matchPayment(c, payment) {
    const cash = (c.cash || 0) > 0;
    const card = (c.card || 0) > 0;
    if (payment === 'cash') return cash && !card;
    if (payment === 'card') return card && !cash;
    if (payment === 'mixed') return cash && card;
    return true;
  }

  function matchType(c, type) {
    if (type === 'package') return !!(c.packageId && c.packageName);
    if (type === 'session') return !c.packageId;
    return true;
  }

  function filterInvoices(list) {
    const f = getInvoiceFilters();
    return list.filter(c => {
      if (f.dateFrom && c.date < f.dateFrom) return false;
      if (f.dateTo && c.date > f.dateTo) return false;
      if (!matchPayment(c, f.payment)) return false;
      if (!matchType(c, f.type)) return false;
      if (!f.q) return true;
      if (f.field === 'name') return (c.name || '').toLowerCase().includes(f.q);
      if (f.field === 'phone') return (c.phone || '').includes(f.q);
      if (f.field === 'fileNo') return (c.fileNo || '').toLowerCase().includes(f.q);
      if (f.field === 'invoice') return String(c.invoice ?? '').toLowerCase().includes(f.q);
      if (f.field === 'id') return (c.patientId || '').includes(f.q);
      return (c.name || '').toLowerCase().includes(f.q) || (c.phone || '').includes(f.q) ||
        (c.fileNo || '').toLowerCase().includes(f.q) || String(c.invoice ?? '').toLowerCase().includes(f.q) ||
        (c.patientId || '').includes(f.q);
    });
  }

  function paymentLabel(c) {
    const cash = (c.cash || 0) > 0;
    const card = (c.card || 0) > 0;
    if (cash && card) return 'مختلط';
    if (card) return 'شبكة';
    if (cash) return 'كاش';
    return '—';
  }

  function typeLabel(c) {
    return (c.packageId && c.packageName) ? 'باقة' : 'جلسة';
  }

  function renderInvoiceActions(c) {
    const id = c.id;
    const primary = [
      { icon: '👁️', label: 'عرض', short: '', onclick: `viewInvoiceDetails('${id}')`, title: 'عرض التفاصيل' },
      { icon: '🖨️', label: 'حرارية', short: 'حرارية', cls: 'btn-accent', onclick: `reprintInvoiceThermal('${id}')`, title: 'فاتورة حرارية' }
    ];
    if (taxEnabled()) {
      primary.push({ icon: '🧾', label: 'ضريبية مبسطة', short: 'ضريبية', onclick: `reprintInvoiceTaxThermal('${id}')`, title: 'فاتورة ضريبية مبسطة حرارية' });
      primary.push({ icon: '📄', label: 'PDF A4', short: 'PDF', onclick: `exportInvoiceTaxPdf('${id}')`, title: 'تصدير PDF ضريبي A4' });
    }
    if (c.phone) {
      primary.push({ icon: '💬', label: 'واتساب', short: 'واتس', onclick: `sendInvoiceWhatsApp('${id}')`, title: 'إرسال واتساب' });
    }
    const more = [];
    if (taxEnabled()) {
      more.push({ icon: '📋', label: 'طباعة A4', onclick: `printInvoiceTaxA4('${id}')`, title: 'طباعة A4 ضريبية' });
    }
    more.push({ icon: '🖨️', label: 'إعادة إصدار', onclick: `reprintInvoiceThermal('${id}')`, title: 'إعادة طباعة حرارية' });
    if (canEditInvoices()) {
      more.push({ icon: '✏️', label: 'تعديل', onclick: `openEditCase('${id}')` });
      more.push({ icon: '🗑️', label: 'حذف', cls: 'btn-danger', danger: true, extraClass: 'admin-delete', onclick: `deleteCase('${id}');refreshInvoicesPage(false)` });
    }
    more.push({ icon: '📋', label: 'سجل الفاتورة', onclick: `viewInvoiceAuditLog('${id}')`, title: 'عرض في سجل النظام' });
    more.push({ icon: '📄', label: 'ملف العميل', feature: 'ops_client_file', onclick: `openClientFileFromInvoice('${id}')`, title: 'طباعة ملف العميل' });
    return rowUnified(primary, more);
  }

  function refreshInvoicesPage(resetPage) {
    invoicesPage = global._invoicesListPage || invoicesPage || 1;
    if (!canViewInvoices()) {
      const body = el('invoicesTableBody');
      if (body) body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--danger)">⛔ ليس لديك صلاحية عرض الفواتير</td></tr>';
      return;
    }
    if (resetPage !== false) { invoicesPage = 1; global._invoicesListPage = 1; }
    const body = el('invoicesTableBody');
    const countEl = el('invoices-count');
    const statsEl = el('invoices-stats');
    if (!body) return;

    const all = typeof cases !== 'undefined' ? cases : [];
    const filteredRaw = filterInvoices(all);
    const filtered = typeof sortClinicList === 'function'
      ? sortClinicList('invoices', filteredRaw, typeof caseListSortValue === 'function' ? caseListSortValue : function (c, field) {
          if (field === 'invoice') return String(c.invoice || '');
          if (field === 'fileNo') return String(c.fileNo || '');
          if (field === 'name') return c.name || '';
          if (field === 'created') return Date.parse(c.createdAt || c.date || 0) || 0;
          return c.date || '';
        })
      : filteredRaw.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.invoice).localeCompare(String(a.invoice)));
    const totalAmount = filtered.reduce((s, c) => s + (c.total || 0), 0);

    if (countEl) countEl.textContent = `${filtered.length} فاتورة`;
    if (statsEl) {
      statsEl.innerHTML = `
        <span class="inv-stat">📋 ${filtered.length}</span>
        <span class="inv-stat">💰 ${typeof fmtMoney === 'function' ? fmtMoney(totalAmount) : totalAmount}</span>`;
    }

    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-light)">لا توجد فواتير مطابقة للفلاتر</td></tr>';
      if (typeof renderTablePagination === 'function') renderTablePagination('invoicesPagination', 1, 0, 0, 'goInvoicesPage');
      return;
    }

    const pageSize = typeof getTablePageSize === 'function' ? getTablePageSize() : 10;
    const pg = typeof paginateList === 'function'
      ? paginateList(filtered, invoicesPage, pageSize)
      : { items: filtered.slice(0, pageSize), page: 1, totalPages: 1, total: filtered.length, pageSize };
    invoicesPage = pg.page;
    global._invoicesListPage = pg.page;
    if (typeof renderTablePagination === 'function') {
      renderTablePagination('invoicesPagination', pg.page, pg.totalPages, pg.total, 'goInvoicesPage');
    }

    const base = (pg.page - 1) * pg.pageSize;
    body.innerHTML = pg.items.map((c, i) => `
      <tr>
        <td class="col-index">${base + i + 1}</td>
        <td><strong style="color:var(--primary)">${c.invoice}</strong></td>
        <td class="col-date">${typeof fmtDateDayStack === 'function' ? fmtDateDayStack(c.date) : c.date}</td>
        <td><strong>${c.name}</strong><div style="font-size:11px;color:var(--text-muted)">${c.phone || '—'}</div></td>
        <td>${c.doctorName || '—'}</td>
        <td>${paymentLabel(c)}</td>
        <td class="currency"><strong>${typeof fmtMoney === 'function' ? fmtMoney(c.total) : c.total}</strong></td>
        <td class="actions-col">${renderInvoiceActions(c)}</td>
      </tr>`).join('');
  }

  function goInvoicesPage(page) {
    invoicesPage = Math.max(1, parseInt(page, 10) || 1);
    global._invoicesListPage = invoicesPage;
    refreshInvoicesPage(false);
  }

  function clearInvoicesFilters() {
    ['inv-filter-q', 'inv-filter-from', 'inv-filter-to'].forEach(id => {
      const n = el(id);
      if (n) n.value = '';
    });
    const field = el('inv-filter-field');
    const pay = el('inv-filter-payment');
    const type = el('inv-filter-type');
    if (field) field.value = 'all';
    if (pay) pay.value = 'all';
    if (type) type.value = 'all';
    refreshInvoicesPage();
  }

  function viewInvoiceDetails(id) {
    if (typeof showReceipt === 'function') showReceipt(id);
  }

  async function reprintInvoiceThermal(id) {
    const c = (typeof cases !== 'undefined' ? cases : []).find(x => x.id === id);
    if (!c || typeof printThermalDoc !== 'function' || typeof buildReceiptHTML !== 'function') return;
    await printThermalDoc(buildReceiptHTML(c), '🖨️ تم إرسال الفاتورة الحرارية للطباعة');
  }

  function reprintInvoiceTaxThermal(id) {
    if (typeof printSimplifiedTaxThermal === 'function') printSimplifiedTaxThermal(id, { confirm: true });
  }

  function printInvoiceTaxA4(id) {
    if (typeof printSimplifiedTaxInvoiceA4 === 'function') printSimplifiedTaxInvoiceA4(id, { confirm: true });
  }

  function exportInvoiceTaxPdf(id) {
    if (typeof exportSimplifiedTaxInvoiceA4 === 'function') exportSimplifiedTaxInvoiceA4(id, { confirm: true });
  }

  function printInvoiceTax(id) {
    reprintInvoiceTaxThermal(id);
  }

  function exportInvoicePdf(id) {
    exportInvoiceTaxPdf(id);
  }

  function sendInvoiceWhatsApp(id) {
    if (typeof sendReceiptWhatsApp === 'function') sendReceiptWhatsApp(id);
  }

  global._invoicesListPage = invoicesPage;
  global.refreshInvoicesPage = refreshInvoicesPage;
  global.goInvoicesPage = goInvoicesPage;
  global.clearInvoicesFilters = clearInvoicesFilters;
  global.viewInvoiceDetails = viewInvoiceDetails;
  global.reprintInvoiceThermal = reprintInvoiceThermal;
  global.reprintInvoiceTaxThermal = reprintInvoiceTaxThermal;
  global.printInvoiceTaxA4 = printInvoiceTaxA4;
  global.exportInvoiceTaxPdf = exportInvoiceTaxPdf;
  global.printInvoiceTax = printInvoiceTax;
  global.exportInvoicePdf = exportInvoicePdf;
  global.sendInvoiceWhatsApp = sendInvoiceWhatsApp;
})(typeof window !== 'undefined' ? window : globalThis);
