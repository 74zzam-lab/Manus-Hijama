/**
 * Branch data isolation — literal per-branch runtime view for owners.
 * Org-wide: license, device, backup tokens.
 * Branch-scoped: users (separate accounts per branch), settings, prices, workforce, inventory, logs.
 */
(function (global) {
  'use strict';

  const BRANCH_SETTINGS_STORE = '__tdw_branch_settings_store__';
  const BRANCH_COUNTERS_STORE = '__tdw_branch_counters_store__';

  const BRANCH_SCOPED_ARRAY_KEYS = new Set([
    'users',
    'packages', 'services', 'otRecords', 'nextSessions', 'employeeLeaveRequests',
    'employeeLedgerAccruals', 'employeeLedgerPayments', 'employeeLedgerEntries',
    'inventoryItems', 'inventorySuppliers', 'inventoryMovements',
    'activityLog', 'messageLog', 'importHistory', 'systemLogs',
    'communicationWebhookLog', 'communicationQueue', 'luxQueue'
  ]);

  const BRANCH_PRICE_KEYS = global.SettingsSplit?.PRICE_KEYS || [
    'cupPrice', 'vatRate', 'threshold', 'commissionRate',
    'siliconFacePrice', 'siliconCommission', 'siliconCommissionType',
    'massagePrice', 'massageCommission', 'bankRates'
  ];

  function branchSettingsKeys() {
    const local = global.SettingsSplit?.SETTINGS_LOCAL_KEYS;
    const live = global.settings && typeof global.settings === 'object' ? Object.keys(global.settings) : [];
    const fromLive = live.filter((k) => !local || !local.has(k));
    const base = global.SettingsSplit?.BRANCH_SETTINGS_KEYS || [
      'centerName', 'centerNameEn', 'address', 'phone', 'taxNum', 'brandLogo',
      'centerCity', 'centerEmail', 'centerWebsite', 'branchName', 'messaging',
      'communication', 'leavePolicy', 'attendanceDefaults', 'waTemplate',
      'promoTemplate', 'appointmentTemplate', 'overdueTemplate', 'printReports',
      'simplifiedTaxInvoice', 'invoiceSystem', 'clientOverdueDays'
    ];
    return [...new Set(fromLive.concat(base, BRANCH_PRICE_KEYS))];
  }

  function getLoginBranchId() {
    return global.DeviceConfig?.getLockedBranchId?.()
      || global.BranchScope?.getDeviceBranchId?.()
      || global.BranchScope?.DEFAULT_BRANCH_ID
      || 'BR-MAIN';
  }

  function getViewBranchId() {
    if (global.BranchScope?.isAggregateBranchView?.()) return null;
    return global.BranchContexts?.getOperationalWriteBranch?.()
      || global.BranchScope?.getViewBranchFilter?.()
      || global.BranchScope?.getActiveBranchId?.()
      || global.BranchScope?.DEFAULT_BRANCH_ID
      || 'BR-MAIN';
  }

  function isAggregateView() {
    return !getViewBranchId() || global.BranchScope?.isAggregateBranchView?.();
  }

  function loadStore(key) {
    return global.DB?.get?.(key, {}) || {};
  }

  function saveStore(key, data) {
    global.DB?.set?.(key, data);
    return data;
  }

  function pickBranchFields(obj, keys) {
    obj = obj || {};
    const out = {};
    keys.forEach((k) => {
      if (obj[k] !== undefined) out[k] = obj[k];
    });
    return out;
  }

  function applyBranchFields(obj, patch, keys) {
    if (!obj || !patch) return obj;
    keys.forEach((k) => {
      if (patch[k] !== undefined) obj[k] = patch[k];
    });
    return obj;
  }

  function persistBranchSettings(branchId) {
    branchId = String(branchId || '').trim();
    if (!branchId || branchId === '*' || branchId === '__ALL__') return;
    const settings = global.settings || global.DB?.get?.('settings', {}) || {};
    const store = loadStore(BRANCH_SETTINGS_STORE);
    store[branchId] = pickBranchFields(settings, branchSettingsKeys());
    saveStore(BRANCH_SETTINGS_STORE, store);
  }

  function applyBranchSettings(branchId) {
    branchId = String(branchId || '').trim();
    if (!branchId || branchId === '*' || branchId === '__ALL__') return;
    const settings = global.settings || global.DB?.get?.('settings', {}) || {};
    const store = loadStore(BRANCH_SETTINGS_STORE);
    const slice = store[branchId];
    if (slice) applyBranchFields(settings, slice, branchSettingsKeys());
    global.settings = settings;
    global.DB?.set?.('settings', settings);
  }

  function persistBranchCounters(branchId) {
    branchId = String(branchId || '').trim();
    if (!branchId || branchId === '*' || branchId === '__ALL__') return;
    const store = loadStore(BRANCH_COUNTERS_STORE);
    store[branchId] = {
      invoiceCounter: Number(global.invoiceCounter ?? global.DB?.get?.('invoiceCounter', 1)) || 1,
      clientFileCounter: Number(global.clientFileCounter ?? global.DB?.get?.('clientFileCounter', 1)) || 1,
      budget: Number(global.DB?.get?.('budget', 0)) || 0
    };
    saveStore(BRANCH_COUNTERS_STORE, store);
  }

  function applyBranchCounters(branchId) {
    branchId = String(branchId || '').trim();
    if (!branchId || branchId === '*' || branchId === '__ALL__') return;
    const store = loadStore(BRANCH_COUNTERS_STORE);
    const slice = store[branchId];
    // Missing slice must NOT reset counters to 1 — that collides with restored invoices/files.
    if (slice) {
      global.invoiceCounter = Math.max(1, Number(slice.invoiceCounter) || 1);
      global.clientFileCounter = Math.max(1, Number(slice.clientFileCounter) || 1);
      global.DB?.set?.('invoiceCounter', global.invoiceCounter);
      global.DB?.set?.('clientFileCounter', global.clientFileCounter);
      if (slice.budget != null) global.DB?.set?.('budget', slice.budget);
    }
    // Sequence lift from document max runs after hydrate/reload, not here:
    // applying it here would inflate the destination branch using the previous branch's cases.
  }

  function filterArrayForView(key, records) {
    if (!Array.isArray(records)) return records;
    if (isAggregateView()) return records.slice();
    if (global.BranchScope?.filterForActiveView) {
      return global.BranchScope.filterForActiveView(records);
    }
    const bid = getViewBranchId();
    if (global.BranchScope?.filterByBranch) return global.BranchScope.filterByBranch(records, bid);
    return records.slice();
  }

  function filterUsersForView(users) {
    if (!Array.isArray(users)) return [];
    if (isAggregateView()) return users.slice();
    const bid = getViewBranchId();
    return users.filter((u) => userBelongsToBranch(u, bid));
  }

  function userBelongsToBranch(user, branchId) {
    if (!user || user.active === false) return false;
    if (user.isDev) return false;
    branchId = branchId || getLoginBranchId();
    if (user.branchId) return String(user.branchId) === String(branchId);
    return String(branchId) === String(global.BranchScope?.DEFAULT_BRANCH_ID || 'BR-MAIN');
  }

  /** Login/auth: device-bound branch only — separate credentials per branch. */
  function getUsersForAuth(allUsers) {
    if (!Array.isArray(allUsers)) return [];
    const bid = getLoginBranchId();
    return allUsers.filter((u) => {
      if (!u || !u.active) return false;
      if (u.isDev) return true;
      return userBelongsToBranch(u, bid);
    });
  }

  function isBranchPrimaryUser(user) {
    return !!(user && (user.isBranchPrimary === true || String(user.id) === '1'));
  }

  function stampUserBranch(user) {
    if (!user || user.isDev) return user;
    const bid = getViewBranchId() || getLoginBranchId();
    if (!user.branchId) user.branchId = bid;
    const role = String(user.role || '').toLowerCase();
    if (role === 'owner' || role === 'hq_admin') {
      user.branchScope = ['*'];
      user.canSwitchBranch = user.canSwitchBranch !== false;
    } else {
      user.branchScope = [user.branchId];
      user.canSwitchBranch = false;
    }
    return user;
  }

  function migrateUsersBranchIds(allUsers) {
    if (!Array.isArray(allUsers)) return allUsers;
    const defaultBid = getLoginBranchId();
    let changed = false;
    const out = allUsers.map((u) => {
      if (!u || u.isDev || u.branchId) return u;
      changed = true;
      const next = { ...u, branchId: defaultBid };
      return stampUserBranch(next);
    });
    return changed ? out : allUsers;
  }

  function findUserInBranch(allUsers, userId, branchId) {
    branchId = branchId || getLoginBranchId();
    return getUsersForAuth(allUsers).find((u) => String(u.id) === String(userId) && userBelongsToBranch(u, branchId));
  }

  function usernameTakenInBranch(allUsers, username, branchId, exceptUserId) {
    const key = String(username || '').trim().toLowerCase();
    if (!key) return false;
    branchId = branchId || getViewBranchId() || getLoginBranchId();
    return (allUsers || []).some((u) => {
      if (!u || String(u.id) === String(exceptUserId || '')) return false;
      if (String(u.username || '').toLowerCase() !== key) return false;
      return userBelongsToBranch(u, branchId);
    });
  }

  function filterLogsForView(logs) {
    if (!Array.isArray(logs)) return [];
    if (isAggregateView()) return logs.slice();
    const bid = getViewBranchId();
    return logs.filter((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      if (entry.branchId) return entry.branchId === bid;
      // Legacy entries without branchId — hide from branch-specific view
      return false;
    });
  }

  function filterKvForView(key, value) {
    if (isAggregateView()) return value;
    if (CORE_TABLES.has(key) || BRANCH_SCOPED_ARRAY_KEYS.has(key)) {
      return filterArrayForView(key, value);
    }
    if (key === 'users') return filterUsersForView(value);
    if (key === 'activityLog' || key === 'messageLog' || key === 'systemLogs') return filterLogsForView(value);
    if (key === 'cashDrawerSession') {
      if (!value || isAggregateView()) return value;
      if (value.branchId && value.branchId !== getViewBranchId()) return null;
      return value;
    }
    if (key === 'settings') return value;
    return value;
  }

  const CORE_TABLES = new Set([
    'clientsRegistry', 'cases', 'bookings', 'doctors', 'attendance', 'expenses'
  ]);

  function stampBranchId(record) {
    if (!record || typeof record !== 'object') return record;
    if (!record.branchId) {
      record.branchId = getViewBranchId()
        || global.BranchScope?.getActiveBranchId?.()
        || global.BranchScope?.DEFAULT_BRANCH_ID
        || 'BR-MAIN';
    }
    return record;
  }

  function stampLogEntry(entry) {
    if (!entry || typeof entry !== 'object') return entry;
    if (!entry.branchId) {
      entry.branchId = getViewBranchId()
        || global.BranchScope?.getActiveBranchId?.()
        || global.BranchScope?.DEFAULT_BRANCH_ID
        || 'BR-MAIN';
    }
    return entry;
  }

  function persistOutgoing(branchId) {
    if (!branchId || branchId === '*' || branchId === '__ALL__') return;
    persistBranchSettings(branchId);
    persistBranchCounters(branchId);
  }

  function applyIncoming(branchId) {
    if (!branchId || branchId === '*' || branchId === '__ALL__') return;
    applyBranchSettings(branchId);
    applyBranchCounters(branchId);
  }

  function beforeBranchSwitch(fromBranchId, toBranchId) {
    if (fromBranchId && fromBranchId !== '*' && fromBranchId !== '__ALL__') {
      persistOutgoing(fromBranchId);
    }
  }

  function afterBranchSwitch(toBranchId) {
    if (toBranchId && toBranchId !== '*' && toBranchId !== '__ALL__') {
      applyIncoming(toBranchId);
      try {
        if (typeof global.ensureBranchStaffAccounts === 'function') {
          const all = global.DB?.get?.('users', global.users || []) || [];
          global.ensureBranchStaffAccounts(all, toBranchId);
        }
      } catch { /* empty */ }
    }
  }

  /** Call after saving branch-specific settings/prices from UI. */
  function persistActiveBranchSettings() {
    const bid = getViewBranchId();
    if (bid) persistBranchSettings(bid);
  }

  function persistActiveBranchCounters() {
    const bid = getViewBranchId();
    if (bid) persistBranchCounters(bid);
  }

  function sliceKvArrayForBranch(records, branchId) {
    if (!Array.isArray(records)) return [];
    branchId = branchId || getViewBranchId();
    if (!branchId || branchId === '*' || branchId === '__ALL__') return records.slice();
    if (global.BranchScope?.filterByBranch) {
      return global.BranchScope.filterByBranch(records, branchId);
    }
    return records.filter((r) => r && String(r.branchId || '') === String(branchId));
  }

  function mergeKvBranchSlice(fullRecords, branchSlice, branchId) {
    branchId = branchId || getViewBranchId();
    if (!branchId || branchId === '*' || branchId === '__ALL__') {
      return Array.isArray(branchSlice) ? branchSlice.slice() : [];
    }
    const full = Array.isArray(fullRecords) ? fullRecords : [];
    const others = full.filter((r) => {
      if (!r || typeof r !== 'object') return false;
      if (global.LegacyBranchMigration?.resolveLegacyBranchId) {
        const resolved = global.LegacyBranchMigration.resolveLegacyBranchId(r);
        if (resolved == null) return true;
        return resolved !== branchId;
      }
      const rb = r.branchId || global.BranchScope?.DEFAULT_BRANCH_ID || 'BR-MAIN';
      return rb !== branchId;
    });
    return [...others, ...(Array.isArray(branchSlice) ? branchSlice : [])];
  }

  function invalidateViewCaches() {
    /* module-level view caches cleared via BranchSwitchCache invalidator registry */
  }

  global.BranchDataIsolation = {
    BRANCH_SETTINGS_STORE,
    BRANCH_COUNTERS_STORE,
    BRANCH_SCOPED_ARRAY_KEYS,
    BRANCH_PRICE_KEYS,
    branchSettingsKeys,
    getLoginBranchId,
    getViewBranchId,
    isAggregateView,
    filterKvForView,
    filterArrayForView,
    filterUsersForView,
    getUsersForAuth,
    userBelongsToBranch,
    isBranchPrimaryUser,
    stampUserBranch,
    migrateUsersBranchIds,
    findUserInBranch,
    usernameTakenInBranch,
    filterLogsForView,
    stampBranchId,
    stampLogEntry,
    persistOutgoing,
    applyIncoming,
    beforeBranchSwitch,
    afterBranchSwitch,
    persistActiveBranchSettings,
    persistActiveBranchCounters,
    persistBranchSettings,
    persistBranchCounters,
    applyBranchSettings,
    applyBranchCounters,
    sliceKvArrayForBranch,
    mergeKvBranchSlice,
    invalidateViewCaches,
  };
})(typeof window !== 'undefined' ? window : globalThis);
