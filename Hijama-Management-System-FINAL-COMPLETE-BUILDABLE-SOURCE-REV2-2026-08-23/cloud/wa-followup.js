/**
 * Client-follow-up matching and due-message preview.
 * Matching uses clinic records (name + file number + phone) against an imported
 * WhatsApp contact list. It does not scrape WhatsApp.
 */
(function (global) {
  'use strict';

  const TYPE_LABELS = {
    followup: 'متابعة بعد الجلسة',
    appointment: 'تذكير موعد',
    overdue: 'تنبيه غياب',
    promo: 'عروض',
  };

  function digits(phone) {
    return String(phone == null ? '' : phone).replace(/\D/g, '');
  }

  function last9(phone) {
    const d = digits(phone);
    return d.length >= 9 ? d.slice(-9) : d;
  }

  function normalizeName(name) {
    return String(name || '')
      .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function parseContactLines(text) {
    const lines = String(text || '').split(/\r?\n/);
    const out = [];
    const seen = new Set();
    for (let i = 0; i < lines.length; i++) {
      const raw = String(lines[i] || '').trim();
      if (!raw || raw.charAt(0) === '#') continue;
      const parts = raw.split(/[,،;؛\t|]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      let name = '';
      let phone = '';
      if (parts.length >= 2) {
        const a = parts[0];
        const rest = parts.slice(1).join(' ');
        if (/\d{8,}/.test(a) && !/\d{8,}/.test(parts[1])) {
          phone = a;
          name = rest;
        } else {
          name = a;
          phone = parts[1];
        }
      } else {
        const m = raw.match(/(\+?\d[\d\s-]{7,}\d)/);
        if (m) {
          phone = m[1];
          name = raw.replace(m[1], '').replace(/[,،;؛\t|]+/g, ' ').trim();
        } else {
          name = raw;
        }
      }
      const d = digits(phone);
      name = String(name || '').replace(/[,،;؛]+$/g, '').trim();
      const key = (d ? last9(d) : '') + '|' + normalizeName(name);
      if (!d && !name) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: name || '—', phone: d, displayPhone: phone || d, line: i + 1 });
    }
    return out;
  }

  function clinicKey(row) {
    return String(row.fileNo || row.key || last9(row.phone) || row.name || '');
  }

  function matchImportedContacts(imported, clinicClients) {
    const list = Array.isArray(imported) ? imported : [];
    const clinic = Array.isArray(clinicClients) ? clinicClients : [];
    const byPhone = new Map();
    const byName = new Map();
    clinic.forEach(function (c) {
      const p = last9(c && c.phone);
      if (p && !byPhone.has(p)) byPhone.set(p, c);
      const n = normalizeName(c && c.name);
      if (n && !byName.has(n)) byName.set(n, c);
    });

    const matched = [];
    const unmatchedImported = [];
    const used = new Set();

    list.forEach(function (imp) {
      const p = last9(imp && imp.phone);
      const n = normalizeName(imp && imp.name);
      let row = p ? byPhone.get(p) : null;
      let how = '';
      if (row) how = 'phone';
      else if (n && byName.get(n)) {
        row = byName.get(n);
        how = 'name';
      }
      if (row) {
        used.add(clinicKey(row));
        matched.push({ imported: imp, clinic: row, how: how });
      } else {
        unmatchedImported.push(imp);
      }
    });

    const unmatchedClinic = clinic.filter(function (c) {
      return !used.has(clinicKey(c));
    });

    return { matched: matched, unmatchedImported: unmatchedImported, unmatchedClinic: unmatchedClinic };
  }

  function listDueAutomatedMessages(input) {
    const src = input || {};
    const now = src.now || Date.now();
    const cfg = src.cfg || {};
    const cases = Array.isArray(src.cases) ? src.cases : [];
    const bookings = Array.isArray(src.bookings) ? src.bookings : [];
    const nextSessions = Array.isArray(src.nextSessions) ? src.nextSessions : [];
    const map = src.clientsMap && typeof src.clientsMap === 'object' ? src.clientsMap : {};
    const wasSent = typeof src.wasSent === 'function' ? src.wasSent : function () { return false; };
    const parseDateTimeMs = typeof src.parseDateTimeMs === 'function'
      ? src.parseDateTimeMs
      : function (dateStr, timeStr) {
        if (!dateStr) return NaN;
        const t = String(timeStr || '09:00').slice(0, 5);
        return new Date(dateStr + 'T' + t + ':00').getTime();
      };
    const due = [];

    if (cfg.followup && cfg.followup.enabled) {
      const hours = parseInt(cfg.followup.hoursAfter, 10) || 24;
      const threshold = now - hours * 3600000;
      cases.forEach(function (c) {
        if (!c || !c.phone || c.sharedRole === 'partner') return;
        const at = new Date(c.createdAt || c.date).getTime();
        if (!at || at > threshold) return;
        const refId = 'case_' + c.id;
        if (wasSent(refId, 'followup')) return;
        due.push({
          type: 'followup',
          label: TYPE_LABELS.followup,
          name: c.name || '—',
          phone: c.phone,
          fileNo: c.fileNo || '',
          refId: refId,
          when: at + hours * 3600000,
        });
      });
    }

    if (cfg.appointment && cfg.appointment.enabled) {
      const hoursBefore = parseInt(cfg.appointment.hoursBefore, 10) || 24;
      const windowEnd = now + hoursBefore * 3600000;
      bookings.forEach(function (b) {
        if (!b || !b.phone || ['pending', 'confirmed'].indexOf(b.status) === -1) return;
        const apptMs = parseDateTimeMs(b.date, b.time);
        if (!apptMs || apptMs <= now || apptMs > windowEnd) return;
        const refId = 'booking_' + b.id;
        if (wasSent(refId, 'appointment')) return;
        due.push({
          type: 'appointment',
          label: TYPE_LABELS.appointment,
          name: b.name || '—',
          phone: b.phone,
          fileNo: b.fileNo || '',
          refId: refId,
          when: apptMs,
        });
      });
      nextSessions.forEach(function (s) {
        if (!s || !s.clientKey) return;
        const client = map[s.clientKey];
        if (!client || !client.phone) return;
        const apptMs = parseDateTimeMs(s.date, '09:00');
        if (!apptMs || apptMs <= now || apptMs > windowEnd) return;
        const refId = 'session_' + s.id;
        if (wasSent(refId, 'appointment')) return;
        due.push({
          type: 'appointment',
          label: TYPE_LABELS.appointment,
          name: client.name || '—',
          phone: client.phone,
          fileNo: client.fileNo || '',
          refId: refId,
          when: apptMs,
        });
      });
    }

    if (cfg.overdue && cfg.overdue.enabled) {
      const overdueDays = parseInt(cfg.overdue.days, 10) || 75;
      const cooldown = parseInt(cfg.overdue.cooldownDays, 10) || 30;
      const today = new Date(now);
      Object.keys(map).forEach(function (key) {
        const v = map[key];
        if (!v || !v.phone || !v.lastDate) return;
        const days = Math.floor((today - new Date(v.lastDate)) / 86400000);
        if (days < overdueDays) return;
        const refId = 'overdue_' + key;
        if (wasSent(refId, 'overdue', cooldown)) return;
        due.push({
          type: 'overdue',
          label: TYPE_LABELS.overdue,
          name: v.name || '—',
          phone: v.phone,
          fileNo: v.fileNo || '',
          refId: refId,
          when: now,
          days: days,
        });
      });
    }

    due.sort(function (a, b) { return (a.when || 0) - (b.when || 0); });
    return due;
  }

  function contactDisplayName(row) {
    const name = String((row && row.name) || '').trim() || 'عميل';
    const fileNo = String((row && row.fileNo) || '').trim();
    return fileNo ? (name + ' ' + fileNo) : name;
  }

  function internationalPhone(phone) {
    const d = digits(phone);
    if (!d) return '';
    if (d.startsWith('966')) return '+' + d;
    if (d.startsWith('00')) return '+' + d.slice(2);
    if (d.startsWith('0') && d.length >= 9) return '+966' + d.slice(1);
    if (d.length === 9) return '+966' + d;
    return '+' + d;
  }

  function csvEscape(value) {
    const t = String(value == null ? '' : value);
    if (/[",\n\r]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
    return t;
  }

  function buildGoogleContactsCsv(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const lines = ['Name,Given Name,Family Name,Phone 1 - Type,Phone 1 - Value,Notes'];
    list.forEach(function (row) {
      const phone = internationalPhone(row && row.phone);
      if (!phone) return;
      lines.push([
        csvEscape(contactDisplayName(row)),
        csvEscape(row.name || ''),
        csvEscape(row.fileNo || ''),
        'Mobile',
        csvEscape(phone),
        csvEscape(row.fileNo ? ('file:' + row.fileNo) : ''),
      ].join(','));
    });
    return lines.join('\r\n') + '\r\n';
  }

  function buildWhatsAppCsv(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const lines = ['Name,Phone Number'];
    list.forEach(function (row) {
      const phone = internationalPhone(row && row.phone);
      if (!phone) return;
      lines.push(csvEscape(contactDisplayName(row)) + ',' + csvEscape(phone));
    });
    return lines.join('\r\n') + '\r\n';
  }

  function vcfEscape(value) {
    return String(value == null ? '' : value)
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  function buildVcard(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const blocks = [];
    list.forEach(function (row) {
      const phone = internationalPhone(row && row.phone);
      if (!phone) return;
      const display = contactDisplayName(row);
      blocks.push([
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:' + vcfEscape(display),
        'N:' + vcfEscape(row.fileNo || '') + ';' + vcfEscape(row.name || '') + ';;;',
        'TEL;TYPE=CELL:' + phone,
        'NOTE:' + vcfEscape(row.fileNo ? ('رقم الملف ' + row.fileNo) : ''),
        'END:VCARD',
      ].join('\r\n'));
    });
    return blocks.join('\r\n') + (blocks.length ? '\r\n' : '');
  }

  function parseVcard(text) {
    const chunks = String(text || '').split(/END:VCARD/i);
    const out = [];
    chunks.forEach(function (chunk, idx) {
      if (!/BEGIN:VCARD/i.test(chunk)) return;
      const fn = (chunk.match(/FN:(.+)/i) || [])[1];
      const tel = (chunk.match(/TEL[^:]*:([^\r\n]+)/i) || [])[1];
      const name = String(fn || '').replace(/\\,/g, ',').trim();
      const phone = digits(tel);
      if (!phone && !name) return;
      out.push({ name: name || '—', phone: phone, displayPhone: tel || phone, line: idx + 1 });
    });
    return out;
  }

  function parseCsvContacts(text) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(function (h) { return h.trim().replace(/^"|"$/g, '').toLowerCase(); });
    const nameIdx = header.findIndex(function (h) { return h === 'name' || h === 'given name' || h.indexOf('name') !== -1; });
    const phoneIdx = (() => {
      const exact = header.findIndex(function (h) {
        return h === 'phone number' || h === 'phone 1 - value' || h === 'phone';
      });
      if (exact >= 0) return exact;
      return header.findIndex(function (h) {
        return h.indexOf('phone') !== -1 && h.indexOf('type') === -1;
      });
    })();
    if (nameIdx < 0 || phoneIdx < 0) return [];
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(function (c) { return c.trim().replace(/^"|"$/g, ''); });
      const name = cols[nameIdx] || '';
      const phone = digits(cols[phoneIdx]);
      if (!phone && !name) continue;
      out.push({ name: name || '—', phone: phone, displayPhone: cols[phoneIdx] || phone, line: i + 1 });
    }
    return out;
  }

  function parseAnyContacts(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    if (/BEGIN:VCARD/i.test(raw)) return parseVcard(raw);
    const csv = parseCsvContacts(raw);
    if (csv.length) return csv;
    return parseContactLines(raw);
  }

  function flattenMatchRows(state) {
    const st = state || {};
    const rows = [];
    (st.matched || []).forEach(function (m) {
      rows.push({
        kind: 'matched',
        how: m.how,
        importedName: m.imported && m.imported.name,
        importedPhone: (m.imported && (m.imported.displayPhone || m.imported.phone)) || '',
        clinicName: m.clinic && m.clinic.name,
        fileNo: m.clinic && m.clinic.fileNo,
      });
    });
    (st.unmatchedImported || []).forEach(function (imp, index) {
      rows.push({
        kind: 'imported',
        index: index,
        importedName: imp.name,
        importedPhone: imp.displayPhone || imp.phone,
        clinicName: '',
        fileNo: '',
        phone: imp.phone,
      });
    });
    (st.unmatchedClinic || []).forEach(function (c) {
      rows.push({
        kind: 'clinic',
        importedName: '',
        importedPhone: '',
        clinicName: c.name,
        fileNo: c.fileNo,
        phone: c.phone,
      });
    });
    return rows;
  }

  function buildWhatsAppSendUrl(phone, text, target) {
    const p = String(phone || '').replace(/\D/g, '');
    const q = encodeURIComponent(text || '');
    const mode = String(target || 'auto');
    if (!p) return '';
    if (mode === 'desktop') return 'whatsapp://send?phone=' + p + '&text=' + q;
    if (mode === 'web' || mode === 'embedded') return 'https://web.whatsapp.com/send?phone=' + p + '&text=' + q;
    return 'https://wa.me/' + p + (q ? ('?text=' + q) : '');
  }

  const api = {
    TYPE_LABELS: TYPE_LABELS,
    digits: digits,
    last9: last9,
    normalizeName: normalizeName,
    parseContactLines: parseContactLines,
    parseAnyContacts: parseAnyContacts,
    parseVcard: parseVcard,
    parseCsvContacts: parseCsvContacts,
    matchImportedContacts: matchImportedContacts,
    flattenMatchRows: flattenMatchRows,
    listDueAutomatedMessages: listDueAutomatedMessages,
    contactDisplayName: contactDisplayName,
    internationalPhone: internationalPhone,
    buildGoogleContactsCsv: buildGoogleContactsCsv,
    buildWhatsAppCsv: buildWhatsAppCsv,
    buildVcard: buildVcard,
    buildWhatsAppSendUrl: buildWhatsAppSendUrl,
  };
  global.WaFollowup = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
