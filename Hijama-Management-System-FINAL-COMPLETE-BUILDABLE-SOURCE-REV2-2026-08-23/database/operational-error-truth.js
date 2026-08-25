'use strict';

/**
 * Operational error truth — canonical codes → actionable user messages (Node + tests).
 */
const REDACTED = '[REDACTED]';

  const CODE_ALIASES = Object.freeze({
  owner_count_invariant_violation: 'owner_corrupted',
  DUPLICATE_PRIMARY_OWNER: 'owner_corrupted',
  branch_id_required: 'branch_context_missing',
  branch_scope_denied: 'branch_access_denied',
  backup_legacy_encrypted_direct_restore_blocked: 'restore_encrypted_import_only',
  unknown: 'sync_cycle_failed',
  Unknown: 'sync_cycle_failed',
  UNKNOWN: 'sync_cycle_failed',
  cycle_failed: 'sync_cycle_failed',
  sync_not_enabled: 'cloud_v2_disabled',
});

const CATALOG = Object.freeze({
  generic: {
    category: 'generic',
    severity: 'error',
    userMessageAr: 'تعذّر إكمال العملية. البيانات المحلية محفوظة.',
    userMessageEn: 'Operation could not complete. Local data is preserved.',
  },
  offline: {
    category: 'network',
    severity: 'warning',
    userMessageAr: 'لا يوجد اتصال بالإنترنت — ستُستأنف المزامنة عند عودة الاتصال.',
    userMessageEn: 'You are offline — sync resumes when connectivity returns.',
  },
  drive_quota: {
    category: 'drive',
    severity: 'error',
    userMessageAr: 'مساحة Google Drive ممتلئة — تم إيقاف المزامنة مؤقتاً.',
    userMessageEn: 'Google Drive quota exceeded — sync paused.',
  },
  oauth_error: {
    category: 'drive',
    severity: 'error',
    userMessageAr: 'انتهت صلاحية ربط Google — أعد الربط من الإعدادات.',
    userMessageEn: 'Google sign-in expired — re-link from Settings.',
  },
  google_identity_transfer: {
    category: 'drive',
    severity: 'error',
    userMessageAr: 'حساب Google مختلف عن حساب المركز المصرّح.',
    userMessageEn: 'Google account does not match the licensed center account.',
  },
  empty_push_blocked: {
    category: 'sync_guard',
    severity: 'warning',
    userMessageAr: 'رفض رفع نسخة فارغة — اسحب من السحابة أولاً.',
    userMessageEn: 'Empty push blocked — pull cloud data first.',
  },
  local_rev_zero_pull_required: {
    category: 'sync_guard',
    severity: 'warning',
    userMessageAr: 'الجهاز جديد محلياً — اسحب البيانات قبل الرفع.',
    userMessageEn: 'Local revision is zero — pull before push.',
  },
  stale_remote_skipped: {
    category: 'sync_guard',
    severity: 'info',
    userMessageAr: 'نسخة سحابية أقدم من المحلي — تم تخطيها.',
    userMessageEn: 'Stale remote snapshot skipped.',
  },
  stale_overwrite_blocked: {
    category: 'sync_guard',
    severity: 'warning',
    userMessageAr: 'رفض استبدال محلي أحدث — أفرغ قائمة الانتظار أو ادمج التعارضات.',
    userMessageEn: 'Stale overwrite blocked — clear outbox or resolve conflicts.',
  },
  sync_blocked_conflict: {
    category: 'sync',
    severity: 'warning',
    userMessageAr: 'تعارض بيانات — راجع قائمة التعارضات قبل المزامنة.',
    userMessageEn: 'Data conflict — resolve conflicts before sync.',
  },
  sync_guard_blocked: {
    category: 'sync',
    severity: 'warning',
    userMessageAr: 'حارس المزامنة موقوف — اضغط استئناف المزامنة.',
    userMessageEn: 'Sync guard paused — resume sync.',
  },
  manager_only: {
    category: 'rbac',
    severity: 'denied',
    userMessageAr: 'هذه العملية للمدير فقط.',
    userMessageEn: 'Manager permission required.',
  },
  owner_required: {
    category: 'rbac',
    severity: 'denied',
    userMessageAr: 'صلاحية المالك مطلوبة لهذه العملية.',
    userMessageEn: 'Organization owner permission required.',
  },
  tampered_role: {
    category: 'rbac',
    severity: 'denied',
    userMessageAr: 'تم رفض محاولة تلاعب بالصلاحية — أُعيدت الصلاحية من السجل.',
    userMessageEn: 'Tampered role rejected — permissions restored from record.',
  },
  rbac_rank_denied: {
    category: 'rbac',
    severity: 'denied',
    userMessageAr: 'صلاحية الحساب لا تسمح بهذه العملية.',
    userMessageEn: 'Account rank insufficient for this operation.',
  },
  permission_denied: {
    category: 'rbac',
    severity: 'denied',
    userMessageAr: 'ليس لديك صلاحية لإكمال هذه العملية.',
    userMessageEn: 'Permission denied.',
  },
  rbac_session_required: {
    category: 'rbac',
    severity: 'warning',
    requiresAction: true,
    userMessageAr: 'جلسة الصلاحيات غير مربوطة — أعد تسجيل الدخول ثم حاول مجدداً.',
    userMessageEn: 'RBAC session not bound — sign in again and retry.',
  },
  rbac_role_denied: {
    category: 'rbac',
    severity: 'denied',
    userMessageAr: 'دور الحساب لا يسمح بهذه العملية.',
    userMessageEn: 'Account role cannot perform this operation.',
  },
  rbac_permission_denied: {
    category: 'rbac',
    severity: 'denied',
    userMessageAr: 'صلاحية الحساب لا تسمح بهذه العملية.',
    userMessageEn: 'Account permission denied for this operation.',
  },
  kv_persist_failed: {
    category: 'sqlite',
    severity: 'error',
    userMessageAr: 'فشل حفظ الإعدادات — أُعيدت آخر حالة معتمدة.',
    userMessageEn: 'Settings save failed — last committed state restored.',
  },
  sync_not_ready: {
    category: 'sync',
    severity: 'warning',
    userMessageAr: 'محرك المزامنة غير جاهز — راجع المتطلبات في الإعدادات.',
    userMessageEn: 'Sync engine not ready — check prerequisites in Settings.',
  },
  database_api_unavailable: {
    category: 'sqlite',
    severity: 'error',
    userMessageAr: 'خدمة قاعدة البيانات غير متاحة في هذه الجلسة.',
    userMessageEn: 'Database service unavailable in this session.',
  },
  branch_access_denied: {
    category: 'rbac',
    severity: 'denied',
    requiresAction: true,
    userMessageAr: 'لا يمكنك الوصول إلى هذا الفرع.',
    userMessageEn: 'Branch access denied.',
  },
  branch_context_missing: {
    category: 'rbac',
    severity: 'warning',
    requiresAction: true,
    userMessageAr: 'سياق الفرع غير محدد — اختر فرعاً نشطاً ثم أعد المحاولة.',
    userMessageEn: 'Branch context missing — select an active branch and retry.',
  },
  sqlite_busy: {
    category: 'sqlite',
    severity: 'warning',
    retryable: true,
    userMessageAr: 'قاعدة البيانات مشغولة — سيتم إعادة المحاولة تلقائياً.',
    userMessageEn: 'Database is busy — retrying automatically.',
  },
  sync_baseline_required: {
    category: 'sync',
    severity: 'warning',
    requiresAction: true,
    userMessageAr: 'يلزم سحب baseline من السحابة قبل الرفع.',
    userMessageEn: 'Pull cloud baseline before push.',
  },
  remote_revision_mismatch: {
    category: 'sync',
    severity: 'warning',
    requiresAction: true,
    userMessageAr: 'إصدار السحابة لا يطابق المحلي — اسحب أو حل التعارضات.',
    userMessageEn: 'Remote revision mismatch — pull or resolve conflicts.',
  },
  owner_corrupted: {
    category: 'rbac',
    severity: 'error',
    requiresAction: true,
    userMessageAr: 'حالة المالك تالفة — راجع المدير أو استعد من نسخة احتياطية.',
    userMessageEn: 'Owner state corrupted — contact admin or restore from backup.',
  },
  migration_pending: {
    category: 'migration',
    severity: 'warning',
    requiresAction: true,
    userMessageAr: 'ترحيل بيانات معلّق — أكمل الترقية قبل التشغيل.',
    userMessageEn: 'Data migration pending — complete upgrade before operations.',
  },
  migration_in_progress: {
    category: 'migration',
    severity: 'warning',
    retryable: true,
    userMessageAr: 'ترحيل البيانات قيد التنفيذ — انتظر اكتماله.',
    userMessageEn: 'Data migration in progress — wait for completion.',
  },
  restore_failed: {
    category: 'restore',
    severity: 'error',
    userMessageAr: 'فشلت الاستعادة — لم تُستبدل البيانات المحلية.',
    userMessageEn: 'Restore failed — local data was not replaced.',
  },
  restore_backup_invalid: {
    category: 'restore',
    severity: 'error',
    requiresAction: true,
    userMessageAr: 'ملف النسخة الاحتياطية غير صالح أو تالف.',
    userMessageEn: 'Backup file is invalid or corrupt.',
  },
  restore_encrypted_import_only: {
    category: 'restore',
    severity: 'warning',
    requiresAction: true,
    userMessageAr: 'النسخة المشفّرة legacy — استخدم الاستيراد فقط وليس الاستعادة المباشرة.',
    userMessageEn: 'Legacy encrypted backup — use import only, not direct restore.',
  },
  restore_scope_mismatch: {
    category: 'restore',
    severity: 'error',
    requiresAction: true,
    userMessageAr: 'نطاق النسخة الاحتياطية لا يطابق المركز/الفرع الحالي.',
    userMessageEn: 'Backup scope does not match current center/branch.',
  },
  programmer_error: {
    category: 'system',
    severity: 'error',
    userMessageAr: 'خطأ داخلي غير متوقع — أبلغ الدعم مع وقت الحدوث.',
    userMessageEn: 'Unexpected internal error — contact support with timestamp.',
  },
  sqlite_primary_required: {
    category: 'sqlite',
    severity: 'error',
    userMessageAr: 'فشل الحفظ — SQLite غير جاهز كمصدر معتمد.',
    userMessageEn: 'Save failed — SQLite primary not ready.',
  },
  commit_failed: {
    category: 'sqlite',
    severity: 'error',
    userMessageAr: 'فشل الحفظ في SQLite — أُعيدت آخر حالة معتمدة.',
    userMessageEn: 'SQLite commit failed — last committed state restored.',
  },
  legacy_branch_migration_required: {
    category: 'migration',
    severity: 'warning',
    userMessageAr: 'يلزم إكمال ترحيل الفروع قبل المزامنة.',
    userMessageEn: 'Complete branch migration before sync.',
  },
  migration_backup_required: {
    category: 'migration',
    severity: 'error',
    userMessageAr: 'يلزم إنشاء نسخة احتياطية قبل ترحيل البيانات.',
    userMessageEn: 'A pre-migration backup is required.',
  },
  pre_migration_backup_required: {
    category: 'migration',
    severity: 'error',
    userMessageAr: 'فشل الترحيل — أنشئ نسخة احتياطية إلزامية قبل المتابعة.',
    userMessageEn: 'Migration blocked — create mandatory backup first.',
  },
  migration_failed: {
    category: 'migration',
    severity: 'error',
    userMessageAr: 'فشل ترحيل البيانات — تمت استعادة النسخة الاحتياطية إن وُجدت.',
    userMessageEn: 'Data migration failed — pre-migration backup restored if available.',
  },
  integrity_failed: {
    category: 'migration',
    severity: 'error',
    userMessageAr: 'فشل فحص سلامة قاعدة البيانات بعد الترحيل — تمت الاستعادة.',
    userMessageEn: 'Database integrity check failed after migration — restored.',
  },
  comparison_mismatch: {
    category: 'migration',
    severity: 'error',
    userMessageAr: 'عدم تطابق البيانات بعد الترحيل — تمت استعادة النسخة الاحتياطية.',
    userMessageEn: 'Row counts mismatch after migration — backup restored.',
  },
  database_unhealthy: {
    category: 'sqlite',
    severity: 'error',
    userMessageAr: 'قاعدة البيانات غير صالحة — أوقف التشغيل واستعد من نسخة احتياطية.',
    userMessageEn: 'Database unhealthy — stop operations and restore from backup.',
  },
  integrity_check_failed: {
    category: 'sqlite',
    severity: 'error',
    userMessageAr: 'فشل فحص سلامة قاعدة البيانات.',
    userMessageEn: 'Database integrity check failed.',
  },
  foreign_key_violation: {
    category: 'sqlite',
    severity: 'error',
    userMessageAr: 'انتهاك قيود الارتباط في قاعدة البيانات.',
    userMessageEn: 'Foreign key constraint violation.',
  },
  schema_version_mismatch: {
    category: 'sqlite',
    severity: 'error',
    userMessageAr: 'إصدار مخطط قاعدة البيانات غير متوقع.',
    userMessageEn: 'Unexpected database schema version.',
  },
  operational_not_ready: {
    category: 'sqlite',
    severity: 'error',
    userMessageAr: 'التشغيل غير جاهز — راجع صحة قاعدة البيانات وترحيل الفروع.',
    userMessageEn: 'Operations not ready — check database health and branch migration.',
  },
  cloud_v2_disabled: {
    category: 'config',
    severity: 'info',
    userMessageAr: 'تفعيل Cloud V2 مطلوب للمزامنة.',
    userMessageEn: 'Enable Cloud V2 for sync.',
  },
  google_not_connected: {
    category: 'config',
    severity: 'warning',
    userMessageAr: 'ربط حساب Google مطلوب.',
    userMessageEn: 'Connect Google account.',
  },
  sync_cycle_failed: {
    category: 'sync',
    severity: 'error',
    userMessageAr: 'فشلت المزامنة — تحقق من ربط Google والاتصال ثم أعد المحاولة.',
    userMessageEn: 'Sync failed — check Google link and connectivity, then retry.',
  },
  restore_rehydrate_timeout: {
    category: 'restore',
    severity: 'warning',
    retryable: true,
    userMessageAr: 'اكتملت استعادة قاعدة البيانات — جارٍ تحديث الذاكرة المحلية (قد يستغرق وقتاً).',
    userMessageEn: 'Database restore completed — refreshing local memory (may take a moment).',
  },
  restore_rehydrate_failed: {
    category: 'restore',
    severity: 'warning',
    retryable: true,
    userMessageAr: 'اكتملت استعادة SQLite — فشل تحديث الذاكرة؛ أعد تحميل التطبيق أو تابع المزامنة.',
    userMessageEn: 'SQLite restore completed — memory refresh failed; reload the app or continue sync.',
  },
  restore_committed_post_processing_failed: {
    category: 'restore',
    severity: 'warning',
    userMessageAr: 'تمت استعادة قاعدة البيانات — فشلت خطوة ما بعد الاستعادة؛ البيانات في SQLite محفوظة.',
    userMessageEn: 'Database restored — post-restore step failed; SQLite data is preserved.',
  },
  device_sync_blocked: {
    category: 'device',
    severity: 'error',
    userMessageAr: 'هذا الجهاز محظور من المزامنة — راجع المدير.',
    userMessageEn: 'This device is blocked from sync.',
  },
});

function redactString(s) {
  if (s == null) return '';
  let out = String(s);
  out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]');
  out = out.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
  out = out.replace(/\bya29\.[A-Za-z0-9\-._~+/]+/gi, '[REDACTED_TOKEN]');
  out = out.replace(/(password|api[_-]?key|token|secret)\s*([:=])\s*([^\s,;|&"']+)/gi, '$1$2[REDACTED]');
  return out;
}

function normalizeCode(raw) {
  const code = String(raw || '').trim() || 'generic';
  return CODE_ALIASES[code] || code;
}

function extractCode(input) {
  if (input == null || input === '') return 'generic';
  if (typeof input === 'string') return normalizeCode(input);
  if (input.code) return normalizeCode(input.code);
  if (input.error) return normalizeCode(input.error);
  if (input.reason) return normalizeCode(input.reason);
  return 'generic';
}

function present(input, options) {
  options = options || {};
  const code = extractCode(input);
  const entry = CATALOG[code] || CATALOG.generic;
  const raw = typeof input === 'object'
    ? (input.message || input.error || input.reason || '')
    : String(input || '');
  const technical = redactString(raw);
  const userMessageAr = options.userMessageAr || entry.userMessageAr;
  return {
    ok: false,
    code,
    category: entry.category,
    severity: entry.severity,
    userMessageAr,
    userMessageEn: entry.userMessageEn || CATALOG.generic.userMessageEn,
    technical: technical && technical !== code ? technical : null,
    leakSafe: true,
  };
}

function buildEnvelope(input, options) {
  options = options || {};
  const truth = present(input, options);
  const entry = CATALOG[truth.code] || CATALOG.generic;
  const envelope = {
    ok: false,
    code: truth.code,
    stage: options.stage || input?.stage || 'operational',
    userMessageAr: truth.userMessageAr,
    userMessageEn: truth.userMessageEn,
    category: truth.category,
    severity: truth.severity,
    retryable: options.retryable === true || entry.retryable === true,
    requiresAction: options.requiresAction === true || entry.requiresAction === true,
    leakSafe: true,
  };
  if (truth.technical) envelope.diagnostic = truth.technical;
  return envelope;
}

function enrichResult(result, options) {
  if (!result || result.ok !== false) return result;
  const envelope = buildEnvelope(result, options);
  return {
    ...result,
    ...envelope,
    error: normalizeCode(result.error || envelope.code),
    message: result.message || envelope.userMessageEn,
  };
}

function labelsForCodes(codes) {
  return (codes || []).map((c) => (CATALOG[c] && CATALOG[c].userMessageAr) || String(c));
}

module.exports = {
  CATALOG,
  CODE_ALIASES,
  REDACTED,
  redactString,
  normalizeCode,
  extractCode,
  present,
  buildEnvelope,
  enrichResult,
  labelsForCodes,
};
