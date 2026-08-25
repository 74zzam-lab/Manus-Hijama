/**
 * V2-5.8 — User-facing activation errors + safe diagnostic codes (no secrets).
 */
(function (global) {
  'use strict';

  const USER_MESSAGES = Object.freeze({
    oauth_cancelled: { title: 'تم إلغاء تسجيل الدخول', detail: 'أُلغي ربط Google. يمكنك المحاولة مرة أخرى.' },
    oauth_access_denied: { title: 'تم رفض الصلاحيات', detail: 'الحساب لا يمتلك الصلاحيات المطلوبة لـ Drive.' },
    oauth_timeout: { title: 'انتهت المهلة', detail: 'انتهت مهلة انتظار Google. تحقق من الاتصال وحاول مرة أخرى.' },
    oauth_offline: { title: 'لا يوجد اتصال بالإنترنت', detail: 'تعذّر الوصول إلى Google — تحقق من الشبكة.' },
    oauth_port_in_use: { title: 'تعذّر فتح نافذة الربط', detail: 'منفذ إعادة التوجيه مشغول. أعد المحاولة.' },
    oauth_invalid_grant: { title: 'انتهت صلاحية الجلسة', detail: 'أعد ربط حساب Google.' },
    oauth_redirect_mismatch: { title: 'Redirect URI غير صحيح', detail: 'إعدادات OAuth غير متطابقة مع التطبيق.' },
    oauth_api_disabled: { title: 'Google API غير مفعّل', detail: 'فعّل Drive API في مشروع Google Cloud.' },
    oauth_failed: { title: 'فشل ربط Google', detail: 'تعذّر إكمال المصادقة. راجع التشخيص ثم أعد المحاولة.' },
    drive_unreachable: { title: 'تعذّر الوصول إلى Drive', detail: 'تحقق من الاتصال وصلاحيات الحساب.' },
    sheets_unreachable: { title: 'تعذّر الوصول إلى Sheets', detail: 'بوابة الترخيص غير متاحة حالياً. يمكن المتابعة محلياً إن وُجدت الحزمة.' },
    license_invalid: { title: 'مفتاح ترخيص غير صالح', detail: 'تحقق من المفتاح وأعد المحاولة.' },
    license_expired: { title: 'الترخيص منتهٍ', detail: 'جدّد الترخيص من المطوّر ثم أعد التفعيل.' },
    license_wrong_account: { title: 'المفتاح غير مرتبط بهذا الحساب', detail: 'استخدم حساب Google المرتبط بالمركز.' },
    license_other_org: { title: 'المفتاح مرتبط بمؤسسة أخرى', detail: 'لا يمكن خلط بيانات أكثر من مركز.' },
    license_device_limit: { title: 'تم تجاوز عدد الأجهزة', detail: 'احذف جهازاً قديماً أو رقِّ الباقة.' },
    license_branch_limit: { title: 'تم تجاوز عدد الفروع', detail: 'لا يمكن إنشاء فرع إضافي ضمن الباقة الحالية.' },
    license_offline: { title: 'غير متصل', detail: 'التفعيل عبر السحابة يتطلب إنترنت — أو استخدم حزمة تفعيل محلية.' },
    license_timeout: { title: 'انتهت مهلة سحب الترخيص', detail: 'أعد المحاولة عند استقرار الشبكة.' },
    license_server_error: { title: 'خطأ في خادم الترخيص', detail: 'حاول لاحقاً أو تواصل مع المطوّر.' },
    org_fetch_failed: { title: 'فشل سحب المؤسسات', detail: 'تعذّر جلب بيانات المؤسسة المصرّح بها.' },
    branch_fetch_failed: { title: 'فشل سحب الفروع', detail: 'تعذّر جلب قائمة الفروع.' },
    branch_name_required: { title: 'اسم الفرع مطلوب', detail: 'أدخل اسماً بالعربية للفرع.' },
    branch_code_duplicate: { title: 'رمز الفرع مكرر', detail: 'اختر رمزاً غير مستخدم.' },
    branch_duplicate_create: { title: 'منع إنشاء مكرر', detail: 'جارٍ إنشاء الفرع بالفعل — انتظر اكتمال العملية.' },
    owner_password_required: { title: 'كلمة مرور المالك مطلوبة', detail: 'لا يمكن إنشاء Owner بدون كلمة مرور.' },
    owner_password_mismatch: { title: 'كلمتا المرور غير متطابقتين', detail: 'أعد إدخال التأكيد.' },
    owner_password_weak: { title: 'كلمة المرور قصيرة', detail: 'استخدم 8 أحرف على الأقل.' },
    owner_duplicate: { title: 'حساب المالك موجود', detail: 'لا تنشئ Owner مرتين — سجّل الدخول أو استعد.' },
    restore_interrupted: { title: 'توقفت الاستعادة', detail: 'بياناتك المحلية آمنة. يمكنك إعادة المحاولة.' },
    sync_interrupted: { title: 'توقفت المزامنة', detail: 'يمكنك إعادة المحاولة دون فقدان التقدم المحفوظ.' },
    step_required: { title: 'خطوة مطلوبة', detail: 'أكمل هذه الخطوة قبل المتابعة.' },
    backup_v1_disabled: { title: 'Backup V1 معطّل', detail: 'استخدم Backup V2 لاستعادة الكوارث وCloud V2 للمزامنة.' },
    conflict_resolve_failed: { title: 'تعذّر حل التعارض', detail: 'أعد المحاولة أو راجع التعارضات من Owner Hub.' },
    bootflow_required: { title: 'أكمل الإعداد الموحّد', detail: 'استخدم معالج الإعداد (BootFlow) قبل الدخول.' },
    unknown: { title: 'حدث خطأ', detail: 'تعذّر إكمال العملية. انسخ رمز التشخيص إن استمر الخطأ.' }
  });

  function classifyTechnical(err) {
    const msg = String(err && (err.message || err.error || err.code || err) || '').toLowerCase();
    if (/access_denied|cancelled|canceled|user.?denied/.test(msg)) return 'oauth_access_denied';
    if (/timeout|oauth_timeout/.test(msg)) return 'oauth_timeout';
    if (/eaddrinuse|port.?in.?use/.test(msg)) return 'oauth_port_in_use';
    if (/invalid_grant|token.?expired|needs.?reauth/.test(msg)) return 'oauth_invalid_grant';
    if (/redirect.?uri|redirect_uri_mismatch/.test(msg)) return 'oauth_redirect_mismatch';
    if (/api.?not.?enabled|accessNotConfigured/.test(msg)) return 'oauth_api_disabled';
    if (/offline|failed to fetch|network|enotfound|enetunreach/.test(msg)) return 'oauth_offline';
    if (/drive/.test(msg) && /403|401|permission/.test(msg)) return 'drive_unreachable';
    if (/sheet|vault/.test(msg) && /fail|unreachable|timeout/.test(msg)) return 'sheets_unreachable';
    if (/license.?expired|expired/.test(msg)) return 'license_expired';
    if (/invalid.?key|license.?invalid|bundle_missing/.test(msg)) return 'license_invalid';
    if (/device.?limit|maxDevices/.test(msg)) return 'license_device_limit';
    if (/branch.?limit|maxBranches/.test(msg)) return 'license_branch_limit';
    if (/password.?required|empty.?password/.test(msg)) return 'owner_password_required';
    if (/password.?mismatch|confirm/.test(msg)) return 'owner_password_mismatch';
    if (/password.?weak|too.?short|min.?length/.test(msg)) return 'owner_password_weak';
    if (/profile_exists|owner_already/.test(msg)) return 'owner_duplicate';
    if (/branch_name/.test(msg)) return 'branch_name_required';
    if (/branch_id_exists|code.?duplicate/.test(msg)) return 'branch_code_duplicate';
    if (/in.?flight|already.?creating|duplicate.?create/.test(msg)) return 'branch_duplicate_create';
    if (/backup_v1_disabled|BACKUP_V1_DISABLED/.test(msg)) return 'backup_v1_disabled';
    if (/conflict.?resolve|not_found|already_resolved/.test(msg)) return 'conflict_resolve_failed';
    if (/boot.?flow|needs.?boot|activation.?required/.test(msg)) return 'bootflow_required';
    return 'unknown';
  }

  function diagnosticCode(code) {
    const stamp = Date.now().toString(36).toUpperCase();
    const safe = String(code || 'unknown').replace(/[^a-z0-9_]/gi, '').slice(0, 40);
    return `TDW-ACT-${safe}-${stamp}`;
  }

  function redact(value) {
    const s = String(value == null ? '' : value);
    return s
      .replace(/ya29\.[A-Za-z0-9_\-.]+/g, '[REDACTED_TOKEN]')
      .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer [REDACTED]')
      .replace(/password["']?\s*[:=]\s*["'][^"']*["']?/gi, 'password:[REDACTED]')
      .replace(/password["']?\s*[:=]\s*\S+/gi, 'password:[REDACTED]')
      .replace(/client_secret["']?\s*[:=]\s*["'][^"']*/gi, 'client_secret:[REDACTED]');
  }

  function toUserError(err, fallbackCode) {
    const code = fallbackCode || classifyTechnical(err);
    const mapped = USER_MESSAGES[code] || USER_MESSAGES.unknown;
    const diag = diagnosticCode(code);
    const technical = redact(err && (err.message || err.error || err) || code);
    try {
      global.AuditLogger?.log?.({
        action: 'ACTIVATION_ERROR',
        entity: 'activation',
        entityId: diag,
        detail: { code, technical: String(technical).slice(0, 240) }
      });
    } catch { /* empty */ }
    return {
      ok: false,
      code,
      title: mapped.title,
      detail: mapped.detail,
      diagnosticCode: diag,
      technical: String(technical).slice(0, 240),
      safe: true,
      retryable: !/license_invalid|license_other_org|owner_duplicate|branch_code_duplicate/.test(code)
    };
  }

  function formatForUi(userErr) {
    if (!userErr) return '';
    return `${userErr.title} — ${userErr.detail} [${userErr.diagnosticCode || ''}]`;
  }

  const api = {
    USER_MESSAGES,
    classifyTechnical,
    diagnosticCode,
    redact,
    toUserError,
    formatForUi
  };
  global.ActivationErrors = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
