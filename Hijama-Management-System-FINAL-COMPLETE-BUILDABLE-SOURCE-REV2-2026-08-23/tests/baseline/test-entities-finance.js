#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const math = require('./lib/baseline-math');

const golden = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'golden', 'financial-golden.json'), 'utf8')
);

const { settings, services, cases, expectations: E } = golden;
const errors = [];

function check(name, actual, expected, eps = 0.001) {
  const ok = typeof expected === 'number'
    ? Math.abs(actual - expected) <= eps
    : JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) errors.push(`${name}: got ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
}

// Client create
const client = math.createClientRecord({
  id: 'c1', name: 'محمد علي', phone: '0500000001', nationality: 'سعودي', fileNo: 'F-001',
});
assert.strictEqual(client.name, 'محمد علي');
assert.strictEqual(client.phone, '0500000001');
assert.strictEqual(client.active, true);

// Visit create + update
const visit = math.createVisitRecord({
  id: 'v1',
  invoice: math.generateInvoiceId(1, 2026),
  name: client.name,
  phone: client.phone,
  clientRegistryId: client.id,
  doctorId: 'd1',
  doctorName: 'أحمد',
  cups: 5,
  total: 200,
  cash: 200,
  commission: 15,
});
assert.strictEqual(visit.invoice, 'TM-2026-0001');
const edited = math.updateVisitRecord(visit, { cups: 6, total: 240, cash: 240 });
assert.strictEqual(edited.id, 'v1');
assert.strictEqual(edited.cups, 6);
assert.strictEqual(edited.total, 240);

// Invoice counter format
check('invoice', math.generateInvoiceId(7, 2026), E.invoice_counter_7);

// Service commissions
check('globalService', math.getServiceCommission(settings, services, 'حجامة', 200, 5), E.globalService_5cups);
check('fixedService', math.getServiceCommission(settings, services, 'تدليك', 100, 1), E.fixedService);
check('pctService', math.getServiceCommission(settings, services, 'باقة', 100, 1), E.pctService_100);
check('perCupService', math.getServiceCommission(settings, services, 'كؤوس', 100, 5), E.perCupService_5cups);

// Doctor commissions
check('fixedSession', math.calcDoctorCommission(cases.fixedSession, settings, services, 'حجامة', 200, 5), E.fixedSession);
check('fixedCup', math.calcDoctorCommission(cases.fixedCup, settings, services, 'حجامة', 200, 5), E.fixedCup_5);
check('fixedCupThr', math.calcDoctorCommission(cases.fixedCupThreshold, settings, services, 'حجامة', 200, 5), E.fixedCupThreshold_5);
check('pctSession', math.calcDoctorCommission(cases.pctSession, settings, services, 'حجامة', 200, 5), E.pctSession_200);
check('progressive', math.calcDoctorCommission(cases.progressive, settings, services, 'حجامة', 200, 5), E.progressive_5cups);
check(
  'progSess1',
  math.calcDoctorCommission(cases.progressiveSessions, settings, services, 'حجامة', 200, 5, { sessionNumber: 1 }),
  E.progressiveSessions_session1
);
check(
  'progSess3',
  math.calcDoctorCommission(cases.progressiveSessions, settings, services, 'حجامة', 200, 5, { sessionNumber: 3 }),
  E.progressiveSessions_session3
);

// Aggregate monthly bonuses
const threeCases = [{ total: 100 }, { total: 150 }, { total: 200 }];
check('monthlyPctSessions', math.calcMonthlyCommissionBonus(cases.pctAfterSessions, threeCases), E.monthly_pctAfterSessions);
check('monthlyPctRevenue', math.calcMonthlyCommissionBonus(cases.pctAfterRevenue, threeCases), E.monthly_pctAfterRevenue);
check('monthlyRetro', math.calcMonthlyCommissionBonus(cases.retroactive, threeCases), E.monthly_retroactive);
check('monthlyBelow', math.calcMonthlyCommissionBonus(cases.retroactive, [{ total: 100 }, { total: 100 }]), E.monthly_belowGoal);

// Insurance + payroll net
const emp = {
  salary: 5000, housing: 1000, transport: 1000,
  insuranceEnabled: true, insuranceType: 'pct', insuranceVal: 9.75,
};
check('insPct', math.calcInsuranceDeduction(emp, settings), E.insurance_pct);
check('insFixed', math.calcInsuranceDeduction({ ...emp, insuranceType: 'fixed', insuranceVal: 100 }, settings), E.insurance_fixed);
check('insOff', math.calcInsuranceDeduction({ ...emp, insuranceEnabled: false }, settings), E.insurance_disabled);

const pay = math.calcPayrollNet(emp, {
  settings,
  commission: 100,
  monthlyCommBonus: 50,
  otValue: 50,
  totalDeduct: 0,
});
check('payrollNet', pay.netTotal, E.payroll_net);

// Booking
const booking = math.createBookingRecord({
  id: 'b1', name: 'سارة', phone: '0555555555', date: '2026-07-10', time: '11:30',
  doctorId: 'd1', doctorName: 'أحمد', service: 'حجامة',
});
assert.strictEqual(booking.status, 'pending');
assert.strictEqual(booking.time, '11:30');

// Backup object shape (version 3)
const backup = math.buildBackupObjectSkeleton({
  cases: [visit],
  clientsRegistry: [client],
  bookings: [booking],
  invoiceCounter: 2,
});
assert.strictEqual(backup._meta.version, 3);
assert.ok(Array.isArray(backup.cases));
assert.ok(Array.isArray(backup.bookings));
assert.ok(Object.prototype.hasOwnProperty.call(backup, 'license'));

if (errors.length) {
  console.error('FAIL: baseline financial/entity tests');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: baseline clients/visits/bookings/invoice/commission/insurance/payroll/backup shapes');
console.log('  golden file:', path.relative(process.cwd(), path.join(__dirname, 'golden', 'financial-golden.json')));
