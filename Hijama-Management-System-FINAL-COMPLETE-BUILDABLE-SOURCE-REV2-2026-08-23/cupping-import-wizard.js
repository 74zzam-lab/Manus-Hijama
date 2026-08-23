/* ═══════════════════════════════════════════════════════════
   Cupping Center Client Import Wizard — Excel / CSV
   ═══════════════════════════════════════════════════════════ */

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

const IMPORT_DUPLICATE_STRATEGIES = {
  skip: {
    label: 'تجاهل المكرر',
    desc: 'تخطّي الصفوف المكررة في الملف والعملاء/الزيارات المسجلة مسبقاً'
  },
  update: {
    label: 'تحديث بيانات العملاء',
    desc: 'دمج الأعمدة المربوطة فقط — يملأ الحقول الفارغة دون مسح بيانات موجودة'
  },
  replace: {
    label: 'استبدال بيانات العملاء',
    desc: 'استبدال بيانات العميل بالكامل من الأعمدة المربوطة (الحقول غير المربوطة لا تُمس)'
  },
  import_all: {
    label: 'استيراد الكل',
    desc: 'استيراد كل الصفوف حتى المكرر في الملف — ينشئ زيارات/ملفات جديدة'
  }
};

function getImportFieldDefs() {
  return (typeof MigrationFields !== 'undefined' && MigrationFields.MIGRATION_FIELDS)
    ? MigrationFields.MIGRATION_FIELDS
    : IMPORT_FIELDS;
}

function getImportDuplicateStrategies() {
  return (typeof MigrationFields !== 'undefined' && MigrationFields.DUPLICATE_STRATEGIES)
    ? MigrationFields.DUPLICATE_STRATEGIES
    : IMPORT_DUPLICATE_STRATEGIES;
}

function getImportColumnAliases() {
  if (typeof MigrationFields !== 'undefined' && MigrationFields.MIGRATION_ALIASES) return MigrationFields.MIGRATION_ALIASES;
  return IMPORT_COLUMN_ALIASES;
}

const REGISTRY_IMPORT_FIELDS = ['name', 'phone', 'patientId', 'nationality'];

const IMPORT_BATCH_SIZE = 400;
const IMPORT_PROGRESS_MIN_MS = 120;

let _importWizard = null;
let _importWorker = null;
let _importWorkerMsgId = 0;
let _importCancelRequested = false;
let _importInProgress = false;
let _importDeferPersist = false;

function yieldToMain() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function getImportWorker() {
  if (typeof Worker === 'undefined') return null;
  if (!_importWorker) {
    try { _importWorker = new Worker('import-engine-worker.js'); } catch (_) { _importWorker = null; }
  }
  return _importWorker;
}

function postImportWorker(type, payload, transfer) {
  const worker = getImportWorker();
  if (!worker) return Promise.reject(new Error('Worker unavailable'));
  const id = ++_importWorkerMsgId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.removeEventListener('message', onMsg);
      reject(new Error('Worker timeout'));
    }, 300000);
    function onMsg(e) {
      if (!e.data || e.data.id !== id) return;
      clearTimeout(timer);
      worker.removeEventListener('message', onMsg);
      if (e.data.ok) resolve(e.data);
      else reject(new Error(e.data.error || 'Worker failed'));
    }
    worker.addEventListener('message', onMsg);
    worker.postMessage(Object.assign({ type, id }, payload), transfer || []);
  });
}

function buildImportIndexes() {
  if (typeof MigrationIdentity !== 'undefined' && MigrationIdentity.buildMigrationIndexes) {
    return MigrationIdentity.buildMigrationIndexes(cases, clientsRegistry);
  }
  const caseKeys = new Set();
  const phones = new Set();
  const clientByPid = new Map();
  const clientByPhoneName = new Map();
  cases.forEach(c => {
    const p = normalizeImportPhone(c.phone);
    if (!p) return;
    phones.add(p);
    caseKeys.add(`${p}|${normalizeImportName(c.name).toLowerCase()}|${c.date || ''}`);
  });
  clientsRegistry.forEach(c => {
    const p = normalizeImportPhone(c.phone);
    if (p) {
      phones.add(p);
      clientByPhoneName.set(`${p}|${normalizeImportName(c.name).toLowerCase()}`, c);
    }
    if (c.patientId) clientByPid.set(String(c.patientId).trim(), c);
  });
  return { caseKeys, phones, clientByPid, clientByPhoneName };
}

function findRegistryByPhoneNameIndexed(phone, name, indexes) {
  const p = normalizeImportPhone(phone);
  const n = normalizeImportName(name).toLowerCase();
  if (!p || !n) return null;
  return indexes.clientByPhoneName.get(`${p}|${n}`)
    || findRegistryByPhoneName(phone, name);
}

function caseExistsForImportIndexed(rec, indexes) {
  const phone = normalizeImportPhone(rec.phone);
  const nameKey = `${phone}|${normalizeImportName(rec.name).toLowerCase()}|${rec.date || ''}`;
  return indexes.caseKeys.has(nameKey);
}

function persistImportBatch() {
  if (typeof SyncedWrite === 'undefined' || !SyncedWrite.setTable) {
    throw new Error('SyncedWrite unavailable — cannot persist import');
  }
  SyncedWrite.setTable('cases', cases);
  SyncedWrite.setTable('clientsRegistry', clientsRegistry);
  DB.set('invoiceCounter', invoiceCounter);
  DB.set('systemLogs', systemLogs);
}

function ensureImportHistory() {
  importHistory = DB.get('importHistory', importHistory || []);
  if (!importHistory) importHistory = [];
  return importHistory;
}

function normalizeImportPhone(v) {
  let p = String(v || '').replace(/\D/g, '');
  if (!p) return '';
  if (p.startsWith('966')) p = '0' + p.slice(3);
  else if (p.startsWith('00966')) p = '0' + p.slice(5);
  if (p.length === 9 && p.startsWith('5')) p = '0' + p;
  if (p.length > 10) p = p.slice(-10);
  return p;
}

function normalizeImportName(v) {
  return String(v || '').trim().replace(/\s+/g, ' ');
}

function importRowHash(row) {
  const phone = normalizeImportPhone(row.phone);
  const name = normalizeImportName(row.name).toLowerCase();
  const date = parseImportDate(row.date) || '';
  return `${phone}|${name}|${date}`;
}

function isValidImportRow(rec) {
  const phone = normalizeImportPhone(rec.phone);
  if (!normalizeImportName(rec.name)) return { ok: false, reason: 'اسم فارغ' };
  if (!phone) return { ok: false, reason: 'جوال فارغ' };
  if (phone.length < 9) return { ok: false, reason: 'رقم جوال غير صالح' };
  return { ok: true, phone };
}

function findRegistryByPhoneName(phone, name) {
  const p = normalizeImportPhone(phone);
  const n = normalizeImportName(name).toLowerCase();
  if (!p || !n) return null;
  return clientsRegistry.find(c =>
    normalizeImportPhone(c.phone) === p &&
    normalizeImportName(c.name).toLowerCase() === n
  ) || null;
}

function isFieldMapped(mapping, field) {
  return mapping && mapping[field] != null && mapping[field] >= 0;
}

function getMappedFieldLabels(mapping) {
  const defs = getImportFieldDefs();
  return Object.keys(defs)
    .filter(k => isFieldMapped(mapping, k))
    .map(k => defs[k].label);
}

function applyClientFields(client, rec, strategy, mapping) {
  if (!client || !mapping) return;
  const apply = (field, val) => {
    if (!isFieldMapped(mapping, field)) return;
    if (strategy === 'replace') {
      client[field === 'name' ? 'name' : field] = val != null ? val : '';
    } else if (strategy === 'update' && val) {
      client[field] = val;
    }
  };
  if (strategy === 'replace' || strategy === 'update') {
    if (isFieldMapped(mapping, 'name')) client.name = rec.name || (strategy === 'replace' ? '' : client.name);
    if (isFieldMapped(mapping, 'phone')) client.phone = rec.phone || (strategy === 'replace' ? '' : client.phone);
    if (isFieldMapped(mapping, 'patientId')) {
      client.patientId = strategy === 'replace' ? (rec.patientId || '') : (rec.patientId || client.patientId);
    }
    if (isFieldMapped(mapping, 'nationality')) {
      client.nationality = strategy === 'replace' ? (rec.nationality || '') : (rec.nationality || client.nationality);
    }
    client.updatedAt = new Date().toISOString();
  }
}

function findPriorFileImport(fileHash) {
  if (!fileHash) return null;
  return ensureImportHistory().find(h => h.fileHash === fileHash) || null;
}

function getImportOptions(w) {
  const strategyEl = document.querySelector('input[name="import-dup-strategy"]:checked');
  const duplicateStrategy = strategyEl?.value || w?.duplicateStrategy || 'skip';
  return {
    mode: w?.mode || 'full',
    duplicateStrategy,
    skipDuplicates: duplicateStrategy === 'skip',
    mapping: w?.mapping || {}
  };
}

async function hashImportFile(text) {
  const buf = new TextEncoder().encode(text.slice(0, 200000));
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

function scoreColumnMatch(header, fieldKey) {
  const h = String(header || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!h) return 0;
  const aliases = getImportColumnAliases()[fieldKey] || [];
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
  Object.keys(getImportFieldDefs()).forEach(field => {
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

function parseImportWorkbook(file) {
  return new Promise(async (resolve, reject) => {
    try {
      const buf = await file.arrayBuffer();
      const worker = getImportWorker();
      if (worker) {
        const res = await postImportWorker('PARSE_WORKBOOK', { buffer: buf }, [buf]);
        resolve(res.matrix);
        return;
      }
      if (typeof XLSX === 'undefined') {
        reject(new Error('مكتبة Excel غير محمّلة'));
        return;
      }
      const data = new Uint8Array(buf);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      resolve(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }));
    } catch (err) {
      reject(err);
    }
  });
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
  if (rec.birthDate) rec.birthDate = parseImportDate(rec.birthDate);
  if (rec.total !== '' && rec.total != null) rec.total = parseFloat(String(rec.total).replace(/[^\d.]/g, '')) || 0;
  if (rec.cash !== '' && rec.cash != null) rec.cash = parseFloat(String(rec.cash).replace(/[^\d.]/g, '')) || 0;
  if (rec.card !== '' && rec.card != null) rec.card = parseFloat(String(rec.card).replace(/[^\d.]/g, '')) || 0;
  return rec;
}

function findDoctorByName(name) {
  const n = normalizeImportName(name).toLowerCase();
  if (!n) return null;
  return doctors.find(d => d.name && d.name.toLowerCase().includes(n))
    || doctors.find(d => n.includes(d.name.toLowerCase()))
    || null;
}

function buildImportCase(rec, client, importOpts) {
  importOpts = importOpts || {};
  const mapping = importOpts.mapping || {};
  const isStub = !!(rec.migrationStub || importOpts.isStub);
  const fin = typeof MigrationFinance !== 'undefined'
    ? MigrationFinance.assessImportFinancials(rec, mapping, isStub)
    : { billable: !isStub, hasDoctor: !!rec.doctor, hasCups: rec.cups > 0, hasPayment: rec.total > 0 };

  const inv = generateInvoice({ deferPersist: _importDeferPersist });
  const caseDate = rec.date || new Date().toISOString().split('T')[0];
  const base = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    invoice: inv,
    fileNo: client ? client.fileNo : '',
    clientRegistryId: client ? client.id : '',
    date: caseDate,
    name: rec.name,
    patientId: rec.patientId || '',
    phone: rec.phone,
    nationality: rec.nationality || '',
    serviceType: rec.service || 'حجامة',
    extraServices: [],
    extraTotal: 0,
    discountType: 'none',
    discountVal: 0,
    discountAmt: 0,
    payCurrency: 'SAR',
    foreignAmount: 0,
    createdBy: currentUser ? currentUser.fullName : 'استيراد',
    createdById: currentUser ? currentUser.id : '',
    createdAt: new Date().toISOString(),
    imported: true,
    importSource: _importWizard?.fileName || 'excel',
    sessionNo: rec.sessionNo || ''
  };

  if (!fin.billable) {
    const doc = fin.hasDoctor ? findDoctorByName(rec.doctor) : null;
    const stubCase = Object.assign(base, {
      doctorId: doc ? doc.id : '',
      doctorName: doc ? doc.name : '',
      cups: fin.hasCups ? (parseFloat(rec.cups) || 0) : 0,
      preTax: 0, vat: 0, total: 0, cash: 0, card: 0, cardType: '',
      commission: 0, rawPreTax: 0, autoTotal: 0, isManualPrice: false,
      migrationStub: isStub,
      financialPending: !isStub,
      excludeFromFinancials: true,
      notes: rec.notes || (isStub ? (typeof MigrationVisit !== 'undefined' ? MigrationVisit.STUB_NOTE : 'زيارة مستوردة (بدون تاريخ)') : 'مستورد — بيانات مالية غير مكتملة')
    });
    if (typeof MigrationFinance !== 'undefined') MigrationFinance.zeroFinancialFields(stubCase);
    return stubCase;
  }

  const cups = fin.hasCups ? (parseFloat(rec.cups) || 0) : 0;
  const unitP = getServiceUnitPrice ? getServiceUnitPrice(rec.service || 'حجامة') : (settings.cupPrice || 50);
  const rawPre = cups > 0 ? cups * unitP : 0;
  const vatRate = settings.vatRate || 15;
  const total = fin.hasTotal ? rec.total : (rawPre > 0 ? rawPre * (1 + vatRate / 100) : 0);
  const preTax = total > 0 ? total / (1 + vatRate / 100) : 0;
  const vat = total - preTax;
  const doc = fin.hasDoctor ? findDoctorByName(rec.doctor) : null;
  let cash = fin.hasCash ? rec.cash : 0;
  let card = fin.hasCard ? rec.card : 0;
  if (total > 0 && cash <= 0 && card <= 0) cash = total;
  const commission = doc && total > 0 && typeof calcCaseCommission === 'function'
    ? calcCaseCommission(doc, rec.service || 'حجامة', total, cups, null, { caseDate, editCaseId: null, docId: doc.id })
    : 0;

  return Object.assign(base, {
    doctorId: doc ? doc.id : '',
    doctorName: doc ? doc.name : (rec.doctor || ''),
    cups,
    preTax, vat, total,
    cash: cash || 0,
    card: card || 0,
    cardType: card > 0 ? 'mada' : '',
    commission,
    rawPreTax: rawPre,
    autoTotal: total,
    isManualPrice: !!fin.hasTotal,
    notes: rec.notes || 'مستورد من Excel',
    excludeFromFinancials: false,
    financialPending: false,
    migrationStub: false
  });
}

function clientExistsByPhone(phone) {
  const p = normalizeImportPhone(phone);
  if (!p || p.length < 9) return false;
  if (clientsRegistry.some(c => normalizeImportPhone(c.phone) === p)) return true;
  return cases.some(c => normalizeImportPhone(c.phone) === p);
}

function caseExistsForImport(rec) {
  const phone = normalizeImportPhone(rec.phone);
  const name = normalizeImportName(rec.name).toLowerCase();
  const date = rec.date || '';
  return cases.some(c =>
    normalizeImportPhone(c.phone) === phone &&
    normalizeImportName(c.name).toLowerCase() === name &&
    c.date === date
  );
}

function isDuplicateImportRow(rec, ctx) {
  const valid = isValidImportRow(rec);
  if (!valid.ok) return { dup: true, reason: valid.reason, invalid: true };

  const { sessionSeen, duplicateStrategy, mode, indexes } = ctx;
  const h = importRowHash(rec);
  const existing = indexes
    ? findRegistryByPhoneNameIndexed(rec.phone, rec.name, indexes)
    : findRegistryByPhoneName(rec.phone, rec.name);

  if (sessionSeen.has(h) && duplicateStrategy !== 'import_all') {
    return { dup: true, reason: 'مكرر في الملف' };
  }

  if (duplicateStrategy === 'skip') {
    if (mode === 'clients_only' && existing) {
      return { dup: true, reason: 'مسجل مسبقاً في السجل (نفس الاسم والجوال)' };
    }
  }
  const caseDup = indexes ? caseExistsForImportIndexed(rec, indexes) : caseExistsForImport(rec);
  if (duplicateStrategy !== 'import_all' && mode === 'full' && caseDup) {
    return { dup: true, reason: 'زيارة مسجلة مسبقاً' };
  }

  return { dup: false, hash: h, existingClient: !!existing };
}

function analyzeImportRecords(records, options) {
  const sessionSeen = new Set();
  const stats = {
    total: records.length, valid: 0, newClients: 0, updates: 0, skipped: 0,
    duplicates: [], preview: [], skipReasons: {}
  };
  const duplicateStrategy = options?.duplicateStrategy || (options?.skipDuplicates === false ? 'import_all' : 'skip');
  const indexes = buildImportIndexes();
  const ctx = { sessionSeen, duplicateStrategy, mode: options?.mode || 'full', indexes };

  records.forEach((rec, i) => {
    const dup = isDuplicateImportRow(rec, ctx);
    if (dup.dup) {
      stats.skipped++;
      stats.duplicates.push({ i, name: rec.name || '—', phone: rec.phone || '—', reason: dup.reason });
      stats.skipReasons[dup.reason] = (stats.skipReasons[dup.reason] || 0) + 1;
      return;
    }
    if (dup.existingClient) {
      if (duplicateStrategy === 'update' || duplicateStrategy === 'replace') stats.updates++;
      else if (duplicateStrategy === 'import_all') stats.updates++;
      else stats.newClients++;
    } else {
      stats.newClients++;
    }
    if (dup.hash) {
      sessionSeen.add(dup.hash);
      ctx.sessionSeen = sessionSeen;
    }
    stats.valid++;
    if (stats.preview.length < 8) stats.preview.push(rec);
  });
  return stats;
}

async function analyzeImportRecordsAsync(records, options) {
  if (typeof MigrationEngine !== 'undefined') {
    const indexes = buildImportIndexes();
    const stats = MigrationEngine.analyzeMigration(records, options, indexes);
    return {
      total: stats.total,
      valid: stats.valid,
      newClients: stats.newClients,
      updates: stats.updatedClients + stats.mergedClients,
      skipped: stats.skipped,
      duplicates: stats.errors,
      preview: stats.preview,
      skipReasons: stats.skipReasons,
      confirmedMatches: stats.confirmedMatches,
      possibleMatches: stats.possibleMatches,
      newVisits: stats.newVisits,
      updatedVisits: stats.updatedVisits,
      stubVisits: stats.stubVisits
    };
  }
  const sessionSeen = new Set();
  const stats = {
    total: records.length, valid: 0, newClients: 0, updates: 0, skipped: 0,
    duplicates: [], preview: [], skipReasons: {}
  };
  const duplicateStrategy = options?.duplicateStrategy || (options?.skipDuplicates === false ? 'import_all' : 'skip');
  const indexes = buildImportIndexes();
  const ctx = { sessionSeen, duplicateStrategy, mode: options?.mode || 'full', indexes };
  const chunk = 500;

  for (let start = 0; start < records.length; start += chunk) {
    const slice = records.slice(start, start + chunk);
    slice.forEach((rec, j) => {
      const i = start + j;
      const dup = isDuplicateImportRow(rec, ctx);
      if (dup.dup) {
        stats.skipped++;
        stats.duplicates.push({ i, name: rec.name || '—', phone: rec.phone || '—', reason: dup.reason });
        stats.skipReasons[dup.reason] = (stats.skipReasons[dup.reason] || 0) + 1;
        return;
      }
      if (dup.existingClient) {
        if (duplicateStrategy === 'update' || duplicateStrategy === 'replace') stats.updates++;
        else if (duplicateStrategy === 'import_all') stats.updates++;
        else stats.newClients++;
      } else {
        stats.newClients++;
      }
      if (dup.hash) {
        sessionSeen.add(dup.hash);
        ctx.sessionSeen = sessionSeen;
      }
      stats.valid++;
      if (stats.preview.length < 8) stats.preview.push(rec);
    });
    await yieldToMain();
  }
  return stats;
}

async function backupBeforeImport() {
  if (typeof buildFullBackupObject !== 'function') return;
  try {
    const data = buildFullBackupObject();
    DB.set('preImportBackup', { at: new Date().toISOString(), snapshot: data });
    if (typeof downloadFile === 'function') {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      downloadFile(JSON.stringify(data, null, 2), `PreImport_${stamp}.json`, 'application/json');
    }
    notify('💾 تم حفظ نسخة احتياطية قبل الاستيراد', 'info');
  } catch (e) { /* continue import */ }
}

function formatImportDuration(sec) {
  if (sec < 60) return sec.toFixed(1) + ' ث';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m + ' د ' + s + ' ث';
}

function renderImportProgress(state) {
  const el = document.getElementById('import-result-panel');
  if (!el) return;
  const pct = state.total ? Math.min(100, Math.round((state.processed / state.total) * 100)) : 0;
  const remaining = Math.max(0, state.total - state.processed);
  const elapsedSec = (Date.now() - state.startedAt) / 1000;
  const speed = state.processed > 0 ? (state.processed / Math.max(elapsedSec, 0.001)).toFixed(1) : '0';
  const etaSec = state.processed > 0 ? (remaining / (state.processed / elapsedSec)) : 0;
  el.innerHTML = `
    <div style="font-size:16px;font-weight:800;margin-bottom:12px">⏳ جاري الاستيراد…</div>
    <div style="height:10px;background:var(--surface);border-radius:999px;overflow:hidden;margin-bottom:14px;border:1px solid var(--border)">
      <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--primary),var(--primary-light));transition:width .25s"></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;font-size:13px;line-height:1.8;margin-bottom:12px">
      <div>إجمالي: <strong>${state.total}</strong></div>
      <div>تمت: <strong style="color:var(--success)">${state.processed}</strong></div>
      <div>متبقي: <strong>${remaining}</strong></div>
      <div>النسبة: <strong>${pct}%</strong></div>
      <div>المنقضي: <strong>${formatImportDuration(elapsedSec)}</strong></div>
      <div>ETA: <strong>${state.processed ? formatImportDuration(etaSec) : '—'}</strong></div>
      <div>السرعة: <strong dir="ltr">${speed}</strong> صف/ث</div>
    </div>
    <button class="btn btn-danger btn-sm" type="button" id="import-cancel-btn" onclick="cancelClientImport()">⏹ إلغاء الاستيراد</button>`;
}

function cancelClientImport() {
  if (!_importInProgress) return;
  _importCancelRequested = true;
  const btn = document.getElementById('import-cancel-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'جاري الإيقاف…'; }
}

function processImportRow(rec, mode, importOptions, ctx) {
  if (typeof MigrationEngine !== 'undefined') {
    ctx.cases = cases;
    ctx.doctors = doctors;
    ctx.deferPersist = _importDeferPersist;
    ctx.buildImportCase = buildImportCase;
    ctx.bulk = typeof MigrationBulk !== 'undefined' ? MigrationBulk.readBulkOptionsFromDom() : null;
    ctx.errors = ctx.errors || [];
    ctx.warnings = ctx.warnings || [];
    ctx.newVisits = ctx.newVisits || 0;
    ctx.updatedVisits = ctx.updatedVisits || 0;
    ctx.stubVisits = ctx.stubVisits || 0;
    MigrationEngine.processMigrationRow(rec, importOptions, ctx);
    return;
  }

  const { duplicateStrategy, mapping, indexes } = ctx;
  const dup = isDuplicateImportRow(rec, ctx);
  if (dup.dup) {
    ctx.skipped++;
    ctx.skippedRows.push({ row: ctx.rowNum, name: rec.name || '—', phone: rec.phone || '—', reason: dup.reason });
    ctx.details.push({ row: ctx.rowNum, name: rec.name || '—', phone: rec.phone || '—', status: 'تجاهل', reason: dup.reason });
    return;
  }

  if (mode === 'clients_only') {
    let reg = rec.patientId && isFieldMapped(mapping, 'patientId')
      ? (indexes.clientByPid.get(String(rec.patientId).trim()) || clientsRegistry.find(c => c.patientId && c.patientId === rec.patientId.trim()))
      : null;
    if (!reg) reg = findRegistryByPhoneNameIndexed(rec.phone, rec.name, indexes);
    if (reg) {
      applyClientFields(reg, rec, duplicateStrategy, mapping);
      ctx.updated++;
      ctx.details.push({ row: ctx.rowNum, name: rec.name, phone: rec.phone, status: 'تحديث', reason: duplicateStrategy === 'replace' ? 'استبدال بيانات' : 'تحديث ملف عميل' });
    } else {
      const phoneExists = indexes.phones.has(normalizeImportPhone(rec.phone));
      const client = ensureClientRegistry({
        name: rec.name, phone: rec.phone,
        patientId: isFieldMapped(mapping, 'patientId') ? rec.patientId : '',
        nationality: isFieldMapped(mapping, 'nationality') ? rec.nationality : '',
        forceNew: duplicateStrategy === 'import_all' && phoneExists,
        deferPersist: true
      });
      if (client) {
        const p = normalizeImportPhone(rec.phone);
        indexes.phones.add(p);
        indexes.clientByPhoneName.set(`${p}|${normalizeImportName(rec.name).toLowerCase()}`, client);
        if (client.patientId) indexes.clientByPid.set(String(client.patientId).trim(), client);
      }
      ctx.imported++;
      ctx.details.push({ row: ctx.rowNum, name: rec.name, phone: rec.phone, status: 'جديد', reason: 'ملف عميل جديد' });
    }
  } else {
    let client = rec.patientId && isFieldMapped(mapping, 'patientId')
      ? (indexes.clientByPid.get(String(rec.patientId).trim()) || clientsRegistry.find(c => c.patientId && c.patientId === rec.patientId.trim()))
      : null;
    let existedBefore = !!client;
    if (!client) {
      client = findRegistryByPhoneNameIndexed(rec.phone, rec.name, indexes);
      existedBefore = !!client;
    }
    if (client && (duplicateStrategy === 'update' || duplicateStrategy === 'replace')) {
      applyClientFields(client, rec, duplicateStrategy, mapping);
    }
    if (!client) {
      const phoneExists = indexes.phones.has(normalizeImportPhone(rec.phone));
      client = ensureClientRegistry({
        name: rec.name, phone: rec.phone,
        patientId: isFieldMapped(mapping, 'patientId') ? rec.patientId : '',
        nationality: isFieldMapped(mapping, 'nationality') ? rec.nationality : '',
        forceNew: duplicateStrategy === 'import_all' && phoneExists,
        deferPersist: true
      });
      if (client) {
        const p = normalizeImportPhone(rec.phone);
        indexes.phones.add(p);
        indexes.clientByPhoneName.set(`${p}|${normalizeImportName(rec.name).toLowerCase()}`, client);
        if (client.patientId) indexes.clientByPid.set(String(client.patientId).trim(), client);
      }
    }
    const caseRec = buildImportCase(rec, client, { mapping });
    cases.push(caseRec);
    const p = normalizeImportPhone(rec.phone);
    indexes.caseKeys.add(`${p}|${normalizeImportName(rec.name).toLowerCase()}|${rec.date || ''}`);
    if (existedBefore) {
      ctx.updated++;
      ctx.details.push({ row: ctx.rowNum, name: rec.name, phone: rec.phone, status: 'زيارة + عميل', reason: caseRec.invoice });
    } else {
      ctx.imported++;
      ctx.details.push({ row: ctx.rowNum, name: rec.name, phone: rec.phone, status: 'جديد', reason: caseRec.invoice });
    }
    if (typeof logAudit === 'function') {
      logAudit('CASE_CREATED', `استيراد: ${rec.name} — ${caseRec.invoice}`, { patient: rec.name, invoice: caseRec.invoice, imported: true, deferPersist: true });
    }
  }
  const h = importRowHash(rec);
  ctx.sessionSeen.add(h);
}

async function runClientImport(records, mode, importOptions) {
  if (typeof requireAuth === 'function' && !requireAuth('استيراد البيانات')) {
    return { error: 'غير مصرح', scanned: records.length, imported: 0, updated: 0, skipped: records.length, duration: 0, details: [], cancelled: false };
  }
  if (_importInProgress) {
    return { error: 'استيراد قيد التنفيذ', scanned: records.length, imported: 0, updated: 0, skipped: records.length, duration: 0, details: [], cancelled: false };
  }
  _importInProgress = true;
  _importCancelRequested = false;
  _importDeferPersist = true;

  const startedAt = Date.now();
  renderImportProgress({ total: records.length, processed: 0, startedAt });

  await backupBeforeImport();
  await yieldToMain();

  const t0 = performance.now();
  const duplicateStrategy = importOptions?.duplicateStrategy || (importOptions?.skipDuplicates === false ? 'import_all' : 'skip');
  if (duplicateStrategy === 'import_all' && typeof RolePolicy !== 'undefined' && !RolePolicy.isManager()) {
    _importInProgress = false;
    notify('⛔ استيراد الكل يتطلب صلاحية المدير', 'danger');
    return { error: 'manager_required', scanned: records.length, imported: 0, updated: 0, skipped: records.length, duration: 0, details: [], cancelled: false };
  }
  if (typeof SyncGuard !== 'undefined') SyncGuard.pause?.('client_import');
  const mapping = importOptions?.mapping || _importWizard?.mapping || {};
  const history = ensureImportHistory();
  const fileHash = _importWizard?.fileHash || '';
  const priorImport = findPriorFileImport(fileHash);
  const isReimport = !!priorImport;

  const indexes = buildImportIndexes();
  const ctx = {
    sessionSeen: new Set(),
    duplicateStrategy,
    mode: 'migration',
    mapping,
    indexes,
    imported: 0,
    updated: 0,
    skipped: 0,
    details: [],
    skippedRows: [],
    errors: [],
    warnings: [],
    newVisits: 0,
    updatedVisits: 0,
    stubVisits: 0,
    rowNum: 0,
    memStart: typeof MigrationEngine !== 'undefined' ? MigrationEngine.formatMemoryMb() : '—'
  };

  let lastProgressAt = 0;
  const total = records.length;

  try {
    for (let start = 0; start < total; start += IMPORT_BATCH_SIZE) {
      if (_importCancelRequested) break;
      const end = Math.min(start + IMPORT_BATCH_SIZE, total);
      for (let i = start; i < end; i++) {
        ctx.rowNum = i + 2;
        try {
          processImportRow(records[i], mode, importOptions, ctx);
        } catch (err) {
          ctx.skipped++;
          ctx.skippedRows.push({ row: ctx.rowNum, name: records[i]?.name || '—', phone: records[i]?.phone || '—', reason: err.message || String(err) });
          ctx.details.push({ row: ctx.rowNum, name: records[i]?.name || '—', status: 'فشل', reason: err.message || String(err) });
        }
      }
      persistImportBatch();
      const processed = end;
      const now = Date.now();
      if (now - lastProgressAt >= IMPORT_PROGRESS_MIN_MS) {
        renderImportProgress({ total, processed, startedAt, imported: ctx.imported, updated: ctx.updated, skipped: ctx.skipped });
        lastProgressAt = now;
      }
      await yieldToMain();
    }

    if (!_importCancelRequested) {
      if (typeof migrateClientsFromCases === 'function') migrateClientsFromCases();
      if (fileHash) {
        history.unshift({
          fileHash, fileName: _importWizard?.fileName, at: new Date().toISOString(),
          imported: ctx.imported, updated: ctx.updated, skipped: ctx.skipped, duplicateStrategy, reimport: isReimport
        });
        if (history.length > 100) history.length = 100;
        DB.set('importHistory', history);
      }
      if (typeof trackBackupOperation === 'function') trackBackupOperation();
    }
    persistImportBatch();
    if (typeof syncAppGlobals === 'function') syncAppGlobals();

    const duration = ((performance.now() - t0) / 1000).toFixed(1);
    return {
      scanned: total,
      imported: ctx.imported,
      updated: ctx.updated,
      skipped: ctx.skipped,
      duration,
      details: ctx.details,
      skippedRows: ctx.skippedRows,
      errors: ctx.errors,
      warnings: ctx.warnings,
      newVisits: ctx.newVisits || 0,
      updatedVisits: ctx.updatedVisits || 0,
      stubVisits: ctx.stubVisits || 0,
      memoryUsed: typeof MigrationEngine !== 'undefined' ? MigrationEngine.formatMemoryMb() : '—',
      duplicateStrategy,
      reimport: isReimport,
      priorImport,
      cancelled: _importCancelRequested,
      error: null
    };
  } finally {
    _importInProgress = false;
    _importDeferPersist = false;
    if (typeof SyncGuard !== 'undefined') SyncGuard.resume?.({ state: 'local_only' });
  }
}

function downloadImportReport(result) {
  if (typeof XLSX === 'undefined') {
    notify('⚠️ لا يمكن إنشاء تقرير Excel', 'danger');
    return;
  }
  const rows = [
    ['الحالة', 'العميل', 'الجوال', 'التفاصيل'],
    ...result.details.map(d => [d.status, d.name, d.phone || '—', d.reason])
  ];
  if (result.skippedRows?.length) {
    rows.push(['', '', '', '']);
    rows.push(['— سجلات متجاهلة —', '', '', '']);
    result.skippedRows.slice(0, 5000).forEach(r => {
      rows.push(['تجاهل', r.name, r.phone || '—', r.reason]);
    });
    if (result.skippedRows.length > 5000) {
      rows.push(['…', `+${result.skippedRows.length - 5000} سجل`, '', '']);
    }
  }
  rows.unshift(['تم فحص', result.scanned, '', '']);
  rows.unshift(['تم استيراد', result.imported, '', '']);
  rows.unshift(['تم تحديث', result.updated, '', '']);
  rows.unshift(['تم تجاهل', result.skipped, '', '']);
  rows.unshift(['استراتيجية التكرار', getImportDuplicateStrategies()[result.duplicateStrategy]?.label || result.duplicateStrategy || '—', '', '']);
  if (result.newVisits != null) {
    rows.unshift(['زيارات جديدة', result.newVisits, '', '']);
    rows.unshift(['زيارات محدّثة', result.updatedVisits || 0, '', '']);
    rows.unshift(['زيارات بدون تاريخ', result.stubVisits || 0, '', '']);
  }
  if (result.memoryUsed) rows.unshift(['الذاكرة', result.memoryUsed, '', '']);
  rows.unshift(['إعادة استيراد', result.reimport ? 'نعم' : 'لا', '', '']);
  rows.unshift(['المدة (ثانية)', result.duration, '', '']);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'تقرير الاستيراد');
  XLSX.writeFile(wb, `Import_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function renderImportWizardStep() {
  const w = _importWizard;
  if (!w) return;
  [1, 2, 3, 4].forEach(n => {
    const el = document.getElementById(`import-step-${n}`);
    if (el) el.style.display = n === w.step ? '' : 'none';
  });
  document.querySelectorAll('.import-step-dot').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === w.step);
    el.classList.toggle('done', i + 1 < w.step);
  });
  const nextBtn = document.querySelector('#importWizardModal .btn-primary[onclick="importWizardNext()"]');
  if (nextBtn) nextBtn.textContent = w.step === 3 ? 'استيراد ←' : (w.step === 4 ? '—' : 'التالي ←');
  if (nextBtn) nextBtn.style.display = w.step === 4 ? 'none' : '';
  const backBtn = document.querySelector('#importWizardModal .btn-ghost[onclick="importWizardBack()"]');
  if (backBtn) backBtn.style.display = (w.step === 4 && _importInProgress) ? 'none' : '';
}

function renderImportMappingUI() {
  const w = _importWizard;
  const wrap = document.getElementById('import-mapping-grid');
  if (!wrap || !w) return;
  const opts = ['<option value="">— تجاهل —</option>']
    .concat(w.headers.map((h, i) => `<option value="${i}">${h || 'عمود ' + (i + 1)}</option>`)).join('');
  wrap.innerHTML = Object.entries(getImportFieldDefs()).map(([key, def]) => `
    <div class="form-group" style="margin:0">
      <label class="form-label">${def.label}${def.required ? ' <span class="req">*</span>' : ''}</label>
      <select class="form-control import-map-select" data-field="${key}">${opts}</select>
    </div>`).join('');
  wrap.querySelectorAll('.import-map-select').forEach(sel => {
    const field = sel.dataset.field;
    if (w.mapping[field] != null) sel.value = String(w.mapping[field]);
    sel.onchange = () => {
      const v = sel.value;
      w.mapping[field] = v === '' ? null : parseInt(v, 10);
    };
  });
  if (typeof MigrationMappingStore !== 'undefined') {
    MigrationMappingStore.injectMappingPresetUI(wrap, w, () => renderImportMappingUI());
  }
}

function renderImportStrategyOptions() {
  const wrap = document.getElementById('import-dup-strategy-wrap');
  if (!wrap) return;
  const current = _importWizard?.duplicateStrategy || 'skip';
  wrap.innerHTML = Object.entries(getImportDuplicateStrategies()).map(([key, def]) => `
    <label class="card-type-option" style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer">
      <input type="radio" name="import-dup-strategy" value="${key}" ${key === current ? 'checked' : ''}
        style="width:18px;height:18px;margin-top:2px;flex-shrink:0"
        onchange="if(_importWizard){_importWizard.duplicateStrategy=this.value;renderImportPreview()}">
      <span><strong>${def.label}</strong><br><span style="font-size:12px;color:var(--text-muted)">${def.desc}</span></span>
    </label>`).join('');
}

function renderImportPreview() {
  const w = _importWizard;
  const el = document.getElementById('import-preview-stats');
  if (!el || !w) return;
  el.innerHTML = '<div style="font-size:14px;color:var(--text-muted)">⏳ جاري تحليل المعاينة…</div>';
  const records = w.rawRows.map(r => mapRowToRecord(r, w.mapping, w.headers));
  w.records = records;
  const opts = getImportOptions(w);
  w.duplicateStrategy = opts.duplicateStrategy;
  w.skipDuplicates = opts.skipDuplicates;
  analyzeImportRecordsAsync(records, opts).then(s => {
    w.stats = s;
    renderImportPreviewBody(w, s, opts);
  }).catch(err => {
    console.error('[import] analyze failed', err);
    if (typeof notify === 'function') notify('⚠️ تعذّر تحليل ملف الاستيراد', 'danger');
    const el = document.getElementById('import-preview-stats');
    if (el) el.innerHTML = '<p class="text-danger">⚠️ تعذّر تحليل الملف — راجع التنسيق وحاول مرة أخرى.</p>';
  });
}

function renderImportPreviewBody(w, s, opts) {
  const el = document.getElementById('import-preview-stats');
  if (!el || !w) return;
  const prior = findPriorFileImport(w.fileHash);
  const mappedLabels = getMappedFieldLabels(w.mapping);
  const fieldDefs = getImportFieldDefs();
  const unmappedLabels = Object.keys(fieldDefs)
    .filter(k => !isFieldMapped(w.mapping, k))
    .map(k => fieldDefs[k].label);
  const modeLbl = 'ترحيل احترافي — ملف عميل كامل + زيارة (أو زيارة مستوردة بدون تاريخ)';
  const strategyLbl = getImportDuplicateStrategies()[opts.duplicateStrategy]?.label || opts.duplicateStrategy;
  const fillNote = 'يُنشئ ملفاً طبياً افتراضياً، ويربط العميل بالسجل والزيارات. الحقول غير المربوطة تُملأ بالقيم الافتراضية دون حذف البيانات الحالية.';
  const reasonLines = Object.entries(s.skipReasons || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
  const visitStats = (s.newVisits != null) ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:12px;font-size:13px">
      <div class="tag tag-blue" style="padding:8px;display:block;text-align:center">تطابق مؤكد<br><strong>${s.confirmedMatches || 0}</strong></div>
      <div class="tag tag-gold" style="padding:8px;display:block;text-align:center">تطابق محتمل<br><strong>${s.possibleMatches || 0}</strong></div>
      <div class="tag tag-green" style="padding:8px;display:block;text-align:center">زيارات جديدة<br><strong>${s.newVisits || 0}</strong></div>
      <div class="tag tag-gold" style="padding:8px;display:block;text-align:center">زيارات محدّثة<br><strong>${s.updatedVisits || 0}</strong></div>
      <div class="tag tag-blue" style="padding:8px;display:block;text-align:center">بدون تاريخ<br><strong>${s.stubVisits || 0}</strong></div>
    </div>` : '';
  el.innerHTML = `
    <div style="font-size:15px;font-weight:800;margin-bottom:10px">🚀 محرك الترحيل — معاينة</div>
    ${prior ? `<div style="padding:10px 12px;margin-bottom:12px;background:rgba(255,193,7,.12);border:1px solid rgba(255,193,7,.45);border-radius:8px;font-size:13px">
      ⚠️ <strong>تم استيراد هذا الملف مسبقاً</strong> (${prior.at ? new Date(prior.at).toLocaleString('ar-SA') : '—'})
      — آخر نتيجة: ${prior.imported || 0} جديد، ${prior.updated || 0} تحديث، ${prior.skipped || 0} تجاهل.
      <br>يمكنك إعادة الاستيراد واختيار استراتيجية مناسبة أدناه.
    </div>` : ''}
    <div style="font-size:13px;font-weight:700;margin-bottom:8px">استراتيجية التكرار</div>
    <div id="import-dup-strategy-wrap" style="margin-bottom:14px"></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">
      <div class="tag tag-blue" style="padding:10px;display:block;text-align:center">تم العثور على<br><strong style="font-size:20px">${s.total}</strong> سجل</div>
      <div class="tag tag-green" style="padding:10px;display:block;text-align:center">سيُعالَج<br><strong style="font-size:20px">${s.valid}</strong></div>
      <div class="tag tag-gold" style="padding:10px;display:block;text-align:center">عملاء جدد<br><strong style="font-size:20px">${s.newClients}</strong></div>
      <div class="tag tag-gold" style="padding:10px;display:block;text-align:center">تحديث متوقع<br><strong style="font-size:20px">${s.updates}</strong></div>
      <div class="tag tag-red" style="padding:10px;display:block;text-align:center">سيُتجاهل<br><strong style="font-size:20px">${s.skipped}</strong></div>
    </div>
    ${visitStats}
    <div style="font-size:13px;margin-bottom:8px"><strong>الوضع:</strong> ${modeLbl}</div>
    <div style="font-size:13px;margin-bottom:8px"><strong>الاستراتيجية:</strong> ${strategyLbl}</div>
    <div style="font-size:13px;margin-bottom:10px;padding:8px 10px;background:var(--surface);border-radius:8px;border:1px solid var(--border);line-height:1.7">${fillNote}</div>
    <div style="font-size:13px;margin-bottom:6px"><strong>أعمدة مربوطة:</strong> ${mappedLabels.join('، ') || '—'}</div>
    ${unmappedLabels.length ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px"><strong>غير مربوطة (تُتجاهل أو تُملأ تلقائياً):</strong> ${unmappedLabels.join('، ')}</div>` : ''}
    ${reasonLines ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px"><strong>أسباب التجاهل:</strong> ${reasonLines}</div>` : ''}
    ${s.preview.length ? `<div style="margin-top:12px;font-size:12px;color:var(--text-muted)">عينة: ${s.preview.map(p => p.name).join('، ')}</div>` : ''}
    <div id="import-bulk-host"></div>`;
  renderImportStrategyOptions();
  if (typeof MigrationBulk !== 'undefined') {
    const host = document.getElementById('import-bulk-host');
    if (host) MigrationBulk.injectBulkOptionsUI(host, doctors);
  }
}

function finishImportUiRefresh() {
  if (typeof reloadClientStoreFromDb === 'function') reloadClientStoreFromDb();
  const modeEl = document.getElementById('client-date-mode');
  if (modeEl) modeEl.value = 'all';
  const searchEl = document.getElementById('client-search');
  if (searchEl) searchEl.value = '';
  if (typeof refreshCaseDerivedViews === 'function') refreshCaseDerivedViews();
  else {
    if (typeof refreshClientsView === 'function') refreshClientsView(true);
    if (typeof refreshDailyTable === 'function') refreshDailyTable();
    if (typeof refreshDashboard === 'function') refreshDashboard();
  }
}

function renderImportResult(result) {
  const el = document.getElementById('import-result-panel');
  if (!el) return;
  if (result.error) {
    el.innerHTML = `<div class="tag tag-red" style="padding:14px;display:block">${result.error}</div>`;
    return;
  }
  const cancelNote = result.cancelled
    ? '<div style="margin-top:8px;font-size:13px;color:var(--warning)">⏹ تم إلغاء الاستيراد — حُفظت آخر دفعة مكتملة.</div>'
    : '';
  el.innerHTML = `
    <div style="font-size:16px;font-weight:800;margin-bottom:12px">${result.cancelled ? '⏹ توقف الترحيل' : '✅ اكتمل الترحيل'}</div>
    <div style="line-height:2;font-size:14px">
      <div>تم فحص: <strong>${result.scanned}</strong> سجل</div>
      <div>عملاء/سجلات جديدة: <strong style="color:var(--success)">${result.imported}</strong></div>
      <div>تم تحديث: <strong>${result.updated}</strong></div>
      <div>تم تجاهل: <strong style="color:var(--danger)">${result.skipped}</strong></div>
      ${result.newVisits != null ? `<div>زيارات جديدة: <strong>${result.newVisits}</strong> · محدّثة: <strong>${result.updatedVisits || 0}</strong> · بدون تاريخ: <strong>${result.stubVisits || 0}</strong></div>` : ''}
      ${result.errors?.length ? `<div style="color:var(--danger)">أخطاء: <strong>${result.errors.length}</strong></div>` : ''}
      ${result.warnings?.length ? `<div style="color:var(--warning)">تحذيرات: <strong>${result.warnings.length}</strong></div>` : ''}
      <div>استراتيجية التكرار: <strong>${getImportDuplicateStrategies()[result.duplicateStrategy]?.label || result.duplicateStrategy || '—'}</strong></div>
      ${result.reimport ? `<div style="color:var(--warning)">⚠️ إعادة استيراد لملف سبق استيراده</div>` : ''}
      <div>مدة العملية: <strong>${result.duration}</strong> ثانية · الذاكرة: <strong>${result.memoryUsed || '—'}</strong></div>
    </div>
    ${cancelNote}
    ${result.skippedRows?.length ? `<div style="margin-top:10px;font-size:12px;color:var(--text-muted)">يمكن تنزيل التقرير لعرض ${result.skippedRows.length} سجل متجاهل مع الأسباب</div>` : ''}
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-accent btn-sm" onclick="downloadImportReport(_importWizard.lastResult)">📥 تنزيل Import_Report.xlsx</button>
      <button class="btn btn-ghost btn-sm" onclick="closeClientImportWizard(); finishImportUiRefresh();">إغلاق</button>
    </div>`;
  _importWizard.lastResult = result;
  if (!result.error) finishImportUiRefresh();
  renderImportWizardStep();
}

function openClientImportWizard() {
  if (typeof hasPermission === 'function' && !hasPermission('clients.edit')) {
    notify('⛔ ليس لديك صلاحية استيراد بيانات العملاء', 'danger');
    return;
  }
  _importWizard = {
    step: 1, headers: [], rawRows: [], mapping: {}, mode: 'migration', records: [], stats: null,
    fileName: '', fileHash: '', duplicateStrategy: 'merge', skipDuplicates: false
  };
  document.querySelectorAll('[name="import-mode"]').forEach(el => {
    const wrap = el.closest('.card-type-option');
    if (wrap) wrap.style.display = 'none';
  });
  const fullMode = document.getElementById('import-mode-full');
  if (fullMode) fullMode.checked = true;
  document.getElementById('import-file-info').textContent = '';
  document.getElementById('import-mapping-grid').innerHTML = '';
  document.getElementById('import-preview-stats').innerHTML = '';
  document.getElementById('import-result-panel').innerHTML = '';
  document.getElementById('importWizardModal').classList.add('open');
  renderImportWizardStep();
}

function closeClientImportWizard() {
  if (_importInProgress) {
    notify('⚠️ انتظر حتى يتوقف الاستيراد أو اضغط إلغاء الاستيراد', 'warning');
    return;
  }
  document.getElementById('importWizardModal').classList.remove('open');
  _importWizard = null;
}

async function onImportFileSelected(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    notify('⚠️ يدعم النظام: .xlsx و .xls و .csv فقط', 'danger');
    input.value = '';
    return;
  }
  try {
    document.getElementById('import-file-info').innerHTML = '⏳ جاري قراءة الملف…';
    await yieldToMain();
    const matrix = await parseImportWorkbook(file);
    const { headers, rows } = rowsToImportData(matrix);
    if (!headers.length || !rows.length) {
      notify('⚠️ الملف فارغ أو غير مفهوم', 'danger');
      return;
    }
    const sample = rows.slice(0, 20);
    let mapping = autoDetectImportMapping(headers);
    const preset = typeof MigrationMappingStore !== 'undefined' ? MigrationMappingStore.findBestPreset(headers) : null;
    if (preset) mapping = Object.assign({}, preset.mapping, mapping);
    _importWizard.headers = headers;
    _importWizard.rawRows = rows;
    _importWizard.mapping = mapping;
    _importWizard.fileName = file.name;
    _importWizard.fileHash = await hashImportFile(JSON.stringify(matrix.slice(0, 500)));
    document.getElementById('import-file-info').innerHTML =
      `📄 <strong>${file.name}</strong> — ${rows.length} صف — ${headers.length} عمود<br>
       <span style="font-size:12px;color:var(--text-muted)">تم تحليل أول 20 صف وتعرف الأعمدة تلقائياً</span>`;
    renderImportMappingUI();
    notify(`✅ تم قراءة الملف — ${rows.length} سجل`);
  } catch (err) {
    notify('⚠️ ' + (err.message || 'فشل قراءة الملف'), 'danger');
  }
  input.value = '';
}

function importWizardNext() {
  const w = _importWizard;
  if (!w) return;
  if (w.step === 1) {
    if (!w.rawRows.length) { notify('⚠️ ارفع ملف Excel أو CSV أولاً', 'danger'); return; }
    w.mode = 'migration';
    w.step = 2;
    renderImportMappingUI();
  } else if (w.step === 2) {
    if (w.mapping.name == null || w.mapping.phone == null) {
      notify('⚠️ يجب ربط عمود الاسم والجوال على الأقل', 'danger');
      return;
    }
    w.step = 3;
    renderImportPreview();
  } else if (w.step === 3) {
    const opts = getImportOptions(w);
    w.duplicateStrategy = opts.duplicateStrategy;
    w.skipDuplicates = opts.skipDuplicates;
    w.step = 4;
    renderImportWizardStep();
    runClientImport(w.records, 'migration', opts).then(result => {
      renderImportResult(result);
      if (!result.error && typeof logAudit === 'function') {
        logAudit('SETTINGS_CHANGED', `استيراد Excel: ${result.imported} عميل — ${w.fileName}`, { imported: result.imported, file: w.fileName });
      }
    }).catch(err => {
      console.error('[import] run failed', err);
      renderImportResult({ error: err?.message || 'import failed', imported: 0, skipped: 0, updated: 0 });
      if (typeof notify === 'function') notify('⚠️ فشل الاستيراد — ' + (err?.message || 'خطأ غير معروف'), 'danger');
    });
    return;
  }
  renderImportWizardStep();
}

function importWizardBack() {
  if (!_importWizard || _importWizard.step <= 1) return;
  if (_importWizard.step === 4 || _importInProgress) return;
  _importWizard.step--;
  renderImportWizardStep();
}

if (typeof window !== 'undefined') {
  window.cancelClientImport = cancelClientImport;
  window.finishImportUiRefresh = finishImportUiRefresh;
  window.buildImportCase = buildImportCase;
} else if (typeof globalThis !== 'undefined') {
  globalThis.cancelClientImport = cancelClientImport;
  globalThis.finishImportUiRefresh = finishImportUiRefresh;
  globalThis.buildImportCase = buildImportCase;
}

let importHistory = DB.get('importHistory', []);
