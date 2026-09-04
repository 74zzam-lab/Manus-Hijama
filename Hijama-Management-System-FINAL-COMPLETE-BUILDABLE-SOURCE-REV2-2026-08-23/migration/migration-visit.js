/**
 * Visit merge — fingerprint compare, stub visits, case updates.
 */
(function (global) {
  'use strict';

  const MI = global.MigrationIdentity || {};
  const MC = global.MigrationClient || {};

  const STUB_NOTE = 'زيارة مستوردة (بدون تاريخ)';

  function hasVisitData(rec, mapping) {
    if (!rec || !mapping) return false;
    return ['date', 'doctor', 'cups', 'total', 'cash', 'card', 'service', 'sessionNo'].some(f =>
      MC.isMapped(mapping, f) && rec[f] != null && rec[f] !== ''
    );
  }

  function findExistingCase(rec, client, cases) {
    const p = MI.normPhone(rec.phone);
    const name = MI.normName(rec.name).toLowerCase();
    const date = rec.date || '';
    return (cases || []).find(c =>
      (client?.id && c.clientRegistryId === client.id) ||
      (c.fileNo && client?.fileNo && c.fileNo === client.fileNo) ||
      (MI.normPhone(c.phone) === p && MI.normName(c.name).toLowerCase() === name && (c.date || '') === date)
    ) || null;
  }

  function findCaseByFingerprint(rec, cases, client) {
    const fp = MI.visitFingerprint(rec);
    return (cases || []).find(c => {
      if (client?.id && c.clientRegistryId && c.clientRegistryId !== client.id) return false;
      return MI.visitFingerprint({
        phone: c.phone, date: c.date, doctor: c.doctorName, service: c.serviceType,
        total: c.total, sessionNo: c.sessionNo
      }) === fp;
    }) || null;
  }

  function mergeCaseFields(existing, patch, strategy) {
    if (!existing || !patch) return existing;
    const fields = ['name', 'phone', 'patientId', 'nationality', 'doctorId', 'doctorName', 'serviceType',
      'cups', 'preTax', 'vat', 'total', 'cash', 'card', 'commission', 'notes', 'sessionNo'];
    fields.forEach(f => {
      const v = patch[f];
      if (v == null || v === '') return;
      if (strategy === 'replace') existing[f] = v;
      else if (strategy === 'fill_empty' || strategy === 'merge' || strategy === 'update') {
        if (existing[f] == null || existing[f] === '' || existing[f] === 0) existing[f] = v;
        else if (strategy === 'merge' && typeof v === 'string') existing[f] = v;
      }
    });
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  function buildStubVisitMeta(rec) {
    return {
      stub: true,
      notes: STUB_NOTE,
      date: rec.date || new Date().toISOString().slice(0, 10),
      imported: true,
      migrationStub: true
    };
  }

  global.MigrationVisit = {
    STUB_NOTE,
    hasVisitData,
    findExistingCase,
    findCaseByFingerprint,
    mergeCaseFields,
    buildStubVisitMeta
  };
})(typeof window !== 'undefined' ? window : globalThis);
