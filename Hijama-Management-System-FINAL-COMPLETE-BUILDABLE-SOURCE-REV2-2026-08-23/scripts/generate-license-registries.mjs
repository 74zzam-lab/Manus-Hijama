#!/usr/bin/env node
/**
 * Generates license registries from FEATURE_REGISTRY in index.html (v1.2.0-approved).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'index.html');
const OUT_REGISTRIES = path.join(ROOT, 'license', 'registries');
const OUT_DATA = path.join(ROOT, 'license', 'data');
const OUT_LICENSE_INDEX = path.join(OUT_DATA, 'license-registry', 'index.json');
const OUT_AUDIT_LOG = path.join(OUT_DATA, 'audit-log.json');

const LIC_SECRETS = ['TDW', '2026', 'Hj@', 'مة'];
const REGISTRY_VERSION = '1.2.0';
const SCHEMA_VERSION = 1;
const OPT_IN_KEYS = new Set([
  'sys_setup_wizard',
  'sys_product_tour',
  'sys_health_check',
  'sys_readiness',
  'sys_integrity',
  'tech_gateway',
]);
const EXCLUDED_OPT_IN = ['062', '063', '064', '065', '066'];

/** v1.2 approved category per feature key (§4.2) */
const KEY_CATEGORY = {
  core_dashboard: 'core',
  core_pos: 'core',
  core_clients: 'core',
  core_staff: 'core',
  core_packages: 'core',
  core_users: 'core',
  core_settings: 'core',
  core_employee: 'core',
  book_schedule: 'booking',
  book_confirm: 'booking',
  book_no_show: 'booking',
  dash_book_kpi: 'booking',
  pos_shared_pkg: 'pos',
  pos_multi_svc: 'pos',
  pos_receipt: 'pos',
  msg_templates: 'communication',
  msg_bulk: 'communication',
  msg_auto: 'communication',
  msg_retention: 'communication',
  dash_msg_alert: 'communication',
  crm_invoice_search: 'crm',
  crm_search: 'crm',
  ops_client_file: 'crm',
  ops_map_editor: 'crm',
  rep_monthly: 'reports',
  rep_doctors: 'reports',
  rep_vat: 'reports',
  rep_zreport: 'reports',
  rep_profitability: 'reports',
  rep_sales: 'reports',
  rep_thermal_period: 'reports',
  rep_archive_a4: 'reports',
  tech_print_pdf: 'reports',
  exp_track: 'finance',
  exp_budget: 'finance',
  dash_exp_kpi: 'finance',
  pkg_bank: 'finance',
  fin_currency: 'finance',
  fin_cashfloat: 'finance',
  ops_inventory: 'inventory',
  att_daily: 'hr',
  att_leave: 'hr',
  hr_leave_requests: 'hr',
  att_overtime: 'hr',
  pay_salary: 'payroll',
  pay_commission: 'payroll',
  hr_ledger: 'payroll',
  att_report: 'hr',
  att_policy: 'hr',
  pkg_commissions: 'payroll',
  hw_drawer: 'hardware',
  hw_thermal: 'hardware',
  hw_status: 'hardware',
  bk_local: 'backup',
  bk_custom: 'backup',
  bk_cloud: 'backup',
  bk_drive: 'backup',
  cloud_multi_device: 'backup',
  cloud_owner_hub: 'backup',
  tech_import: 'developer',
  tech_msg_api: 'communication',
  tech_gateway: 'developer',
  hr_leave_balance: 'hr',
  sys_setup_wizard: 'diagnostics',
  sys_product_tour: 'diagnostics',
  sys_health_check: 'diagnostics',
  sys_readiness: 'diagnostics',
  sys_integrity: 'diagnostics',
  sys_logs: 'developer',
  lux_queue_board: 'queue',
  lux_queue_print: 'queue',
  lux_queue_display: 'queue',
  lux_vip: 'pos',
  lux_rush: 'pos',
};

const GROUP_CATEGORY = {
  core: 'core',
  patients_visits: 'patients_visits',
  reports_print: 'reports',
  advanced: 'advanced',
  hr_payroll: 'hr',
  developer_tools: 'developer',
  backup_restore: 'backup',
  communication: 'communication',
  diagnostics: 'diagnostics',
};

const CAP_TO_COMMERCIAL = {
  cap_booking: 'cap_booking',
  cap_pos_shared: 'cap_pos',
  cap_pos_multi: 'cap_pos',
  cap_pos_receipt: 'cap_pos',
  cap_crm: 'cap_communication',
  cap_reports: 'cap_reports',
  cap_finance: 'cap_finance',
  cap_cashfloat: 'cap_finance',
  cap_inventory: 'cap_finance',
  cap_hr_att: 'cap_hr',
  cap_hr_pay: 'cap_hr',
  cap_hw: 'cap_diagnostics',
  cap_backup: 'cap_backup',
  cap_import: 'cap_diagnostics',
  cap_msg_api: 'cap_communication',
  cap_sys_tools: 'cap_diagnostics',
  cap_audit: 'cap_diagnostics',
  cap_queue: 'cap_pos',
  cap_lux_ops: 'cap_pos',
  cap_cloud: 'cap_backup',
};

const CORE_CAPABILITY = {
  core_dashboard: [],
  core_pos: ['cap_pos'],
  core_clients: ['cap_communication'],
  core_staff: ['cap_hr'],
  core_packages: ['cap_finance'],
  core_users: [],
  core_settings: ['cap_diagnostics'],
  core_employee: ['cap_hr'],
};

const PAGE_MODULES = {
  bookings: 'bookings',
  messages: 'messages',
  reports: 'reports',
  expenses: 'expenses',
  attendance: 'attendance',
  payroll: 'payroll',
  inventory: 'inventory',
  cashfloat: 'cashfloat',
  logs: 'logs',
  search: 'search',
};

const DEVELOPER_ONLY_KEYS = new Set(['tech_gateway', 'sys_logs']);
const INTERNAL_KEYS = new Set(['crm_search']);
const HIDDEN_KEYS = new Set(['crm_search']);

function sortKeysDeep(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortKeysDeep(value[key]);
      return acc;
    }, {});
}

function canonicalJSON(obj) {
  return JSON.stringify(sortKeysDeep(obj));
}

function getSigningKey() {
  const material = LIC_SECRETS.join('|') + '|TADAWI_OFFLINE_LIC_V4';
  const salt = 'TadawiMadina_LIC_SALT_2026';
  return crypto.pbkdf2Sync(material, salt, 150000, 32, 'sha256');
}

function computeRegistrySig(body) {
  return crypto.createHmac('sha256', getSigningKey()).update(canonicalJSON(body)).digest('hex');
}

function withRegistrySig(body) {
  return { ...body, registrySig: computeRegistrySig(body) };
}

function padId(num, width = 3) {
  return String(num).padStart(width, '0');
}

function keyToUuid(key) {
  const hash = crypto.createHash('sha256').update(`tadawi-feature:${key}`).digest('hex');
  const variant = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${variant}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

function keyToNameEn(key) {
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function resolvePage(module) {
  return PAGE_MODULES[module] || module;
}

function resolveCategory(feature) {
  return KEY_CATEGORY[feature.id] || GROUP_CATEGORY[feature.group] || feature.group;
}

function resolveCapabilityIds(feature) {
  if (feature.tier === 'core') {
    return CORE_CAPABILITY[feature.id] || [];
  }
  if (!feature.cap) return [];
  const commercial = CAP_TO_COMMERCIAL[feature.cap];
  return commercial ? [commercial] : [];
}

function parseFeatureRegistry(html) {
  const match = html.match(/const FEATURE_REGISTRY = \[([\s\S]*?)\n\];/);
  if (!match) throw new Error('FEATURE_REGISTRY not found in index.html');
  const features = new Function(`return [${match[1]}];`)();
  if (!Array.isArray(features) || features.length === 0) {
    throw new Error('FEATURE_REGISTRY parse returned empty array');
  }
  return features;
}

function buildFeatureRegistry(sourceFeatures, generatedAt) {
  const features = sourceFeatures.map((feature, index) => {
    const id = padId(index + 1);
    const optIn = OPT_IN_KEYS.has(feature.id);
    const developerOnly = DEVELOPER_ONLY_KEYS.has(feature.id);
    const internal = INTERNAL_KEYS.has(feature.id);
    const visibility = HIDDEN_KEYS.has(feature.id) ? 'hidden' : 'public';

    return {
      id,
      uuid: keyToUuid(feature.id),
      key: feature.id,
      name: feature.label,
      nameEn: keyToNameEn(feature.id),
      category: resolveCategory(feature),
      capabilityIds: resolveCapabilityIds(feature),
      description: feature.tagline || '',
      defaultPackage: '01',
      visibility,
      internal,
      developerOnly,
      optIn,
      unique: !!feature.unique,
      module: feature.module,
      page: resolvePage(feature.module),
      deprecated: false,
    };
  });

  return withRegistrySig({
    schemaVersion: SCHEMA_VERSION,
    registryVersion: REGISTRY_VERSION,
    generatedAt,
    migratedFrom: null,
    features,
  });
}

function buildCapabilityRegistry(features, generatedAt) {
  const capDefs = [
    {
      id: 'cap_pos',
      internalName: 'pos',
      displayName: 'Point of Sale',
      displayNameAr: 'نقطة البيع',
      description: 'تسجيل الجلسات، الفواتير، VIP، الذروة، الترقيم',
    },
    {
      id: 'cap_booking',
      internalName: 'booking',
      displayName: 'Booking & Scheduling',
      displayNameAr: 'الحجوزات والجدولة',
      description: 'جدولة المواعيد وتأكيدها ومؤشرات الحجز',
    },
    {
      id: 'cap_hr',
      internalName: 'hr_payroll',
      displayName: 'HR & Payroll',
      displayNameAr: 'الموارد البشرية والرواتب',
      description: 'الحضور، الإجازات، الرواتب، العمولات',
    },
    {
      id: 'cap_reports',
      internalName: 'reports',
      displayName: 'Reports & Printing',
      displayNameAr: 'التقارير والطباعة',
      description: 'تقارير تشغيلية وضريبية وطباعة PDF',
    },
    {
      id: 'cap_finance',
      internalName: 'finance',
      displayName: 'Finance & Expenses',
      displayNameAr: 'المالية والمصروفات',
      description: 'نفقات، ميزانية، بنوك، مخزون، عهدة كاش',
    },
    {
      id: 'cap_backup',
      internalName: 'backup',
      displayName: 'Backup & Restore',
      displayNameAr: 'النسخ الاحتياطي',
      description: 'نسخ محلي وسحابي ومزامنة',
    },
    {
      id: 'cap_communication',
      internalName: 'communication',
      displayName: 'CRM & Communication',
      displayNameAr: 'العملاء والتواصل',
      description: 'رسائل، CRM، بحث، ملفات العملاء، API',
    },
    {
      id: 'cap_diagnostics',
      internalName: 'diagnostics',
      displayName: 'Diagnostics & Developer Tools',
      displayNameAr: 'التشخيص وأدوات المطور',
      description: 'جاهزية النظام، أجهزة، استيراد، سجلات',
    },
  ];

  const byCap = Object.fromEntries(capDefs.map((cap) => [cap.id, []]));
  for (const feature of features) {
    for (const capId of feature.capabilityIds) {
      if (byCap[capId]) byCap[capId].push(feature.id);
    }
  }

  const capabilities = capDefs.map((cap) => ({
    ...cap,
    featureIds: [...new Set(byCap[cap.id])].sort(),
  }));

  return withRegistrySig({
    schemaVersion: SCHEMA_VERSION,
    registryVersion: REGISTRY_VERSION,
    generatedAt,
    migratedFrom: null,
    capabilities,
  });
}

function buildPackageRegistry(generatedAt) {
  const packages = [
    {
      id: '01',
      internalName: 'starter',
      displayName: 'Starter',
      displayNameAr: 'بداية',
      color: '#27ae60',
      icon: '🌱',
      inherits: null,
      capabilityIds: [],
      featureIds: ['009', '010', '011', '015', '016', '025', '027', '028', '052', '054'],
      excludedOptIn: EXCLUDED_OPT_IN,
      devices: 1,
      branches: 1,
      maxUsers: 10,
      price: null,
      visible: true,
      order: 1,
    },
    {
      id: '02',
      internalName: 'standard',
      displayName: 'Standard',
      displayNameAr: 'قياسي',
      color: '#3498db',
      icon: '📦',
      inherits: '01',
      capabilityIds: [],
      featureIds: ['012', '014', '021', '026', '029', '033', '041', '042', '045', '048', '055', '062'],
      excludedOptIn: EXCLUDED_OPT_IN,
      devices: 2,
      branches: 1,
      maxUsers: 12,
      price: null,
      visible: true,
      order: 2,
    },
    {
      id: '03',
      internalName: 'professional',
      displayName: 'Professional',
      displayNameAr: 'احترافي',
      color: '#2980b9',
      icon: '💼',
      inherits: '02',
      capabilityIds: ['cap_hr', 'cap_reports', 'cap_finance'],
      featureIds: [
        '017', '018', '019', '020', '023', '030', '031', '032', '034', '035', '036', '037', '039',
        '043', '044', '046', '047', '049', '050', '056',
      ],
      excludedOptIn: EXCLUDED_OPT_IN,
      devices: 3,
      branches: 2,
      maxUsers: 15,
      price: null,
      visible: true,
      order: 3,
    },
    {
      id: '04',
      internalName: 'enterprise',
      displayName: 'Enterprise',
      displayNameAr: 'مؤسسي',
      color: '#8e44ad',
      icon: '🏢',
      inherits: '03',
      capabilityIds: ['cap_backup', 'cap_communication'],
      featureIds: [
        '013', '024', '038', '040', '051', '053', '057', '058', '059', '065', '067', '068', '069',
        '070', '071', '072', '073', '074',
      ],
      excludedOptIn: EXCLUDED_OPT_IN,
      devices: 5,
      branches: 5,
      maxUsers: 30,
      price: null,
      visible: true,
      order: 4,
    },
    {
      id: '05',
      internalName: 'ultimate',
      displayName: 'Ultimate',
      displayNameAr: 'شامل',
      color: '#c0392b',
      icon: '👑',
      inherits: '04',
      capabilityIds: [],
      featureIds: ['022', '061'],
      excludedOptIn: EXCLUDED_OPT_IN,
      devices: 0,
      branches: 0,
      maxUsers: 0,
      price: null,
      visible: true,
      order: 5,
    },
    {
      id: '06',
      internalName: 'developer',
      displayName: 'Developer',
      displayNameAr: 'مطور',
      color: '#2c3e50',
      icon: '🛠️',
      inherits: '05',
      capabilityIds: ['cap_diagnostics'],
      featureIds: ['060', '063', '064', '066'],
      excludedOptIn: [],
      devices: 0,
      branches: 0,
      maxUsers: 0,
      price: null,
      visible: false,
      order: 6,
    },
    {
      id: '99',
      internalName: 'custom',
      displayName: 'Custom',
      displayNameAr: 'مخصص',
      color: '#7f8c8d',
      icon: '⚙️',
      inherits: null,
      capabilityIds: [],
      featureIds: [],
      excludedOptIn: [],
      devices: null,
      branches: null,
      maxUsers: null,
      price: null,
      visible: false,
      order: 99,
    },
  ];

  return withRegistrySig({
    schemaVersion: SCHEMA_VERSION,
    registryVersion: REGISTRY_VERSION,
    generatedAt,
    migratedFrom: null,
    packages,
  });
}

function buildSubscriptionRegistry(generatedAt) {
  const subscriptions = [
    { id: '01', key: 'trial', name: 'تجريبي', nameEn: 'Trial', days: 7, renewable: false, upgradeAllowed: false, downgradeAllowed: false, trial: true, internal: false },
    { id: '02', key: 'monthly', name: 'شهري', nameEn: 'Monthly', days: 30, renewable: true, upgradeAllowed: true, downgradeAllowed: true, trial: false, internal: false },
    { id: '03', key: 'quarterly', name: 'ربع سنوي', nameEn: 'Quarterly', days: 90, renewable: true, upgradeAllowed: true, downgradeAllowed: true, trial: false, internal: false },
    { id: '04', key: 'semi_annual', name: 'نصف سنوي', nameEn: 'Semi Annual', days: 180, renewable: true, upgradeAllowed: true, downgradeAllowed: true, trial: false, internal: false },
    { id: '05', key: 'annual', name: 'سنوي', nameEn: 'Annual', days: 365, renewable: true, upgradeAllowed: true, downgradeAllowed: true, trial: false, internal: false },
    { id: '06', key: 'two_years', name: 'سنتان', nameEn: 'Two Years', days: 730, renewable: true, upgradeAllowed: true, downgradeAllowed: true, trial: false, internal: false },
    { id: '07', key: 'three_years', name: 'ثلاث سنوات', nameEn: 'Three Years', days: 1095, renewable: true, upgradeAllowed: true, downgradeAllowed: true, trial: false, internal: false },
    { id: '08', key: 'lifetime', name: 'مدى الحياة', nameEn: 'Lifetime', days: 0, renewable: false, upgradeAllowed: true, downgradeAllowed: false, trial: false, internal: false },
    { id: '09', key: 'custom', name: 'مخصص', nameEn: 'Custom', days: null, renewable: false, upgradeAllowed: true, downgradeAllowed: true, trial: false, internal: false },
  ];

  return withRegistrySig({
    schemaVersion: SCHEMA_VERSION,
    registryVersion: REGISTRY_VERSION,
    generatedAt,
    migratedFrom: null,
    subscriptions,
  });
}

function buildActionRegistry(generatedAt) {
  const actions = [
    { id: '01', key: 'new', name: 'ترخيص جديد', nameEn: 'New License', range: 'lifecycle', status: 'active', phase: '2.2' },
    { id: '02', key: 'renew', name: 'تجديد', nameEn: 'Renew', range: 'lifecycle', status: 'active', phase: '2.2' },
    { id: '03', key: 'upgrade', name: 'ترقية', nameEn: 'Upgrade', range: 'lifecycle', status: 'active', phase: '2.4' },
    { id: '04', key: 'downgrade', name: 'خفض', nameEn: 'Downgrade', range: 'lifecycle', status: 'planned', phase: '2.4' },
    { id: '05', key: 'extend', name: 'تمديد', nameEn: 'Extend', range: 'lifecycle', status: 'active', phase: '2.2' },
    { id: '06', key: 'repair', name: 'إصلاح', nameEn: 'Repair', range: 'lifecycle', status: 'planned', phase: '2.4' },
    { id: '07', key: 'developer', name: 'مطور داخلي', nameEn: 'Developer', range: 'lifecycle', status: 'active', phase: '2.2' },
    { id: '108', key: 'feature_unlock', name: 'فتح خاصية', nameEn: 'Feature Unlock', range: 'features', status: 'reserved', phase: null },
    { id: '109', key: 'feature_lock', name: 'قفل خاصية', nameEn: 'Feature Lock', range: 'features', status: 'reserved', phase: null },
    { id: '110', key: 'temporary_unlock', name: 'فتح مؤقت', nameEn: 'Temporary Unlock', range: 'features', status: 'reserved', phase: null },
    { id: '211', key: 'trial_extension', name: 'تمديد تجريبي', nameEn: 'Trial Extension', range: 'admin', status: 'reserved', phase: null },
    { id: '212', key: 'reactivate', name: 'إعادة تفعيل', nameEn: 'Reactivate', range: 'admin', status: 'reserved', phase: null },
    { id: '313', key: 'suspend', name: 'تعليق ترخيص', nameEn: 'Suspend', range: 'system', status: 'reserved', phase: null },
  ];

  return withRegistrySig({
    schemaVersion: SCHEMA_VERSION,
    registryVersion: REGISTRY_VERSION,
    generatedAt,
    migratedFrom: null,
    actions,
  });
}

function buildTemplateRegistry(generatedAt) {
  const templates = [
    {
      id: 'hijama_starter',
      displayName: 'Hijama Starter',
      displayNameAr: 'حجامة — بداية',
      package: '01',
      overrides: { add: [], remove: [] },
      subscription: '05',
      devices: 1,
      branches: 1,
    },
    {
      id: 'clinic_medium',
      displayName: 'Clinic Medium',
      displayNameAr: 'عيادة متوسطة',
      package: '02',
      overrides: { add: ['032'], remove: [] },
      subscription: '05',
      devices: 3,
      branches: 1,
    },
    {
      id: 'dental_pro',
      displayName: 'Dental Professional',
      displayNameAr: 'أسنان احترافي',
      package: '03',
      overrides: { add: ['024', '040'], remove: ['013'] },
      subscription: '05',
      devices: 3,
      branches: 2,
    },
  ];

  return withRegistrySig({
    schemaVersion: SCHEMA_VERSION,
    registryVersion: REGISTRY_VERSION,
    generatedAt,
    migratedFrom: null,
    templates,
  });
}

function buildLicenseIndex(generatedAt) {
  return withRegistrySig({
    schemaVersion: SCHEMA_VERSION,
    registryVersion: REGISTRY_VERSION,
    generatedAt,
    migratedFrom: null,
    nextLicenseSeq: 1,
    nextCustomSeq: 1,
    count: 0,
    entries: [],
  });
}

function buildAuditLog(generatedAt) {
  return withRegistrySig({
    schemaVersion: SCHEMA_VERSION,
    registryVersion: REGISTRY_VERSION,
    generatedAt,
    migratedFrom: null,
    entries: [],
  });
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function main() {
  const generatedAt = new Date().toISOString();
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const sourceFeatures = parseFeatureRegistry(html);

  const featureRegistry = buildFeatureRegistry(sourceFeatures, generatedAt);
  if (featureRegistry.features.length !== 74) {
    throw new Error(`Expected 74 features, got ${featureRegistry.features.length}`);
  }

  const capabilityRegistry = buildCapabilityRegistry(featureRegistry.features, generatedAt);
  const packageRegistry = buildPackageRegistry(generatedAt);
  const subscriptionRegistry = buildSubscriptionRegistry(generatedAt);
  const actionRegistry = buildActionRegistry(generatedAt);
  const templateRegistry = buildTemplateRegistry(generatedAt);
  const licenseIndex = buildLicenseIndex(generatedAt);
  const auditLog = buildAuditLog(generatedAt);

  const outputs = [
    [path.join(OUT_REGISTRIES, 'feature-registry.json'), featureRegistry],
    [path.join(OUT_REGISTRIES, 'capability-registry.json'), capabilityRegistry],
    [path.join(OUT_REGISTRIES, 'package-registry.json'), packageRegistry],
    [path.join(OUT_REGISTRIES, 'subscription-registry.json'), subscriptionRegistry],
    [path.join(OUT_REGISTRIES, 'action-registry.json'), actionRegistry],
    [path.join(OUT_REGISTRIES, 'template-registry.json'), templateRegistry],
    [OUT_LICENSE_INDEX, licenseIndex],
    [OUT_AUDIT_LOG, auditLog],
  ];

  for (const [filePath, data] of outputs) {
    writeJson(filePath, data);
  }

  console.log('Generated license registries (v1.2.0):');
  for (const [filePath] of outputs) {
    console.log(`  ${path.relative(ROOT, filePath)}`);
  }
  console.log(`Features: ${featureRegistry.features.length}`);
  console.log(`Capabilities: ${capabilityRegistry.capabilities.length}`);
  console.log(`Packages: ${packageRegistry.packages.length}`);
}

main();
