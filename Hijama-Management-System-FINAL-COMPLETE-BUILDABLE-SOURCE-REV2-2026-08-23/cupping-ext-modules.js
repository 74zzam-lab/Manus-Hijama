/* ═══════════════════════════════════════════════════════════
   Cupping Center Extended Modules — Inventory, Permissions, Currency,
   Cash Float, System Logs, Messaging API
   ═══════════════════════════════════════════════════════════ */

const PERMISSION_DEFS = {
  'cases.view': 'عرض الفواتير والسجل',
  'cases.edit': 'تعديل وإضافة الفواتير',
  'clients.view': 'عرض العملاء',
  'clients.edit': 'تعديل العملاء والحجوزات',
  'bookings.view': 'عرض الحجوزات',
  'bookings.edit': 'تعديل الحجوزات',
  'reports.view': 'عرض التقارير',
  'reports.print': 'طباعة التقارير والفواتير',
  'expenses.view': 'عرض المصاريف',
  'expenses.edit': 'تعديل المصاريف',
  'payroll.view': 'عرض الرواتب',
  'payroll.edit': 'تعديل الرواتب والصرف',
  'ledger.view': 'عرض مستحقات الموظفين',
  'ledger.edit': 'تعديل مستحقات الموظفين',
  'ledger.pay': 'تسجيل صرف المستحقات',
  'ledger.partial_pay': 'صرف جزئي للمستحقات',
  'ledger.adjust': 'تسوية وعكس الحركات',
  'ledger.close': 'إقفال الشهر المالي',
  'ledger.reopen': 'إعادة فتح شهر مقفول',
  'ledger.print': 'طباعة السندات وكشف الحساب',
  'ledger.export': 'تصدير تقارير المستحقات',
  'ledger.view_all': 'عرض مستحقات جميع الموظفين',
  'attendance.view': 'عرض الحضور',
  'attendance.edit': 'تعديل الحضور',
  'inventory.view': 'عرض المخزون',
  'inventory.edit': 'تعديل المخزون',
  'cash.view': 'عرض عهدة الكاش',
  'cash.edit': 'إدارة عهدة الكاش',
  'messages.view': 'عرض الرسائل',
  'messages.edit': 'إرسال الرسائل',
  'settings.view': 'عرض الإعدادات',
  'settings.edit': 'تعديل الإعدادات',
  'users.manage': 'إدارة المستخدمين',
  'logs.view': 'سجل النظام',
  'core.edit': 'تعديل البيانات الأساسية'
};
const ALLOWED_PERMISSION_KEYS = Object.keys(PERMISSION_DEFS);

const ROLE_PRESETS = {
  admin: {
    'cases.view': true, 'cases.edit': true,
    'clients.view': true, 'clients.edit': true,
    'bookings.view': true, 'bookings.edit': true,
    'messages.view': true, 'messages.edit': true,
    'reports.view': true, 'reports.print': true,
    'expenses.view': true, 'expenses.edit': true,
    'payroll.view': true, 'payroll.edit': true,
    'ledger.view': true, 'ledger.edit': true, 'ledger.pay': true,
    'ledger.partial_pay': true, 'ledger.adjust': true, 'ledger.close': true,
    'ledger.reopen': true, 'ledger.print': true, 'ledger.export': true, 'ledger.view_all': true,
    'attendance.view': true, 'attendance.edit': true,
    'inventory.view': true, 'inventory.edit': true,
    'cash.view': true, 'cash.edit': true,
    'settings.view': true, 'settings.edit': true,
    'users.manage': true, 'logs.view': true, 'core.edit': true
  },
  reception: {
    'cases.view': true, 'cases.edit': true,
    'clients.view': true, 'clients.edit': true,
    'bookings.view': true, 'bookings.edit': true,
    'messages.view': true, 'messages.edit': true,
    'reports.view': true, 'reports.print': true,
    'expenses.view': true, 'expenses.edit': true,
    'attendance.view': true, 'attendance.edit': true,
    'cash.view': true, 'cash.edit': true,
    'payroll.view': false, 'payroll.edit': false,
    'ledger.view': false, 'ledger.edit': false, 'ledger.pay': false,
    'ledger.partial_pay': false, 'ledger.adjust': false, 'ledger.close': false,
    'ledger.reopen': false, 'ledger.print': false, 'ledger.export': false, 'ledger.view_all': false,
    'inventory.view': false, 'inventory.edit': false,
    'settings.view': false, 'settings.edit': false,
    'users.manage': false, 'logs.view': false, 'core.edit': false
  },
  employee: {
    'cases.view': true, 'cases.edit': false,
    'clients.view': false, 'clients.edit': false,
    'bookings.view': false, 'bookings.edit': false,
    'reports.view': false, 'reports.print': false,
    'expenses.view': false, 'expenses.edit': false,
    'payroll.view': false, 'payroll.edit': false,
    'ledger.view': false, 'ledger.edit': false, 'ledger.pay': false,
    'ledger.partial_pay': false, 'ledger.adjust': false, 'ledger.close': false,
    'ledger.reopen': false, 'ledger.print': false, 'ledger.export': false, 'ledger.view_all': false,
    'attendance.view': true, 'attendance.edit': false,
    'inventory.view': false, 'inventory.edit': false,
    'cash.view': false, 'cash.edit': false,
    'messages.view': false, 'messages.edit': false,
    'settings.view': false, 'settings.edit': false,
    'users.manage': false, 'logs.view': false, 'core.edit': false
  },
  accountant: {
    'cases.view': true, 'cases.edit': false,
    'clients.view': true, 'clients.edit': false,
    'bookings.view': true, 'bookings.edit': false,
    'messages.view': false, 'messages.edit': false,
    'reports.view': true, 'reports.print': true,
    'expenses.view': true, 'expenses.edit': false,
    'payroll.view': true, 'payroll.edit': false,
    'ledger.view': true, 'ledger.edit': false, 'ledger.pay': true,
    'ledger.partial_pay': true, 'ledger.adjust': false, 'ledger.close': false,
    'ledger.reopen': false, 'ledger.print': true, 'ledger.export': true, 'ledger.view_all': true,
    'attendance.view': true, 'attendance.edit': false,
    'inventory.view': true, 'inventory.edit': false,
    'cash.view': true, 'cash.edit': false,
    'settings.view': false, 'settings.edit': false,
    'users.manage': false, 'logs.view': false, 'core.edit': false
  }
};

/** صفحات النظام — للتنقل وصلاحيات مخصصة */
const PAGE_ACCESS_MODULES = [
  { id: 'cases', label: 'لوحة التحكم / السجل اليومي', view: 'cases.view', edit: 'cases.edit', pages: ['dashboard', 'daily'] },
  { id: 'bookings', label: 'الحجوزات', view: 'bookings.view', edit: 'bookings.edit', pages: ['bookings'] },
  { id: 'clients', label: 'سجل العملاء', view: 'clients.view', edit: 'clients.edit', pages: ['clients'] },
  { id: 'invoices', label: 'إدارة الفواتير', view: 'cases.view', edit: 'cases.edit', pages: ['invoices'] },
  { id: 'messages', label: 'رسائل العملاء', view: 'messages.view', edit: 'messages.edit', pages: ['messages', 'followup'] },
  { id: 'reports', label: 'التقارير', view: 'reports.view', edit: 'reports.print', pages: ['reports'] },
  { id: 'expenses', label: 'النفقات والمصاريف', view: 'expenses.view', edit: 'expenses.edit', pages: ['expenses'] },
  { id: 'attendance', label: 'الحضور والانصراف', view: 'attendance.view', edit: 'attendance.edit', pages: ['attendance'] },
  { id: 'payroll', label: 'الرواتب والعمولات', view: 'payroll.view', edit: 'payroll.edit', pages: ['payroll'] },
  { id: 'ledger', label: 'مستحقات الموظفين', view: 'ledger.view', edit: 'ledger.pay', pages: ['employee-ledger'] },
  { id: 'inventory', label: 'المخزون', view: 'inventory.view', edit: 'inventory.edit', pages: ['inventory'] },
  { id: 'cashfloat', label: 'عهدة الكاش', view: 'cash.view', edit: 'cash.edit', pages: ['cashfloat'] },
  { id: 'logs', label: 'سجل النظام', view: 'logs.view', edit: null, pages: ['logs'] },
  { id: 'doctors', label: 'إدارة الموظفين (مدير)', view: 'core.edit', edit: 'core.edit', pages: ['doctors'], adminOnly: true },
  { id: 'users', label: 'إدارة المستخدمين (مدير)', view: 'users.manage', edit: 'users.manage', pages: ['users'], adminOnly: true },
  { id: 'packages', label: 'الأسعار والضرائب (مدير)', view: 'settings.edit', edit: 'settings.edit', pages: ['packages'], adminOnly: true },
  { id: 'settings', label: 'الإعدادات (مدير)', view: 'settings.view', edit: 'settings.edit', pages: ['settings'], adminOnly: true }
];

const PAGE_EDIT_PERMISSIONS = {
  dashboard: 'cases.edit', daily: 'cases.edit', bookings: 'bookings.edit', clients: 'clients.edit',
  messages: 'messages.edit', followup: 'messages.edit', reports: 'reports.print', expenses: 'expenses.edit',
  attendance: 'attendance.edit', payroll: 'payroll.edit', 'employee-ledger': 'ledger.pay', inventory: 'inventory.edit',
  cashfloat: 'cash.edit', doctors: 'core.edit', users: 'users.manage',
  packages: 'settings.edit', settings: 'settings.edit', logs: null, employee: null, invoices: 'cases.edit'
};

const PAGE_PERMISSIONS = {
  dashboard: 'cases.view', daily: 'cases.view', bookings: 'bookings.view',
  clients: 'clients.view', messages: 'messages.view', followup: 'messages.view', reports: 'reports.view',
  expenses: 'expenses.view', attendance: 'attendance.view', payroll: 'payroll.view',
  'employee-ledger': 'ledger.view',
  doctors: 'core.edit', users: 'users.manage', packages: 'settings.edit',
  settings: 'settings.view', inventory: 'inventory.view', logs: 'logs.view',
  cashfloat: 'cash.view', employee: null, invoices: 'cases.view'
};

const defaultInventoryConfig = { enabled: false, autoDeductOnSession: true };
const defaultCurrencyConfig = {
  baseCurrency: 'SAR',
  enabled: true,
  feeMode: 'percent',
  feePercent: 2.5,
  feeFixed: 0,
  feePer100: 5,
  apis: [
    { id: 'exchangerate', name: 'ExchangeRate-API', url: 'https://open.er-api.com/v6/latest/USD', enabled: true, key: '' },
    { id: 'frankfurter', name: 'Frankfurter (مجاني)', url: 'https://api.frankfurter.app/latest?from=USD&to=SAR', enabled: true, key: '' }
  ],
  rates: { USD: 3.75, EUR: 4.05, GBP: 4.72, SAR: 1 },
  lastUpdated: null
};
const defaultMessagingApiConfig = {
  whatsapp: { provider: 'manual', apiUrl: '', apiKey: '', senderId: '' },
  sms: { provider: 'manual', apiUrl: '', apiKey: '', senderId: '' }
};
const defaultCashFloatConfig = {
  enabled: true,
  defaultOpeningFloat: 500,
  denominations: [500, 200, 100, 50, 20, 10, 5, 1]
};

const HIJAMA_INVENTORY_SEED = [
  { name: 'كاسات حجامة', sku: 'CUP-01', perSession: 1, reorderPieces: 100, packaging: null },
  { name: 'مشارط', sku: 'BLD-01', perSession: 1, reorderPieces: 50, packaging: { largeLabel: 'كرتون كبير', largeQty: 5, smallLabel: 'كرتون صغير', smallQty: 20, baseLabel: 'قطعة' } },
  { name: 'لزق طبي', sku: 'TAPE-01', perSession: 2, reorderPieces: 200, packaging: { largeLabel: 'كرتون', largeQty: 10, smallLabel: 'علبة', smallQty: 12, baseLabel: 'قطعة' } },
  { name: 'بيتادين', sku: 'BET-01', perSession: 0.1, reorderPieces: 20, packaging: { largeLabel: 'جالون', largeQty: 4, smallLabel: 'زجاجة', smallQty: 500, baseLabel: 'مل' } },
  { name: 'كحول', sku: 'ALC-01', perSession: 0.05, reorderPieces: 10, packaging: { largeLabel: 'جالون', largeQty: 4, smallLabel: 'زجاجة', smallQty: 1000, baseLabel: 'مل' } },
  { name: 'Opsite', sku: 'OPS-01', perSession: 1, reorderPieces: 30, packaging: null },
  { name: 'مناديل', sku: 'TIS-01', perSession: 2, reorderPieces: 50, packaging: { largeLabel: 'كرتون', largeQty: 12, smallLabel: 'باكيت', smallQty: 100, baseLabel: 'قطعة' } },
  { name: 'مفرش سرير', sku: 'BED-01', perSession: 1, reorderPieces: 40, packaging: null },
  { name: 'فازلين', sku: 'VAZ-01', perSession: 0.02, reorderPieces: 5, packaging: { largeLabel: 'كرتون', largeQty: 6, smallLabel: 'علبة', smallQty: 400, baseLabel: 'جم' } },
  { name: 'شرائط سكر', sku: 'STR-01', perSession: 0, reorderPieces: 10, packaging: { largeLabel: 'كرتون', largeQty: 10, smallLabel: 'علبة', smallQty: 50, baseLabel: 'شريط' } },
  { name: 'مسحات طبية كحولية', sku: 'SWB-01', perSession: 2, reorderPieces: 100, packaging: { largeLabel: 'كرتون', largeQty: 20, smallLabel: 'باكيت', smallQty: 100, baseLabel: 'قطعة' } },
  { name: 'شكاكات طبية للسكر', sku: 'LAN-01', perSession: 1, reorderPieces: 50, packaging: { largeLabel: 'كرتون', largeQty: 10, smallLabel: 'علبة', smallQty: 100, baseLabel: 'قطعة' } }
];

let inventoryItems = DB.get('inventoryItems', []);
let inventorySuppliers = DB.get('inventorySuppliers', []);
let inventoryMovements = DB.get('inventoryMovements', []);
let systemLogs = DB.get('systemLogs', []);
let cashDrawerSession = DB.get('cashDrawerSession', null);

function ensureExtSettings() {
  if (!settings.inventory) settings.inventory = JSON.parse(JSON.stringify(defaultInventoryConfig));
  if (!settings.currency) settings.currency = JSON.parse(JSON.stringify(defaultCurrencyConfig));
  if (!settings.messagingApi) settings.messagingApi = JSON.parse(JSON.stringify(defaultMessagingApiConfig));
  if (!settings.cashFloat) settings.cashFloat = JSON.parse(JSON.stringify(defaultCashFloatConfig));
  const r = settings.currency.rates || {};
  ['USD', 'EUR', 'GBP'].forEach((code) => {
    if (!r[code] || r[code] <= 1) r[code] = defaultCurrencyConfig.rates[code];
  });
  r.SAR = 1;
  settings.currency.rates = r;
}

function getUserPermissions(user) {
  if (!user) return {};
  if (user.isDev) return { _all: true };
  if (typeof RolePolicy !== 'undefined' && RolePolicy.isOrganizationOwner(user)) return { _all: true };
  if (user.role === 'admin') return sanitizePermissionMap(ROLE_PRESETS.admin);
  if (user.role === 'custom' && user.permissions) return sanitizePermissionMap(user.permissions);
  return sanitizePermissionMap(ROLE_PRESETS[user.role] || ROLE_PRESETS.reception);
}

function sanitizePermissionMap(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const key of ALLOWED_PERMISSION_KEYS) {
    out[key] = raw[key] === true;
  }
  return out;
}

function hasPermission(key) {
  if (!ALLOWED_PERMISSION_KEYS.includes(key)) return false;
  const p = getUserPermissions(currentUser);
  if (p._all) return true;
  return !!p[key];
}

function requirePermission(key, action) {
  if (!hasPermission(key)) {
    notify(`⛔ ليس لديك صلاحية: ${action || PERMISSION_DEFS[key] || key}`, 'danger');
    return false;
  }
  return true;
}

function canEditPermission(key) {
  if (typeof window !== 'undefined' && window.LicenseReadOnlyMode?.isActive?.()) return false;
  return hasPermission(key);
}

if (typeof window !== 'undefined') {
  window.PermissionPolicy = window.PermissionPolicy || {};
  window.PermissionPolicy.sanitizePermissionMap = sanitizePermissionMap;
  window.PermissionPolicy.allowedPermissionKeys = ALLOWED_PERMISSION_KEYS.slice();
}

function getRoleDisplayName(user) {
  if (!user) return '—';
  if (user.customTitle) return user.customTitle;
  const map = {
    owner: 'المالك',
    hq_admin: 'إدارة المركز',
    admin: 'مدير النظام',
    reception: 'استقبال',
    employee: 'موظف',
    accountant: 'محاسب (قراءة)',
    custom: 'مخصص'
  };
  return map[user.role] || user.role;
}

let logCounter = DB.get('logCounter', 0);

const LOG_OP_META = {
  PATIENT_ADDED: { label: 'إضافة مريض', cat: 'المرضى', icon: '🟢' },
  PATIENT_UPDATED: { label: 'تعديل بيانات مريض', cat: 'المرضى', icon: '🔵' },
  PATIENT_DELETED: { label: 'حذف مريض', cat: 'المرضى', icon: '🔴' },
  CASE_CREATED: { label: 'إضافة حالة جديدة', cat: 'السجل اليومي', icon: '🟢' },
  CASE_UPDATED: { label: 'تعديل حالة', cat: 'السجل اليومي', icon: '🔵' },
  CASE_DELETED: { label: 'حذف حالة', cat: 'السجل اليومي', icon: '🔴' },
  BOOKING_CREATED: { label: 'إنشاء حجز', cat: 'الحجوزات', icon: '🟢' },
  BOOKING_UPDATED: { label: 'تعديل حجز', cat: 'الحجوزات', icon: '🔵' },
  BOOKING_CANCELLED: { label: 'إلغاء حجز', cat: 'الحجوزات', icon: '🔴' },
  BOOKING_CONFIRMED: { label: 'تأكيد حضور', cat: 'الحجوزات', icon: '🟢' },
  PACKAGE_ADDED: { label: 'إضافة باقة', cat: 'الباقات', icon: '🟢' },
  PACKAGE_UPDATED: { label: 'تعديل باقة', cat: 'الباقات', icon: '🔵' },
  PACKAGE_DELETED: { label: 'حذف باقة', cat: 'الباقات', icon: '🔴' },
  PACKAGE_USED: { label: 'استخدام باقة', cat: 'الباقات', icon: '🟠' },
  USER_LOGIN: { label: 'تسجيل دخول', cat: 'المستخدمين', icon: '🟢' },
  USER_LOGOUT: { label: 'تسجيل خروج', cat: 'المستخدمين', icon: '⚪' },
  USER_ADDED: { label: 'إضافة مستخدم', cat: 'المستخدمين', icon: '🟢' },
  USER_UPDATED: { label: 'تعديل مستخدم', cat: 'المستخدمين', icon: '🔵' },
  USER_DELETED: { label: 'حذف مستخدم', cat: 'المستخدمين', icon: '🔴' },
  EXPENSE_ADDED: { label: 'إضافة مصروف', cat: 'المالية', icon: '🟢' },
  EXPENSE_UPDATED: { label: 'تعديل مصروف', cat: 'المالية', icon: '🔵' },
  EXPENSE_DELETED: { label: 'حذف مصروف', cat: 'المالية', icon: '🔴' },
  INVOICE_CREATED: { label: 'إنشاء فاتورة', cat: 'المالية', icon: '🟢' },
  INVOICE_VOID: { label: 'إلغاء فاتورة', cat: 'المالية', icon: '🔴' },
  SETTINGS_CHANGED: { label: 'تغيير الإعدادات', cat: 'النظام', icon: '🟠' },
  PASSWORD_CHANGED: { label: 'تغيير كلمة المرور', cat: 'المستخدمين', icon: '🟠' },
  THEME_CHANGED: { label: 'تغيير الثيم', cat: 'النظام', icon: '🟠' },
  BACKUP_CREATED: { label: 'نسخة احتياطية', cat: 'النظام', icon: '🔵' },
  BACKUP_RESTORED: { label: 'استعادة نسخة', cat: 'النظام', icon: '🟠' },
  INVENTORY_IN: { label: 'إضافة مخزون', cat: 'المخزون', icon: '🟢' },
  INVENTORY_OUT: { label: 'صرف مخزون', cat: 'المخزون', icon: '🟠' },
  INVENTORY_ITEM: { label: 'صنف مخزون', cat: 'المخزون', icon: '🔵' },
  CASH_MOVEMENT: { label: 'حركة عهدة كاش', cat: 'المالية', icon: '💵' },
  CURRENCY_UPDATE: { label: 'تحديث عملات', cat: 'المالية', icon: '💱' }
};

const LOG_CAT_FILTER = {
  '': 'كل التصنيفات',
  patients: 'المرضى',
  cases: 'السجل اليومي',
  bookings: 'الحجوزات',
  packages: 'الباقات',
  users: 'المستخدمين',
  finance: 'المالية',
  inventory: 'المخزون',
  system: 'النظام'
};

function nextLogId() {
  logCounter = (DB.get('logCounter', logCounter) || 0) + 1;
  DB.set('logCounter', logCounter);
  return 'LOG-' + String(logCounter).padStart(6, '0');
}

function formatLogDateTime(iso) {
  if (!iso) return { date: '—', time: '—', line: '—' };
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const date = `${dd}/${mm}/${yyyy}`;
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const time = `${h12}:${m}:${s} ${ap}`;
  return { date, time, line: `${date} • ${time}` };
}

function logAudit(opType, description, extra) {
  const desc = String(description || '').slice(0, 200);
  if (opType === 'SYSTEM_ERROR' && systemLogs.length) {
    const last = systemLogs[0];
    const age = Date.now() - new Date(last.at).getTime();
    if (last.opType === 'SYSTEM_ERROR' && last.description === desc && age < 60000) return;
  }
  const meta = LOG_OP_META[opType] || { label: opType, cat: 'النظام', icon: '⚪' };
  const entry = {
    id: nextLogId(),
    opType,
    at: new Date().toISOString(),
    category: meta.cat,
    action: meta.label,
    icon: meta.icon,
    description: desc,
    user: currentUser ? currentUser.fullName : '—',
    role: typeof getRoleDisplayName === 'function' ? getRoleDisplayName(currentUser) : '—',
    device: (settings.backup && settings.backup.deviceName) || 'Reception-PC',
    ip: window.__clientIp || '—',
    ...(extra || {})
  };
  if (typeof BranchDataIsolation !== 'undefined' && BranchDataIsolation.stampLogEntry) {
    BranchDataIsolation.stampLogEntry(entry);
  }
  systemLogs.unshift(entry);
  if (systemLogs.length > 3000) systemLogs.length = 3000;
  if (extra?.deferPersist) return;
  DB.set('systemLogs', systemLogs);
  if (typeof AuditLogger !== 'undefined' && typeof CloudMeta !== 'undefined' && CloudMeta.isCloudV2Enabled?.()) {
    try { AuditLogger.logFromSystem(opType, desc, extra); } catch { /* empty */ }
  }
  const logsPage = document.getElementById('page-logs');
  if (logsPage && logsPage.classList.contains('active')) refreshSystemLogsPage();
}

function logSystem(category, action, detail, meta) {
  const catMap = {
    cases: 'CASE_CREATED', inventory: 'INVENTORY_ITEM', cash: 'CASH_MOVEMENT',
    users: 'USER_UPDATED', settings: 'SETTINGS_CHANGED', currency: 'CURRENCY_UPDATE'
  };
  logAudit(catMap[category] || 'SETTINGS_CHANGED', detail || action, { legacyCategory: category, ...(meta || {}) });
}

function canEditPage(pageId) {
  if (typeof window !== 'undefined' && window.LicenseReadOnlyMode?.isActive?.()) return false;
  const key = PAGE_EDIT_PERMISSIONS[pageId];
  if (!key) return false;
  return hasPermission(key);
}

function parseNavPageId(el) {
  if (!el) return null;
  return el.getAttribute('data-page')
    || el.getAttribute('data-addon-page')
    || (el.getAttribute('onclick') || '').match(/showPage\('([^']+)'\)/)?.[1]
    || null;
}

function applyGlobalEditLocks() {
  const licReadOnly = typeof window !== 'undefined' && window.LicenseReadOnlyMode?.isActive?.();
  const locks = [
    { sel: 'button[onclick="saveCase()"]', perm: 'cases.edit' },
    { sel: 'button[onclick*="saveBooking"]', perm: 'bookings.edit' },
    { sel: 'button[onclick*="saveExpense"]', perm: 'expenses.edit' },
    { sel: 'button[onclick="saveAttendance()"]', perm: 'attendance.edit' },
    { sel: 'button[onclick*="saveAttEdit"]', perm: 'attendance.edit' },
    { sel: 'button[onclick*="deleteAtt"]', perm: 'attendance.edit' },
    { sel: 'button[onclick*="saveOT"]', perm: 'payroll.edit' },
    { sel: 'button[onclick*="deleteOT"]', perm: 'payroll.edit' },
    { sel: 'button[onclick*="saveInventory"]', perm: 'inventory.edit' },
    { sel: 'button[onclick*="cashFloat"]', perm: 'cash.edit' },
    { sel: '.admin-delete', perm: 'core.edit' }
  ];
  locks.forEach(({ sel, perm }) => {
    document.querySelectorAll(sel).forEach(btn => {
      const ok = !licReadOnly && hasPermission(perm);
      btn.classList.toggle('perm-locked', !ok);
      if (btn.classList.contains('btn-danger') || btn.classList.contains('btn-primary') || sel.includes('save') || sel.includes('delete')) {
        btn.style.display = ok ? '' : 'none';
      }
      btn.disabled = !ok;
    });
  });
}

function applyPageReadOnly(pageId) {
  const page = document.getElementById('page-' + pageId);
  if (!page) return;
  const canEdit = canEditPage(pageId);
  page.classList.toggle('page-readonly', !canEdit);
  const keepReadOnly = el => el.hasAttribute('readonly') || el.readOnly
    || ['f-invoice', 'f-file-no', 'oc-invoice', 'oc-file-no', 'ce-file-no'].includes(el.id);
  page.querySelectorAll('input:not([type="search"]):not([type="month"]):not([type="date"]), select, textarea').forEach(el => {
    if (el.closest('.page-toolbar, .att-filter, .rep-filter, [data-readonly-ok]')) return;
    if (canEdit) {
      el.disabled = false;
      if (!keepReadOnly(el)) el.readOnly = false;
    } else {
      el.disabled = true;
      el.readOnly = true;
    }
  });
}

function applyPermissionUI() {
  if (!currentUser) return;
  const role = currentUser.role;
  const isEmp = role === 'employee';

  document.querySelectorAll('[data-perm]').forEach(el => {
    const perm = el.getAttribute('data-perm');
    const needEdit = el.getAttribute('data-perm-edit') === 'true';
    const allowed = needEdit ? canEditPermission(perm) : hasPermission(perm);
    if (el.tagName === 'BUTTON' || el.classList.contains('btn') || el.classList.contains('quick-action-btn')) {
      el.classList.toggle('perm-locked', !allowed);
      el.disabled = !allowed;
      if (el.classList.contains('quick-action-btn')) {
        el.style.display = allowed ? '' : 'none';
      }
    } else {
      el.style.display = allowed ? '' : 'none';
    }
  });

  document.querySelectorAll('.nav-item').forEach(el => {
    if (el.dataset.navGated === 'owner-hub') {
      if (typeof globalThis !== 'undefined' && globalThis.OwnerHub && globalThis.OwnerHub.applyNavVisibility) {
        globalThis.OwnerHub.applyNavVisibility();
      }
      return;
    }
    if (el.classList.contains('employee-only')) {
      el.style.display = isEmp ? '' : 'none';
      return;
    }
    if (isEmp) return;
    const page = parseNavPageId(el);
    if (page) {
      const perm = PAGE_PERMISSIONS[page];
      const allowed = perm ? hasPermission(perm) : true;
      if (!allowed || el.classList.contains('feature-hidden')) {
        el.style.display = 'none';
      } else if (!el.classList.contains('admin-only') || (typeof RolePolicy !== 'undefined' && RolePolicy.isManager(currentUser)) || currentUser.isDev || hasPermission(PAGE_PERMISSIONS[page])) {
        el.style.removeProperty('display');
      }
      return;
    }
    if (el.classList.contains('admin-only') && !(typeof RolePolicy !== 'undefined' && RolePolicy.isManager(currentUser)) && !currentUser.isDev) {
      el.style.display = 'none';
    }
  });

  document.querySelectorAll('.nav-section-label').forEach(label => {
    let next = label.nextElementSibling;
    let anyVisible = false;
    while (next && !next.classList.contains('nav-section-label')) {
      if (next.classList.contains('nav-item') && next.style.display !== 'none' && !next.classList.contains('feature-hidden')) {
        anyVisible = true;
        break;
      }
      next = next.nextElementSibling;
    }
    label.style.display = anyVisible ? '' : 'none';
  });

  const topDaily = document.querySelector('.topbar-actions button[onclick="showPage(\'daily\')"]');
  if (topDaily) {
    topDaily.style.display = hasPermission('cases.view') ? '' : 'none';
  }

  applyGlobalEditLocks();
  const active = document.querySelector('.page.active')?.id?.replace('page-', '');
  if (active) applyPageReadOnly(active);
}

function checkPageAccess(pageId) {
  if (currentUser?.role === 'employee' && pageId !== 'employee') return false;
  const perm = PAGE_PERMISSIONS[pageId];
  if (!perm) return true;
  return hasPermission(perm);
}

function getDefaultLandingPage() {
  if (!currentUser) return 'dashboard';
  if (currentUser.role === 'employee') return 'employee';
  if (currentUser.role === 'reception') {
    const order = ['dashboard', 'daily', 'bookings', 'clients', 'messages', 'reports', 'expenses', 'attendance', 'cashfloat'];
    for (const p of order) { if (checkPageAccess(p)) return p; }
  }
  if (currentUser.role === 'accountant') {
    const order = ['daily', 'bookings', 'clients', 'reports', 'expenses', 'attendance', 'payroll', 'inventory', 'cashfloat'];
    for (const p of order) { if (checkPageAccess(p)) return p; }
  }
  const order = ['dashboard', 'daily', 'clients', 'bookings', 'reports', 'payroll', 'attendance', 'expenses', 'inventory', 'messages', 'cashfloat', 'logs'];
  for (const p of order) {
    if (checkPageAccess(p)) return p;
  }
  return 'dashboard';
}

// ── INVENTORY ──
function seedHijamaInventory() {
  if (inventoryItems.length) return;
  inventoryItems = HIJAMA_INVENTORY_SEED.map((item, i) => ({
    id: (Date.now() + i).toString(),
    ...item,
    stockPieces: 0,
    lastPrice: 0,
    supplierIds: [],
    batches: [],
    active: true
  }));
  DB.set('inventoryItems', inventoryItems);
}

function formatStockPieces(item, pieces) {
  const p = Math.max(0, pieces ?? item.stockPieces ?? 0);
  const pkg = item.packaging;
  if (!pkg || !pkg.largeQty || !pkg.smallQty) return `${fmtNum(p, pkg?.baseLabel === 'مل' || pkg?.baseLabel === 'جم' ? 1 : 0)} ${pkg?.baseLabel || 'قطعة'}`;
  const perLarge = pkg.largeQty * pkg.smallQty;
  const large = Math.floor(p / perLarge);
  let rem = p % perLarge;
  const small = Math.floor(rem / pkg.smallQty);
  rem = rem % pkg.smallQty;
  const parts = [];
  if (large) parts.push(`${large} ${pkg.largeLabel}`);
  if (small) parts.push(`${small} ${pkg.smallLabel}`);
  if (rem > 0) parts.push(`${fmtNum(rem, rem % 1 ? 1 : 0)} ${pkg.baseLabel}`);
  return parts.length ? parts.join(' + ') : `0 ${pkg.baseLabel}`;
}

function getInventoryStatus(item) {
  const stock = item.stockPieces || 0;
  const reorder = item.reorderPieces || 0;
  if (stock <= 0) return { label: 'نفد', cls: 'tag-red' };
  if (stock <= reorder) return { label: 'اطلب الآن', cls: 'tag-gold' };
  if (stock <= reorder * 1.5) return { label: 'منخفض', cls: 'tag-gold' };
  return { label: 'جيد', cls: 'tag-green' };
}

function getExpiringBatches(item, withinDays) {
  const days = withinDays || 30;
  const now = Date.now();
  return (item.batches || []).filter(b => {
    if (!b.expiry) return false;
    const diff = (new Date(b.expiry).getTime() - now) / 86400000;
    return diff >= 0 && diff <= days;
  });
}

function adjustInventoryStock(itemId, deltaPieces, reason, refId) {
  const item = inventoryItems.find(x => x.id === itemId);
  if (!item) return false;
  item.stockPieces = Math.max(0, (item.stockPieces || 0) + deltaPieces);
  inventoryMovements.unshift({
    id: Date.now().toString(),
    at: new Date().toISOString(),
    itemId, itemName: item.name,
    delta: deltaPieces, balance: item.stockPieces,
    reason, refId: refId || '',
    user: currentUser ? currentUser.fullName : '—'
  });
  if (inventoryMovements.length > 1000) inventoryMovements.length = 1000;
  DB.set('inventoryItems', inventoryItems);
  DB.set('inventoryMovements', inventoryMovements);
  return true;
}

function deductInventoryForCase(c) {
  ensureExtSettings();
  if (!settings.inventory.enabled || !settings.inventory.autoDeductOnSession) return;
  const cups = parseFloat(c.cups) || 0;
  if (!cups) return;
  inventoryItems.filter(i => i.active && (i.perSession || 0) > 0).forEach(item => {
    const qty = (item.perSession || 0) * cups;
    if (qty > 0) {
      adjustInventoryStock(item.id, -qty, 'استهلاك جلسة', c.id);
      logSystem('inventory', 'خصم مخزون', `${item.name}: -${fmtNum(qty, 2)} (${c.name})`, { caseId: c.id });
    }
  });
}

function restoreInventoryForCase(c) {
  ensureExtSettings();
  if (!settings.inventory.enabled) return;
  const cups = parseFloat(c.cups) || 0;
  inventoryItems.filter(i => i.active && (i.perSession || 0) > 0).forEach(item => {
    const qty = (item.perSession || 0) * cups;
    if (qty > 0) adjustInventoryStock(item.id, qty, 'استرجاع — حذف جلسة', c.id);
  });
}

function toggleInventorySystem(enabled) {
  ensureExtSettings();
  settings.inventory.enabled = !!enabled;
  if (enabled && !inventoryItems.length) seedHijamaInventory();
  DB.set('settings', settings);
  logSystem('inventory', enabled ? 'تفعيل المخزون' : 'تعطيل المخزون', '');
}

function getInventoryScopedItems() {
  const items = inventoryItems || [];
  if (typeof getUiScopedRecords === 'function') return getUiScopedRecords(items);
  if (typeof BranchScope !== 'undefined' && BranchScope.filterForActiveView) {
    return BranchScope.filterForActiveView(items);
  }
  return items;
}

function refreshInventoryPage() {
  ensureExtSettings();
  const enabledEl = document.getElementById('inv-enabled');
  if (enabledEl) enabledEl.checked = !!settings.inventory.enabled;
  const wrap = document.getElementById('inv-content-wrap');
  if (wrap) wrap.style.opacity = settings.inventory.enabled ? '1' : '0.45';
  const tbody = document.getElementById('invTableBody');
  if (!tbody) return;
  if (!settings.inventory.enabled) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-muted)">نظام المخزون معطّل — فعّله من الأعلى</td></tr>';
    return;
  }
  if (!getInventoryScopedItems().length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px">لا توجد أصناف — اضغط «تهيئة مخزون الحجامة»</td></tr>';
    return;
  }
  const ab = typeof actionBtn === 'function' ? actionBtn : (icon, label, opts) => {
    opts = opts || {};
    const cls = opts.cls || 'btn-ghost';
    const onclick = opts.onclick ? ` onclick="${opts.onclick}"` : '';
    return `<button type="button" class="btn ${cls} btn-sm btn-action" title="${label}"${onclick}><span class="btn-ico">${icon}</span><span class="btn-lbl">${label}</span></button>`;
  };
  const abr = typeof actionBtnRow === 'function' ? actionBtnRow : (h) => `<div class="table-action-btns">${h}</div>`;
  tbody.innerHTML = getInventoryScopedItems().map((item, i) => {
    const st = getInventoryStatus(item);
    const expiring = getExpiringBatches(item, 30);
    const expWarn = expiring.length ? `<span class="tag tag-red" style="font-size:10px">⚠️ ${expiring.length} دفعة تنتهي قريباً</span>` : '';
    return `<tr>
      <td>${i + 1}</td>
      <td><strong>${item.name}</strong><div style="font-size:11px;color:var(--text-muted)">${item.sku || ''}</div></td>
      <td>${formatStockPieces(item)}</td>
      <td>${item.reorderPieces || '—'}</td>
      <td><span class="tag ${st.cls}">${st.label}</span></td>
      <td dir="ltr">${item.lastPrice ? fmtMoney(item.lastPrice) : '—'}</td>
      <td>${fmtNum(item.perSession || 0, 2)}/جلسة</td>
      <td>${expWarn || '—'}</td>
      <td class="actions-col">${abr(
        ab('✏️', 'تعديل', { onclick: `openInvItemModal('${item.id}')` }) +
        ab('➕', 'وارد', { onclick: `openInvStockModal('${item.id}','in')` }) +
        ab('➖', 'صادر', { onclick: `openInvStockModal('${item.id}','out')` })
      )}</td>
    </tr>`;
  }).join('');
  refreshInvSuppliersList();
  refreshInvMovements();
  refreshInvExpiryAlerts();
}

function refreshInvExpiryAlerts() {
  const el = document.getElementById('inv-expiry-alerts');
  if (!el) return;
  const alerts = [];
  inventoryItems.forEach(item => {
    getExpiringBatches(item, 30).forEach(b => {
      alerts.push(`${item.name}: دفعة ${b.lot || '—'} تنتهي ${fmtDate(b.expiry)} (${b.qty || 0} ${item.packaging?.baseLabel || 'قطعة'})`);
    });
  });
  el.innerHTML = alerts.length
    ? alerts.map(a => `<div style="padding:8px 12px;background:#fff3cd;border-radius:8px;margin-bottom:6px;font-size:13px">⚠️ ${a}</div>`).join('')
    : '<div style="color:var(--text-muted);font-size:13px">لا توجد دفعات قريبة الانتهاء</div>';
}

function refreshInvMovements() {
  const el = document.getElementById('invMovementsBody');
  if (!el) return;
  if (!inventoryMovements.length) { el.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--text-light)">لا حركات بعد</td></tr>'; return; }
  el.innerHTML = inventoryMovements.slice(0, 50).map(m => {
    const dt = formatLogDateTime(m.at);
    return `<tr>
    <td dir="ltr" style="font-size:12px">${dt.line}</td>
    <td>${m.itemName}</td>
    <td dir="ltr" style="color:${m.delta < 0 ? 'var(--danger)' : 'var(--success)'}">${m.delta > 0 ? '+' : ''}${fmtNum(m.delta, 2)}</td>
    <td>${m.balance}</td>
    <td>${m.reason}</td>
    <td>${m.user}</td>
  </tr>`;
  }).join('');
}

function calcPackagingPieces(large, small, loose, pkg) {
  if (!pkg || !pkg.largeQty) return (parseFloat(loose) || 0) + (parseFloat(small) || 0) * (pkg.smallQty || 1) + (parseFloat(large) || 0) * (pkg.largeQty || 1) * (pkg.smallQty || 1);
  const l = parseFloat(large) || 0;
  const s = parseFloat(small) || 0;
  const b = parseFloat(loose) || 0;
  return l * (pkg.largeQty * pkg.smallQty) + s * pkg.smallQty + b;
}

function onInvPackTypeChange() {
  const t = document.getElementById('inv-item-pack-type')?.value || 'simple';
  const nested = document.getElementById('inv-pack-nested-fields');
  const liquid = document.getElementById('inv-pack-liquid-fields');
  if (nested) nested.style.display = t === 'nested' ? '' : 'none';
  if (liquid) liquid.style.display = t === 'liquid' ? '' : 'none';
  syncInvPackPreview();
}

function syncInvPackPreview() {
  const stockItem = window._invStockId ? inventoryItems.find(x => x.id === window._invStockId) : null;
  const t = stockItem?.packaging?.type || (stockItem?.packaging ? 'nested' : null) || document.getElementById('inv-item-pack-type')?.value || 'simple';
  let pieces = 0;
  let label = '';
  if (t === 'nested') {
    const pkg = stockItem?.packaging || {
      largeLabel: document.getElementById('inv-pack-large-label')?.value || 'كرتون كبير',
      largeQty: parseInt(document.getElementById('inv-pack-large-qty')?.value, 10) || 1,
      smallLabel: document.getElementById('inv-pack-small-label')?.value || 'كرتون صغير',
      smallQty: parseInt(document.getElementById('inv-pack-small-qty')?.value, 10) || 1,
      baseLabel: document.getElementById('inv-pack-base-label')?.value || 'قطعة'
    };
    pieces = calcPackagingPieces(
      document.getElementById('inv-stock-large')?.value,
      document.getElementById('inv-stock-small')?.value,
      document.getElementById('inv-stock-loose')?.value,
      pkg
    );
    label = pkg.baseLabel;
  } else if (t === 'liquid') {
    const gallons = parseFloat(document.getElementById('inv-stock-gallons')?.value) || 0;
    const bottles = parseFloat(document.getElementById('inv-stock-bottles')?.value) || 0;
    const mlPerGallon = stockItem?.packaging?.mlPerGallon || parseFloat(document.getElementById('inv-pack-ml-gallon')?.value) || 3785;
    const mlPerBottle = stockItem?.packaging?.smallQty || parseFloat(document.getElementById('inv-pack-ml-bottle')?.value) || 500;
    pieces = gallons * mlPerGallon + bottles * mlPerBottle;
    label = 'مل';
  } else {
    pieces = parseFloat(document.getElementById('inv-stock-loose')?.value) || parseFloat(document.getElementById('inv-stock-qty')?.value) || 0;
    label = document.getElementById('inv-pack-base-label')?.value || 'قطعة';
  }
  const text = pieces > 0 ? `= ${fmtNum(pieces, pieces % 1 ? 2 : 0)} ${label} (إجمالي الوحدات الأساسية)` : '—';
  ['inv-pack-calc-preview', 'inv-stock-calc-preview'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
  return pieces;
}

function buildItemPackagingFromForm() {
  const t = document.getElementById('inv-item-pack-type')?.value || 'simple';
  if (t === 'nested') {
    return {
      type: 'nested',
      largeLabel: document.getElementById('inv-pack-large-label')?.value || 'كرتون كبير',
      largeQty: parseInt(document.getElementById('inv-pack-large-qty')?.value, 10) || 1,
      smallLabel: document.getElementById('inv-pack-small-label')?.value || 'كرتون صغير',
      smallQty: parseInt(document.getElementById('inv-pack-small-qty')?.value, 10) || 1,
      baseLabel: document.getElementById('inv-pack-base-label')?.value || 'قطعة'
    };
  }
  if (t === 'liquid') {
    return {
      type: 'liquid',
      largeLabel: 'جالون', largeQty: 1,
      smallLabel: 'زجاجة', smallQty: parseFloat(document.getElementById('inv-pack-ml-bottle')?.value) || 500,
      baseLabel: 'مل',
      mlPerGallon: parseFloat(document.getElementById('inv-pack-ml-gallon')?.value) || 3785
    };
  }
  return null;
}

function populateInvSupplierSelect(selectedId) {
  const html = '<option value="">— المورد —</option>' +
    inventorySuppliers.map(s => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${s.name}</option>`).join('');
  ['inv-stock-supplier', 'inv-item-supplier'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.innerHTML = html;
  });
}

function openInvItemModal(id) {
  if (!requirePermission('inventory.edit', 'تعديل المخزون')) return;
  window._editInvId = id || null;
  const item = id ? inventoryItems.find(x => x.id === id) : null;
  document.getElementById('inv-item-name').value = item?.name || '';
  document.getElementById('inv-item-sku').value = item?.sku || '';
  document.getElementById('inv-item-reorder').value = item?.reorderPieces || 50;
  document.getElementById('inv-item-per-session').value = item?.perSession || 0;
  document.getElementById('inv-item-price').value = item?.lastPrice || 0;
  const pt = document.getElementById('inv-item-pack-type');
  if (pt) {
    pt.value = item?.packaging?.type || (item?.packaging ? 'nested' : 'simple');
    if (item?.packaging) {
      const p = item.packaging;
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
      set('inv-pack-large-label', p.largeLabel);
      set('inv-pack-large-qty', p.largeQty);
      set('inv-pack-small-label', p.smallLabel);
      set('inv-pack-small-qty', p.smallQty);
      set('inv-pack-base-label', p.baseLabel);
      set('inv-pack-ml-gallon', p.mlPerGallon);
      set('inv-pack-ml-bottle', p.smallQty);
    }
    onInvPackTypeChange();
  }
  populateInvSupplierSelect(item?.lastSupplierId || '');
  document.getElementById('invItemModal').classList.add('open');
}

function saveInvItem() {
  if (!requirePermission('inventory.edit', 'تعديل المخزون')) return;
  const name = document.getElementById('inv-item-name').value.trim();
  if (!name) { notify('⚠️ اسم الصنف مطلوب', 'danger'); return; }
  const packaging = buildItemPackagingFromForm();
  const supplierId = document.getElementById('inv-item-supplier')?.value || '';
  const data = {
    name,
    sku: document.getElementById('inv-item-sku').value.trim(),
    reorderPieces: parseFloat(document.getElementById('inv-item-reorder').value) || 0,
    perSession: parseFloat(document.getElementById('inv-item-per-session').value) || 0,
    lastPrice: parseFloat(document.getElementById('inv-item-price').value) || 0,
    packaging,
    lastSupplierId: supplierId || undefined,
    supplierIds: supplierId ? [supplierId] : [],
    active: true
  };
  if (window._editInvId) {
    const idx = inventoryItems.findIndex(x => x.id === window._editInvId);
    if (idx !== -1) inventoryItems[idx] = { ...inventoryItems[idx], ...data, batches: inventoryItems[idx].batches || [] };
  } else {
    inventoryItems.push({ id: Date.now().toString(), stockPieces: 0, batches: [], ...data });
  }
  DB.set('inventoryItems', inventoryItems);
  document.getElementById('invItemModal').classList.remove('open');
  refreshInventoryPage();
  logAudit('INVENTORY_ITEM', `حفظ صنف: ${name}`);
  notify('✅ تم حفظ الصنف');
}

function openInvStockModal(id, mode) {
  if (!requirePermission('inventory.edit', 'تعديل المخزون')) return;
  window._invStockId = id;
  window._invStockMode = mode;
  const item = inventoryItems.find(x => x.id === id);
  document.getElementById('inv-stock-title').textContent = (mode === 'in' ? 'إضافة' : 'صرف') + ' — ' + (item?.name || '');
  ['inv-stock-qty', 'inv-stock-large', 'inv-stock-small', 'inv-stock-loose', 'inv-stock-gallons', 'inv-stock-bottles', 'inv-stock-purchase-price'].forEach(i => {
    const el = document.getElementById(i);
    if (el) el.value = '';
  });
  document.getElementById('inv-stock-lot').value = '';
  document.getElementById('inv-stock-mfg').value = '';
  document.getElementById('inv-stock-exp').value = '';
  const priceEl = document.getElementById('inv-stock-purchase-price');
  if (priceEl && item) priceEl.value = item.lastPrice || '';
  const packRow = document.getElementById('inv-stock-pack-entry');
  if (packRow) packRow.style.display = mode === 'in' && item?.packaging ? '' : 'none';
  if (item?.packaging?.type === 'liquid') {
    document.getElementById('inv-stock-nested-entry').style.display = 'none';
    document.getElementById('inv-stock-liquid-entry').style.display = '';
  } else if (item?.packaging?.type === 'nested') {
    document.getElementById('inv-stock-nested-entry').style.display = '';
    document.getElementById('inv-stock-liquid-entry').style.display = 'none';
  } else {
    document.getElementById('inv-stock-nested-entry').style.display = 'none';
    document.getElementById('inv-stock-liquid-entry').style.display = 'none';
  }
  populateInvSupplierSelect(item?.lastSupplierId || '');
  syncInvPackPreview();
  document.getElementById('invStockModal').classList.add('open');
}

function saveInvStock() {
  if (!requirePermission('inventory.edit', 'تعديل المخزون')) return;
  const item = inventoryItems.find(x => x.id === window._invStockId);
  if (!item) return;
  let qty = parseFloat(document.getElementById('inv-stock-qty')?.value) || 0;
  if (item.packaging && window._invStockMode === 'in') {
    qty = syncInvPackPreview() || qty;
  }
  if (qty <= 0) { notify('⚠️ أدخل كمية صحيحة', 'danger'); return; }
  const delta = window._invStockMode === 'in' ? qty : -qty;
  const purchasePrice = parseFloat(document.getElementById('inv-stock-purchase-price')?.value);
  const supplierId = document.getElementById('inv-stock-supplier')?.value;
  if (window._invStockMode === 'in' && !isNaN(purchasePrice) && purchasePrice > 0) {
    item.lastPrice = purchasePrice;
    if (supplierId) item.lastSupplierId = supplierId;
  }
  adjustInventoryStock(item.id, delta, window._invStockMode === 'in' ? 'إضافة مخزون' : 'صرف يدوي', '');
  if (window._invStockMode === 'in') {
    const lot = document.getElementById('inv-stock-lot').value.trim();
    const mfg = document.getElementById('inv-stock-mfg').value;
    const exp = document.getElementById('inv-stock-exp').value;
    if (exp || lot) {
      if (!item.batches) item.batches = [];
      item.batches.push({ lot, mfg, expiry: exp, qty, purchasePrice: item.lastPrice, supplierId, addedAt: new Date().toISOString() });
    }
    DB.set('inventoryItems', inventoryItems);
    logAudit('INVENTORY_IN', `إضافة ${fmtNum(qty, 2)} — ${item.name}${supplierId ? ' (مورد)' : ''}`);
  } else {
    logAudit('INVENTORY_OUT', `صرف ${fmtNum(qty, 2)} — ${item.name}`);
  }
  document.getElementById('invStockModal').classList.remove('open');
  refreshInventoryPage();
  notify('✅ تم تحديث المخزون');
}

function printInventoryReport() {
  if (!inventoryItems.length) { notify('⚠️ لا توجد أصناف', 'danger'); return; }
  const cn = settings.centerName || 'مركز الحجامة';
  const rows = inventoryItems.map((item, i) => `<tr>
    <td>${i + 1}</td><td>${item.name}</td><td>${item.sku || '—'}</td>
    <td>${formatStockPieces(item)}</td><td>${getInventoryStatus(item).label}</td>
    <td dir="ltr">${item.lastPrice ? fmtMoney(item.lastPrice) : '—'}</td>
  </tr>`).join('');
  const html = `${typeof buildUnifiedReportHeader === 'function' ? buildUnifiedReportHeader('تقرير المخزون', 'Inventory Report', [formatLogDateTime(new Date().toISOString()).date]) : `<div class="hdr"><h1>${cn}</h1><p class="meta">تقرير المخزون — ${formatLogDateTime(new Date().toISOString()).date}</p></div>`}
    <table class="tbl"><thead><tr><th>#</th><th>الصنف</th><th>كود الصنف</th><th>المتوفر</th><th>الحالة</th><th>آخر سعر</th></tr></thead><tbody>${rows}</tbody></table>`;
  if (typeof printHTML === 'function') printHTML(html);
}

function refreshInvSuppliersList() {
  const el = document.getElementById('invSuppliersBody');
  if (!el) return;
  const ab = typeof actionBtn === 'function' ? actionBtn : (icon, label, opts) => {
    opts = opts || {};
    const cls = opts.cls || 'btn-ghost';
    const onclick = opts.onclick ? ` onclick="${opts.onclick}"` : '';
    return `<button type="button" class="btn ${cls} btn-sm btn-action" title="${label}"${onclick}><span class="btn-ico">${icon}</span><span class="btn-lbl">${label}</span></button>`;
  };
  if (!inventorySuppliers.length) { el.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text-light)">لا موردين</td></tr>'; return; }
  el.innerHTML = inventorySuppliers.map(s => `<tr>
    <td>${s.name}</td><td dir="ltr">${s.phone || '—'}</td><td>${s.email || '—'}</td>
    <td>${(s.itemIds || []).length} صنف</td>
    <td class="actions-col">${ab('🗑️', 'حذف', { cls: 'btn-danger', onclick: `deleteInvSupplier('${s.id}')` })}</td>
  </tr>`).join('');
}

function saveInvSupplier() {
  if (!requirePermission('inventory.edit', 'تعديل المخزون')) return;
  const name = document.getElementById('inv-sup-name').value.trim();
  if (!name) { notify('⚠️ اسم المورد مطلوب', 'danger'); return; }
  inventorySuppliers.push({
    id: Date.now().toString(),
    name,
    phone: document.getElementById('inv-sup-phone').value.trim(),
    email: document.getElementById('inv-sup-email').value.trim(),
    itemIds: []
  });
  DB.set('inventorySuppliers', inventorySuppliers);
  ['inv-sup-name', 'inv-sup-phone', 'inv-sup-email'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  refreshInvSuppliersList();
  notify('✅ تم إضافة المورد');
}

function deleteInvSupplier(id) {
  if (!requirePermission('inventory.edit', 'تعديل المخزون')) return;
  inventorySuppliers = inventorySuppliers.filter(s => s.id !== id);
  DB.set('inventorySuppliers', inventorySuppliers);
  refreshInvSuppliersList();
}

function initHijamaInventory() {
  if (!requirePermission('inventory.edit', 'تعديل المخزون')) return;
  if (inventoryItems.length && !confirm('يوجد أصناف — إضافة الافتراضية فقط للأصناف الناقصة؟')) return;
  HIJAMA_INVENTORY_SEED.forEach((seed, i) => {
    if (!inventoryItems.find(x => x.sku === seed.sku)) {
      inventoryItems.push({ id: (Date.now() + i).toString(), ...seed, stockPieces: 0, lastPrice: 0, supplierIds: [], batches: [], active: true });
    }
  });
  DB.set('inventoryItems', inventoryItems);
  settings.inventory.enabled = true;
  DB.set('settings', settings);
  refreshInventoryPage();
  notify('✅ تم تهيئة مخزون الحجامة');
}

// ── CURRENCY ──
async function fetchCurrencyRates() {
  ensureExtSettings();
  const cfg = settings.currency;
  const apis = (cfg.apis || []).filter(a => a.enabled);
  for (const api of apis) {
    try {
      const res = await fetch(api.url);
      const data = await res.json();
      if (data.rates) {
        const base = String(data.base || 'USD').toUpperCase();
        const next = { ...cfg.rates };
        if (base === 'USD' && data.rates.SAR) {
          next.USD = data.rates.SAR;
          if (data.rates.EUR) next.EUR = data.rates.SAR / data.rates.EUR;
          if (data.rates.GBP) next.GBP = data.rates.SAR / data.rates.GBP;
        } else if (data.rates.SAR) {
          next.USD = data.rates.SAR;
        }
        next.SAR = 1;
        if (next.USD && next.USD < 2) next.USD = cfg.rates.USD || defaultCurrencyConfig.rates.USD;
        cfg.rates = next;
      }
      cfg.lastUpdated = new Date().toISOString();
      DB.set('settings', settings);
      logSystem('currency', 'تحديث أسعار الصرف', api.name);
      return { ok: true, api: api.name };
    } catch (e) { /* try next */ }
  }
  return { ok: false, offline: true };
}

function getCurrencyRateToSar(currency) {
  ensureExtSettings();
  const cur = String(currency || 'SAR').toUpperCase();
  if (cur === 'SAR') return 1;
  const cfg = settings.currency;
  const defaults = defaultCurrencyConfig.rates;
  let rate = cfg.rates?.[cur];
  if (!rate || rate <= 1) rate = defaults[cur] || defaults.USD || 3.75;
  return rate;
}

function convertForeignToBase(amount, currency) {
  ensureExtSettings();
  const cfg = settings.currency;
  const cur = (currency || 'SAR').toUpperCase();
  const amt = parseFloat(amount) || 0;
  if (cur === cfg.baseCurrency || cur === 'SAR') return { baseAmount: amt, rate: 1, fee: 0 };
  const rate = getCurrencyRateToSar(cur);
  let baseAmount = amt * rate;
  let fee = 0;
  if (cfg.feeMode === 'percent') fee = baseAmount * ((cfg.feePercent || 0) / 100);
  else if (cfg.feeMode === 'fixed') fee = cfg.feeFixed || 0;
  else if (cfg.feeMode === 'per100') fee = Math.ceil(amt / 100) * (cfg.feePer100 || 0) * rate;
  baseAmount -= fee;
  return { baseAmount: Math.max(0, baseAmount), rate, fee, offline: !cfg.lastUpdated };
}

function getForeignPaymentInfo() {
  const currency = document.getElementById('f-pay-currency')?.value || 'USD';
  const foreignAmt = parseFloat(document.getElementById('f-foreign-amt')?.value) || 0;
  const sarCash = parseFloat(document.getElementById('f-cash')?.value) || 0;
  const card = parseFloat(document.getElementById('f-card')?.value) || 0;
  const sessionTotal = (typeof getManualTotal === 'function' && getManualTotal() !== null)
    ? getManualTotal()
    : (typeof getAutoTotal === 'function' ? getAutoTotal() : 0);
  if (foreignAmt <= 0) {
    return { currency: 'SAR', foreignAmt: 0, sarEquiv: 0, sarCash, card, sessionTotal, changeSar: 0, totalPaidSar: sarCash + card };
  }
  const conv = convertForeignToBase(foreignAmt, currency);
  const totalPaidSar = conv.baseAmount + sarCash + card;
  const changeSar = Math.max(0, totalPaidSar - sessionTotal);
  const dueSar = Math.max(0, sessionTotal - totalPaidSar);
  return { currency, foreignAmt, sarEquiv: conv.baseAmount, rate: conv.rate, fee: conv.fee, sarCash, card, sessionTotal, changeSar, dueSar, totalPaidSar };
}

function updateCurrencyPaymentPreview() {
  const info = getForeignPaymentInfo();
  const el = document.getElementById('f-currency-preview');
  const changeWrap = document.getElementById('f-change-sar-wrap');
  const changeEl = document.getElementById('f-change-sar');
  if (!info.foreignAmt) {
    if (el) el.innerHTML = '';
    if (changeWrap) changeWrap.style.display = 'none';
    if (changeEl) changeEl.value = '';
    return;
  }
  const sym = { USD: '$', EUR: '€', GBP: '£' }[info.currency] || info.currency;
  const offlineNote = !navigator.onLine ? ' <span style="color:var(--text-muted)">(آخر سعر محفوظ)</span>' : '';
  if (el) {
    el.innerHTML = `مدفوع: <strong dir="ltr">${fmtNum(info.foreignAmt, 2)} ${sym}</strong> — يعادل <strong>${fmtMoney(info.sarEquiv)}</strong> (سعر ${fmtNum(info.rate, 4)})${info.fee > 0 ? ` — رسوم: ${fmtMoney(info.fee)}` : ''}${offlineNote}`;
  }
  if (changeWrap && changeEl) {
    if (info.changeSar > 0.01) {
      changeWrap.style.display = '';
      changeEl.value = parseFloat(info.changeSar.toFixed(2));
      changeEl.readOnly = false;
    } else if (info.dueSar > 0.01) {
      changeWrap.style.display = '';
      changeEl.value = '';
      changeEl.placeholder = `متبقي ${fmtMoney(info.dueSar)}`;
    } else {
      changeWrap.style.display = 'none';
      changeEl.value = '';
      changeEl.value = '';
    }
  }
  if (typeof calcPayment === 'function') calcPayment();
}

function applyForeignPaymentToCash() {
  notify('ℹ️ يُسجَّل المبلغ بالعملة الأجنبية مباشرة — الباقي بالريال يُحسب تلقائياً', 'info');
}

function fillDailyFormFromClientKey(key) {
  const map = typeof buildClientsMap === 'function' ? buildClientsMap() : {};
  const v = map[key];
  if (!v) return;
  if (typeof clearForm === 'function') clearForm();
  const nameEl = document.getElementById('f-name');
  const phoneEl = document.getElementById('f-phone');
  if (nameEl) nameEl.value = v.name || '';
  if (phoneEl) phoneEl.value = v.phone || '';
  const regEl = document.getElementById('f-registry-id');
  if (regEl) regEl.value = v.clientRegistryId || '';
  const fileEl = document.getElementById('f-file-no');
  if (fileEl && v.fileNo) fileEl.value = v.fileNo;
  const clientCases = typeof getCasesForClientKey === 'function'
    ? getCasesForClientKey(key)
    : (typeof cases !== 'undefined' ? cases : []).filter(c => (c.phone || c.name) === key)
        .sort((a, b) => b.date.localeCompare(a.date));
  const last = clientCases[0];
  if (last) {
    const idEl = document.getElementById('f-id');
    if (idEl) idEl.value = last.patientId || '';
    const natEl = document.getElementById('f-nationality');
    if (natEl && last.nationality) natEl.value = last.nationality;
    if (regEl && last.clientRegistryId) regEl.value = last.clientRegistryId;
  }
  if (typeof lookupClientForForm === 'function') lookupClientForForm('f');
  if (typeof showPage === 'function') showPage('daily');
}

function selectTopbarClientForDaily(key, name) {
  const suggest = document.getElementById('topbarSearchSuggest');
  const input = document.getElementById('topbarSearch');
  if (suggest) { suggest.hidden = true; suggest.innerHTML = ''; }
  if (input) input.value = '';
  if (typeof selectedClientKey !== 'undefined') selectedClientKey = key;
  if (typeof showPage === 'function') showPage('clients');
  const cs = document.getElementById('client-search');
  if (cs) cs.value = name;
  const sf = document.getElementById('client-search-field');
  if (sf) sf.value = 'name';
  const dm = document.getElementById('client-date-mode');
  if (dm) dm.value = 'all';
  if (typeof refreshClientsView === 'function') refreshClientsView();
  setTimeout(() => {
    const encKey = encodeURIComponent(key);
    const row = document.querySelector(`tr[data-client-key="${encKey}"]`);
    if (row) {
      row.classList.add('client-row-selected');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 80);
  notify(`📋 تم الانتقال إلى العميل: ${name}`, 'success');
}

function loadCurrencySettingsUI() {
  ensureExtSettings();
  const c = settings.currency;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('set-cur-base', c.baseCurrency || 'SAR');
  set('set-cur-fee-mode', c.feeMode || 'percent');
  set('set-cur-fee-pct', c.feePercent ?? 2.5);
  set('set-cur-fee-fixed', c.feeFixed ?? 0);
  set('set-cur-fee-per100', c.feePer100 ?? 5);
  const ratesEl = document.getElementById('set-cur-rates-display');
  if (ratesEl) {
    ratesEl.innerHTML = Object.entries(c.rates || {}).map(([k, v]) =>
      `<span class="tag tag-blue" style="margin:3px">${k}: ${fmtNum(v, 4)}</span>`
    ).join('') + (c.lastUpdated ? `<div style="font-size:11px;margin-top:6px;color:var(--text-muted)">آخر تحديث: ${new Date(c.lastUpdated).toLocaleString('ar-SA')}</div>` : '');
  }
}

function saveCurrencySettings() {
  if (!requirePermission('settings.edit', 'تعديل الإعدادات')) return;
  ensureExtSettings();
  settings.currency.feeMode = document.getElementById('set-cur-fee-mode')?.value || 'percent';
  settings.currency.feePercent = parseFloat(document.getElementById('set-cur-fee-pct')?.value) || 0;
  settings.currency.feeFixed = parseFloat(document.getElementById('set-cur-fee-fixed')?.value) || 0;
  settings.currency.feePer100 = parseFloat(document.getElementById('set-cur-fee-per100')?.value) || 0;
  DB.set('settings', settings);
  logAudit('CURRENCY_UPDATE', 'حفظ إعدادات العملات والرسوم', { section: 'currency' });
  notify('✅ تم حفظ إعدادات العملات');
}

function loadMessagingApiSettingsUI() {
  if (typeof loadCommunicationSettingsUI === 'function') return loadCommunicationSettingsUI();
  ensureExtSettings();
  const w = settings.messagingApi.whatsapp;
  const s = settings.messagingApi.sms;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  set('set-wa-api-url', w.apiUrl);
  set('set-wa-api-key', w.apiKey);
  set('set-wa-sender', w.senderId);
  set('set-sms-api-url', s.apiUrl);
  set('set-sms-api-key', s.apiKey);
  set('set-sms-sender', s.senderId);
}

function saveMessagingApiSettings() {
  if (typeof saveCommunicationSettings === 'function') return saveCommunicationSettings();
  if (!requirePermission('settings.edit', 'تعديل الإعدادات')) return;
  ensureExtSettings();
  settings.messagingApi.whatsapp.apiUrl = document.getElementById('set-wa-api-url')?.value.trim() || '';
  settings.messagingApi.whatsapp.apiKey = document.getElementById('set-wa-api-key')?.value.trim() || '';
  settings.messagingApi.whatsapp.senderId = document.getElementById('set-wa-sender')?.value.trim() || '';
  settings.messagingApi.sms.apiUrl = document.getElementById('set-sms-api-url')?.value.trim() || '';
  settings.messagingApi.sms.apiKey = document.getElementById('set-sms-api-key')?.value.trim() || '';
  settings.messagingApi.sms.senderId = document.getElementById('set-sms-sender')?.value.trim() || '';
  DB.set('settings', settings);
  logSystem('settings', 'حفظ إعدادات API الرسائل', '');
  notify('✅ تم حفظ إعدادات API');
}

// ── CASH FLOAT ──
function persistCashDrawerSession() {
  if (cashDrawerSession && typeof cashDrawerSession === 'object') {
    cashDrawerSession.updatedAt = new Date().toISOString();
    if (typeof BranchDataIsolation !== 'undefined' && BranchDataIsolation.stampBranchId) {
      BranchDataIsolation.stampBranchId(cashDrawerSession);
    }
  }
  DB.set('cashDrawerSession', cashDrawerSession);
  try { SyncEngine?.schedulePush?.('cashDrawerSession'); } catch { /* empty */ }
}

function getTodayCashSession() {
  const today = new Date().toISOString().split('T')[0];
  if (!cashDrawerSession || cashDrawerSession.date !== today) {
    ensureExtSettings();
    cashDrawerSession = {
      date: today,
      openingFloat: settings.cashFloat.defaultOpeningFloat || 500,
      denominations: {},
      foreign: { USD: 0, EUR: 0 },
      movements: [],
      openedAt: new Date().toISOString(),
      openedBy: currentUser ? currentUser.fullName : '—',
      updatedAt: new Date().toISOString()
    };
    persistCashDrawerSession();
  }
  return cashDrawerSession;
}

function calcCashSessionBalance() {
  const s = getTodayCashSession();
  let balance = s.openingFloat || 0;
  (s.movements || []).forEach(m => { balance += m.amount || 0; });
  return balance;
}

function recordCashMovement(amount, reason, meta, skipPermCheck) {
  if (!skipPermCheck && !requirePermission('cash.edit', 'إدارة عهدة الكاش')) return;
  const s = getTodayCashSession();
  s.movements.unshift({
    id: Date.now().toString(),
    at: new Date().toISOString(),
    amount,
    reason,
    meta: meta || {},
    user: currentUser ? currentUser.fullName : '—'
  });
  persistCashDrawerSession();
  logSystem('cash', reason, fmtMoney(Math.abs(amount)), meta);
  refreshCashFloatPage();
}

function onCasePaymentRecorded(c) {
  ensureExtSettings();
  if (!settings.cashFloat.enabled) return;
  const s = getTodayCashSession();
  if (!s.foreign) s.foreign = { USD: 0, EUR: 0, GBP: 0 };

  if (c.foreignAmount > 0 && c.payCurrency && c.payCurrency !== 'SAR') {
    s.foreign[c.payCurrency] = (s.foreign[c.payCurrency] || 0) + c.foreignAmount;
    s.movements.unshift({
      id: Date.now().toString(),
      at: new Date().toISOString(),
      amount: 0,
      foreignAmount: c.foreignAmount,
      foreignCurrency: c.payCurrency,
      reason: `تحصيل ${c.foreignAmount} ${c.payCurrency} — فاتورة ${c.invoice || ''}`,
      meta: { caseId: c.id, type: 'foreign_in' },
      user: currentUser ? currentUser.fullName : '—'
    });
  }
  const sarCash = parseFloat(c.cash) || 0;
  if (sarCash > 0) {
    s.movements.unshift({
      id: (Date.now() + 1).toString(),
      at: new Date().toISOString(),
      amount: sarCash,
      reason: `تحصيل كاش ﷼ — فاتورة ${c.invoice || ''}`,
      meta: { caseId: c.id, type: 'in' },
      user: currentUser ? currentUser.fullName : '—'
    });
  }
  const change = parseFloat(c.changeReturned) || 0;
  if (change > 0) {
    s.movements.unshift({
      id: (Date.now() + 2).toString(),
      at: new Date().toISOString(),
      amount: -change,
      reason: `باقي للعميل بالريال — ${c.name || ''}`,
      meta: { caseId: c.id, type: 'change' },
      user: currentUser ? currentUser.fullName : '—'
    });
  }
  persistCashDrawerSession();
  logAudit('CASH_MOVEMENT', `فاتورة ${c.invoice}: ${c.foreignAmount ? c.foreignAmount + ' ' + c.payCurrency : ''} ${change ? 'باقي ' + fmtMoney(change) : ''}`.trim());
  refreshCashFloatPage();
}

function onCaseCashPayment(c, cashAmount, changeGiven) {
  onCasePaymentRecorded(c);
}

function refreshCashFloatPage() {
  ensureExtSettings();
  const s = getTodayCashSession();
  let balance = s.openingFloat || 0;
  (s.movements || []).forEach(m => { if (m.amount) balance += m.amount; });
  const openEl = document.getElementById('cash-opening');
  const balEl = document.getElementById('cash-balance');
  const foreignEl = document.getElementById('cash-foreign-balances');
  const movEl = document.getElementById('cashMovementsBody');
  if (openEl) openEl.textContent = fmtMoney(s.openingFloat || 0);
  if (balEl) balEl.textContent = fmtMoney(balance);
  if (foreignEl && s.foreign) {
    foreignEl.innerHTML = Object.entries(s.foreign).filter(([, v]) => v > 0)
      .map(([k, v]) => `<span class="tag tag-blue" style="margin:3px">${k}: ${fmtNum(v, 2)}</span>`).join('') || '<span style="color:var(--text-muted);font-size:13px">لا عملات أجنبية</span>';
  }
  if (!movEl) return;
  if (!s.movements.length) {
    movEl.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-light)">لا حركات اليوم</td></tr>';
    return;
  }
  movEl.innerHTML = s.movements.map(m => {
    const dt = formatLogDateTime(m.at);
    const amtCell = m.foreignAmount
      ? `<span dir="ltr" style="color:var(--success);font-weight:700">+${fmtNum(m.foreignAmount, 2)} ${m.foreignCurrency}</span>`
      : `<span dir="ltr" style="color:${m.amount >= 0 ? 'var(--success)' : 'var(--danger)'};font-weight:700">${m.amount >= 0 ? '+' : ''}${fmtMoney(m.amount)}</span>`;
    return `<tr>
      <td dir="ltr" style="font-size:12px">${dt.line}</td>
      <td>${amtCell}</td>
      <td>${m.reason}</td>
      <td>${m.user}</td>
      <td style="font-size:11px;color:var(--text-muted)">${m.meta?.caseId ? 'فاتورة' : '—'}</td>
    </tr>`;
  }).join('');
}

function setCashOpeningFloat() {
  if (!requirePermission('cash.edit', 'إدارة عهدة الكاش')) return;
  const val = parseFloat(document.getElementById('cash-set-opening')?.value);
  if (isNaN(val) || val < 0) { notify('⚠️ أدخل قيمة صحيحة', 'danger'); return; }
  const s = getTodayCashSession();
  s.openingFloat = val;
  persistCashDrawerSession();
  refreshCashFloatPage();
  notify('✅ تم تعيين عهدة الافتتاح');
}

function cashEndOfDayWithdraw() {
  if (!requirePermission('cash.edit', 'إدارة عهدة الكاش')) return;
  const bal = calcCashSessionBalance();
  const keep = parseFloat(document.getElementById('cash-keep-float')?.value) || settings.cashFloat.defaultOpeningFloat || 500;
  const withdraw = bal - keep;
  if (withdraw <= 0) { notify('⚠️ لا يوجد فائض للسحب', 'danger'); return; }
  if (!confirm(`سحب ${fmtMoney(withdraw)} وإبقاء ${fmtMoney(keep)} في الدرج؟`)) return;
  recordCashMovement(-withdraw, 'سحب نهاية اليوم — فائض العهدة', { type: 'eod' });
  notify('✅ تم سحب الفائض');
}

function cashResetToday() {
  if (!requirePermission('cash.edit', 'إدارة عهدة الكاش')) return;
  if (!confirm('إعادة تهيئة عهدة اليوم؟')) return;
  cashDrawerSession = null;
  getTodayCashSession();
  refreshCashFloatPage();
  notify('✅ تمت إعادة تهيئة عهدة اليوم');
}

// ── SYSTEM LOGS PAGE ──
const LOG_CAT_VALUE_MAP = {
  patients: 'المرضى',
  cases: 'السجل اليومي',
  daily: 'السجل اليومي',
  bookings: 'الحجوزات',
  packages: 'الباقات',
  users: 'المستخدمين',
  finance: 'المالية',
  inventory: 'المخزون',
  system: 'النظام'
};

function initLogsOpTypeFilter() {
  const opSel = document.getElementById('logs-op-type');
  if (!opSel || opSel.dataset.inited) return;
  opSel.dataset.inited = '1';
  opSel.innerHTML = '<option value="">كل العمليات</option>' +
    Object.entries(LOG_OP_META).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
}

function renderLogTableRow(l) {
  const dt = formatLogDateTime(l.at);
  const meta = LOG_OP_META[l.opType] || {};
  const catKey = (l.legacyCategory || l.category || 'system').toLowerCase();
  const catClass = {
    'المرضى': 'log-row-cat-patients', patients: 'log-row-cat-patients',
    'السجل اليومي': 'log-row-cat-cases', cases: 'log-row-cat-cases',
    'الحجوزات': 'log-row-cat-bookings', bookings: 'log-row-cat-bookings',
    'الباقات': 'log-row-cat-packages', packages: 'log-row-cat-packages',
    'المستخدمين': 'log-row-cat-users', users: 'log-row-cat-users',
    'المالية': 'log-row-cat-finance', finance: 'log-row-cat-finance',
    'المخزون': 'log-row-cat-inventory', inventory: 'log-row-cat-inventory',
    'النظام': 'log-row-cat-system', system: 'log-row-cat-system',
  }[l.category] || `log-row-cat-${catKey}` || 'log-row-cat-system';
  const title = l.action || meta.label || l.opType || '—';
  const desc = l.description || l.detail || '—';
  return `<tr class="${catClass}">
    <td dir="ltr" style="font-size:11px;white-space:nowrap">${dt.line}</td>
    <td><span class="tag tag-gray" style="font-size:10px">${l.category || '—'}</span></td>
    <td style="font-size:11px;font-weight:700">${title}</td>
    <td style="font-size:11px">${l.user || '—'}</td>
    <td class="log-desc" title="${String(desc).replace(/"/g, '&quot;')}">${desc}</td>
    <td dir="ltr" style="font-size:10px;color:var(--text-muted)">${(l.id || '').slice(-6)}</td>
  </tr>`;
}

let systemLogsPage = 1;
const LOGS_PAGE_SIZE_OPTIONS = [20, 10, 25, 50, 100];

function getLogsPageSize() {
  const n = parseInt(DB.get('logsPageSize', 20), 10);
  return LOGS_PAGE_SIZE_OPTIONS.includes(n) ? n : 20;
}

function setLogsPageSize(n) {
  const size = LOGS_PAGE_SIZE_OPTIONS.includes(parseInt(n, 10)) ? parseInt(n, 10) : 20;
  DB.set('logsPageSize', size);
}

function paginateLogsList(arr, page) {
  const pageSize = getLogsPageSize();
  const total = arr.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), totalPages);
  return {
    items: arr.slice((p - 1) * pageSize, p * pageSize),
    page: p,
    totalPages,
    total,
    pageSize,
  };
}

function renderLogsPagination(page, totalPages, totalItems) {
  const el = document.getElementById('logsPagination');
  if (!el) return;
  if (!totalItems) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'flex';
  const curSize = getLogsPageSize();
  const sizeOpts = LOGS_PAGE_SIZE_OPTIONS.map(n =>
    `<option value="${n}"${n === curSize ? ' selected' : ''}>${n}</option>`
  ).join('');
  let btns = `<label class="pg-size">عرض<select onchange="onLogsPageSizeChange(this.value)">${sizeOpts}</select></label>`;
  if (totalPages > 1) {
    btns += `<button type="button" class="pg-btn" ${page <= 1 ? 'disabled' : ''} onclick="goSystemLogsPage(${page - 1})">‹ السابق</button>`;
    const windowSize = 5;
    let start = Math.max(1, page - Math.floor(windowSize / 2));
    let end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    for (let p = start; p <= end; p++) {
      btns += `<button type="button" class="pg-btn${p === page ? ' active' : ''}" onclick="goSystemLogsPage(${p})">${p}</button>`;
    }
    btns += `<button type="button" class="pg-btn" ${page >= totalPages ? 'disabled' : ''} onclick="goSystemLogsPage(${page + 1})">التالي ›</button>`;
    btns += `<label class="pg-jump">انتقل إلى<input type="number" min="1" max="${totalPages}" value="${page}" onkeydown="if(event.key==='Enter')goSystemLogsPage(this.value)"></label>`;
  }
  btns += `<span class="pg-info">${totalItems} سجل${totalPages > 1 ? ` — صفحة ${page} من ${totalPages}` : ''}</span>`;
  el.innerHTML = btns;
}

function getFilteredSystemLogs() {
  systemLogs = DB.get('systemLogs', systemLogs);
  const catKey = document.getElementById('logs-filter-cat')?.value || '';
  const opType = document.getElementById('logs-op-type')?.value || '';
  const search = (document.getElementById('logs-search')?.value || '').trim().toLowerCase();
  const sortOrder = document.getElementById('logs-sort-order')?.value || 'desc';
  let rows = systemLogs.slice();
  if (typeof BranchDataIsolation !== 'undefined' && BranchDataIsolation.filterLogsForView) {
    rows = BranchDataIsolation.filterLogsForView(rows);
  }
  if (catKey) {
    const catAr = LOG_CAT_VALUE_MAP[catKey] || catKey;
    rows = rows.filter(l => l.category === catAr || l.legacyCategory === catKey);
  }
  if (opType) rows = rows.filter(l => l.opType === opType);
  if (search) {
    rows = rows.filter(l => {
      const hay = [l.id, l.user, l.description, l.detail, l.action, l.category, l.patient, l.invoice, l.opType]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(search);
    });
  }
  rows.sort((a, b) => {
    const cmp = (b.at || '').localeCompare(a.at || '');
    return sortOrder === 'asc' ? -cmp : cmp;
  });
  return rows;
}

function goSystemLogsPage(page) {
  systemLogsPage = Math.max(1, parseInt(page, 10) || 1);
  refreshSystemLogsPage(false);
}

function onLogsPageSizeChange(size) {
  setLogsPageSize(size);
  systemLogsPage = 1;
  refreshSystemLogsPage(false);
}

function refreshSystemLogsPage(resetPage) {
  if (resetPage !== false) systemLogsPage = 1;
  initLogsOpTypeFilter();
  const tbody = document.getElementById('systemLogsBody');
  if (!tbody) return;
  let rows = getFilteredSystemLogs();
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-light)">لا توجد سجلات مطابقة</td></tr>`;
    renderLogsPagination(1, 0, 0);
    return;
  }
  const pg = paginateLogsList(rows, systemLogsPage);
  systemLogsPage = pg.page;
  renderLogsPagination(pg.page, pg.totalPages, pg.total);
  tbody.innerHTML = pg.items.map(renderLogTableRow).join('');
}

function clearSystemLogs() {
  if (!requirePermission('users.manage', 'مسح السجلات')) return;
  if (!confirm('مسح كل سجلات النظام؟')) return;
  systemLogs = [];
  DB.set('systemLogs', systemLogs);
  refreshSystemLogsPage();
  notify('🗑️ تم مسح السجلات', 'danger');
}

// ── PAYROLL: unpaid leave deduction ──
function calcUnpaidLeaveDeduction(docAtt, dayVal) {
  const unpaidTypes = ['leave', 'sick', 'weekly', 'annual'];
  const unpaidDays = docAtt.filter(a => unpaidTypes.includes(a.type) && a.leavePaid === 'unpaid').length;
  const deduct = unpaidDays * (dayVal || 0);
  return { unpaidDays, deduct };
}

function renderPayrollDeductionRows(docAtt, dayVal, doc) {
  const absentDays = docAtt.filter(a => a.type === 'absent').length;
  const absentDeduct = absentDays * (dayVal || 0);
  const { unpaidDays, deduct: leaveDeduct } = calcUnpaidLeaveDeduction(docAtt, dayVal);
  let html = '';
  if (absentDeduct > 0) {
    html += `<div class="payroll-row" style="color:var(--danger)">
      <span>❌ خصم الغياب (${fmtNum(absentDays, 0)} يوم × ${fmtMoney(dayVal)})</span>
      <span dir="ltr">- ${fmtMoney(absentDeduct)}</span></div>`;
  }
  if (leaveDeduct > 0) {
    html += `<div class="payroll-row" style="color:var(--danger)">
      <span>📅 خصم إجازات غير مدفوعة (${fmtNum(unpaidDays, 0)} يوم × ${fmtMoney(dayVal)})</span>
      <span dir="ltr">- ${fmtMoney(leaveDeduct)}</span></div>`;
  }
  let attPolDeduct = 0;
  if (typeof renderAttendanceDeductionRows === 'function' && doc) {
    const ar = renderAttendanceDeductionRows(docAtt, doc);
    html += ar.html || '';
    attPolDeduct = ar.total || 0;
  }
  return { html, totalDeduct: absentDeduct + leaveDeduct + attPolDeduct, absentDays, unpaidDays, attPolDeduct };
}

// ── USER PERMISSIONS UI ──
function permLevelFromFlat(perms, mod) {
  if (!perms || !mod.view || !perms[mod.view]) return 'hidden';
  if (mod.edit && perms[mod.edit]) return 'full';
  return 'view';
}

function flatPermsFromLevel(level, mod, target) {
  if (!mod.view) return;
  if (level === 'hidden') {
    target[mod.view] = false;
    if (mod.edit) target[mod.edit] = false;
  } else if (level === 'view') {
    target[mod.view] = true;
    if (mod.edit) target[mod.edit] = false;
  } else {
    target[mod.view] = true;
    if (mod.edit) target[mod.edit] = true;
  }
}

function renderPagePermissionMatrix(selected, readOnly) {
  const el = document.getElementById('um-permissions-grid');
  if (!el) return;
  const perms = selected || {};
  const role = document.getElementById('um-role')?.value;
  const modules = PAGE_ACCESS_MODULES.filter(m => !m.adminOnly || role === 'custom');
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 140px;gap:8px;padding:4px 0 8px;font-size:11px;font-weight:800;color:var(--text-muted);border-bottom:1px solid var(--border)">
      <span>الصفحة</span><span>الصلاحية</span>
    </div>` +
    modules.map(mod => {
      const level = permLevelFromFlat(perms, mod);
      const dis = readOnly ? 'disabled' : '';
      return `<div style="display:grid;grid-template-columns:1fr 140px;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600">${mod.label}</span>
        <select class="form-control um-page-access" data-mod="${mod.id}" ${dis} style="padding:6px 8px;font-size:12px">
          <option value="hidden" ${level === 'hidden' ? 'selected' : ''}>مخفية</option>
          <option value="view" ${level === 'view' ? 'selected' : ''}>قراءة فقط</option>
          <option value="full" ${level === 'full' ? 'selected' : ''}>عرض وتعديل</option>
        </select>
      </div>`;
    }).join('');
}

function renderPermissionCheckboxes(selected) {
  renderPagePermissionMatrix(selected, false);
}

function collectPagePermissionsFromUI() {
  const perms = {};
  PAGE_ACCESS_MODULES.forEach(mod => {
    const sel = document.querySelector(`.um-page-access[data-mod="${mod.id}"]`);
    flatPermsFromLevel(sel?.value || 'hidden', mod, perms);
  });
  return perms;
}

function toggleCustomPermissionsRow() {
  const role = document.getElementById('um-role')?.value;
  const row = document.getElementById('um-custom-perms-row');
  const titleRow = document.getElementById('um-custom-title-row');
  if (row) row.style.display = (role === 'custom' || role === 'accountant') ? '' : 'none';
  if (titleRow) titleRow.style.display = (role === 'custom' || role === 'accountant') ? '' : 'none';
  if (role === 'accountant') renderPagePermissionMatrix(ROLE_PRESETS.accountant, true);
  else if (role === 'custom') renderPagePermissionMatrix({}, false);
  toggleDoctorLinkRow();
}

function collectUserPermissions() {
  const role = document.getElementById('um-role')?.value;
  if (role === 'admin') return null;
  if (role === 'accountant') return { ...ROLE_PRESETS.accountant };
  if (role !== 'custom') return null;
  return collectPagePermissionsFromUI();
}

function extInit() {
  ensureExtSettings();
  if (settings.inventory.enabled && !inventoryItems.length) seedHijamaInventory();
}

function extBackupData(data) {
  data.inventoryItems = inventoryItems;
  data.inventorySuppliers = inventorySuppliers;
  data.inventoryMovements = inventoryMovements;
  data.systemLogs = systemLogs;
  data.cashDrawerSession = cashDrawerSession;
  data.employeeLeaveRequests = DB.get('employeeLeaveRequests', []);
  data.employeeLedgerAccruals = DB.get('employeeLedgerAccruals', []);
  data.employeeLedgerPayments = DB.get('employeeLedgerPayments', []);
  data.employeeLedgerEntries = DB.get('employeeLedgerEntries', []);
  if (typeof importHistory !== 'undefined') data.importHistory = importHistory;
  else data.importHistory = DB.get('importHistory', []);
}

function extRestoreData(data) {
  // Inventory is merged via RestoreStaging — do not overwrite here.
  if (data.systemLogs) { systemLogs = data.systemLogs; DB.set('systemLogs', systemLogs); }
  if (data.cashDrawerSession) { cashDrawerSession = data.cashDrawerSession; DB.set('cashDrawerSession', cashDrawerSession); }
  if (data.importHistory) {
    importHistory = data.importHistory;
    DB.set('importHistory', importHistory);
  }
  if (typeof extRestoreLeaveData === 'function') extRestoreLeaveData(data);
  if (typeof extRestoreLedgerData === 'function') extRestoreLedgerData(data);
  ensureExtSettings();
}
