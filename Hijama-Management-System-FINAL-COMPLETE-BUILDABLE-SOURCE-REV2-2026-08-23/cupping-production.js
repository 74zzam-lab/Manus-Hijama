/**
 * Cupping Center — production reports, unified payroll print, Electron helpers
 */
(function (global) {
  'use strict';

  function getElectronApi() {
    return global.cuppingElectron || global.tadawiElectron || null;
  }

  function appCenterName() {
    return global.settings?.centerName || 'مركز الحجامة';
  }

  function currentYear() {
    return new Date().getFullYear();
  }

  function monthNames() {
    return ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  }

  function rHdr(ar, en, meta, opts) {
    if (global.buildUnifiedReportHeader) return global.buildUnifiedReportHeader(ar, en, meta, opts);
    return `<div class="hdr"><h1>${appCenterName()}</h1><p class="meta">${[ar, en].filter(Boolean).join(' — ')}</p></div>`;
  }

  function brandColor() {
    return global.getPrintBrandColor?.() || '#3D5A80';
  }

  function buildPayrollDoctorBlock(d, month, year) {
    const cases = global.cases || [];
    const otRecords = global.otRecords || [];
    const attendance = global.DB?.get('attendance', []) || [];
    const monthCases = cases.filter(c => {
      const matchMonth = typeof global.recordMatchesMonth === 'function'
        ? global.recordMatchesMonth(c, month, year)
        : (() => { const m = String(c.date || '').match(/^(\d{4})-(\d{2})-/); return m && +m[2] === month && +m[1] === year; })();
      return c.doctorId === d.id && matchMonth;
    }).filter(c => typeof global.isBillableCase !== 'function' || global.isBillableCase(c));
    const monthOT = otRecords.filter(r => {
      const matchMonth = typeof global.recordMatchesMonth === 'function'
        ? global.recordMatchesMonth(r, month, year)
        : (() => { const m = String(r.date || '').match(/^(\d{4})-(\d{2})-/); return m && +m[2] === month && +m[1] === year; })();
      return r.doctorId === d.id && matchMonth;
    });
    const docAtt = attendance.filter(a => {
      const matchMonth = typeof global.recordMatchesMonth === 'function'
        ? global.recordMatchesMonth(a, month, year)
        : (() => { const m = String(a.date || '').match(/^(\d{4})-(\d{2})-/); return m && +m[2] === month && +m[1] === year; })();
      return a.doctorId === d.id && matchMonth;
    });
    const commission = monthCases.reduce((a, c) => a + (c.commission || 0), 0);
    const attOtH = docAtt.reduce((a, r) => a + (r.otHours || 0), 0);
    const manOtH = monthOT.reduce((a, r) => a + (r.hours || 0), 0);
    const totalOtH = attOtH + manOtH;
    const otValue = totalOtH * (d.otRate || 0);
    const dayVal = d.dayValue || 0;
    let deductRows = '';
    let totalDeduct = docAtt.filter(a => a.type === 'absent').length * dayVal;
    let unpaidDays = 0;
    if (typeof global.renderPayrollDeductionRows === 'function') {
      const dr = global.renderPayrollDeductionRows(docAtt, dayVal, d);
      deductRows = dr.html;
      totalDeduct = dr.totalDeduct;
      unpaidDays = dr.unpaidDays;
    }
    const monthlyCommBonus = typeof global.calcMonthlyCommissionBonus === 'function'
      ? global.calcMonthlyCommissionBonus(d, monthCases) : 0;
    const insuranceDeduct = typeof global.calcInsuranceDeduction === 'function'
      ? global.calcInsuranceDeduction(d) : 0;
    const grossTotal = (d.salary || 0) + (d.housing || 0) + (d.transport || 0) + commission + otValue + monthlyCommBonus;
    const netTotal = grossTotal - totalDeduct - insuranceDeduct;
    const mn = monthNames();
    const insRow = insuranceDeduct > 0
      ? `<tr style="color:#c00"><td>🏛️ التأمينات (${d.insuranceType === 'pct' ? global.fmtNum(d.insuranceVal || 0, 2) + '%' : 'ثابت'})</td><td style="text-align:left">- ${global.fmtMoney(insuranceDeduct)}</td></tr>` : '';
    const commBonusRow = monthlyCommBonus > 0
      ? `<tr><td>مكافأة العمولة الشهرية</td><td style="text-align:left">${global.fmtMoney(monthlyCommBonus)}</td></tr>` : '';
    let deductPrintRows = '';
    const absDays = docAtt.filter(a => a.type === 'absent').length;
    const absDeduct = absDays * dayVal;
    if (absDeduct > 0) deductPrintRows += `<tr style="color:#c00"><td>خصم الغياب (${absDays} يوم)</td><td style="text-align:left">- ${global.fmtMoney(absDeduct)}</td></tr>`;
    if (typeof global.calcUnpaidLeaveDeduction === 'function') {
      const ul = global.calcUnpaidLeaveDeduction(docAtt, dayVal);
      if (ul.deduct > 0) deductPrintRows += `<tr style="color:#c00"><td>خصم إجازات غير مدفوعة (${ul.unpaidDays} يوم)</td><td style="text-align:left">- ${global.fmtMoney(ul.deduct)}</td></tr>`;
    }
    if (typeof global.calcAttendancePolicyDeductions === 'function') {
      const ap = global.calcAttendancePolicyDeductions(docAtt, d);
      if (ap.lateDeduct > 0) deductPrintRows += `<tr style="color:#c00"><td>خصم التأخير</td><td style="text-align:left">- ${global.fmtMoney(ap.lateDeduct)}</td></tr>`;
      if (ap.shortDeduct > 0) deductPrintRows += `<tr style="color:#c00"><td>خصم نقص الدوام</td><td style="text-align:left">- ${global.fmtMoney(ap.shortDeduct)}</td></tr>`;
    }
    return {
      netTotal, grossTotal, monthCases, docAtt, totalOtH, otValue, commission, monthlyCommBonus,
      html: `<div style="border:1px solid ${brandColor()};border-radius:6px;margin-bottom:12px;page-break-inside:avoid">
        <div style="background:${brandColor()};color:#fff;padding:8px 12px;font-weight:900;font-size:11pt">${d.name}${d.insuranceEnabled ? ' 🏛️' : ''} — ${d.specialty || 'موظف'} — ${mn[month]} ${year}</div>
        <div style="padding:10px 12px">
          <table style="margin:0;width:100%"><tbody>
            <tr><td>الراتب الأساسي</td><td style="text-align:left">${global.fmtMoney(d.salary)}</td></tr>
            <tr><td>بدل السكن</td><td style="text-align:left">${global.fmtMoney(d.housing)}</td></tr>
            <tr><td>بدل النقل</td><td style="text-align:left">${global.fmtMoney(d.transport)}</td></tr>
            <tr><td>العمولات (${monthCases.length} حالة)</td><td style="text-align:left">${global.fmtMoney(commission)}</td></tr>
            ${commBonusRow}
            <tr><td>أوفر تايم (${global.fmtNum(totalOtH, 1)} ساعة)</td><td style="text-align:left">${global.fmtMoney(otValue)}</td></tr>
            <tr style="border-top:1px solid #ddd;font-weight:700"><td>الإجمالي قبل الخصومات</td><td style="text-align:left">${global.fmtMoney(grossTotal)}</td></tr>
            ${deductPrintRows}
            ${insRow}
          </tbody></table>
          <div style="background:#c9a84c;color:#fff;padding:6px 10px;font-weight:900;font-size:12pt;border-radius:4px;margin-top:8px;display:flex;justify-content:space-between">
            <span>صافي الراتب</span><span>${global.fmtMoney(netTotal)}</span>
          </div>
        </div>
      </div>`
    };
  }

  function printPayrollSlip(doctorId, month, year) {
    const doctors = global.doctors || [];
    const list = doctorId ? doctors.filter(d => d.id === doctorId) : doctors;
    if (!list.length) { global.notify?.('⚠️ لا يوجد موظف للطباعة', 'danger'); return; }
    const mn = monthNames();
    let grandNet = 0;
    const tables = list.map(d => {
      const b = buildPayrollDoctorBlock(d, month, year);
      grandNet += b.netTotal;
      return b.html;
    }).join('');
    const grandBox = list.length > 1
      ? `<div style="background:${brandColor()};color:#fff;padding:12px 16px;border-radius:6px;margin-bottom:16px;display:flex;justify-content:space-between;font-weight:900">
          <span>صافي رواتب (${list.length} موظف)</span><span dir="ltr">${global.fmtMoney(grandNet)}</span></div>` : '';
    global.printHTML(`${rHdr('مسير الرواتب', 'Payroll', [`${mn[month]} ${year}`])}${grandBox}${tables}${global.printFooterDivBilingual?.() || global.printFooterDiv?.() || ''}`, false);
  }

  global.printDoctorPayroll = function (id) {
    const month = parseInt(document.getElementById('payrollMonth')?.value, 10) || (new Date().getMonth() + 1);
    const year = parseInt(document.getElementById('payrollYear')?.value, 10) || currentYear();
    printPayrollSlip(id || null, month, year);
  };

  global.printEmployeeReport = function () {
    const doc = global.window?._empReportDoc || global._empReportDoc;
    const month = global.window?._empReportMonth || global._empReportMonth || (new Date().getMonth() + 1);
    const year = global.window?._empReportYear || global._empReportYear || currentYear();
    if (!doc) { global.notify?.('⚠️ لا توجد بيانات للطباعة', 'danger'); return; }
    const block = buildPayrollDoctorBlock(doc, month, year);
    const typeL = { normal: 'حضور', shift1: 'فترة 1', shift2: 'فترة 2', fullOT: 'OT', absent: 'غياب', leave: 'إجازة', sick: 'مرضية', weekly: 'أسبوعية', annual: 'سنوية' };
    const attRows = block.docAtt.sort((a, b) => a.date.localeCompare(b.date)).map(a =>
      `<tr><td dir="ltr">${global.fmtDate(a.date)}</td><td dir="ltr">${a.timeIn ? global.to12h(a.timeIn) : '—'}</td><td dir="ltr">${a.timeOut ? global.to12h(a.timeOut) : '—'}</td><td dir="ltr">${global.fmtNum(a.totalHours || 0, 1)}</td><td>${(a.lateMinutes || 0) > 0 ? a.lateMinutes + ' د' : '—'}</td><td>${(a.attDeductTotal || 0) > 0 ? '- ' + global.fmtMoney(a.attDeductTotal) : '—'}</td><td>${(a.warningLevel || 0) > 0 ? a.warningLevel + '/3' : (a.isSeriousLate ? 'جسيم' : '—')}</td><td>${typeL[a.type] || a.type}</td></tr>`
    ).join('') || '<tr><td colspan="8" style="text-align:center">لا سجلات</td></tr>';
    const caseRows = block.monthCases.sort((a, b) => b.date.localeCompare(a.date)).map(c =>
      `<tr><td dir="ltr">${global.fmtDate(c.date)}</td><td>${c.name}</td><td>${c.serviceType || 'حجامة'}</td><td dir="ltr">${global.fmtNum(c.cups, 0)}</td><td dir="ltr">${global.fmtMoney(c.commission)}</td></tr>`
    ).join('') || '<tr><td colspan="5" style="text-align:center">لا جلسات</td></tr>';
    global.printHTML(`${rHdr(`تقرير موظف: ${doc.name}`, 'Employee Report', [`${monthNames()[month]} ${year}`])}${block.html}
      <h2>سجل الحضور</h2><table><thead><tr><th>التاريخ</th><th>حضور</th><th>انصراف</th><th>ساعات</th><th>تأخير</th><th>خصم</th><th>إنذار</th><th>النوع</th></tr></thead><tbody>${attRows}</tbody></table>
      <h2>الجلسات</h2><table><thead><tr><th>التاريخ</th><th>العميل</th><th>الخدمة</th><th>كاسات</th><th>عمولة</th></tr></thead><tbody>${caseRows}</tbody></table>
      ${global.printFooterDiv?.() || ''}`, false);
  };

  global.printThermalViaBridge = function (html, options) {
    if (typeof global.printThermalDoc === 'function') return global.printThermalDoc(html, null, options || {});
    if (global.HardwareBridge?.printThermal) return global.HardwareBridge.printThermal(html, options || {});
    return { ok: false, error: 'no_thermal_engine' };
  };

  const _printThermalSummary = global.printThermalSummary;
  if (_printThermalSummary) {
    global.printThermalSummary = function () {
      return _printThermalSummary();
    };
  }

  const _printClientInvoices = global.printClientInvoices;
  if (_printClientInvoices) {
    global.printClientInvoices = function (clientKey) {
      return _printClientInvoices(clientKey);
    };
  }

  global.printCashFloatReport = function () {
    const session = global.DB?.get('cashDrawerSession', null);
    const settings = global.settings || {};
    const float = settings.cashFloat || {};
    const movements = global.systemLogs?.filter(l => l.action === 'CASH_MOVEMENT') || global.DB?.get('systemLogs', []).filter(l => l.action === 'CASH_MOVEMENT') || [];
    const rows = movements.slice(0, 80).map(m =>
      `<tr><td dir="ltr">${global.fmtDate?.(m.timestamp?.slice(0, 10)) || m.timestamp || '—'}</td><td>${m.message || '—'}</td><td dir="ltr">${m.data?.amount != null ? global.fmtMoney(m.data.amount) : '—'}</td></tr>`
    ).join('') || '<tr><td colspan="3" style="text-align:center">لا حركات</td></tr>';
    global.printHTML(`${rHdr('تقرير عهدة الكاش', 'Cash Float Report', [])}
      <div class="boxes">
        <div class="box"><div class="lbl">الرصيد الافتتاحي</div><div class="val" dir="ltr">${global.fmtMoney(float.openingBalance || session?.opening || 0)}</div></div>
        <div class="box"><div class="lbl">آخر إغلاق</div><div class="val">${session?.closedAt ? global.fmtDate(session.closedAt.slice(0, 10)) : '—'}</div></div>
      </div>
      <table><thead><tr><th>التاريخ</th><th>الحركة</th><th>المبلغ</th></tr></thead><tbody>${rows}</tbody></table>
      ${global.printFooterDiv?.() || ''}`, false);
  };

  global.printBookingsReport = function () {
    const bookings = global.DB?.get('bookings', []) || [];
    const now = new Date();
    const month = parseInt(document.getElementById('rep-month-sel')?.value, 10) || (now.getMonth() + 1);
    const year = parseInt(document.getElementById('rep-year-sel')?.value, 10) || currentYear();
    const filtered = bookings.filter(b => {
      const d = new Date(b.date + 'T12:00:00');
      return d.getMonth() + 1 === month && d.getFullYear() === year;
    });
    const statusL = { pending: 'قيد الانتظار', confirmed: 'مؤكد', done: 'تم', cancelled: 'ملغي', noshow: 'لم يحضر' };
    const rows = filtered.map(b =>
      `<tr><td dir="ltr">${global.fmtDate(b.date)}</td><td>${b.clientName || b.name || '—'}</td><td>${b.doctorName || '—'}</td><td>${statusL[b.status] || b.status || '—'}</td><td dir="ltr">${b.time || '—'}</td></tr>`
    ).join('') || '<tr><td colspan="5" style="text-align:center">لا حجوزات</td></tr>';
    const noshow = filtered.filter(b => b.status === 'noshow').length;
    global.printHTML(`${rHdr('تقرير الحجوزات', 'Bookings Report', [`${monthNames()[month]} ${year}`])}
      <div class="boxes">${global.mbox?.('Bookings', 'الحجوزات', global.fmtNum(filtered.length, 0)) || ''}${global.mbox?.('No-show', 'لم يحضر', global.fmtNum(noshow, 0)) || ''}</div>
      <table><thead><tr><th>التاريخ</th><th>العميل</th><th>الأخصائي</th><th>الحالة</th><th>الوقت</th></tr></thead><tbody>${rows}</tbody></table>
      ${global.printFooterDiv?.() || ''}`, false);
  };

  global.printInventoryMovementsReport = function () {
    if (typeof global.printInventoryReport === 'function') global.printInventoryReport();
    const moves = global.DB?.get('inventoryMovements', []) || [];
    const rows = moves.slice(0, 120).map(m =>
      `<tr><td dir="ltr">${global.fmtDate(m.date)}</td><td>${m.itemName || m.itemId || '—'}</td><td>${m.type === 'in' ? 'إدخال' : 'صرف'}</td><td dir="ltr">${global.fmtNum(m.qty, 0)}</td><td>${m.note || '—'}</td></tr>`
    ).join('') || '<tr><td colspan="5" style="text-align:center">لا حركات</td></tr>';
    global.printHTML(`${rHdr('حركات المخزون', 'Inventory Movements', [])}
      <table><thead><tr><th>التاريخ</th><th>الصنف</th><th>النوع</th><th>الكمية</th><th>ملاحظة</th></tr></thead><tbody>${rows}</tbody></table>
      ${global.printFooterDiv?.() || ''}`, false);
  };

  function calcProfitabilityMetrics(mc, month, year) {
    const revenue = mc.reduce((a, c) => a + (c.total || 0), 0);
    const discounts = mc.reduce((a, c) => a + (c.discountAmt || 0), 0);
    const grossRevenue = revenue + discounts;
    const allPeriod = typeof global.getRepFilteredCases === 'function' ? global.getRepFilteredCases() : mc;
    const returns = allPeriod
      .filter(c => (Number(c.total) || 0) < 0 || c.isReturn || c.returnCase)
      .reduce((a, c) => a + Math.abs(Number(c.total) || 0), 0);
    const comm = mc.reduce((a, c) => a + (c.commission || 0), 0);
    const taxes = mc.reduce((a, c) => a + (Number(c.vat) || 0), 0);
    let bankFees = 0;
    mc.forEach(c => {
      if ((c.card || 0) > 0 && typeof global.getBankRate === 'function') {
        bankFees += (c.card || 0) * global.getBankRate(c.cardType) / 100;
      }
    });
    const expenses = (global.DB?.get('expenses', []) || []).filter(e => {
      const d = new Date(e.date);
      const paid = typeof global.isExpensePaid === 'function' ? global.isExpensePaid(e) : true;
      return paid && d.getMonth() + 1 === month && d.getFullYear() === year;
    });
    const expTotal = expenses.reduce((a, e) => a + (e.amount || 0), 0);
    const moves = global.inventoryMovements || global.DB?.get('inventoryMovements', []) || [];
    const items = global.inventoryItems || global.DB?.get('inventoryItems', []) || [];
    const materialCost = moves.filter(m => {
      const d = new Date(m.at || m.date);
      return d.getMonth() + 1 === month && d.getFullYear() === year && (m.delta || 0) < 0;
    }).reduce((a, m) => {
      const item = items.find(i => i.id === m.itemId);
      const price = item?.lastPrice || item?.unitCost || 0;
      return a + Math.abs(m.delta || 0) * price;
    }, 0);
    const operatingCost = expenses
      .filter(e => /تشغيل|operating|كهرب|إيجار|rent|utility/i.test(String(e.desc || e.description || '')))
      .reduce((a, e) => a + (e.amount || 0), 0);
    const otherExpenses = Math.max(0, expTotal - operatingCost);
    let payrollEst = 0;
    (global.doctors || []).forEach(d => {
      payrollEst += buildPayrollDoctorBlock(d, month, year).netTotal;
    });
    const netProfit = revenue - returns - comm - bankFees - taxes - expTotal - payrollEst - materialCost;
    return {
      grossRevenue, revenue, discounts, returns, comm, bankFees, taxes,
      expTotal, materialCost, operatingCost, otherExpenses, payrollEst, netProfit
    };
  }

  global.renderProfitabilitySection = function () {
    const el = document.getElementById('profitabilityReport');
    if (!el) return;
    const mc = typeof global.getRepBillableCases === 'function' ? global.getRepBillableCases()
      : (typeof global.getRepFilteredCases === 'function' ? global.getRepFilteredCases() : []);
    const month = parseInt(document.getElementById('rep-month-sel')?.value, 10) || (new Date().getMonth() + 1);
    const year = parseInt(document.getElementById('rep-year-sel')?.value, 10) || currentYear();
    const m = calcProfitabilityMetrics(mc, month, year);
    el.innerHTML = `<div class="profit-report-card">
      <div class="profit-report-head">
        <div class="card-title" style="margin:0">📊 تقرير الربحية التشغيلية</div>
        <button class="btn btn-accent btn-sm btn-print-a4" onclick="printProfitabilityReport()">طباعة الربحية A4</button>
      </div>
      <div class="profit-report-grid">
        <div class="profit-kpi"><div class="profit-kpi-lbl">إيرادات الفترة</div><div class="profit-kpi-val">${global.fmtMoney(m.revenue)}</div></div>
        <div class="profit-kpi"><div class="profit-kpi-lbl">الخصومات</div><div class="profit-kpi-val neg">${global.fmtMoney(m.discounts)}</div></div>
        <div class="profit-kpi"><div class="profit-kpi-lbl">المرتجعات</div><div class="profit-kpi-val neg">${global.fmtMoney(m.returns)}</div></div>
        <div class="profit-kpi"><div class="profit-kpi-lbl">عمولات الأخصائيين</div><div class="profit-kpi-val neg">${global.fmtMoney(m.comm)}</div></div>
        <div class="profit-kpi"><div class="profit-kpi-lbl">صافي الربح الحقيقي</div><div class="profit-kpi-val pos">${global.fmtMoney(m.netProfit)}</div></div>
      </div>
      <div class="profit-report-table-wrap table-wrap">
        <table class="table-compact table-reports">
          <thead><tr><th>البند</th><th class="currency">المبلغ</th></tr></thead>
          <tbody>
            <tr><td>إيرادات الفترة (بعد الخصم)</td><td class="currency">${global.fmtMoney(m.revenue)}</td></tr>
            <tr><td>(-) الخصومات</td><td class="currency" style="color:var(--danger)">${global.fmtMoney(m.discounts)}</td></tr>
            <tr><td>(-) المرتجعات</td><td class="currency" style="color:var(--danger)">${global.fmtMoney(m.returns)}</td></tr>
            <tr><td>(-) عمولات الأخصائيين</td><td class="currency" style="color:var(--danger)">${global.fmtMoney(m.comm)}</td></tr>
            <tr><td>(-) نسبة البنك / رسوم الشبكة</td><td class="currency" style="color:var(--danger)">${global.fmtMoney(m.bankFees)}</td></tr>
            <tr><td>(-) الضرائب</td><td class="currency" style="color:var(--danger)">${global.fmtMoney(m.taxes)}</td></tr>
            <tr><td>(-) المصروفات</td><td class="currency" style="color:var(--danger)">${global.fmtMoney(m.expTotal)}</td></tr>
            <tr><td>(-) تكلفة المواد</td><td class="currency" style="color:var(--danger)">${global.fmtMoney(m.materialCost)}</td></tr>
            <tr><td>(-) تكلفة التشغيل</td><td class="currency" style="color:var(--danger)">${global.fmtMoney(m.operatingCost)}</td></tr>
            <tr><td>(-) مصروفات أخرى</td><td class="currency" style="color:var(--danger)">${global.fmtMoney(m.otherExpenses)}</td></tr>
            <tr><td>(-) صافي رواتب تقديري</td><td class="currency" style="color:var(--danger)">${global.fmtMoney(m.payrollEst)}</td></tr>
            <tr class="totals-row"><td>صافي الربح الحقيقي</td><td class="currency">${global.fmtMoney(m.netProfit)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>`;
  };

  global.printProfitabilityReport = function () {
    const mc = typeof global.getRepBillableCases === 'function' ? global.getRepBillableCases()
      : (typeof global.getRepFilteredCases === 'function' ? global.getRepFilteredCases() : []);
    const month = parseInt(document.getElementById('rep-month-sel')?.value, 10) || (new Date().getMonth() + 1);
    const year = parseInt(document.getElementById('rep-year-sel')?.value, 10) || currentYear();
    const m = calcProfitabilityMetrics(mc, month, year);
    const label = typeof global.getRepLabel === 'function' ? global.getRepLabel() : `${month}/${year}`;
    global.printHTML(`${rHdr('تقرير الربحية التشغيلية', 'Profitability Report', [label])}
      <div class="boxes">
        ${global.mbox ? global.mbox('Revenue', 'الإيراد', global.fmtMoney(m.revenue)) : ''}
        ${global.mbox ? global.mbox('Discounts', 'الخصومات', global.fmtMoney(m.discounts)) : ''}
        ${global.mbox ? global.mbox('Returns', 'المرتجعات', global.fmtMoney(m.returns)) : ''}
        ${global.mbox ? global.mbox('Commissions', 'العمولات', global.fmtMoney(m.comm)) : ''}
        ${global.mbox ? global.mbox('Bank Fees', 'رسوم البنك', global.fmtMoney(m.bankFees)) : ''}
        ${global.mbox ? global.mbox('Taxes', 'الضرائب', global.fmtMoney(m.taxes)) : ''}
        ${global.mbox ? global.mbox('Expenses', 'المصاريف', global.fmtMoney(m.expTotal)) : ''}
        ${global.mbox ? global.mbox('Materials', 'تكلفة المواد', global.fmtMoney(m.materialCost)) : ''}
        ${global.mbox ? global.mbox('Payroll Est.', 'الرواتب', global.fmtMoney(m.payrollEst)) : ''}
        ${global.mbox ? global.mbox('Net Profit', 'صافي الربح الحقيقي', global.fmtMoney(m.netProfit)) : ''}
      </div>
      <table><thead><tr><th>البند</th><th>المبلغ</th></tr></thead><tbody>
        <tr><td>إيرادات الفترة</td><td class="money">${global.fmtMoney(m.revenue)}</td></tr>
        <tr><td>الخصومات</td><td class="money" style="color:#c00">- ${global.fmtMoney(m.discounts)}</td></tr>
        <tr><td>المرتجعات</td><td class="money" style="color:#c00">- ${global.fmtMoney(m.returns)}</td></tr>
        <tr><td>عمولات الأخصائيين</td><td class="money" style="color:#c00">- ${global.fmtMoney(m.comm)}</td></tr>
        <tr><td>رسوم البنك</td><td class="money" style="color:#c00">- ${global.fmtMoney(m.bankFees)}</td></tr>
        <tr><td>الضرائب</td><td class="money" style="color:#c00">- ${global.fmtMoney(m.taxes)}</td></tr>
        <tr><td>المصاريف</td><td class="money" style="color:#c00">- ${global.fmtMoney(m.expTotal)}</td></tr>
        <tr><td>تكلفة المواد</td><td class="money" style="color:#c00">- ${global.fmtMoney(m.materialCost)}</td></tr>
        <tr><td>تكلفة التشغيل</td><td class="money" style="color:#c00">- ${global.fmtMoney(m.operatingCost)}</td></tr>
        <tr><td>مصروفات أخرى</td><td class="money" style="color:#c00">- ${global.fmtMoney(m.otherExpenses)}</td></tr>
        <tr><td>رواتب تقديرية</td><td class="money" style="color:#c00">- ${global.fmtMoney(m.payrollEst)}</td></tr>
        <tr class="tr-total"><td>صافي الربح الحقيقي</td><td class="money">${global.fmtMoney(m.netProfit)}</td></tr>
      </tbody></table>
      ${global.printFooterDiv?.() || ''}`, false);
  };

  global.patchElectronBridges = function () {
    const api = getElectronApi();
    if (!api) return;
    if (!global.cuppingElectron) global.cuppingElectron = api;
  };

  global.getReportYear = currentYear;
  global.buildPayrollDoctorBlock = buildPayrollDoctorBlock;

  global.patchElectronBridges();

})(typeof window !== 'undefined' ? window : globalThis);
