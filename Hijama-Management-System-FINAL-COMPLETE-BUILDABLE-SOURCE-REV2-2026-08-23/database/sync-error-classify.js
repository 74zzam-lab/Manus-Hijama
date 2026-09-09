'use strict';

/**
 * V2-4 sync error classification — actionable recovery (no empty catch).
 */

const CATEGORIES = Object.freeze({
  OFFLINE: 'offline',
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  TOKEN_EXPIRED: 'token_expired',
  REVOKED: 'revoked',
  RATE_LIMIT: 'rate_limit',
  QUOTA: 'quota',
  REMOTE_MISSING: 'remote_missing',
  REMOTE_CORRUPT: 'remote_corrupt',
  SCHEMA_INCOMPATIBLE: 'schema_incompatible',
  CHECKSUM_MISMATCH: 'checksum_mismatch',
  CONFLICT: 'conflict',
  LOCAL_DB: 'local_db',
  DISK_FULL: 'disk_full',
  PERMISSION: 'permission',
  ATTACHMENT: 'attachment',
  UNKNOWN: 'unknown',
});

const POLICY = Object.freeze({
  [CATEGORIES.OFFLINE]: {
    retryable: true,
    backoff: true,
    pauseSync: false,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'أنت غير متصل. العمل المحلي محفوظ وسيُزامَن عند عودة الشبكة.',
  },
  [CATEGORIES.NETWORK]: {
    retryable: true,
    backoff: true,
    pauseSync: false,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'مشكلة شبكة مؤقتة. ستُعاد المحاولة تلقائياً.',
  },
  [CATEGORIES.TIMEOUT]: {
    retryable: true,
    backoff: true,
    pauseSync: false,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'انتهت مهلة الاتصال. ستُعاد المحاولة.',
  },
  [CATEGORIES.UNAUTHORIZED]: {
    retryable: false,
    backoff: false,
    pauseSync: true,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'يلزم إعادة ربط حساب Google. البيانات المحلية محفوظة.',
    ownerAction: 'reconnect_oauth',
  },
  [CATEGORIES.FORBIDDEN]: {
    retryable: false,
    backoff: false,
    pauseSync: true,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'لا صلاحية للمزامنة. راجع صلاحيات الجهاز/الفرع.',
    ownerAction: 'review_authorization',
  },
  [CATEGORIES.TOKEN_EXPIRED]: {
    retryable: true,
    backoff: true,
    pauseSync: false,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'انتهت صلاحية الجلسة؛ جاري التجديد.',
  },
  [CATEGORIES.REVOKED]: {
    retryable: false,
    backoff: false,
    pauseSync: true,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'الجهاز ملغى من Owner Hub. العمل المحلي مستمر بدون مزامنة.',
    ownerAction: 'reapprove_device',
  },
  [CATEGORIES.RATE_LIMIT]: {
    retryable: true,
    backoff: true,
    pauseSync: false,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'تم تجاوز حد الطلبات مؤقتاً. انتظار ثم إعادة المحاولة.',
  },
  [CATEGORIES.QUOTA]: {
    retryable: false,
    backoff: true,
    pauseSync: true,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'امتلأ مساحة Drive. أفرغ مساحة أو ارفع الخطة.',
    ownerAction: 'free_quota',
  },
  [CATEGORIES.REMOTE_MISSING]: {
    retryable: true,
    backoff: true,
    pauseSync: false,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'ملف سحابي مفقود. سيتم الإصلاح أو الحجر.',
  },
  [CATEGORIES.REMOTE_CORRUPT]: {
    retryable: false,
    backoff: false,
    pauseSync: true,
    deadLetter: true,
    preserveLocal: true,
    userMessage: 'ملف سحابي تالف؛ تم حجره. البيانات المحلية محفوظة.',
    ownerAction: 'quarantine_recover',
  },
  [CATEGORIES.SCHEMA_INCOMPATIBLE]: {
    retryable: false,
    backoff: false,
    pauseSync: true,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'إصدار المخطط غير متوافق. حدّث التطبيق.',
    ownerAction: 'upgrade_app',
  },
  [CATEGORIES.CHECKSUM_MISMATCH]: {
    retryable: true,
    backoff: true,
    pauseSync: false,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'عدم تطابق التحقق. إعادة تنزيل/رفع.',
  },
  [CATEGORIES.CONFLICT]: {
    retryable: false,
    backoff: false,
    pauseSync: false,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'تعارض يحتاج قراراً من مدير مخوّل.',
    ownerAction: 'resolve_conflict',
  },
  [CATEGORIES.LOCAL_DB]: {
    retryable: false,
    backoff: false,
    pauseSync: true,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'مشكلة قاعدة محلية. لا تُستبدل بقاعدة فارغة.',
    ownerAction: 'diagnostics_db',
  },
  [CATEGORIES.DISK_FULL]: {
    retryable: false,
    backoff: false,
    pauseSync: true,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'القرص ممتلئ. حرّر مساحة ثم أعد المحاولة.',
  },
  [CATEGORIES.PERMISSION]: {
    retryable: false,
    backoff: false,
    pauseSync: true,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'صلاحيات نظام الملفات مرفوضة.',
  },
  [CATEGORIES.ATTACHMENT]: {
    retryable: true,
    backoff: true,
    pauseSync: false,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'فشل مرفق. البيانات الأساسية محفوظة.',
  },
  [CATEGORIES.UNKNOWN]: {
    retryable: true,
    backoff: true,
    pauseSync: false,
    deadLetter: false,
    preserveLocal: true,
    userMessage: 'خطأ مزامنة غير مصنّف. راجع التشخيصات.',
  },
});

function classify(err) {
  const raw = err && typeof err === 'object' ? err : { message: String(err || '') };
  const code = String(raw.code || raw.error || raw.status || '').toLowerCase();
  const msg = String(raw.message || raw.err || raw.error || err || '').toLowerCase();
  // Prefer explicit status; also parse drive_*_failed:429 / http_429 style messages
  let status = Number(raw.status || raw.statusCode || raw.httpStatus || 0);
  if (!status) {
    const m = String(raw.message || raw.error || err || '').match(
      /(?:drive_[a-z_]+_failed|http|status)[:\s]*(\d{3})\b/i
    );
    if (m) status = Number(m[1]);
  }

  let category = CATEGORIES.UNKNOWN;
  if (raw.offline === true || code === 'offline' || /enotfound|offline|network unreachable/.test(msg)) {
    category = CATEGORIES.OFFLINE;
  } else if (status === 401 || code === 'unauthorized' || /invalid_grant|unauthorized/.test(msg)) {
    category = /invalid_grant|revoked/.test(msg) ? CATEGORIES.REVOKED : CATEGORIES.UNAUTHORIZED;
  } else if (status === 403 || code === 'forbidden') {
    category = /quota|storage/.test(msg) ? CATEGORIES.QUOTA : CATEGORIES.FORBIDDEN;
  } else if (status === 404 || code === 'not_found' || /not.?found|remote_missing/.test(msg)) {
    category = CATEGORIES.REMOTE_MISSING;
  } else if (status === 409 || /precondition|conflict_detected/.test(msg) || code === 'conflict') {
    category = CATEGORIES.CONFLICT;
  } else if (status === 429 || /rate.?limit|too many requests/.test(msg)) {
    category = CATEGORIES.RATE_LIMIT;
  } else if (/quota|storageQuotaExceeded|insufficient/.test(msg) || code === 'quota') {
    category = CATEGORIES.QUOTA;
  } else if (/token.?expir|access.?token.?expired/.test(msg) || code === 'token_expired') {
    category = CATEGORIES.TOKEN_EXPIRED;
  } else if (/timeout|etimedout|esockettimedout/.test(msg) || code === 'timeout') {
    category = CATEGORIES.TIMEOUT;
  } else if (/corrupt|json.?parse|unexpected token|truncated/.test(msg) || code === 'corrupt') {
    category = CATEGORIES.REMOTE_CORRUPT;
  } else if (/checksum|hash.?mismatch/.test(msg)) {
    category = CATEGORIES.CHECKSUM_MISMATCH;
  } else if (/schema|format.?version|minimumappversion/.test(msg)) {
    category = CATEGORIES.SCHEMA_INCOMPATIBLE;
  } else if (/sqlite|database.?locked|corrupt.?db/.test(msg)) {
    category = CATEGORIES.LOCAL_DB;
  } else if (/enospc|disk.?full|no space/.test(msg)) {
    category = CATEGORIES.DISK_FULL;
  } else if (/eacces|eperm|permission/.test(msg)) {
    category = CATEGORIES.PERMISSION;
  } else if (/attachment|mime|oversized/.test(msg)) {
    category = CATEGORIES.ATTACHMENT;
  } else if (/econnreset|econnrefused|network|dns/.test(msg) || status >= 500) {
    category = CATEGORIES.NETWORK;
  }

  const policy = POLICY[category] || POLICY[CATEGORIES.UNKNOWN];
  return {
    category,
    retryable: policy.retryable,
    backoff: policy.backoff,
    pauseSync: policy.pauseSync,
    deadLetter: policy.deadLetter,
    preserveLocal: policy.preserveLocal,
    userMessage: policy.userMessage,
    ownerAction: policy.ownerAction || null,
    raw: {
      code: raw.code || null,
      status: status || null,
      message: String(raw.message || raw.error || err || '').slice(0, 500),
    },
  };
}

function backoffMs(attempt, baseMs = 1000, maxMs = 300000) {
  const a = Math.max(1, Number(attempt) || 1);
  const exp = Math.min(maxMs, Math.round(Math.pow(2, Math.min(8, a)) * baseMs));
  const jitter = Math.round(exp * (0.5 + Math.random()));
  return Math.min(maxMs, jitter);
}

module.exports = {
  CATEGORIES,
  POLICY,
  classify,
  backoffMs,
};
