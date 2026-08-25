/**
 * Explicit semantic names for legacy controls whose visible caption is not a native
 * <label>. It never overrides a real label, aria-label, or aria-labelledby value.
 */
(function (global) {
  'use strict';

  const LABELS = Object.freeze({
    'comm-int-payment-provider': 'مزود تكامل المدفوعات',
    'comm-int-email-provider': 'مزود تكامل البريد الإلكتروني',
    'comm-int-calendar-provider': 'مزود تكامل التقويم',
    'comm-int-invoices-provider': 'مزود تكامل الفواتير',
    'lic-feat-search': 'بحث في خصائص الترخيص',
    'topbarSearch': 'البحث الشامل',
    'lux-queue-name-women': 'اسم المراجع في قائمة السيدات',
    'lux-queue-name-men': 'اسم المراجع في قائمة الرجال',
    'f-file-no': 'رقم ملف العميل',
    'inv-filter-q': 'بحث الفواتير',
    'inv-filter-field': 'حقل البحث في الفواتير',
    'inv-filter-from': 'تاريخ بداية بحث الفواتير',
    'inv-filter-to': 'تاريخ نهاية بحث الفواتير',
    'inv-filter-payment': 'طريقة دفع الفواتير',
    'inv-filter-type': 'نوع الفاتورة',
    'rep-filter-mode': 'نطاق التقرير',
    'rep-month-sel': 'شهر التقرير',
    'rep-year-sel': 'سنة التقرير',
    'rep-year-only': 'سنة التقرير السنوي',
    'rep-day-sel': 'يوم التقرير',
    'rep-range-from': 'تاريخ بداية نطاق التقرير',
    'rep-range-to': 'تاريخ نهاية نطاق التقرير',
    'vat-rep-month': 'شهر تقرير ضريبة القيمة المضافة',
    'vat-rep-year': 'سنة تقرير ضريبة القيمة المضافة',
    'vat-rep-scope': 'نطاق تقرير ضريبة القيمة المضافة',
    'doc-rep-month': 'شهر تقرير الأطباء',
    'doc-rep-year': 'سنة تقرير الأطباء',
    'doc-rep-mode': 'نوع تقرير الأطباء',
    'payrollMonth': 'شهر مسير الرواتب',
    'payrollYear': 'سنة مسير الرواتب',
    'ot-doctor': 'الطبيب لساعات العمل الإضافي',
    'ot-date': 'تاريخ العمل الإضافي',
    'ot-hours': 'عدد ساعات العمل الإضافي',
    'ledger-report-sel': 'نوع تقرير سجل الموظفين',
    'ledger-month': 'شهر سجل الموظفين',
    'ledger-year': 'سنة سجل الموظفين',
    'ledger-doctor': 'الموظف في سجل الموظفين',
    'ledger-type': 'نوع حركة سجل الموظفين',
    'ledger-status': 'حالة حركة سجل الموظفين',
    'ledger-pay-method': 'طريقة دفع سجل الموظفين',
    'ledger-from': 'تاريخ بداية سجل الموظفين',
    'ledger-to': 'تاريخ نهاية سجل الموظفين',
    'ledger-voucher': 'رقم سند سجل الموظفين',
    'ledger-user': 'المستخدم في سجل الموظفين',
    'ledger-search': 'بحث في سجل الموظفين',
    'set-pos-bank': 'حساب البنك لنقطة البيع',
    'set-printer-thermal': 'طابعة الإيصالات الحرارية',
    'set-printer-a4': 'طابعة A4',
    'cdb-auto-interval': 'فاصل النسخ الاحتياطي V1 المعطل',
    'bk-v2-upload-drive': 'رفع النسخة الاحتياطية الجديدة إلى Google Drive',
    'bk-v2-pass': 'كلمة مرور تشفير النسخة الاحتياطية',
    'bk-local-path-custom': 'مسار النسخ الاحتياطي المحلي المخصص',
    'bk-cloud-enabled': 'تفعيل النسخ الاحتياطي السحابي',
    'alt-firebase-project': 'معرّف مشروع Firebase البديل',
    'alt-firebase-key': 'مفتاح Firebase البديل',
    'alt-firebase-url': 'رابط Firebase البديل',
    'alt-server-url': 'رابط الخادم البديل',
    'alt-server-key': 'مفتاح الخادم البديل',
    'alt-usb-path': 'مسار USB البديل',
    'alt-manual-path': 'مسار النسخ اليدوي البديل',
    'ds-enabled': 'تفعيل مزامنة البيانات',
    'ds-upload-interval': 'فاصل رفع مزامنة البيانات',
    'ds-download-interval': 'فاصل تنزيل مزامنة البيانات',
    'ds-auto-restore': 'تفعيل الاستعادة التلقائية للبيانات',
    'ds-encrypt': 'تفعيل تشفير مزامنة البيانات',
    'set-queue-url-women': 'رابط شاشة قائمة انتظار السيدات',
    'set-queue-url-men': 'رابط شاشة قائمة انتظار الرجال',
    'bk-filter': 'فلتر الحجوزات',
    'bk-custom-date': 'تاريخ الحجوزات المخصص',
    'msg-channel': 'قناة الرسائل',
    'msg-overdue-days': 'عدد أيام التأخر للرسائل',
    'msg-overdue-cooldown': 'فاصل منع تكرار رسائل المتأخرات',
    'bulk-msg-type': 'نوع الرسالة الجماعية',
    'bulk-manual-name': 'اسم مستلم الرسالة اليدوي',
    'bulk-manual-phone': 'رقم هاتف مستلم الرسالة اليدوي',
    'bulk-check-all': 'تحديد كل مستلمي الرسالة الجماعية',
    'client-search': 'بحث العملاء',
    'client-search-field': 'حقل بحث العملاء',
    'client-date-mode': 'نطاق تاريخ بحث العملاء',
    'client-date-from': 'تاريخ بداية بحث العملاء',
    'client-date-to': 'تاريخ نهاية بحث العملاء',
    'client-month': 'شهر بحث العملاء',
    'invoice-search-query': 'بحث فواتير العميل',
    'invoice-search-type': 'نوع بحث فواتير العميل',
    'att-date-from-display': 'تاريخ بداية عرض الحضور',
    'lr-filter-doctor': 'الطبيب في تقرير الحضور',
    'lr-filter-status': 'حالة تقرير الحضور',
    'att-filter-doctor': 'الطبيب في فلتر الحضور',
    'att-filter-month': 'شهر فلتر الحضور',
    'att-filter-year': 'سنة فلتر الحضور',
    'att-rep-month': 'شهر تقرير الحضور',
    'att-rep-year': 'سنة تقرير الحضور',
    'att-rep-doctor': 'الطبيب في تقرير الحضور',
    'exp-filter-month': 'شهر فلتر المصروفات',
    'exp-filter-year': 'سنة فلتر المصروفات',
    'inv-sup-name': 'اسم مورد المخزون',
    'inv-sup-phone': 'هاتف مورد المخزون',
    'inv-sup-email': 'بريد مورد المخزون',
    'cash-set-opening': 'العهدة الافتتاحية للصندوق',
    'cash-keep-float': 'المبلغ المراد إبقاؤه في درج النقدية',
    'logs-search': 'بحث سجل العمليات',
    'logs-filter-cat': 'فئة سجل العمليات',
    'logs-op-type': 'نوع العملية في السجل',
    'logs-sort-order': 'ترتيب سجل العمليات'
  });

  function hasSemanticName(control) {
    if (!control) return true;
    if (control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')) return true;
    return Array.from(control.labels || []).some((label) => String(label.textContent || '').trim());
  }

  function apply(root) {
    const scope = root || global.document;
    if (!scope?.getElementById) return 0;
    let applied = 0;
    Object.entries(LABELS).forEach(([id, label]) => {
      const control = scope.getElementById(id);
      if (!control || hasSemanticName(control)) return;
      control.setAttribute('aria-label', label);
      control.dataset.a11yExplicitLabel = 'true';
      applied += 1;
    });
    return applied;
  }

  const api = { LABELS, apply, hasSemanticName };
  global.InputAccessibilityLabels = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global.document?.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', () => apply(), { once: true });
  else apply();
})(typeof window !== 'undefined' ? window : globalThis);
