/**
 * Client import — pure parsing, mapping, and dedup helpers (main thread + worker).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ImportEngineCore = factory();
  }
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const IMPORT_FIELDS = {
    name:      { label: 'اسم العميل', required: true },
    phone:     { label: 'رقم الجوال', required: true },
    cups:      { label: 'عدد الكاسات', required: false },
    date:      { label: 'تاريخ الجلسة', required: false },
    doctor:    { label: 'الأخصائي', required: false },
    patientId: { label: 'رقم الهوية', required: false },
    nationality: { label: 'الجنسية', required: false },
    total:     { label: 'قيمة الفاتورة', required: false },
    cash:      { label: 'كاش', required: false },
    card:      { label: 'شبكة', required: false },
    notes:     { label: 'ملاحظات', required: false }
  };

  const IMPORT_COLUMN_ALIASES = {
    name: ['اسم', 'الاسم', 'اسم العميل', 'اسم المريض', 'اسم المراجع', 'العميل', 'المريض', 'name', 'patient', 'client'],
    phone: ['جوال', 'الجوال', 'هاتف', 'الهاتف', 'رقم الجوال', 'رقم الهاتف', 'موبايل', 'mobile', 'phone', 'tel', 'جوال العميل'],
    cups: ['كاسات', 'الكاسات', 'عدد الكاسات', 'كؤوس', 'الكؤوس', 'عدد الكؤوس', 'عدد الكاس', 'cups', 'كاسة'],
    date: ['تاريخ', 'التاريخ', 'تاريخ الجلسة', 'آخر جلسة', 'اخر جلسة', 'تاريخ الزيارة', 'last visit', 'date', 'session date'],
    doctor: ['أخصائي', 'الأخصائي', 'طبيب', 'الطبيب', 'معالج', 'المعالج', 'الدكتور', 'specialist', 'doctor', 'therapist'],
    patientId: ['هوية', 'الهوية', 'إقامة', 'الإقامة', 'رقم الهوية', 'رقم الإقامة', 'id', 'national id', 'iqama'],
    nationality: ['جنسية', 'الجنسية', 'nationality'],
    total: ['المبلغ', 'الإجمالي', 'قيمة', 'القيمة', 'المجموع', 'total', 'amount', 'price', 'سعر'],
    cash: ['كاش', 'نقدي', 'نقد', 'cash'],
    card: ['شبكة', 'بطاقة', 'card', 'visa', 'mada', 'مدى'],
    notes: ['ملاحظات', 'ملاحظة', 'notes', 'note', 'تعليق']
  };

  function normalizeImportPhone(v) {
    return String(v || '').replace(/\D/g, '').replace(/^966/, '0').slice(-10);
  }

  function normalizeImportName(v) {
    return String(v || '').trim().replace(/\s+/g, ' ');
  }

  function parseImportDate(val) {
    if (val == null || val === '') return '';
    if (val instanceof Date && !isNaN(val)) return val.toISOString().split('T')[0];
    if (typeof val === 'number' && val > 20000 && val < 60000) {
      const d = new Date((val - 25569) * 86400000);
      if (!isNaN(d)) return d.toISOString().split('T')[0];
    }
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const dmY = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmY) {
      const [, d, m, y] = dmY;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const parsed = new Date(s);
    if (!isNaN(parsed)) return parsed.toISOString().split('T')[0];
    return '';
  }

  function importRowHash(row) {
    const phone = normalizeImportPhone(row.phone);
    const name = normalizeImportName(row.name).toLowerCase();
    const date = parseImportDate(row.date) || '';
    return `${phone}|${name}|${date}`;
  }

  function scoreColumnMatch(header, fieldKey) {
    const h = String(header || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!h) return 0;
    const aliases = IMPORT_COLUMN_ALIASES[fieldKey] || [];
    let best = 0;
    aliases.forEach(alias => {
      const a = alias.toLowerCase();
      if (h === a) best = Math.max(best, 100);
      else if (h.includes(a) || a.includes(h)) best = Math.max(best, 75);
      else {
        const words = a.split(' ');
        const hits = words.filter(w => w.length > 2 && h.includes(w)).length;
        if (hits) best = Math.max(best, 40 + hits * 15);
      }
    });
    return best;
  }

  function autoDetectImportMapping(headers) {
    const mapping = {};
    const used = new Set();
    Object.keys(IMPORT_FIELDS).forEach(field => {
      let bestIdx = -1;
      let bestScore = 0;
      headers.forEach((h, i) => {
        if (used.has(i)) return;
        const s = scoreColumnMatch(h, field);
        if (s > bestScore) { bestScore = s; bestIdx = i; }
      });
      if (bestIdx >= 0 && bestScore >= 40) {
        mapping[field] = bestIdx;
        used.add(bestIdx);
      }
    });
    return mapping;
  }

  function rowsToImportData(matrix) {
    const clean = (matrix || []).filter(r => r && r.some(c => String(c || '').trim()));
    if (!clean.length) return { headers: [], rows: [] };
    const headers = clean[0].map(h => String(h || '').trim());
    const rows = clean.slice(1).map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] != null ? r[i] : ''; });
      return obj;
    });
    return { headers, rows };
  }

  function mapRowToRecord(raw, mapping, headers) {
    const rec = {};
    Object.entries(mapping).forEach(([field, colIdx]) => {
      if (colIdx == null || colIdx === '' || colIdx < 0) return;
      const key = headers[colIdx];
      rec[field] = raw[key] != null ? raw[key] : '';
    });
    rec.name = normalizeImportName(rec.name);
    rec.phone = normalizeImportPhone(rec.phone);
    if (rec.cups !== '' && rec.cups != null) rec.cups = parseFloat(rec.cups) || 0;
    rec.date = parseImportDate(rec.date);
    if (rec.total !== '' && rec.total != null) rec.total = parseFloat(String(rec.total).replace(/[^\d.]/g, '')) || 0;
    if (rec.cash !== '' && rec.cash != null) rec.cash = parseFloat(String(rec.cash).replace(/[^\d.]/g, '')) || 0;
    if (rec.card !== '' && rec.card != null) rec.card = parseFloat(String(rec.card).replace(/[^\d.]/g, '')) || 0;
    return rec;
  }

  function buildDedupIndexes(existingCases, existingClients) {
    const caseKeys = new Set();
    const phones = new Set();
    const clientByPid = new Map();
    const clientByPhoneName = new Map();
    (existingCases || []).forEach(c => {
      const p = normalizeImportPhone(c.phone);
      if (!p) return;
      phones.add(p);
      caseKeys.add(`${p}|${normalizeImportName(c.name).toLowerCase()}|${c.date || ''}`);
    });
    (existingClients || []).forEach(c => {
      const p = normalizeImportPhone(c.phone);
      if (p) {
        phones.add(p);
        clientByPhoneName.set(`${p}|${normalizeImportName(c.name).toLowerCase()}`, c);
      }
      if (c.patientId) clientByPid.set(String(c.patientId).trim(), c);
    });
    return { caseKeys, phones, clientByPid, clientByPhoneName };
  }

  function isDuplicateImportRow(rec, fileHashes, sessionHashes, indexes) {
    const phone = normalizeImportPhone(rec.phone);
    if (!rec.name || !phone || phone.length < 9) return { dup: true, reason: 'بيانات ناقصة' };
    const h = importRowHash(rec);
    if (fileHashes.has(h) || sessionHashes.has(h)) return { dup: true, reason: 'مكرر في الملف', level: 3 };
    const nameKey = `${phone}|${normalizeImportName(rec.name).toLowerCase()}|${rec.date || ''}`;
    if (indexes.caseKeys.has(nameKey)) return { dup: true, reason: 'زيارة مسجلة مسبقاً', level: 3 };
    return { dup: false, hash: h, existingClient: indexes.phones.has(phone) };
  }

  function analyzeImportRecords(records, indexes) {
    const fileHashes = new Set();
    const stats = { total: records.length, valid: 0, newClients: 0, updates: 0, skipped: 0, duplicates: [], preview: [] };
    records.forEach((rec, i) => {
      if (!rec.name || !rec.phone) {
        stats.skipped++;
        stats.duplicates.push({ i, name: rec.name || '—', reason: 'اسم أو جوال فارغ' });
        return;
      }
      const dup = isDuplicateImportRow(rec, fileHashes, new Set(), indexes);
      if (dup.dup) {
        stats.skipped++;
        stats.duplicates.push({ i, name: rec.name, reason: dup.reason });
        return;
      }
      if (dup.existingClient) stats.updates++;
      else stats.newClients++;
      if (dup.hash) fileHashes.add(dup.hash);
      stats.valid++;
      if (stats.preview.length < 8) stats.preview.push(rec);
    });
    return stats;
  }

  function parseWorkbookBuffer(arrayBuffer) {
    if (typeof XLSX === 'undefined') throw new Error('مكتبة Excel غير محمّلة');
    const data = new Uint8Array(arrayBuffer);
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  }

  return {
    IMPORT_FIELDS,
    IMPORT_COLUMN_ALIASES,
    normalizeImportPhone,
    normalizeImportName,
    parseImportDate,
    importRowHash,
    scoreColumnMatch,
    autoDetectImportMapping,
    rowsToImportData,
    mapRowToRecord,
    buildDedupIndexes,
    isDuplicateImportRow,
    analyzeImportRecords,
    parseWorkbookBuffer
  };
}));
