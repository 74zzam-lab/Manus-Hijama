#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const global = {
  settings: { attendancePolicy: { enabled: true, graceMinutes: 15, workHoursPerDay: 8, seriousLateMinutes: 30 } },
  fmtMoney: n => n.toFixed(2) + ' ر.س'
};

vm.runInNewContext(fs.readFileSync(path.join(root, 'cupping-attendance-policy.js'), 'utf8'), global);

const doc = { id: 'd1', name: 'أحمد', salary: 6000, dayValue: 200, workHoursPerDay: 8 };
const attendance = [];

function saveDay(date, timeIn, timeOut, totalHours, extra) {
  const rec = { id: Date.now().toString() + Math.random(), doctorId: 'd1', doctorName: 'أحمد', date, timeIn, timeOut, totalHours, type: 'normal', shiftStart: '06:00', ...(extra || {}) };
  attendance.push(rec);
  global.applyPolicyToRecord(doc, rec, attendance);
  return rec;
}

const errors = [];
const minuteRate = global.calcMinuteRate(doc);

// 10 min late — within grace: no warning, no deduct (8h completed)
const rGrace = saveDay('2026-06-01', '06:10', '14:10', 8);
if (rGrace.warningLevel > 0) errors.push('warnGrace=' + rGrace.warningLevel);
if (rGrace.lateDeductAmount > 0) errors.push('deductGrace=' + rGrace.lateDeductAmount);
if (rGrace.shortDeductAmount > 0) errors.push('shortOnLateArrival=' + rGrace.shortDeductAmount);
if (!rGrace.policyNote.includes('بدون خصم')) errors.push('graceNote=' + rGrace.policyNote);

// 20 min late — beyond grace, first warning, no deduct
const r1 = saveDay('2026-06-02', '06:20', '14:00', 7.67);
if (r1.warningLevel !== 1) errors.push('warn1=' + r1.warningLevel);
if (r1.lateDeductAmount > 0) errors.push('deduct1=' + r1.lateDeductAmount);

// 20 min late again — second warning
const r2 = saveDay('2026-06-03', '06:20', '14:00', 7.67);
if (r2.warningLevel !== 2) errors.push('warn2=' + r2.warningLevel);

// third warning
saveDay('2026-06-04', '06:20', '14:00', 7.67);

// 20 min late 4th time beyond grace — deduct only minutes after grace (5 min)
const r4 = saveDay('2026-06-05', '06:20', '14:00', 7.67);
if (r4.warningLevel > 0) errors.push('warn4=' + r4.warningLevel);
const expectedDeduct = 5 * minuteRate;
if (Math.abs(r4.lateDeductAmount - expectedDeduct) > 0.01) errors.push('deduct4=' + r4.lateDeductAmount + ' expected=' + expectedDeduct);

// Serious late 35 min — immediate deduct beyond grace (20 min)
const r5 = saveDay('2026-06-06', '06:35', '14:00', 7.42);
if (!r5.isSeriousLate) errors.push('serious flag');
const expectedSerious = 20 * minuteRate;
if (Math.abs(r5.lateDeductAmount - expectedSerious) > 0.01) errors.push('serious deduct=' + r5.lateDeductAmount);

// Short hours 7h — early leave deduct
const r6 = saveDay('2026-06-07', '06:00', '13:00', 7);
if (!(r6.shortDeductAmount > 0)) errors.push('short deduct');

if (Math.abs(minuteRate - (6000 / 30 / 8 / 60)) > 0.001) errors.push('minuteRate=' + minuteRate);

const mReg = global.getShiftRegularHours(doc, 'shift1');
if (Math.abs(mReg - 8) > 0.01) errors.push('morningHours=' + mReg);

const eReg = global.getShiftRegularHours(doc, 'shift2');
if (Math.abs(eReg - 8) > 0.01) errors.push('eveningHours=' + eReg);

const eveOt = global.calcShiftOtHours(doc, 'shift2', 9, { shiftStart: '14:00', type: 'shift2' });
if (Math.abs(eveOt - 1) > 0.01) errors.push('eveningOt=' + eveOt);

// OT from actual hours vs required (not shift span)
const otOnTime = global.calcShiftOtHours(doc, 'normal', 8, { shiftStart: '15:00', type: 'normal' });
if (Math.abs(otOnTime) > 0.01) errors.push('otOnTime=' + otOnTime);
const otExtra = global.calcShiftOtHours(doc, 'normal', 9, { shiftStart: '15:00', type: 'normal' });
if (Math.abs(otExtra - 1) > 0.01) errors.push('otExtra=' + otExtra);

// Late from shift start only — 1h late, 8h work, no short or late deduct
const lateOnly = saveDay('2026-06-10', '15:00', '23:00', 8, { shiftStart: '14:00' });
if (lateOnly.lateMinutes !== 60) errors.push('lateOnlyMin=' + lateOnly.lateMinutes);
if (lateOnly.lateDeductAmount > 0) errors.push('lateOnlyDeduct=' + lateOnly.lateDeductAmount);
if (lateOnly.shortDeductAmount > 0) errors.push('lateOnlyShort=' + lateOnly.shortDeductAmount);

// fullOT — no late
const fullOtRec = saveDay('2026-06-11', '10:00', '14:00', 4, { type: 'fullOT', shiftStart: '' });
if (fullOtRec.lateMinutes > 0) errors.push('fullOtLate=' + fullOtRec.lateMinutes);
const fullOtH = global.calcShiftOtHours(doc, 'fullOT', 4, fullOtRec);
if (Math.abs(fullOtH - 4) > 0.01) errors.push('fullOtHours=' + fullOtH);

const excused = saveDay('2026-06-08', '06:30', '14:00', 7.5, { lateExcused: true });
if (excused.warningLevel > 0 || excused.lateDeductAmount > 0) errors.push('excused late');

const leaveExcused = saveDay('2026-06-09', '06:00', '13:00', 7, { leaveExcused: true });
if (leaveExcused.shortDeductAmount > 0 || leaveExcused.shortMinutes > 0) errors.push('excused leave');

// Delete middle warning — remaining days should recalc warning levels
const doc2 = { id: 'd2', name: 'خالد', salary: 6000, dayValue: 200, workHoursPerDay: 8 };
const delAtt = [];
function saveDayDel(date, timeIn, timeOut, totalHours) {
  const rec = { id: 'del-' + date, doctorId: 'd2', doctorName: 'خالد', date, timeIn, timeOut, totalHours, type: 'normal', shiftStart: '06:00' };
  delAtt.push(rec);
  global.applyPolicyToRecord(doc2, rec, delAtt);
  return rec;
}
saveDayDel('2026-07-01', '06:20', '14:00', 7.67);
saveDayDel('2026-07-02', '06:20', '14:00', 7.67);
saveDayDel('2026-07-03', '06:20', '14:00', 7.67);
if (delAtt[2].warningLevel !== 3) errors.push('delWarn3=' + delAtt[2].warningLevel);
delAtt.splice(1, 1);
global.recalcAllAttendancePolicy(delAtt, [doc2]);
if (delAtt[1].warningLevel !== 2) errors.push('delRecalc=' + delAtt[1].warningLevel);

const monthDed = global.calcAttendancePolicyDeductions(attendance, doc);
if (!(monthDed.total > 0)) errors.push('month total');

if (errors.length) {
  console.error('FAIL:', errors.join('; '));
  process.exit(1);
}
console.log('OK: attendance policy verified');
console.log('  grace sample:', rGrace.lateMinutes, 'min — no warn');
console.log('  warnings sample:', r1.warningLevel, r2.warningLevel);
console.log('  4th late deduct:', r4.lateDeductAmount.toFixed(2));
console.log('  month total deduct:', monthDed.total.toFixed(2));
