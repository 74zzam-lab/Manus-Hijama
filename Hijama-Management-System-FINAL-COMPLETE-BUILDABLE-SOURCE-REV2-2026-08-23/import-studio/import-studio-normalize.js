/* Import Studio — Field normalization & preprocessing */

const IMPORT_STUDIO_AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const IMPORT_STUDIO_EN_DIGITS = '0123456789';

function importStudioToAsciiDigits(v) {
  let s = String(v ?? '');
  IMPORT_STUDIO_AR_DIGITS.split('').forEach((d, i) => {
    s = s.split(d).join(IMPORT_STUDIO_EN_DIGITS[i]);
  });
  return s;
}

function importStudioNormalizeArabicLetters(v) {
  return String(v || '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();
}

function importStudioNormalizePhone(v, opts) {
  let raw = importStudioToAsciiDigits(v);
  if (typeof normalizeImportPhone === 'function') raw = normalizeImportPhone(raw);
  else raw = String(raw || '').replace(/\D/g, '');
  if (!raw) return { value: '', valid: false, reason: 'جوال فارغ' };
  if (raw.length < 9) return { value: raw, valid: false, reason: 'رقم جوال غير صالح' };
  return { value: raw, valid: true };
}

function importStudioNormalizeName(v) {
  let n = importStudioNormalizeArabicLetters(v);
  n = n.replace(/\s+/g, ' ').trim();
  if (typeof normalizeImportName === 'function') n = normalizeImportName(n);
  return n;
}

function importStudioNormalizeDate(v) {
  if (typeof parseImportDate === 'function') return parseImportDate(v) || '';
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function importStudioNormalizeNumber(v) {
  const s = importStudioToAsciiDigits(v).replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function importStudioNormalizeMoney(v) {
  return importStudioNormalizeNumber(String(v || '').replace(/[^\d.,\-]/g, '').replace(/,/g, ''));
}

function importStudioNormalizeBool(v) {
  const s = String(v || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'نعم', 'y', 'active', 'نشط'].includes(s)) return true;
  if (['0', 'false', 'no', 'لا', 'n', 'inactive', 'غير نشط', 'موقوف'].includes(s)) return false;
  return !!s;
}

function importStudioCleanRecord(rec, fieldDefs, modes) {
  if (!rec || modes?.dataCleaning === false) return rec;
  const out = { ...rec };
  Object.keys(fieldDefs || {}).forEach(key => {
    const val = out[key];
    if (val == null || val === '') return;
    if (key === 'phone') {
      const p = importStudioNormalizePhone(val);
      out[key] = p.value;
    } else if (key === 'name') {
      out[key] = importStudioNormalizeName(val);
    } else if (key === 'date') {
      out[key] = importStudioNormalizeDate(val);
    } else if (['total', 'cash', 'card', 'amount', 'salary', 'price', 'cups', 'reorder', 'perSession'].includes(key)) {
      out[key] = key === 'cups' ? importStudioNormalizeNumber(val) : importStudioNormalizeMoney(val);
    } else if (key === 'active') {
      out[key] = importStudioNormalizeBool(val);
    } else if (typeof val === 'string') {
      out[key] = val.trim();
    }
  });
  return out;
}

function importStudioValidateRecord(rec, fieldDefs, modes) {
  if (modes?.validation === false) return { ok: true };
  const errors = [];
  Object.entries(fieldDefs || {}).forEach(([key, def]) => {
    if (!def.required) return;
    const v = rec[key];
    if (v == null || String(v).trim() === '') errors.push(`${def.label || key} مطلوب`);
  });
  if (rec.phone != null && rec.phone !== '') {
    const p = importStudioNormalizePhone(rec.phone);
    if (!p.valid) errors.push(p.reason);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

function importStudioApplyFieldPolicy(existingVal, newVal, policy, modes) {
  const empty = newVal == null || String(newVal).trim() === '';
  const hasExisting = existingVal != null && String(existingVal).trim() !== '';
  if (modes?.ignoreEmpty !== false && empty) return existingVal;
  if (modes?.fillMissing && hasExisting && empty) return existingVal;
  switch (policy || 'fill_missing') {
    case 'keep': return hasExisting ? existingVal : newVal;
    case 'replace': return newVal;
    case 'replace_if_new': return empty ? existingVal : newVal;
    case 'append':
      if (empty) return existingVal;
      if (!hasExisting) return newVal;
      return `${existingVal} | ${newVal}`;
    case 'fill_missing':
    default:
      return hasExisting && empty ? existingVal : (empty && !hasExisting ? '' : newVal);
  }
}
