#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function makeContext(attendanceByMonth) {
  const global = {
    settings: { employeeLedger: { enabled: true, autoCarryOver: true, accrualTypes: [], closings: {} } },
    doctors: [
      { id: 'd1', name: 'أحمد', active: true, salary: 5000, housing: 0, transport: 0, otRate: 0, dayValue: 0, workHoursPerDay: 8 }
    ],
    cases: [],
    otRecords: [],
    DB: {
      _data: {},
      get(k, d) { return this._data[k] !== undefined ? this._data[k] : d; },
      set(k, v) { this._data[k] = v; }
    },
    fmtMoney: n => (Number(n) || 0).toFixed(2) + ' ر.س',
    fmtDate: d => d,
    getActiveUser: () => ({ id: 'u1', fullName: 'Admin', role: 'admin' }),
    hasPermission: () => true,
    isFeatureEnabled: () => true,
    notify: () => {},
    syncAppGlobals: () => {},
    buildPayrollDoctorBlock: (d, month, year) => {
      const attendance = global.DB.get('attendance', []);
      const docAtt = attendance.filter(a => {
        const dt = new Date(a.date);
        return a.doctorId === d.id && dt.getMonth() + 1 === month && dt.getFullYear() === year;
      });
      return { commission: 0, monthlyCommBonus: 0, otValue: 0, docAtt, monthCases: [] };
    },
    document: {
      readyState: 'complete',
      addEventListener: () => {},
      getElementById: () => null,
      createElement: () => ({ appendChild: () => {}, setAttribute: () => {} }),
      head: { appendChild: () => {} },
      body: { appendChild: () => {} }
    }
  };
  global.DB.set('attendance', attendanceByMonth || []);
  return global;
}

function runLedgerTests(global) {
  vm.runInNewContext(fs.readFileSync(path.join(root, 'cupping-employee-ledger.js'), 'utf8'), global);
  return global.EmployeeLedger;
}

const errors = [];
const now = new Date();
const curM = now.getMonth() + 1;
const curY = now.getFullYear();
const prev = curM <= 1 ? { month: 12, year: curY - 1 } : { month: curM - 1, year: curY };
const future = curM >= 12 ? { month: 1, year: curY + 1 } : { month: curM + 1, year: curY };

function attFor(month, year) {
  return [{ id: 'a1', doctorId: 'd1', date: `${year}-${String(month).padStart(2, '0')}-15`, type: 'normal', timeIn: '08:00', timeOut: '16:00' }];
}

// ── Test 1: monthly isolation with attendance data ──
{
  const g = makeContext(attFor(prev.month, prev.year).concat(attFor(curM, curY)));
  const EL = runLedgerTests(g);
  EL.init();
  EL.syncMonth(prev.month, prev.year, { carryOver: false });
  const prevSummary = EL.getSummary('d1', prev.month, prev.year);
  if (!(prevSummary.due > 0)) errors.push('prevDue=' + prevSummary.due);

  EL.syncMonth(curM, curY, { carryOver: true });
  const curSummary = EL.getSummary('d1', curM, curY);
  if (!(curSummary.due > 0)) errors.push('curDue=' + curSummary.due);

  const prevEntries = EL.getEntries().filter(e => e.periodMonth === prev.month && e.periodYear === prev.year && e.status !== 'void');
  const curEntries = EL.getEntries().filter(e => e.periodMonth === curM && e.periodYear === curY && e.status !== 'void');
  if (!prevEntries.length) errors.push('noPrevEntries');
  if (curEntries.some(e => e.periodMonth === prev.month)) errors.push('curHasPrevRows');

  const futureSync = EL.syncMonth(future.month, future.year, { carryOver: true });
  if (futureSync !== 0) errors.push('futureSyncAllowed=' + futureSync);
}

// ── Test 2: empty month should not create salary accruals ──
{
  const emptyM = prev.month <= 1 ? 12 : prev.month - 1;
  const emptyY = prev.month <= 1 ? prev.year - 1 : prev.year;
  const g = makeContext([]);
  const EL = runLedgerTests(g);
  EL.init();
  const synced = EL.syncMonth(emptyM, emptyY, { carryOver: false });
  const acc = EL.getAccruals().filter(a => a.periodMonth === emptyM && a.periodYear === emptyY && a.status !== 'void');
  if (synced !== 0) errors.push('emptyMonthSyncedDoctors=' + synced);
  if (acc.length) errors.push('emptyMonthAccruals=' + acc.length);
}

// ── Test 3: paid source must not remain in next month carryover balance ──
{
  const g = makeContext(attFor(prev.month, prev.year).concat(attFor(curM, curY)));
  const EL = runLedgerTests(g);
  EL.init();
  EL.syncMonth(prev.month, prev.year, { carryOver: false });
  EL.syncMonth(curM, curY, { carryOver: true });
  const beforePay = EL.getSummary('d1', curM, curY);
  const carryBefore = beforePay.carriedAmount;
  if (!(carryBefore > 0)) errors.push('noCarryBeforePay=' + carryBefore);

  const prevRows = EL.getAccruals().filter(a => a.doctorId === 'd1' && a.periodMonth === prev.month && a.periodYear === prev.year && !a.isCarryover && a.status !== 'void');
  const payAmt = prevRows.reduce((s, a) => s + Math.max(0, a.amount - (a.paidAmount || 0)), 0);
  EL.recordPayment({ doctorId: 'd1', month: prev.month, year: prev.year, amount: payAmt, paymentMethod: 'cash' });
  EL.reconcileCarryoversForTargetMonth(curM, curY);

  const afterPay = EL.getSummary('d1', curM, curY);
  const carryRows = EL.getAccruals().filter(a =>
    a.doctorId === 'd1' && a.periodMonth === curM && a.periodYear === curY && a.isCarryover && a.status !== 'void'
  );
  if (afterPay.carriedAmount > 0.01) errors.push('paidCarryRemaining=' + afterPay.carriedAmount);
  if (carryRows.length) errors.push('paidCarryRows=' + carryRows.length);
}

// ── Test 4: سند button must print receipt voucher, not account statement ──
{
  const g = makeContext(attFor(prev.month, prev.year));
  const EL = runLedgerTests(g);
  EL.init();
  EL.syncMonth(prev.month, prev.year, { carryOver: false });
  const pay = EL.recordPayment({ doctorId: 'd1', month: prev.month, year: prev.year, amount: 100, paymentMethod: 'cash' });
  if (!pay?.id) errors.push('noPaymentForVoucherTest');
  if (typeof EL.printPeriodVoucher !== 'function') errors.push('missingPrintPeriodVoucherExport');
  const src = fs.readFileSync(path.join(root, 'cupping-employee-ledger.js'), 'utf8');
  if (/label:\s*'سند'[\s\S]{0,120}printStatement/.test(src)) errors.push('sindButtonStillMapsToPrintStatement');
  if (!src.includes('buildDoctorPeriodPrintActions')) errors.push('missingUnifiedPrintActions');
  if (!src.includes('إقرار استلام مستحقات')) errors.push('missingVoucherAcknowledgmentTemplate');
  if (!src.includes('مفردات مرتب')) errors.push('missingPayslipTemplate');
}

if (errors.length) {
  console.error('FAIL:', errors.join('; '));
  process.exit(1);
}
console.log('OK: ledger monthly isolation, empty-month skip, paid carryover, and voucher button mapping verified');
