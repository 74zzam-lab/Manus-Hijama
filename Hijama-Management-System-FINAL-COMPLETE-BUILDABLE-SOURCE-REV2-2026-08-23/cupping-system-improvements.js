/* ═══════════════════════════════════════════════════════════
   Cupping Center System Improvements — search, bookings, reports, logs
   ═══════════════════════════════════════════════════════════ */

const SYS_CARD_NAMES = { mada: 'مدى', visa: 'فيزا', master: 'ماستركارد', amex: 'أمريكان إكسبريس' };

function sysNormalizeCardType(cardType) {
  if (typeof normalizeLegacyCardType === 'function') return normalizeLegacyCardType(cardType);
  const ct = (cardType || 'mada').toLowerCase();
  if (ct === 'mada') return 'mada';
  if (['visa', 'master', 'amex'].includes(ct)) return ct;
  if (ct === 'credit_local') return 'visa';
  if (ct === 'credit_intl') return 'amex';
  return 'visa';
}

// ── بحث الفواتير (مدمج في سجل العملاء) ──
function performInvoiceSearch(resetPage) {
  if (resetPage !== false && typeof invoiceSearchPage !== 'undefined') invoiceSearchPage = 1;
  const q = (document.getElementById('invoice-search-query')?.value || '').trim().toLowerCase();
  const type = document.getElementById('invoice-search-type')?.value || 'all';
  const body = document.getElementById('invoiceSearchBody');
  const countEl = document.getElementById('invoice-search-count');
  if (!body) return;
  if (!q) {
    if (countEl) countEl.textContent = '—';
    body.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-light)">ابحث في الفواتير والحالات</td></tr>';
    if (typeof renderTablePagination === 'function') renderTablePagination('invoiceSearchPagination', 1, 0, 0, 'goInvoiceSearchPage');
    return;
  }
  const scopedCases = typeof getUiScopedRecords === 'function' ? getUiScopedRecords(cases || []) : (cases || []);
  const results = scopedCases.filter(c => {
    if (type === 'name') return (c.name || '').toLowerCase().includes(q);
    if (type === 'phone') return (c.phone || '').includes(q);
    if (type === 'fileNo') return (c.fileNo || '').toLowerCase().includes(q);
    if (type === 'invoice') return String(c.invoice ?? '').toLowerCase().includes(q);
    if (type === 'id') return (c.patientId || '').includes(q);
    return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q) ||
      (c.fileNo || '').toLowerCase().includes(q) || String(c.invoice ?? '').toLowerCase().includes(q) ||
      (c.patientId || '').includes(q);
  }).sort((a, b) => b.date.localeCompare(a.date));
  if (countEl) countEl.textContent = `${results.length} نتيجة`;
  if (!results.length) {
    body.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-light)">لا توجد نتائج</td></tr>`;
    if (typeof renderTablePagination === 'function') renderTablePagination('invoiceSearchPagination', 1, 0, 0, 'goInvoiceSearchPage');
    return;
  }
  const pageSize = typeof getTablePageSize === 'function' ? getTablePageSize() : 10;
  const pg = typeof paginateList === 'function'
    ? paginateList(results, invoiceSearchPage || 1, pageSize)
    : { items: results.slice(0, pageSize), page: 1, totalPages: 1, total: results.length, pageSize };
  if (typeof invoiceSearchPage !== 'undefined') invoiceSearchPage = pg.page;
  if (typeof renderTablePagination === 'function') {
    renderTablePagination('invoiceSearchPagination', pg.page, pg.totalPages, pg.total, 'goInvoiceSearchPage');
  }
  const base = (pg.page - 1) * pg.pageSize;
  body.innerHTML = pg.items.map((c, i) => `
    <tr>
      <td class="col-index">${base + i + 1}</td>
      <td><strong style="color:var(--primary)">${c.invoice}</strong></td>
      <td class="num">${c.fileNo || '—'}</td>
      <td class="col-date">${typeof fmtDateDayStack === 'function' ? fmtDateDayStack(c.date) : fmtDate(c.date)}</td>
      <td><strong>${c.name}</strong></td>
      <td>${c.doctorName}</td>
      <td class="num">${fmtNum(c.cups, 0)}</td>
      <td class="currency"><strong>${fmtMoney(c.total)}</strong></td>
      <td class="actions-col">
        <button class="btn btn-accent btn-sm" onclick="showReceipt('${c.id}')">🧾</button>
        <button class="btn btn-ghost btn-sm" onclick="openEditCase('${c.id}')">✏️</button>
      </td>
    </tr>`).join('');
}

function goInvoiceSearchPage(page) {
  invoiceSearchPage = Math.max(1, parseInt(page, 10) || 1);
  performInvoiceSearch(false);
}

function clearInvoiceSearch() {
  const q = document.getElementById('invoice-search-query');
  if (q) q.value = '';
  invoiceSearchPage = 1;
  performInvoiceSearch(false);
}

// ── تسجيل حالة لعميل من سجل العملاء ──
function startCaseForClient(clientKey, clientName) {
  if (typeof fillDailyFormFromClientKey === 'function') {
    fillDailyFormFromClientKey(clientKey);
    notify(`✅ تم تجهيز نموذج حالة جديدة لـ: ${clientName || ''}`);
  }
}

// ── تحويل حجز إلى حالة ──
function convertBookingToCase(bookingId) {
  const b = bookings.find(x => x.id === bookingId);
  if (!b) return;
  if (!hasPermission('cases.edit')) {
    notify('⛔ ليس لديك صلاحية تسجيل الحالات', 'danger');
    return;
  }
  showPage('daily');
  clearForm();
  if (b.clientRegistryId && b.clientRegistryId !== 'new' && typeof findClientByRegistryId === 'function') {
    const client = findClientByRegistryId(b.clientRegistryId);
    if (client) {
      applyClientToForm('f', client, 'select');
      if (typeof loadProfileFromClient === 'function') loadProfileFromClient(client);
    }
  } else {
    document.getElementById('f-name').value = b.name || '';
    document.getElementById('f-phone').value = b.phone || '';
    if (typeof lookupClientForForm === 'function') lookupClientForForm('f');
  }
  if (b.doctorId) {
    const docEl = document.getElementById('f-doctor');
    if (docEl) docEl.value = b.doctorId;
    onDoctorChange();
  }
  const svcEl = document.getElementById('f-service-type');
  if (svcEl && b.service) {
    const opt = [...svcEl.options].find(o => o.value === b.service || o.text.includes(b.service));
    if (opt) svcEl.value = opt.value;
  }
  document.getElementById('f-notes').value = b.notes ? `من حجز: ${b.notes}` : 'تحويل من حجز';
  b.status = 'confirmed';
  DB.set('bookings', bookings);
  if (typeof logAudit === 'function') logAudit('BOOKING_CONFIRMED', `تحويل حجز لحالة: ${b.name}`, { patient: b.name, date: b.date });
  refreshBookingsTable();
  calcFinancials();
  notify(`✅ تم تحويل حجز ${b.name} — أكمل الدفع واحفظ الحالة`);
}

// ── إقفال يومي Z-تقفيل ──
function printZReport() {
  const tc = typeof todayCases === 'function' ? todayCases() : cases.filter(c => c.date === new Date().toISOString().split('T')[0]);
  const today = new Date().toISOString().split('T')[0];
  const cn = settings.centerName || 'مركز الحجامة';
  if (!tc.length) { notify('⚠️ لا توجد عمليات اليوم', 'danger'); return; }

  const totalIncome = tc.reduce((a, c) => a + c.total, 0);
  const totalCash = tc.reduce((a, c) => a + (c.cash || 0), 0);
  const totalCard = tc.reduce((a, c) => a + (c.card || 0), 0);
  const totalVat = tc.reduce((a, c) => a + (c.vat || 0), 0);
  let totalFees = 0;
  const byCard = {};
  tc.forEach(c => {
    if (c.card > 0) {
      const ct = sysNormalizeCardType(c.cardType);
      byCard[ct] = (byCard[ct] || 0) + c.card;
      const rate = typeof getBankRate === 'function' ? getBankRate(ct) : 0;
      totalFees += c.card * rate / 100;
    }
  });
  const todayExp = (expenses || []).filter(e => e.date === today && typeof isExpensePaid === 'function' && isExpensePaid(e))
    .reduce((a, e) => a + e.amount, 0);
  const netCard = totalCard - totalFees;
  const netDay = totalIncome - totalFees - todayExp;

  const cardLines = Object.entries(byCard).map(([t, v]) => {
    const rate = typeof getBankRate === 'function' ? getBankRate(t) : 0;
    const fee = v * rate / 100;
    return `<tr><td>${SYS_CARD_NAMES[t] || t}</td><td dir="ltr">${fmtMoney(v)}</td><td dir="ltr">${fmtNum(rate, 2)}%</td><td dir="ltr">${fmtMoney(fee)}</td><td dir="ltr">${fmtMoney(v - fee)}</td></tr>`;
  }).join('');

  printHTML(`
    ${typeof buildUnifiedReportHeader === 'function' ? buildUnifiedReportHeader('تقرير إقفال يومي (Z-Report)', 'Daily Z-Report', [fmtDate(today)]) : `<div class="hdr"><h1>${cn}</h1><p class="meta">تقرير إقفال يومي (Z-Report) — ${fmtDate(today)}</p></div>`}
    <div class="boxes">
      ${typeof mbox === 'function' ? mbox('Cases', 'الحالات', fmtNum(tc.length, 0)) : ''}
      ${typeof mbox === 'function' ? mbox('Gross', 'إجمالي الإيراد', fmtMoney(totalIncome)) : ''}
      ${typeof mbox === 'function' ? mbox('Cash', 'كاش', fmtMoney(totalCash)) : ''}
      ${typeof mbox === 'function' ? mbox('Card', 'شبكة', fmtMoney(totalCard)) : ''}
    </div>
    <h2>تفصيل الشبكة ورسوم البنك</h2>
    <table><thead><tr><th>البطاقة</th><th>المبلغ</th><th>النسبة المحفوظة</th><th>رسوم البنك</th><th>الصافي</th></tr></thead>
    <tbody>${cardLines || '<tr><td colspan="5">—</td></tr>'}</tbody></table>
    <div class="boxes" style="margin-top:16px">
      <div>ضريبة اليوم: <strong dir="ltr">${fmtMoney(totalVat)}</strong></div>
      <div>رسوم البنك: <strong dir="ltr" style="color:#c00">${fmtMoney(totalFees)}</strong></div>
      <div>مصاريف اليوم: <strong dir="ltr">${fmtMoney(todayExp)}</strong></div>
      <div>صافي اليوم المتوقع: <strong dir="ltr" style="color:#1a7a4a;font-size:18px">${fmtMoney(netDay)}</strong></div>
    </div>
    ${typeof printFooterDiv === 'function' ? printFooterDiv() : ''}
  `, false);
  if (typeof logAudit === 'function') logAudit('SETTINGS_CHANGED', `طباعة Z-Report يوم ${today}`, { date: today, cases: tc.length });
}

// ── تصدير سجل النظام ──
function exportSystemLogs() {
  if (!hasPermission('logs.view')) { notify('⛔ لا صلاحية', 'danger'); return; }
  const rawRows = typeof getFilteredSystemLogs === 'function' ? getFilteredSystemLogs() : (DB.get('systemLogs', systemLogs || []));
  const rows = (typeof OpsLogRedact !== 'undefined' && OpsLogRedact.exportRedactedLogs)
    ? OpsLogRedact.exportRedactedLogs(rawRows)
    : (typeof OpsUxBridge !== 'undefined' && OpsUxBridge.redactAndExportLogs)
      ? OpsUxBridge.redactAndExportLogs(rawRows)
      : rawRows;
  if (!rows.length) { notify('⚠️ لا توجد سجلات مطابقة للتصدير', 'danger'); return; }
  if (typeof XLSX !== 'undefined') {
    const sheetRows = [['الرقم', 'التاريخ', 'الوقت', 'التصنيف', 'العملية', 'الوصف', 'المستخدم']];
    rows.forEach(l => {
      const dt = typeof formatLogDateTime === 'function' ? formatLogDateTime(l.at) : { date: '—', time: '—' };
      sheetRows.push([l.id, dt.date, dt.time, l.category, l.action, l.description || '', l.user]);
    });
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'سجل النظام');
    XLSX.writeFile(wb, `System_Logs_${new Date().toISOString().slice(0, 10)}.xlsx`);
    notify('✅ تم تصدير سجل النظام');
    return;
  }
  const csv = rows.map(l => {
    const dt = typeof formatLogDateTime === 'function' ? formatLogDateTime(l.at) : { line: l.at };
    return [l.id, dt.line, l.category, l.action, (l.description || '').replace(/,/g, ';'), l.user].join(',');
  }).join('\n');
  downloadFile('\uFEFF' + 'id,datetime,category,action,description,user\n' + csv, `system_logs_${Date.now()}.csv`, 'text/csv;charset=utf-8');
  notify('✅ تم تصدير CSV');
}

// ── سجل الباقات من systemLogs الموحد ──
function renderPackageActivityLogUnified() {
  const el = document.getElementById('packageActivityLog');
  if (!el) return;
  systemLogs = DB.get('systemLogs', systemLogs || []);
  const pkgOps = ['PACKAGE_ADDED', 'PACKAGE_UPDATED', 'PACKAGE_DELETED', 'PACKAGE_USED'];
  const rows = systemLogs.filter(l => pkgOps.includes(l.opType)).slice(0, 50);
  if (!rows.length) {
    el.innerHTML = '<div style="color:var(--text-light);font-size:13px;padding:12px">لا يوجد نشاط باقات — يُسجَّل تلقائياً في سجل النظام</div>';
    return;
  }
  el.innerHTML = rows.map(entry => {
    const dt = typeof formatLogDateTime === 'function' ? formatLogDateTime(entry.at) : { line: entry.at };
    return `<div class="activity-log-item" style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px">
      <div style="display:flex;justify-content:space-between;gap:8px">
        <strong>${entry.icon || '📦'} ${entry.action}</strong>
        <span style="font-size:11px;color:var(--text-muted)">${dt.line}</span>
      </div>
      <div style="color:var(--text-muted);margin-top:4px">${entry.description || '—'} — ${entry.user || '—'}</div>
    </div>`;
  }).join('') + `<div style="padding:10px;text-align:center"><button class="btn btn-ghost btn-sm" onclick="showPage('logs');document.getElementById('logs-filter-cat').value='packages';refreshSystemLogsPage()">عرض الكل في سجل النظام →</button></div>`;
}

const _origRenderPackageActivityLog = typeof renderPackageActivityLog === 'function' ? renderPackageActivityLog : null;
function renderPackageActivityLog() {
  renderPackageActivityLogUnified();
}
