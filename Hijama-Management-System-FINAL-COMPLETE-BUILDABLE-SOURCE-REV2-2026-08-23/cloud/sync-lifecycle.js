/**
 * RC Hotfix Round 1 — canonical sync lifecycle presentation (renderer).
 * Separates lifecycle state from conflicts / outbox / guard pause.
 */
(function (global) {
  'use strict';

  const LIFECYCLE = Object.freeze({
    NOT_STARTED: 'NOT_STARTED',
    PREPARING: 'PREPARING',
    HYDRATING: 'HYDRATING',
    COMPARING: 'COMPARING',
    MERGING: 'MERGING',
    PUSHING: 'PUSHING',
    VERIFYING: 'VERIFYING',
    CONFLICT_REQUIRES_ACTION: 'CONFLICT_REQUIRES_ACTION',
    PAUSED_OFFLINE: 'PAUSED_OFFLINE',
    FAILED: 'FAILED',
    READY: 'READY',
  });

  const LABELS_AR = Object.freeze({
    NOT_STARTED: 'لم تبدأ المزامنة بعد',
    PREPARING: 'جارٍ تجهيز المزامنة',
    HYDRATING: 'جارٍ سحب بيانات الفرع',
    COMPARING: 'جارٍ مقارنة التغييرات',
    MERGING: 'جارٍ دمج البيانات',
    PUSHING: 'جارٍ رفع التغييرات المحلية',
    VERIFYING: 'جارٍ التحقق من النتيجة',
    CONFLICT_REQUIRES_ACTION: 'يوجد تعارض يحتاج مراجعة',
    PAUSED_OFFLINE: 'بانتظار الإنترنت',
    FAILED: 'تعذر إكمال المزامنة',
    READY: 'المزامنة جاهزة ✓',
  });

  function countOpenConflicts() {
    try {
      const fromSqlite = global.ConflictQueue?.listOpenFromSqlite?.() || [];
      if (Array.isArray(fromSqlite) && fromSqlite.length) return fromSqlite.length;
      const q = global.DB?.get?.('__tdw_conflict_queue__', []) || [];
      return Array.isArray(q) ? q.filter((x) => x && x.status !== 'resolved').length : 0;
    } catch {
      return 0;
    }
  }

  function countPendingOutbox() {
    try {
      const pending = global.SyncState?.getPendingCount?.();
      if (typeof pending === 'number') return pending;
      const outbox = global.DB?.get?.('__tdw_sync_outbox__', []) || [];
      return Array.isArray(outbox) ? outbox.length : 0;
    } catch {
      return 0;
    }
  }

  function isGoogleConnectedForLifecycle() {
    if (global.DriveAdapter?.isConnected?.()) return true;
    const snap = global.DriveAdapter?.authoritySnapshot?.();
    if (snap?.verified && snap?.connected && !snap?.needsReauth && !snap?.stale) return true;
    const prov = global.settings?.backup?.providers?.google;
    return !!(prov?.connected && !prov?.userDisconnected && prov?.oauth !== false);
  }

  function isOffline() {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    } catch { /* empty */ }
    return !isGoogleConnectedForLifecycle();
  }

  /**
   * Map SyncEngine readiness + runtime signals to one lifecycle state.
   */
  function resolveLifecycle(options = {}) {
    const readiness = global.SyncEngine?.getReadiness?.(options) || null;
    const syncStatus = global.SyncEngine?.getStatus?.() || {};
    const engineEnabled = syncStatus.engineEnabled === true || !!readiness?.engineEnabled || !!syncStatus.running;
    const cycleInFlight = syncStatus.cycleInFlight === true || !!readiness?.cycleInFlight
      || !!global.SyncCoordinator?.isCycleInFlight?.();
    const conflictCount = countOpenConflicts();
    const outboxCount = countPendingOutbox();
    const lastPull = syncStatus.lastPullAt || syncStatus.lastSuccessfulPull || null;
    const lastPush = syncStatus.lastPushAt || syncStatus.lastSuccessfulPush || null;
    const lastCycleResult = syncStatus.lastCycleResult || global.SyncCoordinator?.getLastCycleResult?.()?.result || null;
    const baseline = global.SyncBaseline?.load?.() || {};
    const baselineKnown = baseline.baselineKnown === true || baseline.lifecycle === 'READY' || baseline.lifecycle === 'BASELINE_KNOWN';
    const reconciliationRequired = baseline.lifecycle === 'RECONCILIATION_REQUIRED' || baseline.pushBlockedUntilReconcile === true;
    const guardReason = (readiness?.missing || []).find((c) =>
      ['conflict', 'unsafe', 'UNSAFE', 'sync_guard_blocked', 'analysis_required'].includes(String(c))
    ) || null;

    let lifecycle = LIFECYCLE.NOT_STARTED;
    let notReadyReason = null;
    let progressHint = null;

    if (isOffline() && !readiness?.ready) {
      lifecycle = LIFECYCLE.PAUSED_OFFLINE;
      notReadyReason = 'غير جاهزة — لا يوجد اتصال بالإنترنت أو Google';
    } else if (conflictCount > 0 || guardReason === 'conflict') {
      lifecycle = LIFECYCLE.CONFLICT_REQUIRES_ACTION;
      notReadyReason = `يوجد ${conflictCount} تعارض(ات) — البيانات قد تكون متزامنة جزئياً`;
    } else if (readiness?.ready && cycleInFlight) {
      const phase = String(syncStatus.phase || syncStatus.stage || '').toLowerCase();
      if (phase.includes('push')) lifecycle = LIFECYCLE.PUSHING;
      else if (phase.includes('merge')) lifecycle = LIFECYCLE.MERGING;
      else if (phase.includes('compare')) lifecycle = LIFECYCLE.COMPARING;
      else if (phase.includes('hydrat') || phase.includes('pull')) lifecycle = LIFECYCLE.HYDRATING;
      else if (phase.includes('verify')) lifecycle = LIFECYCLE.VERIFYING;
      else lifecycle = LIFECYCLE.PREPARING;
      progressHint = syncStatus.lastActivity || readiness.messageAr;
    } else if (readiness?.ready && !cycleInFlight) {
      const cycleSucceeded = lastCycleResult === 'success';
      if (reconciliationRequired && !cycleSucceeded) {
        lifecycle = LIFECYCLE.VERIFYING;
        notReadyReason = 'مواءمة ما بعد الاستعادة — انتظر اكتمال دورة المزامنة';
      } else if (outboxCount > 0) {
        lifecycle = LIFECYCLE.PUSHING;
        progressHint = `قائمة انتظار: ${outboxCount}`;
      } else if (!baselineKnown && !options.relaxedBaseline && !cycleSucceeded) {
        lifecycle = LIFECYCLE.PREPARING;
        notReadyReason = 'baseline غير معروف بعد — نفّذ المزامنة الأولية';
      } else {
        lifecycle = LIFECYCLE.READY;
      }
    } else if (readiness?.recoverablePause) {
      lifecycle = LIFECYCLE.PREPARING;
      notReadyReason = readiness.messageAr || 'غير جاهزة — المزامنة موقوفة مؤقتاً';
    } else if (readiness && !readiness.ready) {
      lifecycle = LIFECYCLE.NOT_STARTED;
      const missing = readiness.missingLabelsAr || readiness.missing || [];
      if (missing.includes('center_id') || (readiness.missing || []).includes('center_id')) {
        notReadyReason = 'غير جاهزة — Center ID / الترخيص غير مكتمل';
      } else if ((readiness.missing || []).includes('branch_id')) {
        notReadyReason = 'غير جاهزة — الفرع غير مرتبط';
      } else if (global.CloudDataDiscovery?.isRestoreLocked?.() || global.OwnerManagement?.isSystemBusy?.('restore')) {
        notReadyReason = 'غير جاهزة — استعادة/مواءمة جارية';
      } else if ((readiness.missing || []).includes('database_unhealthy')) {
        notReadyReason = 'غير جاهزة — قاعدة البيانات غير صالحة';
      } else {
        notReadyReason = readiness.messageAr
          || `غير جاهزة — ${(missing.slice(0, 3)).join('؛ ')}`;
      }
    }

    if (syncStatus.error && lifecycle !== LIFECYCLE.CONFLICT_REQUIRES_ACTION) {
      lifecycle = LIFECYCLE.FAILED;
      notReadyReason = syncStatus.errorMessage || syncStatus.error || notReadyReason;
    }

    return {
      lifecycle,
      labelAr: LABELS_AR[lifecycle] || lifecycle,
      notReadyReason,
      progressHint,
      conflictCount,
      outboxCount,
      lastPull,
      lastPush,
      readiness,
      engineEnabled,
      cycleInFlight,
      lastCycleResult,
      baselineKnown,
      reconciliationRequired,
    };
  }

  function renderPanelHtml(snapshot) {
    const s = snapshot || resolveLifecycle();
    const lines = [
      `<strong>${s.labelAr}</strong>`,
      s.notReadyReason ? `<span class="bf-source-meta">${s.notReadyReason}</span>` : '',
      s.progressHint && s.cycleInFlight ? `<span class="bf-source-meta">آخر نشاط: ${s.progressHint}</span>` : '',
      s.engineEnabled && !s.cycleInFlight ? `<span class="bf-source-meta">المحرك: يعمل بالخلفية</span>` : '',
      `<span class="bf-source-meta">تعارضات مفتوحة: ${s.conflictCount} · قائمة انتظار: ${s.outboxCount}</span>`,
      s.lastPull ? `<span class="bf-source-meta">آخر سحب: ${s.lastPull}</span>` : '',
      s.lastPush ? `<span class="bf-source-meta">آخر رفع: ${s.lastPush}</span>` : '',
    ].filter(Boolean);
    return lines.join('<br>');
  }

  global.SyncLifecycle = {
    LIFECYCLE,
    LABELS_AR,
    resolveLifecycle,
    renderPanelHtml,
    countOpenConflicts,
    countPendingOutbox,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.SyncLifecycle;
  }
})(typeof window !== 'undefined' ? window : globalThis);
