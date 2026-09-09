/**
 * V2-5.6 — Actionable, leak-safe error recovery copy (AR/EN).
 * Messages must never embed tokens, secrets, or raw credentials.
 */
(function (global) {
  'use strict';

  const MESSAGES = Object.freeze({
    offline: Object.freeze({
      code: 'offline',
      titleAr: 'لا يوجد اتصال بالإنترنت',
      titleEn: 'You are offline',
      bodyAr: 'تعذّر الوصول إلى السحابة. ستُحفظ التغييرات محلياً حتى يعود الاتصال.',
      bodyEn: 'Cloud is unreachable. Changes stay local until connectivity returns.',
      recoveryAr: Object.freeze([
        'تحقق من شبكة Wi‑Fi أو البيانات الخلوية',
        'أعد المحاولة بعد استعادة الاتصال',
        'لا تغلق الجهاز أثناء انتظار إعادة الاتصال إن أمكن'
      ]),
      recoveryEn: Object.freeze([
        'Check Wi‑Fi or cellular data',
        'Retry after connectivity returns',
        'Avoid closing the app while waiting to reconnect if possible'
      ]),
      leakSafe: true
    }),
    token_expired: Object.freeze({
      code: 'token_expired',
      titleAr: 'انتهت صلاحية تسجيل الدخول',
      titleEn: 'Sign-in session expired',
      bodyAr: 'يلزم إعادة ربط حساب Google للمركز من الإعدادات. لن تُعرض بيانات الدخول هنا.',
      bodyEn: 'Re-link the center Google account from Settings. Credentials are never shown here.',
      recoveryAr: Object.freeze([
        'افتح الإعدادات ← ربط Google',
        'سجّل الدخول بحساب المركز المصرّح',
        'أعد تشغيل المزامنة بعد نجاح الربط'
      ]),
      recoveryEn: Object.freeze([
        'Open Settings → Google link',
        'Sign in with the authorized center account',
        'Resume sync after linking succeeds'
      ]),
      leakSafe: true
    }),
    quota: Object.freeze({
      code: 'quota',
      titleAr: 'مساحة التخزين ممتلئة',
      titleEn: 'Storage quota exceeded',
      bodyAr: 'توقفت المزامنة مؤقتاً لحماية البيانات. حرّر مساحة على Drive أو وسّع الخطة ثم أعد المحاولة.',
      bodyEn: 'Sync paused to protect data. Free Drive space or upgrade the plan, then retry.',
      recoveryAr: Object.freeze([
        'احذف ملفات غير ضرورية من Google Drive',
        'تحقق من حصة التخزين في حساب المركز',
        'أعد المحاولة بعد توفر مساحة كافية'
      ]),
      recoveryEn: Object.freeze([
        'Remove unneeded files from Google Drive',
        'Check the center account storage quota',
        'Retry once enough space is available'
      ]),
      leakSafe: true
    }),
    permission_denied: Object.freeze({
      code: 'permission_denied',
      titleAr: 'رفض الصلاحية',
      titleEn: 'Permission denied',
      bodyAr: 'الحساب الحالي لا يملك صلاحية إكمال هذه العملية. لم تُكشف تفاصيل حساسة.',
      bodyEn: 'The current account cannot complete this operation. No sensitive details are disclosed.',
      recoveryAr: Object.freeze([
        'تأكد أنك تستخدم حساب المركز الصحيح',
        'اطلب من المدير منح الصلاحية المناسبة',
        'أعد المحاولة بعد تحديث الصلاحيات'
      ]),
      recoveryEn: Object.freeze([
        'Confirm you are using the correct center account',
        'Ask an admin to grant the required permission',
        'Retry after permissions are updated'
      ]),
      leakSafe: true
    }),
    network_slow: Object.freeze({
      code: 'network_slow',
      titleAr: 'الشبكة بطيئة أو غير مستقرة',
      titleEn: 'Network is slow or unstable',
      bodyAr: 'العملية ما زالت جارية أو ستُعاد تلقائياً. تجنّب قطع الاتصال أثناء التقدم.',
      bodyEn: 'The operation is still running or will retry automatically. Avoid disconnecting mid-progress.',
      recoveryAr: Object.freeze([
        'انتظر اكتمال المحاولة الحالية',
        'انتقل إلى شبكة أكثر استقراراً إن أمكن',
        'استخدم إعادة المحاولة إذا ظهرت فشل نهائي'
      ]),
      recoveryEn: Object.freeze([
        'Wait for the current attempt to finish',
        'Switch to a more stable network if possible',
        'Use Retry if a final failure is shown'
      ]),
      leakSafe: true
    }),
    generic: Object.freeze({
      code: 'generic',
      titleAr: 'تعذّر إكمال العملية',
      titleEn: 'Operation could not complete',
      bodyAr: 'حدث خطأ غير متوقع. البيانات المحلية محفوظة. راجع التفاصيل الآمنة في سجل العمليات.',
      bodyEn: 'An unexpected error occurred. Local data is preserved. Review safe details in the ops log.',
      recoveryAr: Object.freeze([
        'أعد المحاولة بعد لحظات',
        'تحقق من الاتصال وحالة الحساب',
        'إن تكرر الخطأ، صدّر سجلاً منقّحاً للدعم'
      ]),
      recoveryEn: Object.freeze([
        'Retry in a moment',
        'Check connectivity and account status',
        'If it repeats, export a redacted log for support'
      ]),
      leakSafe: true
    })
  });

  const CLASSIFY_MAP = Object.freeze({
    offline: 'offline',
    unauthorized: 'token_expired',
    token_expired: 'token_expired',
    oauth: 'token_expired',
    oauth_error: 'token_expired',
    forbidden: 'permission_denied',
    permission_denied: 'permission_denied',
    quota: 'quota',
    drive_quota: 'quota',
    timeout: 'network_slow',
    network_slow: 'network_slow',
    rate_limit: 'network_slow',
    unknown: 'generic',
    conflict: 'generic',
    remote_corrupt: 'generic',
    generic: 'generic'
  });

  function cloneMessage(msg) {
    return {
      code: msg.code,
      titleAr: msg.titleAr,
      titleEn: msg.titleEn,
      bodyAr: msg.bodyAr,
      bodyEn: msg.bodyEn,
      recoveryAr: msg.recoveryAr.slice(),
      recoveryEn: msg.recoveryEn.slice(),
      leakSafe: true
    };
  }

  function get(code) {
    const key = String(code || 'generic');
    return cloneMessage(MESSAGES[key] || MESSAGES.generic);
  }

  function fromClassify(category) {
    const cat = String(category || '').toLowerCase().trim();
    const mapped = CLASSIFY_MAP[cat] || 'generic';
    return get(mapped);
  }

  /** Scan message fields for accidental secret-like substrings (test aid). */
  function assertLeakSafe(msg) {
    const blob = [
      msg.titleAr, msg.titleEn, msg.bodyAr, msg.bodyEn,
      ...(msg.recoveryAr || []), ...(msg.recoveryEn || [])
    ].join('\n');
    if (/bearer\s+[a-z0-9\-._~+/]+=*/i.test(blob)) throw new Error('leak_bearer');
    if (/api[_-]?key\s*[:=]/i.test(blob)) throw new Error('leak_api_key');
    if (/password\s*[:=]\s*\S+/i.test(blob)) throw new Error('leak_password');
    if (!msg.leakSafe) throw new Error('leak_flag_missing');
    return true;
  }

  const api = {
    MESSAGES,
    CLASSIFY_MAP,
    get,
    fromClassify,
    assertLeakSafe
  };

  global.ErrorRecoveryUx = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
