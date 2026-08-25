'use strict';

/**
 * Canonical operational data keys — SQLite is the sole authority in Electron.
 * localStorage may mirror SQLite after successful commit (UI/cache) or hold
 * migration/UI-only keys listed separately.
 */
const CORE_TABLES = [
  'clientsRegistry', // patients
  'cases',           // sessions / invoices
  'bookings',
  'doctors',         // employees
  'attendance',
  'expenses',
];

const KV_OPERATIONAL = [
  'users',
  'settings',
  'packages',
  'services',
  'otRecords',
  'budget',
  'invoiceCounter',
  'clientFileCounter',
  'nextSessions',
  'employeeLeaveRequests',
  'employeeLedgerAccruals',
  'employeeLedgerPayments',
  'employeeLedgerEntries',
  'importHistory',
  'inventoryItems',
  'inventorySuppliers',
  'inventoryMovements',
  'attachments_meta',
  '__tdw_conflict_queue__',
  '__tdw_conflict_archive__',
  '__tdw_attachment_manifest__',
  '__tdw_branch_settings_store__',
  '__tdw_branch_counters_store__',
  '__tdw_owner_profile__',
  '__tdw_owner_setup__',
  '__tdw_owner_migration__',
  '__tdw_owner_lifecycle__',
  '__tdw_owner_lifecycle_commit__',
  'activityLog',
  'messageLog',
  'systemLogs',
  'cashDrawerSession',
  'communicationWebhookLog',
  'communicationQueue',
  'backupLog',
  '__tdw_repo_revisions__',
  '__tdw_sync_lifecycle__',
];

/** Prefixes — any kv key starting with these is operational when Electron DB is present. */
const OPERATIONAL_PREFIXES = [
  '__tdw_owner_',
  '__tdw_conflict_',
  '__tdw_attachment_',
  '__tdw_sync_',
];

const UI_ONLY_KEYS = [
  '__tdw_ui_theme__',
  '__tdw_ui_lang__',
  '__tdw_last_tab__',
  '__tdw_wizard_ui__',
  'tdw_sidebar_collapsed',
  'tablePageSize',
  'logsPageSize',
  'devContact',
];

/** Backup/sync infra — not clinical SoT; may stay in localStorage until dedicated PRs. */
const NON_OPERATIONAL_KNOWN = [
  'backupRegistry',
  'backupUploadQueue',
  'backupOpCounter',
  'hardwareLog',
  'luxQueue',
  'preImportBackup',
  'importStudioLog',
  'logCounter',
  '__tdw_meta__',
  '__tdw_org_name__',
];

const OPERATIONAL_KEYS = new Set(CORE_TABLES.concat(KV_OPERATIONAL));

function defaultForOperationalKey(key) {
  if (key.endsWith('Counter')) return 0;
  if (key === 'settings') return {};
  if (key === 'budget') return 0;
  if (key === 'cashDrawerSession') return null;
  if (key.startsWith('__tdw_branch_') && key.endsWith('_store__')) return {};
  if (key.startsWith('__tdw_owner_')) return null;
  return [];
}

function isOperationalKey(key) {
  if (!key || typeof key !== 'string') return false;
  if (OPERATIONAL_KEYS.has(key)) return true;
  if (CORE_TABLES.includes(key)) return true;
  return OPERATIONAL_PREFIXES.some((p) => key.startsWith(p));
}

function isUiOnlyKey(key) {
  return UI_ONLY_KEYS.includes(key);
}

function shouldBlockLocalStorageForKey(key, electronDbPresent) {
  if (!electronDbPresent) return false;
  if (isUiOnlyKey(key)) return false;
  return isOperationalKey(key);
}

const registry = {
  CORE_TABLES,
  KV_OPERATIONAL,
  KV_MIRROR: KV_OPERATIONAL,
  OPERATIONAL_PREFIXES,
  UI_ONLY_KEYS,
  NON_OPERATIONAL_KNOWN,
  OPERATIONAL_KEYS,
  defaultForOperationalKey,
  isOperationalKey,
  isUiOnlyKey,
  shouldBlockLocalStorageForKey,
};

if (typeof module === 'object' && module.exports) {
  module.exports = registry;
}

if (typeof globalThis !== 'undefined') {
  globalThis.SqliteOperationalRegistry = registry;
}
