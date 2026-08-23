/**
 * Phase-1 frozen snapshot of pure commission / insurance / payroll math
 * extracted from index.html (calcDoctorCommission, getServiceCommission,
 * calcMonthlyCommissionBonus, calcInsuranceDeduction, generateInvoice pattern).
 *
 * DO NOT use this module in the Electron app.
 * It exists only so later phases can detect accidental formula drift.
 */
'use strict';

function getServiceCommission(settings, services, svcType, price, cups) {
  const svc = (services || []).find((s) => s.name === svcType) || null;
  if (!svc || svc.commissionMode === 'global') {
    const thr = settings.threshold || 0;
    const rate = settings.commissionRate || 0;
    const commCups = Math.max(0, cups - thr);
    return commCups * rate;
  }
  if (svc.commissionMode === 'fixed') return parseFloat(svc.commission) || 0;
  if (svc.commissionMode === 'pct') return price * ((parseFloat(svc.commission) || 0) / 100);
  if (svc.commissionMode === 'per_cup') {
    const thr = settings.threshold || 0;
    const commCups = Math.max(0, cups - thr);
    return commCups * (parseFloat(svc.commission) || 0);
  }
  return 0;
}

function calcDoctorCommission(doc, settings, services, svcType, price, cups, opts) {
  if (!doc) return getServiceCommission(settings, services, svcType, price, cups);
  const ct = doc.commissionType || 'global';
  if (ct === 'global') return getServiceCommission(settings, services, svcType, price, cups);
  switch (ct) {
    case 'fixed-session':
      return parseFloat(doc.commAmt) || 0;
    case 'fixed-cup':
      return cups * (parseFloat(doc.commAmt) || 0);
    case 'fixed-cup-threshold': {
      const thr = parseFloat(doc.commThreshold) || 0;
      return Math.max(0, cups - thr) * (parseFloat(doc.commAmt) || 0);
    }
    case 'pct-session':
      return price * ((parseFloat(doc.commPct) || 0) / 100);
    case 'progressive': {
      const t1c = parseFloat(doc.commTier1Cups) || 0;
      const t1a = parseFloat(doc.commTier1Amt) || 0;
      const t2a = parseFloat(doc.commTier2Amt) || 0;
      const c1 = Math.min(cups, t1c);
      const c2 = Math.max(0, cups - t1c);
      return c1 * t1a + c2 * t2a;
    }
    case 'progressive-sessions': {
      const sessionNum = opts?.sessionNumber || 1;
      const limit = parseFloat(doc.commTier1Cups) || 0;
      const t1a = parseFloat(doc.commTier1Amt) || 0;
      const t2a = parseFloat(doc.commTier2Amt) || 0;
      if (limit <= 0) return t1a;
      return sessionNum <= limit ? t1a : t2a;
    }
    case 'pct-after-sessions':
    case 'pct-after-revenue':
    case 'retroactive':
      return 0;
    default:
      return getServiceCommission(settings, services, svcType, price, cups);
  }
}

function calcMonthlyCommissionBonus(doc, docCases) {
  const ct = doc.commissionType || 'global';
  const totalSessions = docCases.length;
  const totalRevenue = docCases.reduce((a, c) => a + (c.total || 0), 0);
  const pct = parseFloat(doc.commPct) || 0;
  switch (ct) {
    case 'pct-after-sessions': {
      const thr = parseFloat(doc.commThreshold) || 0;
      if (totalSessions <= thr) return 0;
      return totalRevenue * (pct / 100);
    }
    case 'pct-after-revenue': {
      const target = parseFloat(doc.commRevenue) || 0;
      if (totalRevenue <= target) return 0;
      return (totalRevenue - target) * (pct / 100);
    }
    case 'retroactive': {
      const goal = parseFloat(doc.commThreshold) || 0;
      if (totalSessions < goal) return 0;
      return totalRevenue * (pct / 100);
    }
    default:
      return 0;
  }
}

function calcInsuranceDeduction(doc, settings) {
  if (!doc.insuranceEnabled) return 0;
  const base = (doc.salary || 0) + (doc.housing || 0) + (doc.transport || 0);
  const typ = doc.insuranceType || settings?.insuranceMode || 'pct';
  const val = doc.insuranceVal !== undefined ? doc.insuranceVal : (settings?.insuranceVal || 9.75);
  if (typ === 'fixed') return parseFloat(val) || 0;
  return base * (parseFloat(val) || 0) / 100;
}

function calcPayrollNet(doc, opts) {
  const commission = opts.commission || 0;
  const monthlyCommBonus = opts.monthlyCommBonus || 0;
  const otValue = opts.otValue || 0;
  const totalDeduct = opts.totalDeduct || 0;
  const insuranceDeduct = calcInsuranceDeduction(doc, opts.settings);
  const grossTotal = (doc.salary || 0) + (doc.housing || 0) + (doc.transport || 0)
    + commission + otValue + monthlyCommBonus;
  const netTotal = grossTotal - totalDeduct - insuranceDeduct;
  return { grossTotal, insuranceDeduct, netTotal };
}

function generateInvoiceId(counter, year) {
  const n = Number(counter).toString().padStart(4, '0');
  return `TM-${year}-${n}`;
}

function createClientRecord(input) {
  return {
    id: String(input.id || 'client-1'),
    name: String(input.name || '').trim(),
    phone: String(input.phone || '').trim(),
    nationality: input.nationality || '',
    fileNo: input.fileNo || '',
    notes: input.notes || '',
    active: input.active !== false,
  };
}

function createVisitRecord(input) {
  return {
    id: String(input.id || 'case-1'),
    invoice: input.invoice || generateInvoiceId(1, input.year || 2026),
    date: input.date || '2026-07-01',
    name: input.name || '',
    phone: input.phone || '',
    doctorId: input.doctorId || '',
    doctorName: input.doctorName || '',
    serviceType: input.serviceType || 'حجامة',
    cups: Number(input.cups) || 0,
    cash: Number(input.cash) || 0,
    card: Number(input.card) || 0,
    total: Number(input.total) || 0,
    commission: Number(input.commission) || 0,
    clientRegistryId: input.clientRegistryId || '',
    notes: input.notes || '',
  };
}

function updateVisitRecord(existing, patch) {
  return { ...existing, ...patch, id: existing.id };
}

function createBookingRecord(input) {
  return {
    id: String(input.id || 'bk-1'),
    name: String(input.name || '').trim(),
    phone: String(input.phone || '').trim(),
    date: input.date || '2026-07-01',
    time: input.time || '10:00',
    clientRegistryId: input.clientRegistryId || '',
    fileNo: input.fileNo || '',
    doctorId: input.doctorId || '',
    doctorName: input.doctorName || '—',
    service: input.service || '',
    notes: input.notes || '',
    status: input.status || 'pending',
  };
}

function buildBackupObjectSkeleton(data) {
  return {
    _meta: {
      version: 3,
      date: data.date || '2026-07-27T00:00:00.000Z',
      app: data.app || 'Hijama Management System',
      device: data.device || 'PC-MAIN',
      encrypted: false,
      cloudV2: !!data.cloudV2,
    },
    cases: data.cases || [],
    doctors: data.doctors || [],
    otRecords: data.otRecords || [],
    settings: data.settings || {},
    users: data.users || [],
    packages: data.packages || [],
    services: data.services || [],
    activityLog: data.activityLog || [],
    clientsRegistry: data.clientsRegistry || [],
    attendance: data.attendance || [],
    expenses: data.expenses || [],
    bookings: data.bookings || [],
    invoiceCounter: data.invoiceCounter || 1,
    license: data.license || { meta: null, data: null },
  };
}

module.exports = {
  getServiceCommission,
  calcDoctorCommission,
  calcMonthlyCommissionBonus,
  calcInsuranceDeduction,
  calcPayrollNet,
  generateInvoiceId,
  createClientRecord,
  createVisitRecord,
  updateVisitRecord,
  createBookingRecord,
  buildBackupObjectSkeleton,
};
