/**
 * Smart duplicate detection — multi-criteria client & visit matching.
 */
(function (global) {
  'use strict';

  const MF = global.MigrationFields || {};
  const Core = global.ImportEngineCore || {};

  function normPhone(v) {
    if (Core.normalizeImportPhone) return Core.normalizeImportPhone(v);
    let p = String(v || '').replace(/\D/g, '');
    if (p.startsWith('966')) p = '0' + p.slice(3);
    if (p.length === 9 && p.startsWith('5')) p = '0' + p;
    if (p.length > 10) p = p.slice(-10);
    return p;
  }

  function normName(v) {
    return Core.normalizeImportName ? Core.normalizeImportName(v) : String(v || '').trim().replace(/\s+/g, ' ');
  }

  function buildMigrationIndexes(cases, clientsRegistry) {
    const indexes = Core.buildDedupIndexes ? Core.buildDedupIndexes(cases, clientsRegistry) : {
      caseKeys: new Set(), phones: new Set(), clientByPid: new Map(), clientByPhoneName: new Map()
    };
    indexes.clientByFileNo = new Map();
    indexes.clientByPhone = new Map();
    indexes.clientsById = new Map();
    indexes.visitFingerprints = new Set();

    (clientsRegistry || []).forEach(c => {
      if (!c) return;
      if (c.id) indexes.clientsById.set(c.id, c);
      if (c.fileNo) indexes.clientByFileNo.set(String(c.fileNo).trim().toUpperCase(), c);
      const p = normPhone(c.phone);
      if (p) {
        if (!indexes.clientByPhone.has(p)) indexes.clientByPhone.set(p, []);
        indexes.clientByPhone.get(p).push(c);
      }
    });

    (cases || []).forEach(c => {
      indexes.visitFingerprints.add(visitFingerprint(c));
    });

    return indexes;
  }

  function visitFingerprint(rec) {
    const p = normPhone(rec.phone);
    const date = rec.date || rec.caseDate || '';
    const doctor = String(rec.doctor || rec.doctorName || '').trim().toLowerCase();
    const service = String(rec.service || rec.serviceType || '').trim().toLowerCase();
    const total = rec.total != null ? String(rec.total) : '';
    const session = String(rec.sessionNo || '').trim();
    return `${p}|${date}|${doctor}|${service}|${total}|${session}`;
  }

  function matchClient(rec, indexes) {
    const reasons = [];
    let client = null;
    let level = MF.MATCH_LEVEL?.NEW || 'new';

    if (rec.patientId) {
      const pid = String(rec.patientId).trim();
      client = indexes.clientByPid?.get(pid) || null;
      if (client) {
        reasons.push('رقم الهوية');
        level = MF.MATCH_LEVEL?.CONFIRMED || 'confirmed';
        return { level, client, reasons };
      }
    }

    if (rec.fileNo) {
      client = indexes.clientByFileNo?.get(String(rec.fileNo).trim().toUpperCase()) || null;
      if (client) {
        reasons.push('رقم الملف');
        level = MF.MATCH_LEVEL?.CONFIRMED || 'confirmed';
        return { level, client, reasons };
      }
    }

    const phone = normPhone(rec.phone);
    const name = normName(rec.name).toLowerCase();

    if (phone && name) {
      client = indexes.clientByPhoneName?.get(`${phone}|${name}`) || null;
      if (client) {
        reasons.push('الجوال + الاسم');
        level = MF.MATCH_LEVEL?.CONFIRMED || 'confirmed';
        return { level, client, reasons };
      }
    }

    if (rec.birthDate && name) {
      const candidates = (indexes.clientByPhone?.get(phone) || []).filter(c =>
        c.birthDate && String(c.birthDate).slice(0, 10) === String(rec.birthDate).slice(0, 10) &&
        normName(c.name).toLowerCase() === name
      );
      if (candidates.length === 1) {
        reasons.push('الاسم + تاريخ الميلاد');
        return { level: MF.MATCH_LEVEL?.CONFIRMED || 'confirmed', client: candidates[0], reasons };
      }
      if (candidates.length > 1) {
        reasons.push('الاسم + تاريخ الميلاد (متعدد)');
        return { level: MF.MATCH_LEVEL?.POSSIBLE || 'possible', client: candidates[0], reasons };
      }
    }

    if (phone) {
      const byPhone = indexes.clientByPhone?.get(phone) || [];
      if (byPhone.length === 1) {
        reasons.push('رقم الجوال');
        return { level: MF.MATCH_LEVEL?.POSSIBLE || 'possible', client: byPhone[0], reasons };
      }
      if (byPhone.length > 1) {
        reasons.push('رقم الجوال (عدة أسماء)');
        return { level: MF.MATCH_LEVEL?.POSSIBLE || 'possible', client: byPhone[0], reasons };
      }
    }

    return { level: MF.MATCH_LEVEL?.NEW || 'new', client: null, reasons };
  }

  function matchVisit(rec, indexes) {
    const fp = visitFingerprint(rec);
    if (indexes.visitFingerprints?.has(fp)) {
      return { exists: true, fingerprint: fp, action: 'update' };
    }
    return { exists: false, fingerprint: fp, action: 'create' };
  }

  global.MigrationIdentity = {
    normPhone, normName, buildMigrationIndexes, visitFingerprint, matchClient, matchVisit
  };
})(typeof window !== 'undefined' ? window : globalThis);
