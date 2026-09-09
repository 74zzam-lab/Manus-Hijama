/**
 * Formatted Excel workbook of clinic clients and visits.
 * Pure data builder — the UI writes the file with SheetJS.
 */
(function (global) {
  'use strict';

  const MONTH_NAMES = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  const CLIENT_HEADERS = [
    '#', 'رقم الملف', 'الاسم', 'الهاتف', 'رقم الهوية', 'الجنسية', 'VIP',
    'عدد الجلسات', 'أول زيارة', 'آخر زيارة', 'سنة آخر زيارة', 'شهر آخر زيارة', 'اسم الشهر',
    'أيام منذ آخر زيارة', 'الجلسة القادمة', 'تاريخ التسجيل', 'الحالة',
  ];
  const VISIT_HEADERS = [
    '#', 'رقم الملف', 'الاسم', 'الهاتف', 'رقم الفاتورة', 'تاريخ الجلسة',
    'السنة', 'الشهر', 'اسم الشهر', 'اليوم', 'يوم الأسبوع',
    'الأخصائي', 'نوع الخدمة', 'الكاسات', 'الإجمالي', 'كاش', 'شبكة',
  ];
  const YEAR_HEADERS = ['السنة', 'عدد العملاء (آخر زيارة)', 'عدد الجلسات', 'إجمالي الإيراد'];
  const MONTH_HEADERS = ['السنة', 'الشهر', 'اسم الشهر', 'عدد الجلسات', 'عدد العملاء', 'إجمالي الإيراد'];

  function parseIsoDate(value) {
    const s = String(value == null ? '' : value).trim().slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      return { iso: s, year: '', month: '', day: '', monthName: '', weekday: '' };
    }
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    const dt = new Date(year, month - 1, day);
    return {
      iso: s,
      year: year,
      month: month,
      day: day,
      monthName: MONTH_NAMES[month] || '',
      weekday: WEEKDAYS[dt.getDay()] || '',
    };
  }

  function daysBetween(isoDate, nowMs) {
    const parsed = parseIsoDate(isoDate);
    if (!parsed.year) return '';
    const then = new Date(parsed.year, parsed.month - 1, parsed.day).getTime();
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const today = new Date(now);
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return Math.floor((todayStart - then) / 86400000);
  }

  function clientStatus(row, overdueDays) {
    if (!row || !row.lastVisit) return 'ملف بدون زيارات';
    const days = typeof row.daysSince === 'number' ? row.daysSince : daysBetween(row.lastVisit);
    const threshold = parseInt(overdueDays, 10) || 75;
    if (typeof days === 'number' && days > threshold) return 'متأخر — ' + days + ' يوم';
    if (typeof days === 'number' && days > 30) return 'يحتاج متابعة — ' + days + ' يوم';
    return 'منتظم';
  }

  function suggestedFilename(centerName, isoDate) {
    const safe = String(centerName || 'المركز').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    const day = String(isoDate || '').slice(0, 10) || 'export';
    return 'عملاء-' + (safe || 'المركز') + '-' + day + '.xlsx';
  }

  function normalizeClient(row, nowMs, overdueDays) {
    const last = parseIsoDate(row && row.lastVisit);
    const first = parseIsoDate(row && row.firstVisit);
    const registered = parseIsoDate(row && row.registeredAt);
    const daysSince = row && row.lastVisit ? daysBetween(row.lastVisit, nowMs) : '';
    const enriched = Object.assign({}, row, { daysSince: daysSince });
    return {
      fileNo: (row && row.fileNo) || '',
      name: (row && row.name) || '',
      phone: (row && row.phone) || '',
      patientId: (row && row.patientId) || '',
      nationality: (row && row.nationality) || '',
      vip: row && row.isVip ? 'نعم' : '',
      visitCount: Number(row && row.visitCount) || 0,
      firstVisit: first.iso,
      lastVisit: last.iso,
      lastYear: last.year,
      lastMonth: last.month,
      lastMonthName: last.monthName,
      daysSince: daysSince,
      nextVisit: (row && row.nextVisit) || '',
      registeredAt: registered.iso,
      status: clientStatus(enriched, overdueDays),
    };
  }

  function normalizeVisit(row) {
    const d = parseIsoDate(row && row.date);
    return {
      fileNo: (row && row.fileNo) || '',
      name: (row && row.name) || '',
      phone: (row && row.phone) || '',
      invoice: (row && row.invoice) || '',
      date: d.iso,
      year: d.year,
      month: d.month,
      monthName: d.monthName,
      day: d.day,
      weekday: d.weekday,
      doctorName: (row && row.doctorName) || '',
      serviceType: (row && row.serviceType) || '',
      cups: Number(row && row.cups) || 0,
      total: Number(row && row.total) || 0,
      cash: Number(row && row.cash) || 0,
      card: Number(row && row.card) || 0,
    };
  }

  function yearSummary(visits, clients) {
    const map = {};
    (visits || []).forEach(function (v) {
      if (!v.year) return;
      if (!map[v.year]) map[v.year] = { year: v.year, visits: 0, revenue: 0, clients: new Set() };
      map[v.year].visits += 1;
      map[v.year].revenue += Number(v.total) || 0;
      if (v.fileNo || v.phone) map[v.year].clients.add(v.fileNo || v.phone);
    });
    (clients || []).forEach(function (c) {
      if (!c.lastYear) return;
      if (!map[c.lastYear]) map[c.lastYear] = { year: c.lastYear, visits: 0, revenue: 0, clients: new Set() };
    });
    return Object.keys(map).sort().reverse().map(function (y) {
      const row = map[y];
      const lastVisitClients = (clients || []).filter(function (c) { return c.lastYear === row.year; }).length;
      return {
        year: row.year,
        clientCount: lastVisitClients,
        visits: row.visits,
        revenue: Math.round(row.revenue * 100) / 100,
      };
    });
  }

  function monthSummary(visits) {
    const map = {};
    (visits || []).forEach(function (v) {
      if (!v.year || !v.month) return;
      const key = v.year + '-' + String(v.month).padStart(2, '0');
      if (!map[key]) {
        map[key] = {
          year: v.year,
          month: v.month,
          monthName: v.monthName,
          visits: 0,
          revenue: 0,
          clients: new Set(),
        };
      }
      map[key].visits += 1;
      map[key].revenue += Number(v.total) || 0;
      if (v.fileNo || v.phone) map[key].clients.add(v.fileNo || v.phone);
    });
    return Object.keys(map).sort().reverse().map(function (k) {
      const row = map[k];
      return {
        year: row.year,
        month: row.month,
        monthName: row.monthName,
        visits: row.visits,
        clients: row.clients.size,
        revenue: Math.round(row.revenue * 100) / 100,
      };
    });
  }

  function coverRows(meta, clients, visits) {
    const m = meta || {};
    return [
      ['نسخة بيانات العملاء'],
      ['المركز', m.centerName || 'مركز الحجامة'],
      ['تاريخ التصدير', m.exportedAt || ''],
      ['الفلتر', m.filterLabel || 'كل العملاء'],
      ['عدد العملاء', clients.length],
      ['عدد الزيارات', visits.length],
      [],
      ['محتويات الملف'],
      ['ورقة العملاء', 'صف لكل عميل: الاسم، رقم الملف، الهاتف، التواريخ، السنة، الحالة'],
      ['ورقة الزيارات', 'كل جلسة مع السنة والشهر واسم الشهر ويوم الأسبوع'],
      ['حسب السنة', 'عدد العملاء والجلسات والإيراد لكل سنة'],
      ['حسب الشهر', 'توزيع الجلسات على الشهور'],
    ];
  }

  function widthsFor(headers, extras) {
    return (headers || []).map(function (h, i) {
      const extra = extras && extras[i];
      const n = Math.max(String(h).length + 2, extra || 10);
      return { wch: Math.min(28, n) };
    });
  }

  function sheetSpec(name, header, bodyRows, colExtras) {
    const rows = header ? [header].concat(bodyRows || []) : (bodyRows || []);
    return {
      name: name,
      rows: rows,
      cols: header ? widthsFor(header, colExtras) : [{ wch: 22 }, { wch: 42 }],
      freeze: !!header,
      autofilter: !!(header && bodyRows && bodyRows.length),
    };
  }

  function buildWorkbookModel(input) {
    const src = input || {};
    const nowMs = src.nowMs;
    const overdueDays = src.overdueDays;
    const clients = (src.clients || []).map(function (c) { return normalizeClient(c, nowMs, overdueDays); });
    const visits = (src.visits || []).map(normalizeVisit);
    const years = yearSummary(visits, clients);
    const months = monthSummary(visits);

    const clientBody = clients.map(function (c, i) {
      return [
        i + 1, c.fileNo, c.name, c.phone, c.patientId, c.nationality, c.vip,
        c.visitCount, c.firstVisit, c.lastVisit, c.lastYear, c.lastMonth, c.lastMonthName,
        c.daysSince, c.nextVisit, c.registeredAt, c.status,
      ];
    });
    const visitBody = visits.map(function (v, i) {
      return [
        i + 1, v.fileNo, v.name, v.phone, v.invoice, v.date,
        v.year, v.month, v.monthName, v.day, v.weekday,
        v.doctorName, v.serviceType, v.cups, v.total, v.cash, v.card,
      ];
    });
    const yearBody = years.map(function (r) { return [r.year, r.clientCount, r.visits, r.revenue]; });
    const monthBody = months.map(function (r) { return [r.year, r.month, r.monthName, r.visits, r.clients, r.revenue]; });

    return {
      filename: suggestedFilename(src.centerName, src.exportedAt),
      rtl: true,
      sheets: [
        sheetSpec('ملخص', null, coverRows(src, clients, visits)),
        sheetSpec('العملاء', CLIENT_HEADERS, clientBody, [4, 12, 22, 14, 14, 12, 6, 10, 12, 12, 10, 8, 12, 12, 12, 12, 18]),
        sheetSpec('الزيارات', VISIT_HEADERS, visitBody, [4, 12, 22, 14, 14, 12, 8, 8, 12, 8, 12, 16, 14, 8, 10, 8, 8]),
        sheetSpec('حسب السنة', YEAR_HEADERS, yearBody, [10, 22, 12, 14]),
        sheetSpec('حسب الشهر', MONTH_HEADERS, monthBody, [10, 8, 12, 12, 12, 14]),
      ],
      counts: { clients: clients.length, visits: visits.length, years: years.length, months: months.length },
    };
  }

  function layoutSheet(XLSX, ws, spec) {
    if (!ws || !spec) return ws;
    if (spec.cols) ws['!cols'] = spec.cols;
    const range = spec.rows && spec.rows.length
      ? { s: { r: 0, c: 0 }, e: { r: spec.rows.length - 1, c: Math.max(0, (spec.rows[0] || []).length - 1) } }
      : null;
    if (range && spec.autofilter) ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    if (spec.freeze) {
      ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activeCell: 'A2' };
      ws['!views'] = [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2', activeCell: 'A2', rightToLeft: true }];
    }
    return ws;
  }

  function writeWorkbook(XLSX, model, filename) {
    if (!XLSX || !XLSX.utils) throw new Error('مكتبة Excel غير محمّلة');
    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    (model.sheets || []).forEach(function (spec) {
      const ws = XLSX.utils.aoa_to_sheet(spec.rows || []);
      layoutSheet(XLSX, ws, spec);
      XLSX.utils.book_append_sheet(wb, ws, spec.name.slice(0, 31));
    });
    XLSX.writeFile(wb, filename || model.filename || 'عملاء.xlsx');
    return { ok: true, filename: filename || model.filename, counts: model.counts };
  }

  const api = {
    MONTH_NAMES: MONTH_NAMES,
    WEEKDAYS: WEEKDAYS,
    CLIENT_HEADERS: CLIENT_HEADERS,
    VISIT_HEADERS: VISIT_HEADERS,
    parseIsoDate: parseIsoDate,
    daysBetween: daysBetween,
    clientStatus: clientStatus,
    suggestedFilename: suggestedFilename,
    normalizeClient: normalizeClient,
    normalizeVisit: normalizeVisit,
    yearSummary: yearSummary,
    monthSummary: monthSummary,
    buildWorkbookModel: buildWorkbookModel,
    writeWorkbook: writeWorkbook,
  };
  global.ClientsExcel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
