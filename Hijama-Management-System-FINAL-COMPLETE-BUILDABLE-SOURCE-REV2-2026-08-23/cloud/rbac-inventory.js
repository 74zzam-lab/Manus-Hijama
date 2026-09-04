/**
 * V2-5.4 — RBAC inventory snapshot (roles, permissions, screens, IPC, services).
 */
(function (global) {
  'use strict';

  const PRODUCT_ROLES = ['owner', 'admin', 'reception', 'accountant', 'employee', 'custom'];
  const LEGACY_OR_LOCAL_ROLES = ['hq_admin', 'branch_manager', 'doctor', 'practitioner'];

  const EXPORT_ACTIONS = [
    'exportToday', 'ledger.export', 'logs.export', 'database:exportSnapshot', 'backup:saveLocal', 'backup:v2:create'
  ];
  const IMPORT_ACTIONS = [
    'importStudio', 'importWizard', 'database:migrateFromBackup', 'backup:v2:restore'
  ];
  const PRINT_ACTIONS = [
    'printReport', 'printZReport', 'previewMainReport', 'devices:printThermal', 'devices:printA4', 'ledger.print'
  ];
  const SEARCH_ENDPOINTS = ['topbarSearch', 'clientSearch', 'caseSearch'];
  const DASHBOARD_WIDGETS = ['kpiCards', 'charts', 'timeline', 'ledgerDashCard', 'zReportButton', 'cashDrawerQuick'];

  function listRoles() {
    return {
      product: PRODUCT_ROLES.slice(),
      legacyOrLocal: LEGACY_OR_LOCAL_ROLES.slice(),
      rolePolicy: {
        organizationOwner: ['owner', 'hq_admin'],
        manager: ['owner', 'hq_admin', 'admin'],
      },
    };
  }

  function listPermissions() {
    const defs = global.PERMISSION_DEFS || global.PermissionPolicy?.PERMISSION_DEFS || {};
    const presets = global.ROLE_PRESETS || {};
    return {
      keys: Object.keys(defs),
      defs,
      presets: Object.keys(presets),
    };
  }

  function listScreens() {
    const pages = global.PAGE_PERMISSIONS || global.PermissionPolicy?.PAGE_PERMISSIONS || {};
    const modules = global.PAGE_ACCESS_MODULES || [];
    return {
      pagePermissions: Object.keys(pages),
      pageAccessModules: Array.isArray(modules) ? modules.map((m) => m.id || m) : [],
    };
  }

  function listSidebarSelectors() {
    return {
      navItems: '.nav-item[data-page]',
      adminOnly: '.admin-only',
      employeeOnly: '.employee-only',
      dataPerm: '[data-perm]',
      ownerHub: '#nav-owner-hub, [data-page="owner-hub"]',
    };
  }

  function listIpcHandlers() {
    return {
      public: ['app:getRuntimeInfo', 'database:status', 'messaging:getStatus', 'devices:getStatus'],
      privileged: [
        'database:persistTable', 'database:persistKv', 'database:migrateFromBackup', 'database:exportSnapshot', 'database:syncOp',
        'backup:saveLocal', 'backup:uploadCloud', 'backup:v2:create', 'backup:v2:restore', 'backup:v2:restoreLatest',
        'app:wipePersistentLicenseData', 'license:writeLicenseShard', 'license:writeActivationBundle',
        'cloudOAuth:saveSettings', 'devices:openCashDrawer', 'devices:printThermal', 'devices:printA4',
      ],
    };
  }

  function listServices() {
    return [
      'Repository', 'BranchScope', 'RolePolicy', 'PermissionPolicy', 'OwnerHub', 'SyncEngine',
      'DeviceRegistry', 'LicenseCloud', 'EmployeeLedger', 'AppointmentService'
    ];
  }

  function listRepositoryOperations() {
    return ['get', 'getScoped', 'upsert', 'set', 'setAll', 'delete', 'query', 'queryScoped'];
  }

  function snapshot() {
    return {
      at: new Date().toISOString(),
      roles: listRoles(),
      permissions: listPermissions(),
      screens: listScreens(),
      sidebar: listSidebarSelectors(),
      dashboardWidgets: DASHBOARD_WIDGETS.slice(),
      reports: ['mainReport', 'zReport', 'employeeReport', 'ledgerReport'],
      exports: EXPORT_ACTIONS.slice(),
      imports: IMPORT_ACTIONS.slice(),
      prints: PRINT_ACTIONS.slice(),
      search: SEARCH_ENDPOINTS.slice(),
      ipc: listIpcHandlers(),
      services: listServices(),
      repositoryOps: listRepositoryOperations(),
    };
  }

  global.RbacInventory = {
    PRODUCT_ROLES,
    LEGACY_OR_LOCAL_ROLES,
    EXPORT_ACTIONS,
    IMPORT_ACTIONS,
    PRINT_ACTIONS,
    SEARCH_ENDPOINTS,
    DASHBOARD_WIDGETS,
    listRoles,
    listPermissions,
    listScreens,
    listSidebarSelectors,
    listIpcHandlers,
    listServices,
    listRepositoryOperations,
    snapshot,
  };
})(typeof window !== 'undefined' ? window : globalThis);
