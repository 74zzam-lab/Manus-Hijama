/**
 * User-controlled list ordering (UI-only; not live-synced).
 * Default for every clinic list is newest-first by the list's primary date.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'tdw.listSort';

  const DEFAULTS = {
    clients: 'lastVisit-desc',
    daily: 'created-desc',
    invoices: 'date-desc',
    invoiceSearch: 'date-desc',
    messages: 'lastVisit-desc',
    messageLog: 'sentAt-desc',
    bookings: 'date-desc',
    expenses: 'date-desc',
    attendance: 'date-desc',
  };

  const PRESETS = {
    clients: [
      { value: 'lastVisit-desc', label: 'آخر زيارة — الأحدث أولاً' },
      { value: 'lastVisit-asc', label: 'آخر زيارة — الأقدم أولاً' },
      { value: 'created-desc', label: 'تاريخ التسجيل — الأحدث' },
      { value: 'created-asc', label: 'تاريخ التسجيل — الأقدم' },
      { value: 'fileNo-desc', label: 'رقم الملف — الأكبر' },
      { value: 'fileNo-asc', label: 'رقم الملف — الأصغر' },
      { value: 'visits-desc', label: 'عدد الجلسات — الأكثر' },
      { value: 'visits-asc', label: 'عدد الجلسات — الأقل' },
      { value: 'name-asc', label: 'الاسم (أ—ي)' },
    ],
    daily: [
      { value: 'created-desc', label: 'تسجيل الجلسة — الأحدث أولاً' },
      { value: 'created-asc', label: 'تسجيل الجلسة — الأقدم أولاً' },
      { value: 'date-desc', label: 'تاريخ الجلسة — الأحدث' },
      { value: 'date-asc', label: 'تاريخ الجلسة — الأقدم' },
      { value: 'invoice-desc', label: 'رقم الفاتورة — الأكبر' },
      { value: 'invoice-asc', label: 'رقم الفاتورة — الأصغر' },
      { value: 'fileNo-desc', label: 'رقم الملف — الأكبر' },
      { value: 'fileNo-asc', label: 'رقم الملف — الأصغر' },
      { value: 'name-asc', label: 'الاسم (أ—ي)' },
    ],
    invoices: [
      { value: 'date-desc', label: 'التاريخ — الأحدث أولاً' },
      { value: 'date-asc', label: 'التاريخ — الأقدم أولاً' },
      { value: 'created-desc', label: 'تسجيل الجلسة — الأحدث' },
      { value: 'created-asc', label: 'تسجيل الجلسة — الأقدم' },
      { value: 'invoice-desc', label: 'رقم الفاتورة — الأكبر' },
      { value: 'invoice-asc', label: 'رقم الفاتورة — الأصغر' },
      { value: 'fileNo-desc', label: 'رقم الملف — الأكبر' },
      { value: 'fileNo-asc', label: 'رقم الملف — الأصغر' },
      { value: 'name-asc', label: 'الاسم (أ—ي)' },
    ],
    invoiceSearch: [
      { value: 'date-desc', label: 'التاريخ — الأحدث أولاً' },
      { value: 'date-asc', label: 'التاريخ — الأقدم أولاً' },
      { value: 'invoice-desc', label: 'رقم الفاتورة — الأكبر' },
      { value: 'invoice-asc', label: 'رقم الفاتورة — الأصغر' },
      { value: 'fileNo-desc', label: 'رقم الملف — الأكبر' },
      { value: 'name-asc', label: 'الاسم (أ—ي)' },
    ],
    messages: [
      { value: 'lastVisit-desc', label: 'آخر زيارة — الأحدث أولاً' },
      { value: 'lastVisit-asc', label: 'آخر زيارة — الأقدم أولاً' },
      { value: 'fileNo-desc', label: 'رقم الملف — الأكبر' },
      { value: 'fileNo-asc', label: 'رقم الملف — الأصغر' },
      { value: 'visits-desc', label: 'عدد الحضور — الأكثر' },
      { value: 'visits-asc', label: 'عدد الحضور — الأقل' },
      { value: 'lastMsg-desc', label: 'آخر رسالة — الأحدث' },
      { value: 'lastMsg-asc', label: 'آخر رسالة — الأقدم' },
      { value: 'name-asc', label: 'الاسم (أ—ي)' },
    ],
    messageLog: [
      { value: 'sentAt-desc', label: 'وقت الإرسال — الأحدث أولاً' },
      { value: 'sentAt-asc', label: 'وقت الإرسال — الأقدم أولاً' },
      { value: 'name-asc', label: 'الاسم (أ—ي)' },
    ],
    bookings: [
      { value: 'date-desc', label: 'موعد الحجز — الأحدث أولاً' },
      { value: 'date-asc', label: 'موعد الحجز — الأقدم أولاً' },
      { value: 'created-desc', label: 'تاريخ التسجيل — الأحدث' },
      { value: 'created-asc', label: 'تاريخ التسجيل — الأقدم' },
      { value: 'name-asc', label: 'الاسم (أ—ي)' },
    ],
    expenses: [
      { value: 'date-desc', label: 'التاريخ — الأحدث أولاً' },
      { value: 'date-asc', label: 'التاريخ — الأقدم أولاً' },
      { value: 'created-desc', label: 'التسجيل — الأحدث' },
      { value: 'amount-desc', label: 'المبلغ — الأعلى' },
      { value: 'amount-asc', label: 'المبلغ — الأقل' },
    ],
    attendance: [
      { value: 'date-desc', label: 'التاريخ — الأحدث أولاً' },
      { value: 'date-asc', label: 'التاريخ — الأقدم أولاً' },
      { value: 'created-desc', label: 'التسجيل — الأحدث' },
      { value: 'name-asc', label: 'الموظف (أ—ي)' },
    ],
  };

  function parseKey(key, listId) {
    const raw = String(key || DEFAULTS[listId] || 'date-desc');
    const m = raw.match(/^([A-Za-z]+)-(asc|desc)$/);
    if (!m) return { field: 'date', dir: 'desc' };
    return { field: m[1], dir: m[2] };
  }

  function loadMap() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveMap(map) {
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
      /* device storage unavailable — keep in-memory via get/set callers */
    }
  }

  let memoryMap = null;

  function get(listId) {
    const stored = (memoryMap || loadMap())[listId];
    return stored || DEFAULTS[listId] || 'date-desc';
  }

  function set(listId, key) {
    const next = String(key || DEFAULTS[listId] || 'date-desc');
    memoryMap = Object.assign({}, memoryMap || loadMap());
    memoryMap[listId] = next;
    saveMap(memoryMap);
    return next;
  }

  function fileNoValue(v) {
    const s = String(v == null ? '' : v).trim();
    const m = s.match(/(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function timeValue(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const t = Date.parse(String(v));
    return Number.isFinite(t) ? t : 0;
  }

  function compareScalar(a, b, dir) {
    let c = 0;
    if (typeof a === 'number' && typeof b === 'number') c = a - b;
    else c = String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), 'ar', { numeric: true, sensitivity: 'base' });
    if (c === 0) return 0;
    return dir === 'asc' ? c : -c;
  }

  function sortItems(items, sortKey, getter, listId) {
    const { field, dir } = parseKey(sortKey || get(listId), listId);
    const getVal = typeof getter === 'function' ? getter : function (item) { return item && item[field]; };
    return (items || []).slice().sort(function (a, b) {
      const c = compareScalar(getVal(a, field), getVal(b, field), dir);
      if (c !== 0) return c;
      const ta = timeValue(getVal(a, 'created'));
      const tb = timeValue(getVal(b, 'created'));
      if (ta !== tb) return tb - ta;
      return 0;
    });
  }

  function fillSelect(listId) {
    const el = global.document && global.document.getElementById('sort-' + listId);
    if (!el) return;
    const cur = get(listId);
    const opts = PRESETS[listId] || PRESETS.daily;
    el.innerHTML = opts.map(function (o) {
      return '<option value="' + o.value + '"' + (o.value === cur ? ' selected' : '') + '>' + o.label + '</option>';
    }).join('');
    el.value = cur;
  }

  function fillAllSelects() {
    Object.keys(DEFAULTS).forEach(fillSelect);
  }

  const api = {
    STORAGE_KEY,
    DEFAULTS,
    PRESETS,
    parseKey,
    get,
    set,
    fileNoValue,
    timeValue,
    compareScalar,
    sortItems,
    fillSelect,
    fillAllSelects,
  };
  global.ListSort = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
