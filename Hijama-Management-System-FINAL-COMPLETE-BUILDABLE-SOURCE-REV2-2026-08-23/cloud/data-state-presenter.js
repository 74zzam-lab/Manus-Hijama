/**
 * Data State Presenter — user-friendly summary (no technical jargon).
 */
(function (global) {
  'use strict';

  const STATE_LABELS = {
    identical: 'البيانات متطابقة',
    local_only: 'البيانات المحلية أحدث',
    cloud_only: 'بيانات السحابة أحدث',
    safe_merge: 'توجد بيانات مختلفة — يمكن دمجها بأمان',
    diverged: 'توجد بيانات مختلفة تحتاج مراجعة',
    conflict: 'توجد تعارضات تحتاج تدخل المدير',
    unsafe: 'توجد بيانات مختلفة تحتاج مراجعة',
    offline: 'غير متصل — سيتم المزامنة عند عودة الاتصال'
  };

  const COUNT_KEYS = {
    clients: 'clientsRegistry',
    cases: 'cases',
    invoices: 'cases',
    bookings: 'bookings',
    sessions: 'bookings'
  };

  function maxUpdatedAt(records) {
    if (!Array.isArray(records) || !records.length) return null;
    let max = 0;
    records.forEach(r => {
      const t = r?.updatedAt || r?.createdAt || r?.date || r?.savedAt;
      if (t) max = Math.max(max, new Date(t).getTime());
    });
    return max ? new Date(max).toISOString() : null;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }

  function countRecords(table, branchId, records) {
    if (records) return records.length;
    const rows = global.DataStateAnalyzer?.getLocalRecords?.(table, branchId) || [];
    return rows.length;
  }

  function buildCounts(analysis, localCache, remoteCache) {
    const branchId = analysis?.branchId;
    const getLocal = (t) => localCache?.[t] || global.DataStateAnalyzer?.getLocalRecords?.(t, branchId) || [];
    const getRemote = (t) => remoteCache?.[t] || [];

    return {
      clients: countRecords('clientsRegistry', branchId, getLocal('clientsRegistry')),
      cases: countRecords('cases', branchId, getLocal('cases')),
      invoices: countRecords('cases', branchId, getLocal('cases')),
      bookings: countRecords('bookings', branchId, getLocal('bookings')),
      sessions: countRecords('bookings', branchId, getLocal('bookings')),
      remoteClients: getRemote('clientsRegistry').length,
      remoteCases: getRemote('cases').length,
      remoteBookings: getRemote('bookings').length
    };
  }

  function buildTimestamps(analysis, localCache, remoteCache) {
    const branchId = analysis?.branchId;
    const tables = ['cases', 'clientsRegistry', 'bookings', 'settings'];
    let localMax = 0;
    let remoteMax = 0;

    tables.forEach(t => {
      const l = localCache?.[t] || global.DataStateAnalyzer?.getLocalRecords?.(t, branchId) || [];
      const r = remoteCache?.[t] || [];
      const lm = maxUpdatedAt(l);
      const rm = maxUpdatedAt(r);
      if (lm) localMax = Math.max(localMax, new Date(lm).getTime());
      if (rm) remoteMax = Math.max(remoteMax, new Date(rm).getTime());
    });

    return {
      lastLocalEdit: localMax ? new Date(localMax).toISOString() : null,
      lastCloudEdit: remoteMax ? new Date(remoteMax).toISOString() : null,
      lastLocalEditLabel: formatDate(localMax ? new Date(localMax).toISOString() : null),
      lastCloudEditLabel: formatDate(remoteMax ? new Date(remoteMax).toISOString() : null)
    };
  }

  function present(analysis, options) {
    options = options || {};
    if (!analysis) return null;

    const state = analysis.state || 'identical';
    const counts = buildCounts(analysis, options.localCache, options.remoteCache);
    const times = buildTimestamps(analysis, options.localCache, options.remoteCache);

    let headline = 'تم العثور على بيانات محلية وبيانات على Google Drive';
    if (analysis.offline) headline = 'لا يوجد اتصال بـ Google Drive حالياً';
    else if (state === 'identical') headline = 'بياناتك متطابقة مع Google Drive';
    else if (state === 'local_only') headline = 'البيانات موجودة على هذا الجهاز فقط';
    else if (state === 'cloud_only') headline = 'البيانات موجودة على Google Drive فقط';

    return {
      headline,
      stateLabel: STATE_LABELS[state] || STATE_LABELS.unsafe,
      state,
      blocked: !!analysis.blocked,
      requiresManager: state === 'conflict' || (analysis.requiresUserDecision && state !== 'safe_merge'),
      counts,
      ...times,
      canAutoProceed: !analysis.blocked && !analysis.requiresUserDecision,
      allowedActions: analysis.allowedActions || [],
      analyzedAt: analysis.analyzedAt,
      analyzedAtLabel: formatDate(analysis.analyzedAt)
    };
  }

  global.DataStatePresenter = {
    STATE_LABELS,
    present,
    formatDate,
    buildCounts,
    buildTimestamps
  };
})(typeof window !== 'undefined' ? window : globalThis);
