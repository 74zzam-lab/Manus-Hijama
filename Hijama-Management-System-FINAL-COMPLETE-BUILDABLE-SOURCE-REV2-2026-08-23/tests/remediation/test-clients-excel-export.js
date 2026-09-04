#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..', '..');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const ClientsExcel = require(path.join(root, 'cloud/clients-excel.js'));
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const parsed = ClientsExcel.parseIsoDate('2026-08-20');
check(parsed.year === 2026 && parsed.month === 8 && parsed.day === 20, 'parses ISO date into year/month/day');
check(parsed.monthName === 'أغسطس', 'Arabic month name for August');
check(parsed.weekday === 'الخميس', 'weekday for 2026-08-20 is Thursday');
check(ClientsExcel.parseIsoDate('').year === '', 'empty date stays empty');

const named = ClientsExcel.normalizeClient({
  name: 'أحمد علي',
  fileNo: 'CL-00007',
  phone: '0500000001',
  lastVisit: '2026-08-20',
  firstVisit: '2025-01-15',
  visitCount: 4,
  isVip: true,
  registeredAt: '2025-01-10T08:00:00.000Z',
}, Date.parse('2026-09-04T12:00:00.000Z'), 75);
check(named.name === 'أحمد علي' && named.fileNo === 'CL-00007', 'client row keeps name and file number');
check(named.lastYear === 2026 && named.lastMonthName === 'أغسطس', 'last visit is split into year and month name');
check(named.daysSince === 15, 'days since last visit uses local calendar dates');
check(named.vip === 'نعم', 'VIP flag is exported');
check(named.status === 'منتظم', 'recent visit is marked regular');

const overdue = ClientsExcel.normalizeClient({
  name: 'سارة',
  fileNo: 'CL-00012',
  lastVisit: '2026-01-01',
  visitCount: 1,
}, Date.parse('2026-09-04T12:00:00.000Z'), 75);
check(String(overdue.status).indexOf('متأخر') === 0, 'old last visit is marked overdue');

const visits = [
  { name: 'أحمد علي', fileNo: 'CL-00007', date: '2026-08-20', invoice: 'TM-2026-0003', doctorName: 'خالد', cups: 10, total: 150, cash: 150, card: 0 },
  { name: 'أحمد علي', fileNo: 'CL-00007', date: '2025-03-02', invoice: 'TM-2025-0010', doctorName: 'خالد', cups: 8, total: 100, cash: 0, card: 100 },
  { name: 'سارة', fileNo: 'CL-00012', date: '2026-01-01', invoice: 'TM-2026-0001', cups: 5, total: 80, cash: 80, card: 0 },
].map((v) => ClientsExcel.normalizeVisit(v));
check(visits[0].year === 2026 && visits[0].monthName === 'أغسطس' && visits[0].weekday === 'الخميس', 'visit rows carry year, month name, weekday');

const years = ClientsExcel.yearSummary(visits, [named, overdue]);
check(years[0].year === 2026 && years[0].visits === 2, 'year sheet counts 2026 visits first');
check(years.some((y) => y.year === 2025 && y.visits === 1), 'year sheet includes 2025');

const months = ClientsExcel.monthSummary(visits);
check(months.some((m) => m.year === 2026 && m.month === 8 && m.visits === 1 && m.monthName === 'أغسطس'), 'month sheet groups August 2026');

const model = ClientsExcel.buildWorkbookModel({
  centerName: 'مركز الاختبار',
  exportedAt: '2026-09-04',
  filterLabel: 'كل العملاء',
  overdueDays: 75,
  nowMs: Date.parse('2026-09-04T12:00:00.000Z'),
  clients: [
    { name: 'أحمد علي', fileNo: 'CL-00007', phone: '0500000001', lastVisit: '2026-08-20', firstVisit: '2025-01-15', visitCount: 2 },
    { name: 'سارة', fileNo: 'CL-00012', lastVisit: '2026-01-01', visitCount: 1 },
  ],
  visits: visits,
});
check(model.sheets.map((s) => s.name).join(',') === 'ملخص,العملاء,الزيارات,حسب السنة,حسب الشهر', 'workbook has cover, clients, visits, year, month sheets');
check(model.sheets[1].rows[0][2] === 'الاسم' && model.sheets[1].rows[1][2] === 'أحمد علي', 'clients sheet is headed and starts with the newest client data');
check(model.sheets[1].autofilter === true && model.sheets[1].freeze === true, 'clients sheet is filterable with a frozen header');
check(model.filename.indexOf('عملاء-مركز الاختبار-2026-09-04') === 0, 'filename uses center name and export date');
check(ClientsExcel.suggestedFilename('A/B:C', '2026-09-04').indexOf('/') === -1, 'filename strips illegal path characters');

const stubXlsx = {
  last: null,
  utils: {
    book_new: () => ({ SheetNames: [], Sheets: {}, Workbook: null }),
    aoa_to_sheet: (rows) => ({ _rows: rows }),
    book_append_sheet: (wb, ws, name) => { wb.SheetNames.push(name); wb.Sheets[name] = ws; },
    encode_range: () => 'A1:Q3',
  },
  writeFile(wb, filename) { this.last = { names: wb.SheetNames.slice(), filename: filename, rtl: !!(wb.Workbook && wb.Workbook.Views && wb.Workbook.Views[0].RTL) }; },
};
const written = ClientsExcel.writeWorkbook(stubXlsx, model, 'test.xlsx');
check(written.ok && stubXlsx.last.filename === 'test.xlsx', 'writeWorkbook uses SheetJS writeFile');
check(stubXlsx.last.names.join(',') === 'ملخص,العملاء,الزيارات,حسب السنة,حسب الشهر', 'written workbook keeps Arabic sheet names');
check(stubXlsx.last.rtl === true, 'workbook view is right-to-left');
check(model.sheets[1].cols && model.sheets[1].cols[2].wch >= 10, 'client columns have widths for a readable sheet');

check(/function exportClientsExcel/.test(indexSrc) && /onclick="exportClientsExcel\(\)"/.test(indexSrc), 'clients page has an Excel export action');
check(/cloud\/clients-excel\.js/.test(indexSrc), 'clients Excel helper is loaded in the app');

if (errors.length) {
  console.error('FAIL clients-excel-export');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS remediation:clients-excel-export');
