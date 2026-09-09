/**
 * V2-5.6 — Small AR/EN dictionary for operational UX strings.
 */
(function (global) {
  'use strict';

  let currentLang = 'ar';

  const DICT = Object.freeze({
    'ops.backup': { ar: 'نسخ احتياطي', en: 'Backup' },
    'ops.sync': { ar: 'مزامنة', en: 'Sync' },
    'ops.restore': { ar: 'استعادة', en: 'Restore' },
    'ops.progress': { ar: 'التقدم', en: 'Progress' },
    'ops.pause': { ar: 'إيقاف مؤقت', en: 'Pause' },
    'ops.resume': { ar: 'استئناف', en: 'Resume' },
    'ops.cancel': { ar: 'إلغاء', en: 'Cancel' },
    'ops.retry': { ar: 'إعادة المحاولة', en: 'Retry' },
    'ops.complete': { ar: 'اكتمل', en: 'Complete' },
    'ops.failed': { ar: 'فشل', en: 'Failed' },
    'ops.cancelled': { ar: 'أُلغي', en: 'Cancelled' },
    'ops.offline': { ar: 'غير متصل', en: 'Offline' },
    'ops.online': { ar: 'متصل', en: 'Online' },
    'ops.reconnect': { ar: 'إعادة الاتصال', en: 'Reconnect' },
    'ops.pending': { ar: 'معلّق', en: 'Pending' },
    'ops.conflicts': { ar: 'تعارضات', en: 'Conflicts' },
    'ops.dead_letter': { ar: 'رسائل معلّقة', en: 'Dead letter' },
    'ops.last_sync': { ar: 'آخر مزامنة ناجحة', en: 'Last successful sync' },
    'ops.confirm_wipe': { ar: 'اكتب «مسح الكل» للتأكيد', en: 'Type “مسح الكل” to confirm' },
    'ops.confirm_restore': { ar: 'اكتب «استعادة» للتأكيد', en: 'Type “استعادة” to confirm' },
    'ops.pre_summary': { ar: 'ملخص قبل الاستعادة', en: 'Pre-restore summary' },
    'ops.post_summary': { ar: 'ملخص بعد الاستعادة', en: 'Post-restore summary' },
    'ops.export_logs': { ar: 'تصدير السجلات (منقّح)', en: 'Export logs (redacted)' },
    'ops.status_ready': { ar: 'جاهز', en: 'Ready' }
  });

  function normalizeLang(lang) {
    const s = String(lang == null ? currentLang : lang).toLowerCase();
    if (s.startsWith('en')) return 'en';
    return 'ar';
  }

  function t(key, lang) {
    const k = String(key || '');
    const L = normalizeLang(lang);
    const row = DICT[k];
    if (!row) return k;
    return row[L] || row.ar || k;
  }

  function setLang(lang) {
    currentLang = normalizeLang(lang);
    return currentLang;
  }

  function getLang() {
    return currentLang;
  }

  function getDir(lang) {
    return normalizeLang(lang) === 'en' ? 'ltr' : 'rtl';
  }

  function applyDocumentLang(doc, lang) {
    const L = normalizeLang(lang);
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || !d.documentElement) {
      return { lang: L, dir: getDir(L), applied: false };
    }
    d.documentElement.setAttribute('lang', L);
    d.documentElement.setAttribute('dir', getDir(L));
    currentLang = L;
    return { lang: L, dir: getDir(L), applied: true };
  }

  const api = {
    DICT,
    t,
    setLang,
    getLang,
    getDir,
    applyDocumentLang,
    normalizeLang
  };

  global.UxI18n = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
