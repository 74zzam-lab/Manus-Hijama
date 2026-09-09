/**
 * Drive error classification — safe handling for Quota / OAuth failures.
 */
(function (global) {
  'use strict';

  const TYPES = {
    QUOTA: 'drive_quota',
    OAUTH: 'oauth_error',
    OFFLINE: 'offline',
    IDENTITY: 'google_identity_transfer',
    UNKNOWN: 'unknown'
  };

  const USER_MESSAGES = {
    drive_quota: 'مساحة Google Drive ممتلئة — تم إيقاف المزامنة مؤقتاً. حرّر مساحة أو وسّع التخزين ثم أعد المحاولة.',
    oauth_error: 'انتهت صلاحية ربط Google — سجّل الدخول بحساب المركز من الإعدادات.',
    offline: 'لا يوجد اتصال بالإنترنت — ستُستأنف المزامنة عند عودة الاتصال.',
    google_identity_transfer: 'حساب Google مختلف عن حساب المركز — استخدم الحساب المصرّح أو راجع المدير.',
    unknown: 'تعذّرت المزامنة مع Google Drive — حاول لاحقاً.'
  };

  function classify(input) {
    const msg = String(
      input?.message || input?.error || input?.reason || input || ''
    ).toLowerCase();
    const code = String(input?.code || input?.status || '').toLowerCase();

    if (/quota|storage.?quota|insufficient.?storage|userstoragequota|drive.*full/.test(msg + code)) {
      return { type: TYPES.QUOTA, pauseSync: true, notifyUser: true, retry: false };
    }
    if (/invalid_grant|oauth|unauthorized|auth.*expired|token.*revoked|access_denied|login_required/.test(msg + code)) {
      return { type: TYPES.OAUTH, pauseSync: true, notifyUser: true, retry: false };
    }
    if (/google_identity_transfer/.test(msg)) {
      return { type: TYPES.IDENTITY, pauseSync: true, notifyUser: true, retry: false };
    }
    if (/offline|network|enotfound|econnreset|etimedout|fetch failed/.test(msg)) {
      return { type: TYPES.OFFLINE, pauseSync: false, notifyUser: false, retry: true };
    }
    return { type: TYPES.UNKNOWN, pauseSync: false, notifyUser: false, retry: true };
  }

  function userMessage(type) {
    const truth = global.OperationalErrorTruth?.present?.(type);
    if (truth?.userMessageAr) return truth.userMessageAr;
    return USER_MESSAGES[type] || USER_MESSAGES.unknown;
  }

  function handleFailure(input, context) {
    context = context || {};
    const c = classify(input);
    const summary = userMessage(c.type);
    const truth = global.OperationalErrorTruth?.present?.(c.type) || { userMessageAr: summary };

    if (c.pauseSync) {
      global.SyncGuard?.pause?.(c.type, { error: input, context });
      global.SyncEngine?.stop?.();
    }

    if (c.type === TYPES.OFFLINE) {
      global.SyncState?.setOnline?.(false);
    } else if (c.notifyUser) {
      global.SyncState?.setError?.(c.type);
    }

    global.AuditLogger?.logSyncEvent?.('SYSTEM_ERROR', {
      entity: 'drive',
      summary: truth.userMessageAr || summary,
      meta: {
        type: c.type,
        code: truth.code || c.type,
        context,
        raw: global.OperationalErrorTruth?.redactString?.(
          String(input?.message || input?.error || input || '')
        ).slice(0, 200) || String(input?.message || input?.error || input || '').slice(0, 200),
      }
    });

    if (c.notifyUser && typeof global.notify === 'function') {
      global.notify('⚠️ ' + (truth.userMessageAr || summary), 'danger');
    }

    return { ok: false, classified: c, userMessage: truth.userMessageAr || summary, code: truth.code || c.type };
  }

  function wrapResult(result) {
    if (result?.ok !== false) return result;
    return handleFailure(result, { layer: 'drive_adapter' });
  }

  global.DriveErrors = {
    TYPES,
    classify,
    userMessage,
    handleFailure,
    wrapResult
  };
})(typeof window !== 'undefined' ? window : globalThis);
