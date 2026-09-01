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

  const api = {
    TYPE_LABELS: TYPE_LABELS,
    digits: digits,
    last9: last9,
    normalizeName: normalizeName,
    parseContactLines: parseContactLines,
    matchImportedContacts: matchImportedContacts,
    listDueAutomatedMessages: listDueAutomatedMessages,
  };
  global.WaFollowup = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
