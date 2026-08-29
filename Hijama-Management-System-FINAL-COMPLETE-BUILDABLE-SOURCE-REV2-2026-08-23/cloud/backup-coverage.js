/**
 * Local backup coverage for this device.
 * After a full branch restore, this device already holds the latest snapshot.
 * Do not nag to create a new backup (that can overwrite today's Auto file
 * and race other devices). Periodic Auto backup continues on later days.
 *
 * Coverage is local-only — it must not sync and silence other devices.
 */
(function (global) {
  'use strict';

  const COVERAGE_KEY = 'backupCoverage';
  const NAG_DAYS = 7;

  function nowMs(now) {
    if (now instanceof Date) return now.getTime();
    if (typeof now === 'number' && Number.isFinite(now)) return now;
    return Date.now();
  }

  function timeMs(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const t = Date.parse(String(value));
    return Number.isFinite(t) ? t : 0;
  }

  function dayKey(ms) {
    if (!ms) return '';
    return new Date(ms).toISOString().slice(0, 10);
  }

  function loadCoverage(db) {
    try {
      const store = db || global.DB;
      return store?.get?.(COVERAGE_KEY, null) || null;
    } catch {
      return null;
    }
  }

  function saveCoverage(record, db) {
    const store = db || global.DB;
    try { store?.set?.(COVERAGE_KEY, record); } catch { /* empty */ }
    return record;
  }

  function collectCoverageMs(input) {
    input = input || {};
    const times = [];
    const push = (v) => {
      const ms = timeMs(v);
      if (ms) times.push(ms);
    };

    (input.backupLog || []).forEach((e) => {
      if (e && e.status === 'success') push(e.at);
    });
    (input.backupRegistry || []).forEach((e) => {
      if (e && e.at) push(e.at);
    });

    const cv2 = input.cloudV2 || {};
    push(cv2.lastAutoBackupAt);
    push(cv2.lastBackupAt);
    if (cv2.lastAutoBackupDate) push(String(cv2.lastAutoBackupDate) + 'T12:00:00.000Z');

    const cov = input.coverage || null;
    if (cov) {
      push(cov.at);
      push(cov.snapshotAt);
    }

    push(input.restoreAt);
    return times.length ? Math.max.apply(null, times) : 0;
  }

  function hasClinicData(input) {
    const n = (arr) => (Array.isArray(arr) ? arr.length : 0);
    return n(input.cases) + n(input.clientsRegistry) + n(input.bookings) > 0;
  }

  function evaluateNag(input, now) {
    input = input || {};
    const ms = nowMs(now);
    const last = collectCoverageMs(input);
    const ageDays = last ? Math.floor((ms - last) / 86400000) : null;
    const coverage = input.coverage || null;
    const restored = coverage && (coverage.source === 'restore' || coverage.full === true);
    const restoredAge = restored ? Math.floor((ms - timeMs(coverage.at || coverage.snapshotAt)) / 86400000) : null;

    if (restored && (restoredAge == null || restoredAge < NAG_DAYS) && (hasClinicData(input) || input.restoreVerified)) {
      return {
        nag: false,
        reason: 'restored_current',
        at: coverage.at || coverage.snapshotAt || null,
        last,
        ageDays: restoredAge,
      };
    }

    if (last && ageDays != null && ageDays < NAG_DAYS) {
      return { nag: false, reason: 'recent_backup', at: new Date(last).toISOString(), last, ageDays };
    }

    if (input.syncHealthy && hasClinicData(input)) {
      return { nag: false, reason: 'live_sync_current', at: last ? new Date(last).toISOString() : null, last, ageDays };
    }

    return {
      nag: true,
      reason: last ? 'stale' : 'never',
      at: last ? new Date(last).toISOString() : null,
      last,
      ageDays,
    };
  }

  function shouldSkipSameDayAutoBackup(input, now) {
    input = input || {};
    const coverage = input.coverage || loadCoverage(input.db);
    if (!coverage || (coverage.source !== 'restore' && coverage.full !== true)) return false;
    const today = dayKey(nowMs(now));
    const restoredDay = dayKey(timeMs(coverage.at || coverage.snapshotAt));
    return !!today && today === restoredDay;
  }

  function markRestored(meta, helpers) {
    helpers = helpers || {};
    const at = meta?.at || new Date().toISOString();
    const snapshotAt = meta?.snapshotAt || meta?.backupAt || at;
    const record = {
      source: 'restore',
      full: true,
      at,
      snapshotAt,
      branchId: meta?.branchId || '',
      centerId: meta?.centerId || '',
      backupId: meta?.backupId || '',
    };
    saveCoverage(record, helpers.db);
    if (typeof helpers.logBackupEntry === 'function') {
      helpers.logBackupEntry(
        'success',
        'استعادة نسخة مكتملة — بيانات الفرع محدّثة حتى لحظة النسخة. النسخ الدوري يتابع لاحقاً مع المزامنة.',
        'restore'
      );
    }
    if (typeof helpers.registerBackup === 'function') {
      helpers.registerBackup({
        id: 'restore_' + Date.now(),
        at,
        snapshotAt,
        trigger: 'restore',
        restored: true,
        local: true,
        cloud: !!meta?.fromCloud,
      });
    }
    return record;
  }

  const api = {
    COVERAGE_KEY,
    NAG_DAYS,
    timeMs,
    dayKey,
    loadCoverage,
    saveCoverage,
    collectCoverageMs,
    evaluateNag,
    shouldSkipSameDayAutoBackup,
    markRestored,
  };
  global.BackupCoverage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
