/**
 * Monthly Reports Archive — batch A4 print & PDF export
 */
(function (global) {
  'use strict';

  const MONTH_NAMES = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const LEAVE_STATUS = { pending: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض' };

  const REPORT_DEFS = [
    { id: 'today_last', label: 'كشف آخر يوم من الشهر', icon: '📅', basePages: 2, feature: null, group: 'daily' },
    { id: 'monthly', label: 'التقرير الشهري', icon: '📊', basePages: 3, feature: 'rep_monthly', group: 'finance' },
    { id: 'revenue', label: 'تقرير الإيرادات', icon: '💰', basePages: 1, feature: 'rep_monthly', group: 'finance' },
    { id: 'vat', label: 'تقرير ضريبة القيمة المضافة', icon: '🧾', basePages: 2, feature: 'rep_vat', group: 'finance' },
    { id: 'profitability', label: 'تقرير الربحية التشغيلية', icon: '📈', basePages: 1, feature: 'rep_profitability', group: 'finance' },
    { id: 'payroll', label: 'تقرير الرواتب', icon: '💵', basePages: 4, feature: 'pay_salary', group: 'hr' },
    { id: 'attendance', label: 'تقرير الحضور والانصراف', icon: '🕐', basePages: 3, feature: 'att_report', group: 'hr' },
    { id: 'leave', label: 'تقرير الإجازات', icon: '🏖️', basePages: 2, feature: 'hr_leave_balance', group: 'hr' },
    { id: 'doctors', label: 'تقرير الأطباء / الأخصائيين', icon: '👨‍⚕️', basePages: 2, feature: 'rep_doctors', group: 'ops' },
    { id: 'expenses', label: 'تقرير المصروفات', icon: '💸', basePages: 2, feature: null, group: 'finance' },
    { id: 'bookings', label: 'تقرير الحجوزات', icon: '📋', basePages: 2, feature: null, group: 'ops' },
    { id: 'inventory', label: 'تقرير المخزون', icon: '📦', basePages: 2, feature: 'ops_inventory', group: 'ops' },
    { id: 'inventory_movements', label: 'حركات المخزون', icon: '🔄', basePages: 2, feature: 'ops_inventory', group: 'ops' },
    { id: 'cash_float', label: 'تقرير عهدة الكاش', icon: '🔓', basePages: 1, feature: 'fin_cashfloat', group: 'finance' },
    { id: 'zreport_last', label: 'Z-Report آخر يوم من الشهر', icon: '📊', basePages: 2, feature: 'rep_zreport', group: 'daily' }
  ];

  const BUILTIN_TEMPLATES = {
    accounting: {
      name: 'أرشيف محاسبي',
      selection: ['monthly', 'revenue', 'vat', 'expenses', 'payroll', 'profitability', 'cash_float'],
      order: ['monthly', 'revenue', 'vat', 'expenses', 'payroll', 'profitability', 'cash_float'],
      includeCover: true,
      builtin: true
    },
    administrative: {
      name: 'أرشيف إداري',
      selection: ['monthly', 'attendance', 'leave', 'doctors', 'bookings', 'inventory', 'inventory_movements'],
      order: ['monthly', 'attendance', 'leave', 'doctors', 'bookings', 'inventory', 'inventory_movements'],
      includeCover: true,
      builtin: true
    },
    tax: {
      name: 'أرشيف ضريبي',
      selection: ['vat', 'monthly', 'revenue', 'today_last', 'zreport_last'],
      order: ['vat', 'monthly', 'revenue', 'today_last', 'zreport_last'],
      includeCover: true,
      builtin: true
    }
  };

  let _order = [];
  let _selected = new Set();
  let _activeTemplateId = '';

  function notify(msg, type) {
    if (typeof global.notify === 'function') global.notify(msg, type);
  }

  function syncOrderWithRegistry(savedOrder) {
    const known = new Set(REPORT_DEFS.map(r => r.id));
    const order = (savedOrder || []).filter(id => known.has(id));
    REPORT_DEFS.forEach(r => { if (!order.includes(r.id)) order.push(r.id); });
    return order;
  }

  function ensureArchiveSettings() {
    if (!global.settings) return;
    if (!global.settings.monthlyArchive) {
      global.settings.monthlyArchive = {
        lastSelection: ['monthly', 'vat', 'payroll', 'attendance', 'expenses'],
        order: REPORT_DEFS.map(r => r.id),
        includeCover: true,
        activeTemplateId: 'accounting',
        templates: {}
      };
    }
    const ma = global.settings.monthlyArchive;
    ma.order = syncOrderWithRegistry(ma.order);
    ma.lastSelection = ma.lastSelection || [];
    ma.templates = ma.templates || {};
    ma.activeTemplateId = ma.activeTemplateId || 'accounting';
    Object.entries(BUILTIN_TEMPLATES).forEach(([id, tpl]) => {
      if (!ma.templates[id]) ma.templates[id] = { ...tpl };
      else ma.templates[id] = { ...tpl, ...ma.templates[id], builtin: true, name: tpl.name };
    });
  }

  function getTemplateList() {
    ensureArchiveSettings();
    return Object.entries(global.settings.monthlyArchive.templates).map(([id, tpl]) => ({ id, ...tpl }));
  }

  function applyTemplate(id) {
    ensureArchiveSettings();
    const tpl = global.settings.monthlyArchive.templates[id];
    if (!tpl) return false;
    _activeTemplateId = id;
    global.settings.monthlyArchive.activeTemplateId = id;
    _selected = new Set((tpl.selection || []).filter(sid => REPORT_DEFS.some(r => r.id === sid)));
    _order = syncOrderWithRegistry(tpl.order || tpl.selection || global.settings.monthlyArchive.order);
    const coverEl = document.getElementById('ma-include-cover');
    if (coverEl) coverEl.checked = tpl.includeCover !== false;
    renderTemplateSelect();
    renderList();
    saveArchiveSettings();
    return true;
  }

  function saveCurrentAsTemplate() {
    const name = prompt('اسم القالب الجديد:', 'قالب مخصص');
    if (!name || !name.trim()) return;
    ensureArchiveSettings();
    const id = 'custom_' + Date.now();
    global.settings.monthlyArchive.templates[id] = {
      name: name.trim(),
      selection: [..._selected],
      order: [..._order],
      includeCover: !!document.getElementById('ma-include-cover')?.checked,
      builtin: false
    };
    _activeTemplateId = id;
    global.settings.monthlyArchive.activeTemplateId = id;
    global.DB?.set('settings', global.settings);
    renderTemplateSelect();
    notify('✅ تم حفظ القالب — سيُحمّل تلقائياً كل شهر', 'success');
  }

  function updateCurrentTemplate() {
    if (!_activeTemplateId) { saveCurrentAsTemplate(); return; }
    ensureArchiveSettings();
    const tpl = global.settings.monthlyArchive.templates[_activeTemplateId];
    if (!tpl) { saveCurrentAsTemplate(); return; }
    tpl.selection = [..._selected];
    tpl.order = [..._order];
    tpl.includeCover = !!document.getElementById('ma-include-cover')?.checked;
    global.DB?.set('settings', global.settings);
    notify(`✅ تم تحديث القالب «${tpl.name}»`, 'success');
  }

  function deleteTemplate(id) {
    ensureArchiveSettings();
    const tpl = global.settings.monthlyArchive.templates[id];
    if (!tpl || tpl.builtin) { notify('⚠️ لا يمكن حذف القوالب الافتراضية', 'danger'); return; }
    if (!confirm(`حذف القالب «${tpl.name}»؟`)) return;
    delete global.settings.monthlyArchive.templates[id];
    if (_activeTemplateId === id) {
      _activeTemplateId = 'accounting';
      global.settings.monthlyArchive.activeTemplateId = 'accounting';
      applyTemplate('accounting');
    }
    global.DB?.set('settings', global.settings);
    renderTemplateSelect();
    notify('✅ تم حذف القالب', 'success');
  }

  function renderTemplateSelect() {
    const sel = document.getElementById('ma-template-sel');
    if (!sel) return;
    const list = getTemplateList();
    sel.innerHTML = list.map(t => `<option value="${t.id}">${t.builtin ? '📁' : '📝'} ${t.name}</option>`).join('');
    sel.value = _activeTemplateId || global.settings.monthlyArchive.activeTemplateId || 'accounting';
    const delBtn = document.getElementById('ma-template-delete');
    const tpl = global.settings.monthlyArchive.templates[sel.value];
    if (delBtn) delBtn.style.display = tpl && !tpl.builtin ? '' : 'none';
  }

  function onTemplateChange() {
    const id = document.getElementById('ma-template-sel')?.value;
    if (id) applyTemplate(id);
  }

  function registerReport(def) {
    if (!def?.id || !def?.label) return false;
    if (REPORT_DEFS.some(r => r.id === def.id)) return false;
    REPORT_DEFS.push({
      id: def.id,
      label: def.label,
      icon: def.icon || '📄',
      basePages: def.basePages || 2,
      feature: def.feature || null,
      group: def.group || 'other',
      build: typeof def.build === 'function' ? def.build : null
    });
    ensureArchiveSettings();
    global.settings.monthlyArchive.order.push(def.id);
    global.DB?.set('settings', global.settings);
    return true;
  }

  function saveArchiveSettings() {
    ensureArchiveSettings();
    global.settings.monthlyArchive.lastSelection = [..._selected];
    global.settings.monthlyArchive.order = [..._order];
    global.settings.monthlyArchive.includeCover = !!document.getElementById('ma-include-cover')?.checked;
    global.settings.monthlyArchive.activeTemplateId = _activeTemplateId || global.settings.monthlyArchive.activeTemplateId;
    if (_activeTemplateId && global.settings.monthlyArchive.templates[_activeTemplateId]) {
      const tpl = global.settings.monthlyArchive.templates[_activeTemplateId];
      tpl.selection = [..._selected];
      tpl.order = [..._order];
      tpl.includeCover = !!document.getElementById('ma-include-cover')?.checked;
    }
    global.DB?.set('settings', global.settings);
  }

  function isReportEnabled(def) {
    if (!def.feature) return true;
    if (typeof global.isFeatureEnabled === 'function') return global.isFeatureEnabled(def.feature);
    return true;
  }

  function getVisibleReports() {
    return REPORT_DEFS.filter(isReportEnabled);
  }

  function getOrderedReports() {
    const visible = new Set(getVisibleReports().map(r => r.id));
    const order = _order.length ? _order : REPORT_DEFS.map(r => r.id);
    return order.filter(id => visible.has(id)).map(id => REPORT_DEFS.find(r => r.id === id)).filter(Boolean);
  }

  function lastDayOfMonth(year, month) {
    return new Date(year, month, 0).toISOString().slice(0, 10);
  }

  function withArchiveContext(ctx, fn) {
    const saved = {};
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) { saved[id] = el.value; el.value = val; }
    };
    set('rep-filter-mode', 'month');
    set('rep-month-sel', String(ctx.month));
    set('rep-year-sel', String(ctx.year));
    set('payrollMonth', String(ctx.month));
    set('payrollYear', String(ctx.year));
    set('exp-filter-month', String(ctx.month));
    set('exp-filter-year', String(ctx.year));
    set('att-rep-month', String(ctx.month));
    set('att-rep-year', String(ctx.year));
    set('doc-rep-month', String(ctx.month));
    set('doc-rep-year', String(ctx.year));
    set('doc-rep-mode', 'month');
    global._archiveContext = ctx;
    try { return fn(); }
    finally {
      global._archiveContext = null;
      Object.entries(saved).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val; });
    }
  }

  function capture(fn) {
    return typeof global.captureReportHtml === 'function' ? global.captureReportHtml(fn) : null;
  }

  function buildTodayLastDayHtml(ctx) {
    const lastDay = lastDayOfMonth(ctx.year, ctx.month);
    const tc = (global.cases || []).filter(c => c.date === lastDay);
    if (!tc.length) return null;
    const cn = global.settings?.centerName || 'مركز الحجامة';
    const tot = tc.reduce((a, c) => ({ preTax: a.preTax + c.preTax, vat: a.vat + c.vat, total: a.total + c.total, cash: a.cash + c.cash, card: a.card + c.card }), { preTax: 0, vat: 0, total: 0, cash: 0, card: 0 });
    const rows = tc.map((c, i) => `<tr><td class="center">${i + 1}</td><td class="ltr">${c.invoice}</td><td>${c.name}</td><td>${c.doctorName}</td><td class="center">${global.fmtNum(c.cups, 0)}</td><td class="money">${global.fmtMoney(c.total)}</td></tr>`).join('');
    return `<div class="hdr"><h1>${cn}</h1><p class="meta">Daily Report — كشف آخر يوم من الشهر</p><p class="meta">${global.fmtDate(lastDay)}</p></div>
      <div class="boxes">${global.mbox('Cases', 'الحالات', global.fmtNum(tc.length, 0))}${global.mbox('Revenue', 'الإيراد', global.fmtMoney(tot.total))}${global.mbox('Cash', 'كاش', global.fmtMoney(tot.cash))}${global.mbox('Card', 'شبكة', global.fmtMoney(tot.card))}</div>
      <table><thead><tr><th>#</th><th>الفاتورة</th><th>المريض</th><th>الأخصائي</th><th>كاسات</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
      ${global.printFooterDiv?.() || ''}`;
  }

  function buildRevenueHtml(ctx) {
    return withArchiveContext(ctx, () => {
      const mc = global.getRepFilteredCases?.() || [];
      const label = global.getRepLabel?.() || `${MONTH_NAMES[ctx.month]} ${ctx.year}`;
      const tot = mc.reduce((a, c) => ({ total: a.total + c.total, cash: a.cash + (c.cash || 0), card: a.card + (c.card || 0), vat: a.vat + c.vat }), { total: 0, cash: 0, card: 0, vat: 0 });
      const byDay = {};
      mc.forEach(c => { byDay[c.date] = (byDay[c.date] || 0) + c.total; });
      const dayRows = Object.entries(byDay).sort().map(([d, v]) => `<tr><td dir="ltr">${global.fmtDate(d)}</td><td class="money">${global.fmtMoney(v)}</td></tr>`).join('');
      const cn = global.settings?.centerName || 'مركز الحجامة';
      return `<div class="hdr"><h1>${cn}</h1><p class="meta">Revenue Report — تقرير الإيرادات</p><p class="meta">${label}</p></div>
        <div class="boxes">${global.mbox('Cases', 'الحالات', global.fmtNum(mc.length, 0))}${global.mbox('Revenue', 'الإيراد', global.fmtMoney(tot.total))}${global.mbox('VAT', 'الضريبة', global.fmtMoney(tot.vat))}${global.mbox('Cash', 'كاش', global.fmtMoney(tot.cash))}${global.mbox('Card', 'شبكة', global.fmtMoney(tot.card))}</div>
        <table><thead><tr><th>التاريخ</th><th>الإيراد</th></tr></thead><tbody>${dayRows || '<tr><td colspan="2" style="text-align:center">لا بيانات</td></tr>'}</tbody></table>
        ${global.printFooterDiv?.() || ''}`;
    });
  }

  function buildLeaveHtml(ctx) {
    const reqs = (global.employeeLeaveRequests || global.DB?.get('employeeLeaveRequests', []) || []).filter(r => {
      const from = new Date(r.dateFrom);
      const to = new Date(r.dateTo || r.dateFrom);
      return (from.getMonth() + 1 === ctx.month && from.getFullYear() === ctx.year)
        || (to.getMonth() + 1 === ctx.month && to.getFullYear() === ctx.year);
    });
    const cn = global.settings?.centerName || 'مركز الحجامة';
    const rows = reqs.map(r => `<tr><td>${r.doctorName}</td><td>${r.leaveTypeLabel || r.leaveType || '—'}</td><td dir="ltr">${r.dateFrom}</td><td dir="ltr">${r.dateTo}</td><td class="center">${global.fmtNum(r.days, 0)}</td><td>${LEAVE_STATUS[r.status] || r.status}</td><td>${r.paid ? 'مدفوعة' : 'غير مدفوعة'}</td></tr>`).join('');
    return `<div class="hdr"><h1>${cn}</h1><p class="meta">Leave Report — تقرير الإجازات</p><p class="meta">${MONTH_NAMES[ctx.month]} ${ctx.year}</p></div>
      <div class="boxes">${global.mbox('Requests', 'الطلبات', global.fmtNum(reqs.length, 0))}</div>
      <table><thead><tr><th>الموظف</th><th>النوع</th><th>من</th><th>إلى</th><th>الأيام</th><th>الحالة</th><th>الأجر</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:16px">لا طلبات إجازة في هذه الفترة</td></tr>'}</tbody></table>
      ${global.printFooterDiv?.() || ''}`;
  }

  function buildInventoryHtml() {
    const items = global.inventoryItems || global.DB?.get('inventoryItems', []) || [];
    if (!items.length) return null;
    const cn = global.settings?.centerName || 'مركز الحجامة';
    const rows = items.map((item, i) => `<tr><td>${i + 1}</td><td>${item.name}</td><td>${item.sku || '—'}</td><td>${typeof global.formatStockPieces === 'function' ? global.formatStockPieces(item) : item.stockPieces}</td><td>${typeof global.getInventoryStatus === 'function' ? global.getInventoryStatus(item).label : '—'}</td></tr>`).join('');
    return `<div class="hdr"><h1>${cn}</h1><p class="meta">Inventory Report — تقرير المخزون</p></div>
      <table><thead><tr><th>#</th><th>الصنف</th><th>SKU</th><th>المتوفر</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>
      ${global.printFooterDiv?.() || ''}`;
  }

  function buildInventoryMovementsHtml(ctx) {
    const moves = (global.inventoryMovements || global.DB?.get('inventoryMovements', []) || []).filter(m => {
      const d = new Date(m.date || m.at);
      return d.getMonth() + 1 === ctx.month && d.getFullYear() === ctx.year;
    });
    const cn = global.settings?.centerName || 'مركز الحجامة';
    const rows = moves.map(m => `<tr><td dir="ltr">${global.fmtDate(m.date)}</td><td>${m.itemName || '—'}</td><td>${m.type === 'in' ? 'إدخال' : 'صرف'}</td><td dir="ltr">${global.fmtNum(m.qty, 2)}</td><td>${m.note || '—'}</td></tr>`).join('');
    return `<div class="hdr"><h1>${cn}</h1><p class="meta">Inventory Movements — حركات المخزون</p><p class="meta">${MONTH_NAMES[ctx.month]} ${ctx.year}</p></div>
      <table><thead><tr><th>التاريخ</th><th>الصنف</th><th>النوع</th><th>الكمية</th><th>ملاحظة</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center">لا حركات في هذه الفترة</td></tr>'}</tbody></table>
      ${global.printFooterDiv?.() || ''}`;
  }

  function buildZReportLastDayHtml(ctx) {
    const lastDay = lastDayOfMonth(ctx.year, ctx.month);
    const tc = (global.cases || []).filter(c => c.date === lastDay);
    if (!tc.length) return null;
    const cn = global.settings?.centerName || 'مركز الحجامة';
    const totalIncome = tc.reduce((a, c) => a + c.total, 0);
    const totalCash = tc.reduce((a, c) => a + (c.cash || 0), 0);
    const totalCard = tc.reduce((a, c) => a + (c.card || 0), 0);
    const totalVat = tc.reduce((a, c) => a + (c.vat || 0), 0);
    const todayExp = (global.expenses || global.DB?.get('expenses', []) || []).filter(e => e.date === lastDay && typeof global.isExpensePaid === 'function' && global.isExpensePaid(e)).reduce((a, e) => a + e.amount, 0);
    return `<div class="hdr"><h1>${cn}</h1><p class="meta">Z-Report — إقفال آخر يوم</p><p class="meta">${global.fmtDate(lastDay)}</p></div>
      <div class="boxes">${global.mbox('Cases', 'الحالات', global.fmtNum(tc.length, 0))}${global.mbox('Gross', 'الإيراد', global.fmtMoney(totalIncome))}${global.mbox('Cash', 'كاش', global.fmtMoney(totalCash))}${global.mbox('Card', 'شبكة', global.fmtMoney(totalCard))}</div>
      <div style="margin-top:12px">ضريبة اليوم: <strong dir="ltr">${global.fmtMoney(totalVat)}</strong> · مصاريف: <strong dir="ltr">${global.fmtMoney(todayExp)}</strong></div>
      ${global.printFooterDiv?.() || ''}`;
  }

  function buildReportById(id, ctx) {
    const custom = REPORT_DEFS.find(r => r.id === id);
    if (custom?.build) {
      try { return custom.build(ctx) || null; } catch (e) { console.error(e); return null; }
    }
    if (id === 'today_last') return buildTodayLastDayHtml(ctx);
    if (id === 'revenue') return buildRevenueHtml(ctx);
    if (id === 'leave') return buildLeaveHtml(ctx);
    if (id === 'inventory') return buildInventoryHtml();
    if (id === 'inventory_movements') return buildInventoryMovementsHtml(ctx);
    if (id === 'zreport_last') return buildZReportLastDayHtml(ctx);

    return withArchiveContext(ctx, () => {
      if (id === 'monthly' || id === 'vat' || id === 'doctors' || id === 'payroll' || id === 'expenses') {
        return capture(() => global.printReport(id));
      }
      if (id === 'attendance') return capture(() => global.printAttSheet());
      if (id === 'profitability' && typeof global.printProfitabilityReport === 'function') {
        return capture(() => global.printProfitabilityReport());
      }
      if (id === 'bookings' && typeof global.printBookingsReport === 'function') {
        return capture(() => global.printBookingsReport());
      }
      if (id === 'cash_float' && typeof global.printCashFloatReport === 'function') {
        return capture(() => global.printCashFloatReport());
      }
      return null;
    });
  }

  function estimatePages(html, basePages) {
    if (!html) return 0;
    const rows = (html.match(/<tr>/gi) || []).length;
    const breaks = (html.match(/page-break/gi) || []).length;
    return Math.max(1, basePages + Math.floor(rows / 30) + breaks);
  }

  function buildCoverPage(ctx, reportLabels) {
    const brand = global.getPrintBrandColor?.() || '#3D5A80';
    const softBg = global.getPrintBrandColorSoftBg?.(0.06) || '#f4f7fa';
    const cn = global.settings?.centerName || 'مركز الحجامة';
    const logoSrc = global.getCenterBrandLogo?.() || global.settings?.brandLogo || 'branding/Center-Logo.png';
    const logo = `<img src="${logoSrc}" alt="" style="max-height:96px;max-width:220px;object-fit:contain;margin:0 auto 20px;display:block">`;
    const now = new Date();
    const dt = now.toLocaleString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const user = (typeof global.getActiveUser === 'function' ? global.getActiveUser() : global.currentUser);
    const userName = user?.fullName || user?.username || '—';
    const tplName = _activeTemplateId && global.settings?.monthlyArchive?.templates?.[_activeTemplateId]?.name;
    const tocRows = reportLabels.map((l, i) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #e8ece9;text-align:center;font-weight:800;color:${brand};width:48px">${i + 1}</td><td style="padding:8px 14px;border-bottom:1px solid #e8ece9;font-size:11.5pt">${l}</td></tr>`).join('');
    return `<div style="min-height:92vh;display:flex;flex-direction:column;align-items:stretch;justify-content:center;padding:36px 32px;font-family:Cairo,sans-serif">
      <div style="text-align:center;margin-bottom:28px">
        ${logo}
        <h1 style="font-size:24pt;color:${brand};margin:0 0 6px;font-weight:900">${cn}</h1>
        <p style="font-size:13pt;color:#5a6b63;margin:0;font-weight:700">Monthly Reports Archive — أرشيف تقارير نهاية الشهر</p>
      </div>
      <div style="border:2px solid ${brand};border-radius:16px;padding:22px 26px;margin:0 auto 24px;max-width:520px;width:100%;background:${softBg}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;font-size:11pt;margin-bottom:18px">
          <div><span style="color:#666">الفترة</span><br><strong>${MONTH_NAMES[ctx.month]} ${ctx.year}</strong></div>
          <div><span style="color:#666">عدد التقارير</span><br><strong>${reportLabels.length}</strong></div>
          <div><span style="color:#666">تاريخ الإنشاء</span><br><strong dir="ltr">${dt}</strong></div>
          <div><span style="color:#666">أُعد بواسطة</span><br><strong>${userName}</strong></div>
          ${tplName ? `<div style="grid-column:1/-1"><span style="color:#666">القالب</span><br><strong>${tplName}</strong></div>` : ''}
        </div>
        <div style="font-weight:900;color:${brand};margin-bottom:10px;text-align:center;font-size:12pt">📑 جدول المحتويات</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #d4e4dc;border-radius:10px;overflow:hidden">
          <thead><tr style="background:${brand};color:#fff"><th style="padding:8px;width:48px">#</th><th style="padding:8px 14px;text-align:right">التقرير</th></tr></thead>
          <tbody>${tocRows}</tbody>
        </table>
      </div>
      <p style="text-align:center;font-size:9pt;color:#888;margin:0">تم إنشاء هذا الأرشيف آلياً من نظام إدارة مركز الحجامة</p>
    </div>
    <div style="page-break-after:always"></div>`;
  }

  function getContextFromModal() {
    return {
      month: parseInt(document.getElementById('ma-month')?.value, 10) || (new Date().getMonth() + 1),
      year: parseInt(document.getElementById('ma-year')?.value, 10) || new Date().getFullYear()
    };
  }

  function estimatePdfSizeKb(combinedHtml) {
    if (!combinedHtml) return 0;
    const doc = typeof global.buildA4PrintDocument === 'function'
      ? global.buildA4PrintDocument(combinedHtml, { documentTitle: 'estimate' })
      : combinedHtml;
    const raw = new Blob([doc]).size;
    return Math.max(80, Math.round(raw * 0.32 / 1024));
  }

  function buildCombinedHtml(ctx, ids, includeCover) {
    const labels = ids.map(id => REPORT_DEFS.find(r => r.id === id)?.label).filter(Boolean);
    let combined = '';
    if (includeCover) combined += buildCoverPage(ctx, labels);
    ids.forEach(id => {
      const html = buildReportById(id, ctx);
      if (html) combined += `<div class="ma-archive-section" style="page-break-before:always">${html}</div>`;
    });
    return { combined, labels };
  }

  function updatePageEstimate() {
    const el = document.getElementById('ma-page-estimate');
    if (!el) return;
    const ctx = getContextFromModal();
    const ids = getOrderedReports().map(r => r.id).filter(id => _selected.has(id));
    const includeCover = !!document.getElementById('ma-include-cover')?.checked;
    let total = includeCover ? 1 : 0;
    let skipped = 0;
    ids.forEach(id => {
      const def = REPORT_DEFS.find(r => r.id === id);
      const html = buildReportById(id, ctx);
      if (!html) { skipped++; return; }
      total += estimatePages(html, def?.basePages || 2);
    });
    const { combined } = buildCombinedHtml(ctx, ids.filter(id => buildReportById(id, ctx)), includeCover);
    const pdfKb = estimatePdfSizeKb(combined);
    const skipNote = skipped ? ` · ${skipped} بدون بيانات` : '';
    el.innerHTML = `<span>عدد الصفحات المتوقع: <strong>~${total}</strong> صفحة</span> · <span>حجم PDF تقريبي: <strong>~${pdfKb}</strong> KB</span>${skipNote ? `<span style="color:var(--warning)">${skipNote}</span>` : ''}`;
  }

  function renderList() {
    const list = document.getElementById('ma-report-list');
    if (!list) return;
    const items = getOrderedReports();
    list.innerHTML = items.map((def, idx) => {
      const checked = _selected.has(def.id) ? 'checked' : '';
      return `<div class="ma-report-row" data-id="${def.id}">
        <label class="ma-report-check"><input type="checkbox" data-ma-id="${def.id}" ${checked}> <span>${def.icon} ${def.label}</span></label>
        <div class="ma-report-order">
          <button type="button" class="btn btn-ghost btn-sm" onclick="MonthlyArchive.moveReport('${def.id}',-1)" title="أعلى">▲</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="MonthlyArchive.moveReport('${def.id}',1)" title="أسفل">▼</button>
        </div>
      </div>`;
    }).join('');
    list.querySelectorAll('input[data-ma-id]').forEach(inp => {
      inp.onchange = () => {
        if (inp.checked) _selected.add(inp.dataset.maId);
        else _selected.delete(inp.dataset.maId);
        saveArchiveSettings();
        updatePageEstimate();
      };
    });
    updatePageEstimate();
  }

  function populateYearMonth() {
    const mEl = document.getElementById('ma-month');
    const yEl = document.getElementById('ma-year');
    if (!mEl || !yEl) return;
    if (!mEl.options.length) {
      MONTH_NAMES.slice(1).forEach((n, i) => { mEl.innerHTML += `<option value="${i + 1}">${n}</option>`; });
      const y = new Date().getFullYear();
      for (let yr = y - 5; yr <= y + 1; yr++) yEl.innerHTML += `<option value="${yr}">${yr}</option>`;
    }
    const now = new Date();
    mEl.value = document.getElementById('rep-month-sel')?.value || String(now.getMonth() + 1);
    yEl.value = document.getElementById('rep-year-sel')?.value || String(now.getFullYear());
  }

  function openModal() {
    if (typeof global.isFeatureEnabled === 'function' && !global.isFeatureEnabled('rep_archive_a4')) {
      notify('⛔ أرشيف التقارير الشهرية غير متاح في إصدار ترخيصك', 'danger');
      return;
    }
    if (typeof global.hasPermission === 'function' && !global.hasPermission('reports.print') && !global.hasPermission('reports.view')) {
      notify('⛔ لا صلاحية لطباعة التقارير', 'danger');
      return;
    }
    ensureArchiveSettings();
    const ma = global.settings.monthlyArchive;
    _activeTemplateId = ma.activeTemplateId || 'accounting';
    if (ma.templates[_activeTemplateId]) {
      applyTemplate(_activeTemplateId);
    } else {
      _order = [...ma.order];
      _selected = new Set(ma.lastSelection);
    }
    populateYearMonth();
    renderTemplateSelect();
    const coverEl = document.getElementById('ma-include-cover');
    if (coverEl && !ma.templates[_activeTemplateId]) coverEl.checked = ma.includeCover !== false;
    renderList();
    document.getElementById('monthlyArchiveModal')?.classList.add('open');
  }

  function closeModal() {
    document.getElementById('monthlyArchiveModal')?.classList.remove('open');
  }

  function selectAll(on) {
    getOrderedReports().forEach(r => { if (on) _selected.add(r.id); else _selected.delete(r.id); });
    renderList();
    saveArchiveSettings();
  }

  function moveReport(id, dir) {
    const idx = _order.indexOf(id);
    if (idx < 0) return;
    const ni = idx + dir;
    if (ni < 0 || ni >= _order.length) return;
    const tmp = _order[idx];
    _order[idx] = _order[ni];
    _order[ni] = tmp;
    renderList();
    saveArchiveSettings();
  }

  async function printSelected() {
    const ctx = getContextFromModal();
    const ids = getOrderedReports().map(r => r.id).filter(id => _selected.has(id));
    if (!ids.length) { notify('⚠️ اختر تقريراً واحداً على الأقل', 'danger'); return; }

    saveArchiveSettings();
    const labels = ids.map(id => REPORT_DEFS.find(r => r.id === id)?.label).filter(Boolean);
    let combined = '';
    if (document.getElementById('ma-include-cover')?.checked) {
      combined += buildCoverPage(ctx, labels);
    }
    let skipped = 0;
    ids.forEach(id => {
      const html = buildReportById(id, ctx);
      if (!html) { skipped++; return; }
      combined += `<div class="ma-archive-section" style="page-break-before:always">${html}</div>`;
    });
    if (!combined.trim()) { notify('⚠️ لا توجد بيانات للتقارير المحددة', 'danger'); return; }

    if (typeof global.buildA4PrintDocument === 'function') {
      const doc = global.buildA4PrintDocument(combined, { documentTitle: `أرشيف ${MONTH_NAMES[ctx.month]} ${ctx.year}` });
      const hasPrinter = global.settings?.devices?.report?.name;
      if (hasPrinter && typeof global.printHTML === 'function') {
        await global.printHTML(combined, false, { documentTitle: `أرشيف ${MONTH_NAMES[ctx.month]} ${ctx.year}` });
      } else if (typeof global.openPrintWindow === 'function') {
        global.openPrintWindow(doc, false, { isFullDocument: true, documentTitle: 'أرشيف الشهر' });
      }
    } else if (typeof global.printHTML === 'function') {
      await global.printHTML(combined, false);
    }
    if (typeof global.logAudit === 'function') {
      global.logAudit('REPORT_ARCHIVE_PRINT', `طباعة أرشيف ${MONTH_NAMES[ctx.month]} ${ctx.year} (${ids.length} تقرير)`, { month: ctx.month, year: ctx.year, reports: ids });
    }
    notify(skipped ? `✅ تم إرسال الأرشيف للطباعة (تُخطّي ${skipped} تقرير بدون بيانات)` : '✅ تم إرسال أرشيف الشهر للطباعة A4', 'success');
    closeModal();
  }

  async function exportPdf() {
    const ctx = getContextFromModal();
    const ids = getOrderedReports().map(r => r.id).filter(id => _selected.has(id));
    if (!ids.length) { notify('⚠️ اختر تقريراً واحداً على الأقل', 'danger'); return; }

    const labels = ids.map(id => REPORT_DEFS.find(r => r.id === id)?.label).filter(Boolean);
    let combined = '';
    if (document.getElementById('ma-include-cover')?.checked) combined += buildCoverPage(ctx, labels);
    ids.forEach(id => {
      const html = buildReportById(id, ctx);
      if (html) combined += `<div style="page-break-before:always">${html}</div>`;
    });
    if (!combined.trim()) { notify('⚠️ لا توجد بيانات للتصدير', 'danger'); return; }

    const doc = typeof global.buildA4PrintDocument === 'function'
      ? global.buildA4PrintDocument(combined, { documentTitle: `Archive_${ctx.year}_${ctx.month}` })
      : combined;

    const api = global.getCuppingElectron?.()?.devices;
    if (api?.exportA4Pdf) {
      const res = await api.exportA4Pdf(doc, { documentTitle: `Archive_${ctx.year}_${String(ctx.month).padStart(2, '0')}` });
      if (res?.ok) {
        if (typeof global.logAudit === 'function') {
          global.logAudit('REPORT_ARCHIVE_PDF', `تصدير أرشيف ${MONTH_NAMES[ctx.month]} ${ctx.year} (${ids.length} تقرير)`, { month: ctx.month, year: ctx.year, reports: ids, path: res.path });
        }
        notify('✅ تم تصدير أرشيف الشهر PDF', 'success');
        closeModal();
        return;
      }
    }

    if (typeof global.openPrintWindow === 'function') {
      global.openPrintWindow(doc, false, { isFullDocument: String(doc).trimStart().startsWith('<!DOCTYPE'), documentTitle: 'أرشيف الشهر' });
      notify('💡 استخدم «طباعة → حفظ كـ PDF» من نافذة الطباعة', 'success');
    }
    closeModal();
  }

  function injectStyles() {
    if (document.getElementById('monthly-archive-styles')) return;
    const s = document.createElement('style');
    s.id = 'monthly-archive-styles';
    s.textContent = `
#monthlyArchiveModal .modal{max-width:min(760px,96vw)}
.ma-template-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:10px}
.ma-template-bar select{flex:1;min-width:180px}
.ma-report-list{display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto;padding:4px 0}
.ma-report-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface)}
.ma-report-check{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;cursor:pointer;margin:0;flex:1}
.ma-report-check input{width:18px;height:18px;accent-color:var(--primary)}
.ma-report-order{display:flex;gap:4px;flex-shrink:0}
.ma-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.ma-period{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.ma-footer-meta{font-size:12px;color:var(--text-muted);margin-top:10px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.ma-footer-meta strong{color:var(--primary)}
`;
    document.head.appendChild(s);
  }

  function ensureModalDOM() {
    const existing = document.getElementById('monthlyArchiveModal');
    if (existing && document.getElementById('ma-template-sel')) return;
    if (existing) existing.remove();
    injectStyles();
    const el = document.createElement('div');
    el.id = 'monthlyArchiveModal';
    el.className = 'modal-overlay';
    el.onclick = e => { if (e.target === el) closeModal(); };
    el.innerHTML = `
      <div class="modal" role="dialog">
        <div class="modal-header">
          <div class="modal-title">📂 أرشيف تقارير نهاية الشهر</div>
          <button type="button" class="modal-close" onclick="MonthlyArchive.closeModal()">✕</button>
        </div>
        <div class="ma-template-bar">
          <label class="form-label" style="margin:0;white-space:nowrap">القالب</label>
          <select class="form-control" id="ma-template-sel" onchange="MonthlyArchive.onTemplateChange()"></select>
          <button type="button" class="btn btn-ghost btn-sm" onclick="MonthlyArchive.updateCurrentTemplate()" title="حفظ التعديلات على القالب">💾 حفظ القالب</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="MonthlyArchive.saveCurrentAsTemplate()">➕ قالب جديد</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ma-template-delete" style="display:none" onclick="MonthlyArchive.deleteTemplate(document.getElementById('ma-template-sel').value)">🗑️</button>
        </div>
        <div class="ma-period">
          <label class="form-label" style="margin:0">الفترة</label>
          <select class="form-control" id="ma-month" style="width:130px" onchange="MonthlyArchive.onPeriodChange()"></select>
          <select class="form-control" id="ma-year" style="width:100px" onchange="MonthlyArchive.onPeriodChange()"></select>
        </div>
        <div class="ma-toolbar">
          <button type="button" class="btn btn-ghost btn-sm" onclick="MonthlyArchive.selectAll(true)">تحديد الكل</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="MonthlyArchive.selectAll(false)">إلغاء الكل</button>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;margin:0"><input type="checkbox" id="ma-include-cover" checked onchange="MonthlyArchive.onPeriodChange()"> غلاف أول الصفحة</label>
        </div>
        <div class="ma-report-list" id="ma-report-list"></div>
        <div class="ma-footer-meta" id="ma-page-estimate">عدد الصفحات المتوقع: —</div>
        <div class="divider"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button type="button" class="btn btn-ghost" onclick="MonthlyArchive.closeModal()">إلغاء</button>
          <button type="button" class="btn btn-accent btn-sm" onclick="MonthlyArchive.exportPdf()">📄 تصدير PDF</button>
          <button type="button" class="btn btn-primary" onclick="MonthlyArchive.printSelected()">🖨️ طباعة التقارير المحددة</button>
        </div>
      </div>`;
    document.body.appendChild(el);
  }

  function onPeriodChange() { updatePageEstimate(); }

  function init() {
    ensureModalDOM();
    ensureArchiveSettings();
  }

  global.MonthlyArchive = {
    init,
    openModal,
    closeModal,
    selectAll,
    moveReport,
    printSelected,
    exportPdf,
    onPeriodChange,
    onTemplateChange,
    applyTemplate,
    saveCurrentAsTemplate,
    updateCurrentTemplate,
    deleteTemplate,
    registerReport,
    getReportDefs: () => REPORT_DEFS.slice(),
    getTemplates: getTemplateList
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(typeof window !== 'undefined' ? window : globalThis);
