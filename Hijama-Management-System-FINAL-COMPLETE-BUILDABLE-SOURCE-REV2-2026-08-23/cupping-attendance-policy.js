/**
 * Cupping Center — Attendance late/short-hours policy (خصومات التأخير ونقص الدوام)
 */
(function (global) {
  'use strict';

  const DEFAULT_POLICY = {
    enabled: true,
    graceMinutes: 15,
    workHoursPerDay: 8,
    seriousLateMinutes: 30,
    warningResetMonthly: true
  };

  const SHIFT_DEFAULTS = {
    morningStart: '06:00',
    eveningStart: '14:00',
    eveningEnd: '23:00',
    eveningOtHours: 1
  };

  const WARNING_LABELS = {
    1: 'إنذار شفهي / ملاحظة',
    2: 'إنذار كتابي أول',
    3: 'إنذار كتابي نهائي'
  };

  function ensureAttPolicySettings() {
    if (!global.settings) global.settings = {};
    if (!global.settings.attendancePolicy) {
      global.settings.attendancePolicy = Object.assign({}, DEFAULT_POLICY);
    }
    const p = global.settings.attendancePolicy;
    Object.keys(DEFAULT_POLICY).forEach(k => {
      if (p[k] === undefined) p[k] = DEFAULT_POLICY[k];
    });
    if ('shiftStart' in p) delete p.shiftStart;
    return p;
  }

  function parseTimeToMinutes(t) {
    if (!t) return null;
    const parts = String(t).trim().split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  function getShiftDefaults() {
    return Object.assign({}, SHIFT_DEFAULTS);
  }

  function isEveningAttendance(record, type) {
    const t = type || record?.type;
    return t === 'shift2' || (t === 'normal' && record?.workShift === 'evening');
  }

  function getRecordShiftEnd(record, type) {
    const t = type || record?.type || 'normal';
    const defs = getShiftDefaults();
    if (isEveningAttendance(record, t)) return defs.eveningEnd;
    return defs.eveningStart;
  }

  function getRecordShiftStart(record, type) {
    const t = type || record?.type || 'normal';
    if (t === 'fullOT') return null;
    if (record && record.shiftStart) return record.shiftStart;
    if (isEveningAttendance(record, t)) return SHIFT_DEFAULTS.eveningStart;
    return SHIFT_DEFAULTS.morningStart;
  }

  function getDoctorShiftStart(doc, type, record) {
    return getRecordShiftStart(record || null, type);
  }

  /** Required work hours per employee/day — used for OT only (not late). */
  function getRequiredWorkHours(doc, type, record) {
    if (type === 'fullOT') return 0;
    const p = ensureAttPolicySettings();
    if (doc && doc.workHoursPerDay > 0) return doc.workHoursPerDay;
    return p.workHoursPerDay || 8;
  }

  function getShiftRegularHours(doc, type, record) {
    return getRequiredWorkHours(doc, type, record);
  }

  function calcShiftOtHours(doc, type, hours, record) {
    if (type === 'fullOT') return hours || 0;
    const reg = getRequiredWorkHours(doc, type, record);
    return Math.max(0, (hours || 0) - reg);
  }

  function calcDayOtHours(doc, dayHours, type, record) {
    return calcShiftOtHours(doc, type || record?.type || 'normal', dayHours || 0, record);
  }

  function getShiftSpanHours(start, end) {
    const startM = parseTimeToMinutes(start);
    const endM = parseTimeToMinutes(end);
    if (startM === null || endM === null || endM <= startM) return null;
    return (endM - startM) / 60;
  }

  function getDoctorWorkHours(doc, type, record) {
    if (type) return getShiftRegularHours(doc, type, record);
    const p = ensureAttPolicySettings();
    const h = (doc && doc.workHoursPerDay) || p.workHoursPerDay || 8;
    return h > 0 ? h : 8;
  }

  function calcMinuteRate(doc) {
    const workH = getDoctorWorkHours(doc);
    const dayVal = (doc && doc.dayValue) || 0;
    const salary = (doc && doc.salary) || 0;
    if (dayVal > 0 && workH > 0) return dayVal / workH / 60;
    if (salary > 0 && workH > 0) return salary / 30 / workH / 60;
    return 0;
  }

  function isWorkAttendanceType(type) {
    return ['normal', 'shift1', 'shift2', 'fullOT'].includes(type);
  }

  function isPrimaryAttendanceRecord(rec) {
    if (!rec) return false;
    if (rec.type === 'normal' || rec.type === 'fullOT') return true;
    if (rec.type === 'shift1') return true;
    return false;
  }

  function clearPolicyFields(rec) {
    if (!rec) return;
    rec.lateMinutes = 0;
    rec.lateDeductMinutes = 0;
    rec.lateDeductAmount = 0;
    rec.shortMinutes = 0;
    rec.shortDeductAmount = 0;
    rec.warningLevel = 0;
    rec.warningLabel = '';
    rec.isSeriousLate = false;
    rec.policyNote = '';
    rec.attDeductTotal = 0;
  }

  function getMonthYearFromDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }

  function countWarningsInMonth(doctorId, month, year, allAttendance, excludeId) {
    return (allAttendance || []).filter(a => {
      if (excludeId && a.id === excludeId) return false;
      if (a.doctorId !== doctorId) return false;
      const ad = new Date(a.date + 'T12:00:00');
      if (ad.getMonth() + 1 !== month || ad.getFullYear() !== year) return false;
      return (a.warningLevel || 0) > 0 && !a.lateExcused;
    }).length;
  }

  function getCombinedDayHours(doctorId, date, type, totalHours, allAttendance, excludeId) {
    if (type !== 'shift1' && type !== 'shift2') return totalHours || 0;
    const otherType = type === 'shift1' ? 'shift2' : 'shift1';
    const other = (allAttendance || []).find(a =>
      a.doctorId === doctorId && a.date === date && a.type === otherType && a.id !== excludeId
    );
    return (totalHours || 0) + (other ? (other.totalHours || 0) : 0);
  }

  function findPrimaryDayRecord(doctorId, date, allAttendance) {
    const dayRecs = (allAttendance || []).filter(a =>
      a.doctorId === doctorId && a.date === date && isWorkAttendanceType(a.type)
    );
    return dayRecs.find(a => a.type === 'normal')
      || dayRecs.find(a => a.type === 'fullOT')
      || dayRecs.find(a => a.type === 'shift1')
      || dayRecs.find(a => a.type === 'shift2')
      || null;
  }

  function buildDayContext(doctorId, date, allAttendance, excludeId) {
    const dayRecs = (allAttendance || []).filter(a =>
      a.doctorId === doctorId && a.date === date && isWorkAttendanceType(a.type) && a.id !== excludeId
    );
    const normal = dayRecs.find(a => a.type === 'normal');
    const shift1 = dayRecs.find(a => a.type === 'shift1');
    const shift2 = dayRecs.find(a => a.type === 'shift2');
    const fullOT = dayRecs.find(a => a.type === 'fullOT');
    const primary = normal || fullOT || shift1 || shift2;
    const timeIn = (shift1 || normal || shift2 || fullOT)?.timeIn || '';
    const timeOut = (shift2 || normal || shift1 || fullOT)?.timeOut || '';
    let totalHours = 0;
    if (shift1 || shift2) {
      totalHours = (shift1?.totalHours || 0) + (shift2?.totalHours || 0);
    } else if (normal) {
      totalHours = normal.totalHours || 0;
    } else if (fullOT) {
      totalHours = fullOT.totalHours || 0;
    }
    return {
      primary,
      type: primary?.type || 'normal',
      timeIn,
      timeOut,
      totalHours
    };
  }

  function analyzeAttendanceDay(doc, partial, allAttendance) {
    const p = ensureAttPolicySettings();
    const result = {
      lateMinutes: 0,
      lateDeductMinutes: 0,
      lateDeductAmount: 0,
      shortMinutes: 0,
      shortDeductAmount: 0,
      warningLevel: 0,
      warningLabel: '',
      isSeriousLate: false,
      policyNote: '',
      attDeductTotal: 0
    };
    if (!p.enabled || !doc) return result;

    const type = partial.type || 'normal';
    if (!isWorkAttendanceType(type)) return result;
    if (type === 'fullOT') return result;

    const date = partial.date;
    const excludeId = partial.id;
    const timeIn = partial.timeIn;
    const totalHours = partial.totalHours || 0;
    const minuteRate = calcMinuteRate(doc);
    const grace = p.graceMinutes || 15;
    const serious = p.seriousLateMinutes || 30;
    const { month, year } = getMonthYearFromDate(date);
    const priorWarnings = countWarningsInMonth(doc.id, month, year, allAttendance, excludeId);

    const requiredHours = getRequiredWorkHours(doc, type, partial);
    const actualHours = partial.totalHours || 0;
    const hoursComplete = actualHours >= requiredHours - 0.01 && actualHours > 0;

    if (timeIn && !partial.lateExcused && !hoursComplete) {
      const inM = parseTimeToMinutes(timeIn);
      const startM = parseTimeToMinutes(getRecordShiftStart(partial, type));
      if (inM !== null && startM !== null && inM > startM) {
        result.lateMinutes = inM - startM;
      }
    } else if (timeIn && !partial.lateExcused && hoursComplete && partial.lateExcused !== true) {
      const inM = parseTimeToMinutes(timeIn);
      const startM = parseTimeToMinutes(getRecordShiftStart(partial, type));
      if (inM !== null && startM !== null && inM > startM) {
        result.lateMinutes = inM - startM;
        result.policyNote = `اكتملت ${requiredHours} س — تأخير ${result.lateMinutes} د بدون خصم`;
      }
    }

    if (!partial.leaveExcused && actualHours > 0 && actualHours < requiredHours - 0.01) {
      const missingMin = Math.round((requiredHours - actualHours) * 60);
      if (missingMin > 0) {
        result.shortMinutes = missingMin;
        result.shortDeductAmount = missingMin * minuteRate;
        const shortNote = `نقص دوام ${Math.floor(missingMin / 60)}س ${missingMin % 60}د`;
        result.policyNote = result.policyNote ? `${result.policyNote} | ${shortNote}` : shortNote;
      }
    } else if (!partial.leaveExcused && !hoursComplete && ['normal', 'shift1', 'shift2'].includes(type) && partial.timeOut) {
      const outM = parseTimeToMinutes(partial.timeOut);
      const endM = parseTimeToMinutes(getRecordShiftEnd(partial, type));
      if (outM !== null && endM !== null && outM < endM && !result.shortMinutes) {
        result.shortMinutes = endM - outM;
        result.shortDeductAmount = result.shortMinutes * minuteRate;
        const shortNote = `انصراف مبكر ${Math.floor(result.shortMinutes / 60)}س ${result.shortMinutes % 60}د`;
        result.policyNote = result.policyNote ? `${result.policyNote} | ${shortNote}` : shortNote;
      }
    }

    if (result.lateMinutes > 0 && !partial.lateExcused && !hoursComplete) {
      if (result.lateMinutes <= grace) {
        result.policyNote = `تأخير ${result.lateMinutes} د — بدون إنذار أو خصم`;
      } else {
        const penalizable = result.lateMinutes - grace;
        if (result.lateMinutes > serious) {
          result.isSeriousLate = true;
          result.lateDeductMinutes = penalizable;
          result.lateDeductAmount = result.lateDeductMinutes * minuteRate;
          result.policyNote = `تأخير جسيم (${result.lateMinutes} د) — خصم فوري`;
        } else if (priorWarnings < 3) {
          const level = Math.min(priorWarnings + 1, 3);
          result.warningLevel = level;
          result.warningLabel = WARNING_LABELS[level] || '';
          result.policyNote = `تأخير ${result.lateMinutes} د — ${result.warningLabel}`;
        } else {
          result.lateDeductMinutes = penalizable;
          result.lateDeductAmount = result.lateDeductMinutes * minuteRate;
          result.policyNote = `تأخير ${result.lateMinutes} د — خصم أجر (بعد 3 إنذارات)`;
        }
      }
    }

    if (partial.lateExcused) {
      result.lateMinutes = 0;
      result.lateDeductMinutes = 0;
      result.lateDeductAmount = 0;
      result.warningLevel = 0;
      result.warningLabel = '';
      result.isSeriousLate = false;
      result.policyNote = 'تأخير بإذن — بدون إنذار أو خصم';
    } else if (hoursComplete && result.lateMinutes > 0) {
      result.lateDeductMinutes = 0;
      result.lateDeductAmount = 0;
      result.warningLevel = 0;
      result.warningLabel = '';
      result.isSeriousLate = false;
      if (!result.policyNote) {
        result.policyNote = `اكتملت ساعات العمل (${requiredHours} س) — بدون خصم تأخير`;
      }
    }

    if (result.shortMinutes > 0 && !partial.leaveExcused && hoursComplete) {
      result.shortMinutes = 0;
      result.shortDeductAmount = 0;
    } else if (partial.leaveExcused) {
      result.shortMinutes = 0;
      result.shortDeductAmount = 0;
      if (!result.policyNote) {
        result.policyNote = 'انصراف بإذن — بدون خصم';
      } else if (!result.policyNote.includes('انصراف بإذن')) {
        result.policyNote = `${result.policyNote} | انصراف بإذن`;
      }
    }

    result.attDeductTotal = (result.lateDeductAmount || 0) + (result.shortDeductAmount || 0);
    return result;
  }

  function applyPolicyToRecord(doc, record, allAttendance) {
    if (!record || !doc) return record;
    const dayRecs = (allAttendance || []).filter(a =>
      a.doctorId === record.doctorId && a.date === record.date && isWorkAttendanceType(a.type)
    );
    dayRecs.forEach(s => clearPolicyFields(s));

    const shiftRecs = dayRecs.filter(a => a.type === 'shift1' || a.type === 'shift2');
    if (shiftRecs.length) {
      const combinedHours = shiftRecs.reduce((s, r) => s + (r.totalHours || 0), 0);
      const anchor = shiftRecs.find(a => a.type === 'shift1') || shiftRecs[0];
      if (anchor && (anchor.timeIn || anchor.timeOut)) {
        const analysis = analyzeAttendanceDay(doc, {
          id: anchor.id,
          date: anchor.date,
          type: anchor.type,
          timeIn: shiftRecs.find(a => a.timeIn)?.timeIn || anchor.timeIn,
          timeOut: shiftRecs.find(a => a.timeOut)?.timeOut || anchor.timeOut,
          totalHours: combinedHours,
          shiftStart: anchor.shiftStart,
          workShift: anchor.workShift,
          lateExcused: shiftRecs.some(a => a.lateExcused),
          leaveExcused: shiftRecs.some(a => a.leaveExcused)
        }, allAttendance);
        shiftRecs.forEach(rec => {
          clearPolicyFields(rec);
          if (rec.id === anchor.id) Object.assign(rec, analysis);
        });
      }
      return record;
    }

    const ctx = buildDayContext(record.doctorId, record.date, allAttendance, null);
    const target = ctx.primary || record;
    if (!target.timeIn && !target.timeOut && !ctx.timeIn) {
      clearPolicyFields(target);
      return record;
    }

    const analysis = analyzeAttendanceDay(doc, {
      id: target.id,
      date: target.date,
      type: target.type || 'normal',
      timeIn: ctx.timeIn || target.timeIn,
      timeOut: ctx.timeOut || target.timeOut,
      totalHours: ctx.totalHours || target.totalHours || 0,
      shiftStart: target.shiftStart,
      workShift: target.workShift,
      lateExcused: target.lateExcused,
      leaveExcused: target.leaveExcused
    }, allAttendance);

    Object.assign(target, analysis);
    return record;
  }

  function recalcAllAttendancePolicy(allAttendance, doctors) {
    if (!ensureAttPolicySettings().enabled) return;
    (allAttendance || []).forEach(a => {
      if (isWorkAttendanceType(a.type)) clearPolicyFields(a);
    });
    const datesByDoc = {};
    (allAttendance || []).forEach(a => {
      if (!isWorkAttendanceType(a.type)) return;
      if (!datesByDoc[a.doctorId]) datesByDoc[a.doctorId] = new Set();
      datesByDoc[a.doctorId].add(a.date);
    });
    Object.keys(datesByDoc).forEach(docId => {
      [...datesByDoc[docId]].sort().forEach(date =>
        reconcileDayAttendancePolicy(docId, date, allAttendance, doctors)
      );
    });
  }

  function reconcileDayAttendancePolicy(doctorId, date, allAttendance, doctors) {
    const doc = (doctors || []).find(d => d.id === doctorId);
    if (!doc) return;
    const primary = findPrimaryDayRecord(doctorId, date, allAttendance);
    if (!primary) return;
    applyPolicyToRecord(doc, primary, allAttendance);
  }

  function calcAttendancePolicyDeductions(docAtt, doc) {
    const records = (docAtt || []).filter(a => isWorkAttendanceType(a.type));
    let lateDeduct = 0;
    let shortDeduct = 0;
    let warningCount = 0;
    let seriousCount = 0;
    records.forEach(r => {
      lateDeduct += r.lateDeductAmount || 0;
      shortDeduct += r.shortDeductAmount || 0;
      if ((r.warningLevel || 0) > 0) warningCount++;
      if (r.isSeriousLate) seriousCount++;
    });
    const total = lateDeduct + shortDeduct;
    return { lateDeduct, shortDeduct, total, warningCount, seriousCount };
  }

  function renderAttendanceDeductionRows(docAtt, doc) {
    const { lateDeduct, shortDeduct, total, warningCount, seriousCount } = calcAttendancePolicyDeductions(docAtt, doc);
    let html = '';
    if (lateDeduct > 0) {
      html += `<div class="payroll-row" style="color:var(--danger)">
        <span>⏰ خصم التأخير${seriousCount ? ` (${seriousCount} جسيم)` : ''}</span>
        <span dir="ltr">- ${global.fmtMoney ? global.fmtMoney(lateDeduct) : lateDeduct.toFixed(2)}</span></div>`;
    }
    if (shortDeduct > 0) {
      html += `<div class="payroll-row" style="color:var(--danger)">
        <span>📉 خصم نقص الدوام</span>
        <span dir="ltr">- ${global.fmtMoney ? global.fmtMoney(shortDeduct) : shortDeduct.toFixed(2)}</span></div>`;
    }
    if (warningCount > 0 && total === 0) {
      html += `<div class="payroll-row" style="color:var(--warning);font-size:12px">
        <span>⚠️ إنذارات تأخير هذا الشهر: ${warningCount}</span><span></span></div>`;
    }
    return { html, total, warningCount, lateDeduct, shortDeduct };
  }

  function getEmployeeWarningCount(doctorId, month, year, allAttendance) {
    return countWarningsInMonth(doctorId, month, year, allAttendance);
  }

  function getTodayISO() {
    if (typeof global.getTodayISO === 'function') return global.getTodayISO();
    return new Date().toISOString().slice(0, 10);
  }

  function eachDateUpToToday(month, year) {
    const dates = [];
    const today = getTodayISO();
    const lastDay = new Date(year, month, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
      const m = String(month).padStart(2, '0');
      const day = String(d).padStart(2, '0');
      const iso = `${year}-${m}-${day}`;
      if (iso > today) break;
      dates.push(iso);
    }
    return dates;
  }

  function getRegisteredToday(allAttendance, doctors) {
    const today = getTodayISO();
    const active = (doctors || []).filter(d => d.active);
    const registered = [];
    const missing = [];
    active.forEach(doc => {
      const has = (allAttendance || []).some(a => a.doctorId === doc.id && a.date === today);
      if (has) registered.push(doc);
      else missing.push(doc);
    });
    return { today, registered, missing };
  }

  function getMonthlyRegistrationGaps(month, year, allAttendance, doctors) {
    const dates = eachDateUpToToday(month, year);
    const active = (doctors || []).filter(d => d.active);
    return active.map(doc => {
      const missingDates = dates.filter(d =>
        !(allAttendance || []).some(a => a.doctorId === doc.id && a.date === d)
      );
      return { doc, missingDates, missingCount: missingDates.length, totalDays: dates.length };
    }).filter(x => x.missingCount > 0);
  }

  function previewAttendancePolicy(doc, partial, allAttendance) {
    return analyzeAttendanceDay(doc, partial, allAttendance);
  }

  function formatPolicyPreview(analysis) {
    if (!analysis) return '';
    const parts = [];
    if (analysis.warningLevel > 0) {
      parts.push(`⚠️ ${analysis.warningLabel || 'إنذار'} (${analysis.warningLevel}/3)`);
    }
    if (analysis.lateDeductAmount > 0) {
      parts.push(`⏰ خصم تأخير: ${global.fmtMoney ? global.fmtMoney(analysis.lateDeductAmount) : analysis.lateDeductAmount.toFixed(2)}`);
    }
    if (analysis.shortDeductAmount > 0) {
      parts.push(`📉 خصم نقص دوام: ${global.fmtMoney ? global.fmtMoney(analysis.shortDeductAmount) : analysis.shortDeductAmount.toFixed(2)}`);
    }
    if (analysis.isSeriousLate) parts.push('🚨 تأخير جسيم');
    return parts.join(' · ') || (analysis.lateMinutes > 0 ? `تأخير ${analysis.lateMinutes} د — بدون إنذار أو خصم` : '');
  }

  function saveAttPolicyFromUI() {
    ensureAttPolicySettings();
    const p = global.settings.attendancePolicy;
    const g = id => document.getElementById(id);
    p.enabled = g('att-pol-enabled') ? g('att-pol-enabled').checked : true;
    p.graceMinutes = parseInt(g('att-pol-grace')?.value, 10) || 15;
    p.workHoursPerDay = parseFloat(g('att-pol-hours')?.value) || 8;
    p.seriousLateMinutes = parseInt(g('att-pol-serious')?.value, 10) || 30;
    if (global.DB) global.DB.set('settings', global.settings);
    if (typeof global.recalcAllAttendancePolicy === 'function' && global.attendance) {
      global.recalcAllAttendancePolicy(global.attendance, global.doctors || []);
      if (global.DB) global.DB.set('attendance', global.attendance);
    }
    if (global.notify) global.notify('✅ تم حفظ سياسة الحضور');
    if (typeof global.refreshAttPolicyUI === 'function') global.refreshAttPolicyUI();
    if (typeof global.refreshAllAttViews === 'function') global.refreshAllAttViews();
  }

  function loadAttPolicyToUI() {
    const p = ensureAttPolicySettings();
    const g = id => document.getElementById(id);
    if (g('att-pol-enabled')) g('att-pol-enabled').checked = p.enabled !== false;
    if (g('att-pol-grace')) g('att-pol-grace').value = p.graceMinutes;
    if (g('att-pol-hours')) g('att-pol-hours').value = p.workHoursPerDay;
    if (g('att-pol-serious')) g('att-pol-serious').value = p.seriousLateMinutes;
  }

  global.ensureAttPolicySettings = ensureAttPolicySettings;
  global.getShiftDefaults = getShiftDefaults;
  global.getRecordShiftStart = getRecordShiftStart;
  global.getRecordShiftEnd = getRecordShiftEnd;
  global.getDoctorShiftStart = getDoctorShiftStart;
  global.getRequiredWorkHours = getRequiredWorkHours;
  global.getShiftRegularHours = getShiftRegularHours;
  global.calcShiftOtHours = calcShiftOtHours;
  global.calcDayOtHours = calcDayOtHours;
  global.getDoctorWorkHours = getDoctorWorkHours;
  global.normalizeDoctorShifts = getShiftDefaults;
  global.calcMinuteRate = calcMinuteRate;
  global.analyzeAttendanceDay = analyzeAttendanceDay;
  global.applyPolicyToRecord = applyPolicyToRecord;
  global.reconcileDayAttendancePolicy = reconcileDayAttendancePolicy;
  global.recalcAllAttendancePolicy = recalcAllAttendancePolicy;
  global.calcAttendancePolicyDeductions = calcAttendancePolicyDeductions;
  global.renderAttendanceDeductionRows = renderAttendanceDeductionRows;
  global.getEmployeeWarningCount = getEmployeeWarningCount;
  global.getRegisteredToday = getRegisteredToday;
  global.getMonthlyRegistrationGaps = getMonthlyRegistrationGaps;
  global.previewAttendancePolicy = previewAttendancePolicy;
  global.formatPolicyPreview = formatPolicyPreview;
  global.saveAttPolicyFromUI = saveAttPolicyFromUI;
  global.loadAttPolicyToUI = loadAttPolicyToUI;
  global.WARNING_LABELS_ATT = WARNING_LABELS;

})(typeof window !== 'undefined' ? window : globalThis);
