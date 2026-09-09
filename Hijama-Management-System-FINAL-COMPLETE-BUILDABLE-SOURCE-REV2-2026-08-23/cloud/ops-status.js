/**
 * V2-5.6 — Operational status view-model helpers (Owner Hub / status bar).
 */
(function (global) {
  'use strict';

  function formatLargeCount(n, lang) {
    const num = Number(n);
    if (!Number.isFinite(num)) return '0';
    const rounded = Math.trunc(num);
    const locale = String(lang || '').toLowerCase().startsWith('ar') ? 'ar' : 'en-US';
    try {
      return new Intl.NumberFormat(locale, { useGrouping: true, maximumFractionDigits: 0 }).format(rounded);
    } catch {
      const s = String(Math.abs(rounded));
      const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return rounded < 0 ? '-' + grouped : grouped;
    }
  }

  function truncateName(name, max) {
    const m = Number.isFinite(Number(max)) ? Math.max(1, Number(max)) : 32;
    const s = String(name == null ? '' : name);
    if (s.length <= m) return s;
    if (m <= 1) return '…';
    return s.slice(0, m - 1) + '…';
  }

  function reconnectHint(online) {
    if (online) {
      return {
        online: true,
        code: 'online',
        hintAr: 'متصل — المزامنة نشطة عند توفر المهام.',
        hintEn: 'Online — sync will run when work is pending.'
      };
    }
    return {
      online: false,
      code: 'offline',
      hintAr: 'غير متصل — أعد الاتصال بالشبكة لاستئناف المزامنة.',
      hintEn: 'Offline — reconnect to the network to resume sync.'
    };
  }

  function normalizeDevice(d) {
    d = d || {};
    return {
      id: d.id || d.deviceId || null,
      name: truncateName(d.name || d.label || d.deviceName || 'device', 32),
      nameFull: String(d.name || d.label || d.deviceName || ''),
      lastSyncAt: d.lastSyncAt || d.lastSuccessfulSyncAt || null,
      online: d.online !== false,
      status: d.status || (d.online === false ? 'offline' : 'ok'),
      pending: Number(d.pending) || 0
    };
  }

  function buildStatus(input) {
    input = input || {};
    const online = !!input.online;
    const syncState = input.syncState && typeof input.syncState === 'object'
      ? input.syncState
      : {};
    const conflictCount = Math.max(0, Number(input.conflictCount) || 0);
    const deadLetterCount = Math.max(0, Number(input.deadLetterCount) || 0);
    const pending = Math.max(
      0,
      Number(input.pendingCount != null ? input.pendingCount : syncState.pending) || 0
    );
    const lastSuccessfulSyncAt =
      input.lastSuccessfulSyncAt ||
      syncState.lastPushAt ||
      syncState.lastSuccessfulSyncAt ||
      null;
    const devices = Array.isArray(input.devices)
      ? input.devices.map(normalizeDevice)
      : [];
    const hint = reconnectHint(online);

    let tone = 'ok';
    if (!online) tone = 'offline';
    else if (deadLetterCount > 0) tone = 'dead_letter';
    else if (conflictCount > 0) tone = 'conflict';
    else if (pending > 0) tone = 'pending';
    else if (syncState.lastError) tone = 'error';

    return {
      online,
      tone,
      syncState: {
        pending,
        lastPollAt: syncState.lastPollAt || null,
        lastPushAt: syncState.lastPushAt || null,
        lastError: syncState.lastError || null,
        retryBackoffMs: Number(syncState.retryBackoffMs) || 0
      },
      conflictCount,
      deadLetterCount,
      pendingCount: pending,
      lastSuccessfulSyncAt,
      conflictCountLabel: formatLargeCount(conflictCount),
      deadLetterCountLabel: formatLargeCount(deadLetterCount),
      pendingCountLabel: formatLargeCount(pending),
      devices,
      reconnect: hint,
      summaryAr: !online
        ? 'غير متصل'
        : deadLetterCount
          ? 'رسائل معلّقة تحتاج مراجعة'
          : conflictCount
            ? 'تعارضات بانتظار الحل'
            : pending
              ? 'مزامنة معلّقة'
              : 'جاهز',
      summaryEn: !online
        ? 'Offline'
        : deadLetterCount
          ? 'Dead-letter items need attention'
          : conflictCount
            ? 'Conflicts awaiting resolution'
            : pending
              ? 'Pending sync'
              : 'Ready'
    };
  }

  const api = {
    buildStatus,
    formatLargeCount,
    truncateName,
    reconnectHint
  };

  global.OpsStatus = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
