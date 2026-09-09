/**
 * Production migration — extended field catalog & column aliases.
 * Reuses ImportEngineCore helpers when available.
 */
(function (global) {
  'use strict';

  const Core = global.ImportEngineCore || {};

  const BASE_FIELDS = Core.IMPORT_FIELDS || {
    name: { label: 'اسم العميل', required: true, group: 'client' },
    phone: { label: 'رقم الجوال', required: true, group: 'client' },
    cups: { label: 'عدد الكاسات', required: false, group: 'visit' },
    date: { label: 'تاريخ الجلسة', required: false, group: 'visit' },
    doctor: { label: 'الأخصائي', required: false, group: 'visit' },
    patientId: { label: 'رقم الهوية', required: true, group: 'client' },
    nationality: { label: 'الجنسية', required: false, group: 'client' },
    total: { label: 'قيمة الفاتورة', required: false, group: 'visit' },
    cash: { label: 'كاش', required: false, group: 'visit' },
    card: { label: 'شبكة', required: false, group: 'visit' },
    notes: { label: 'ملاحظات', required: false, group: 'client' }
  };

  const EXTENDED = {
    fileNo: { label: 'رقم الملف', required: false, group: 'client' },
    birthDate: { label: 'تاريخ الميلاد', required: false, group: 'client' },
    email: { label: 'البريد الإلكتروني', required: false, group: 'client' },
    address: { label: 'العنوان', required: false, group: 'client' },
    gender: { label: 'الجنس', required: false, group: 'medical' },
    age: { label: 'العمر', required: false, group: 'medical' },
    service: { label: 'نوع الخدمة', required: false, group: 'visit' },
    sessionNo: { label: 'رقم الجلسة', required: false, group: 'visit' },
    branch: { label: 'الفرع', required: false, group: 'meta' },
    source: { label: 'مصدر العميل', required: false, group: 'meta' },
    tags: { label: 'الوسوم', required: false, group: 'meta' },
    status: { label: 'الحالة', required: false, group: 'meta' },
    allergies: { label: 'الحساسية', required: false, group: 'medical' },
    symptoms: { label: 'الأعراض', required: false, group: 'medical' },
    emergencyContact: { label: 'جهة الطوارئ', required: false, group: 'medical' }
  };

  const MIGRATION_FIELDS = Object.assign({}, BASE_FIELDS, EXTENDED);

  const EXTRA_ALIASES = {
    fileNo: ['ملف', 'رقم الملف', 'file no', 'file', 'cl-', 'patient file'],
    birthDate: ['ميلاد', 'تاريخ الميلاد', 'birth', 'dob', 'date of birth'],
    email: ['email', 'e-mail', 'بريد', 'البريد', 'الإيميل'],
    address: ['عنوان', 'العنوان', 'address', 'location'],
    gender: ['جنس', 'الجنس', 'gender', 'sex'],
    age: ['عمر', 'العمر', 'age'],
    service: ['خدمة', 'الخدمة', 'service', 'نوع الخدمة', 'service type'],
    sessionNo: ['جلسة', 'رقم الجلسة', 'session', 'session no'],
    branch: ['فرع', 'الفرع', 'branch'],
    source: ['مصدر', 'source', 'referral'],
    tags: ['وسوم', 'tags', 'tag', 'تصنيف'],
    status: ['حالة', 'status', 'state'],
    allergies: ['حساسية', 'allergies', 'allergy'],
    symptoms: ['أعراض', 'symptoms'],
    emergencyContact: ['طوارئ', 'جهة الطوارئ', 'emergency']
  };

  const MIGRATION_ALIASES = Object.assign({}, Core.IMPORT_COLUMN_ALIASES || {}, EXTRA_ALIASES);

  const DUPLICATE_STRATEGIES = {
    skip: { label: 'تخطي الموجود', desc: 'تخطّي الصفوف المكررة دون تعديل' },
    update: { label: 'تحديث البيانات', desc: 'تحديث الحقول المربوطة من الملف' },
    fill_empty: { label: 'تحديث الحقول الفارغة فقط', desc: 'يملأ الحقول الفارغة فقط دون مسح الموجود' },
    replace: { label: 'استبدال جميع البيانات', desc: 'استبدال بيانات العميل من الأعمدة المربوطة' },
    merge: { label: 'دمج ذكي', desc: 'دمج البيانات الأحدث دون حذف القديمة' },
    import_all: { label: 'استيراد الكل', desc: 'إنشاء سجلات جديدة حتى للمكرر' }
  };

  const MATCH_LEVEL = { NEW: 'new', CONFIRMED: 'confirmed', POSSIBLE: 'possible' };

  global.MigrationFields = {
    MIGRATION_FIELDS,
    MIGRATION_ALIASES,
    DUPLICATE_STRATEGIES,
    MATCH_LEVEL,
    CLIENT_FIELDS: Object.keys(MIGRATION_FIELDS).filter(k => MIGRATION_FIELDS[k].group === 'client' || MIGRATION_FIELDS[k].group === 'medical' || MIGRATION_FIELDS[k].group === 'meta'),
    VISIT_FIELDS: Object.keys(MIGRATION_FIELDS).filter(k => MIGRATION_FIELDS[k].group === 'visit')
  };
})(typeof window !== 'undefined' ? window : globalThis);
