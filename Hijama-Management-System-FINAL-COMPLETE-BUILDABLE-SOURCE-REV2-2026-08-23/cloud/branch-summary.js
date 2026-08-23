/**
 * Branch Summary Contract (Phase 33)
 * Lightweight per-branch aggregation for Owner Hub on-demand reporting.
 */
(function (global) {
  'use strict';

  const SUMMARY_KEY = '__tdw_branch_summaries__';

  function loadAll() {
    const raw = global.DB?.get?.(SUMMARY_KEY, null);
    return raw && typeof raw === 'object' ? raw : {};
  }

  function saveAll(map) {
    const next = map && typeof map === 'object' ? map : {};
    global.DB?.set?.(SUMMARY_KEY, next);
    return next;
  }

  function getBranchData(branchId) {
    const bid = branchId || global.BranchScope?.DEFAULT_BRANCH_ID || 'BR-MAIN';
    const clients = (global.clientsRegistry || []).filter((c) => (c?.branchId || 'BR-MAIN') === bid);
    const cases = (global.cases || []).filter((c) => (c?.branchId || 'BR-MAIN') === bid);
    const bookings = (global.bookings || []).filter((b) => (b?.branchId || 'BR-MAIN') === bid);
    const expenses = (global.expenses || []).filter((e) => (e?.branchId || 'BR-MAIN') === bid);
    return { clients, cases, bookings, expenses };
  }

  function sumRevenue(cases) {
    return cases.reduce((acc, row) => acc + Number(row?.amount || row?.total || row?.totalAmount || 0), 0);
  }

  function sumExpenses(expenses) {
    return expenses.reduce((acc, row) => acc + Number(row?.amount || row?.value || 0), 0);
  }

  function buildBranchSummary(branchId) {
    const bid = branchId || global.BranchScope?.DEFAULT_BRANCH_ID || 'BR-MAIN';
    const { clients, cases, bookings, expenses } = getBranchData(bid);
    return {
      schemaVersion: 1,
      branchId: bid,
      generatedAt: new Date().toISOString(),
      clientsTotal: clients.length,
      casesTotal: cases.length,
      bookingsTotal: bookings.length,
      revenueTotal: sumRevenue(cases),
      expensesTotal: sumExpenses(expenses),
      netTotal: sumRevenue(cases) - sumExpenses(expenses)
    };
  }

  function refreshBranchSummary(branchId) {
    const summary = buildBranchSummary(branchId);
    const map = loadAll();
    map[summary.branchId] = summary;
    saveAll(map);
    return summary;
  }

  function refreshAllBranchSummaries() {
    const lic = global.LicenseCloud?.loadLocal?.() || {};
    const branches = (lic.branches || []).filter((b) => b && b.active !== false);
    const ids = branches.length ? branches.map((b) => b.id) : [global.BranchScope?.DEFAULT_BRANCH_ID || 'BR-MAIN'];
    const map = loadAll();
    ids.forEach((id) => { map[id] = buildBranchSummary(id); });
    saveAll(map);
    return map;
  }

  function getSummary(branchId) {
    const map = loadAll();
    const bid = branchId || global.BranchScope?.DEFAULT_BRANCH_ID || 'BR-MAIN';
    return map[bid] || null;
  }

  global.BranchSummary = {
    SUMMARY_KEY,
    loadAll,
    saveAll,
    buildBranchSummary,
    refreshBranchSummary,
    refreshAllBranchSummaries,
    getSummary
  };
})(typeof window !== 'undefined' ? window : globalThis);
