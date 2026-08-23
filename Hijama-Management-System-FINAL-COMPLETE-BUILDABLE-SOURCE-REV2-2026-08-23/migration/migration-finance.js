/**
 * Safe financial defaults for imported / incomplete client visits.
 * Ensures stub or partial imports do not affect accounts, commissions, or reports.
 */
(function (global) {
  'use strict';

  const MC = global.MigrationClient || {};

  function isMapped(mapping, field) {
    return MC.isMapped ? MC.isMapped(mapping, field) : (mapping && mapping[field] != null && mapping[field] >= 0);
  }

  function hasMappedValue(rec, mapping, field) {
    if (!isMapped(mapping, field)) return false;
    const v = rec[field];
    if (v == null || v === '') return false;
    if (field === 'cups') return parseFloat(v) > 0;
    if (field === 'total' || field === 'cash' || field === 'card') {
      return parseFloat(String(v).replace(/[^\d.]/g, '')) > 0;
    }
    return true;
  }

  function assessImportFinancials(rec, mapping, isStub) {
    if (isStub) {
      return { billable: false, hasDoctor: false, hasCups: false, hasPayment: false, reason: 'stub' };
    }
    const hasDoctor = hasMappedValue(rec, mapping, 'doctor');
    const hasCups = hasMappedValue(rec, mapping, 'cups');
    const hasTotal = hasMappedValue(rec, mapping, 'total');
    const hasCash = hasMappedValue(rec, mapping, 'cash');
    const hasCard = hasMappedValue(rec, mapping, 'card');
    const hasPayment = hasTotal || hasCash || hasCard;
    const billable = hasPayment && (hasTotal || hasCash || hasCard);
    return { billable, hasDoctor, hasCups, hasPayment, hasTotal, hasCash, hasCard, reason: billable ? 'complete' : 'incomplete' };
  }

  function isBillableCase(c) {
    if (!c) return false;
    if (c.excludeFromFinancials || c.migrationStub || c.financialPending) return false;
    if ((Number(c.total) || 0) <= 0 && (Number(c.cash) || 0) <= 0 && (Number(c.card) || 0) <= 0) return false;
    return true;
  }

  function zeroFinancialFields(caseRec) {
    caseRec.cups = Number(caseRec.cups) > 0 ? caseRec.cups : 0;
    caseRec.preTax = 0;
    caseRec.vat = 0;
    caseRec.total = 0;
    caseRec.cash = 0;
    caseRec.card = 0;
    caseRec.cardType = '';
    caseRec.commission = 0;
    caseRec.discountAmt = 0;
    caseRec.discountVal = 0;
    caseRec.discountType = 'none';
    caseRec.rawPreTax = 0;
    caseRec.autoTotal = 0;
    caseRec.extraTotal = 0;
    caseRec.isManualPrice = false;
    caseRec.excludeFromFinancials = true;
    return caseRec;
  }

  global.MigrationFinance = {
    isBillableCase,
    assessImportFinancials,
    hasMappedValue,
    zeroFinancialFields
  };
  global.isBillableCase = isBillableCase;
})(typeof window !== 'undefined' ? window : globalThis);
