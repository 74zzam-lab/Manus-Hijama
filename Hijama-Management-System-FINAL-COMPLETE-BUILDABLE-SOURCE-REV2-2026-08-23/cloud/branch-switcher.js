/**
 * Branch Switcher — topbar selector for organization owners (Cloud V2).
 * PR8: durable authority, cache invalidation, awaited rehydrate, device lock denial.
 */
(function (global) {
  'use strict';

  const ALL_BRANCHES_VALUE = '__ALL__';
  let _pendingBranch = null;
  let _confirmOpen = false;
  let _switchInFlight = false;

  function getBranches() {
    const doc = global.LicenseCloud?.loadLocal?.();
    if (doc?.branches?.length) return doc.branches.filter(b => b && b.active !== false);
    return [{ id: 'BR-MAIN', name: 'الفرع الرئيسي', active: true }];
  }

  function shouldShow() {
    if (!global.CloudMeta?.isCloudV2Enabled?.()) return false;
    if (!global.currentUser) return false;
    if (!global.BranchScope?.canUserSwitchBranch?.(global.currentUser)) return false;
    return getBranches().length > 1;
  }

  function branchName(bid) {
    if (!bid || bid === '*' || bid === ALL_BRANCHES_VALUE) return 'كل الفروع';
    if (global.BranchDisplay?.resolveBranchName) {
      return global.BranchDisplay.resolveBranchName(bid);
    }
    return getBranches().find(b => b.id === bid)?.name || bid;
  }

  function getDisplayBranchId() {
    if (global.BranchAuthority?.activeBranchId) {
      const active = global.BranchAuthority.activeBranchId(global.currentUser);
      if (active) return active;
    }
    return global.BranchContexts?.getOperationalWriteBranch?.()
      || global.BranchScope?.getActiveBranchId?.()
      || global.DeviceConfig?.getLockedBranchId?.()
      || global.DeviceConfig?.load?.()?.lockedBranchId
      || null;
  }

  function shouldShowBranchLabel() {
    if (!global.CloudMeta?.isCloudV2Enabled?.()) return false;
    if (!global.currentUser) return false;
    if (shouldShow()) return false;
    return !!getDisplayBranchId();
  }

  function updateBranchLabel() {
    const el = document.getElementById('topbar-branch-label');
    if (!el) return;
    const bid = getDisplayBranchId();
    el.textContent = branchName(bid);
    el.title = (global.BranchDisplay?.resolveBranchTitle?.(bid) || branchName(bid)) + ' — مربوط بهذا الجهاز (قراءة فقط)';
  }

  function ensureBranchLabelDOM() {
    if (document.getElementById('topbar-branch-label-wrap')) return;
    const actions = document.querySelector('.topbar-actions');
    if (!actions) return;
    const wrap = document.createElement('div');
    wrap.id = 'topbar-branch-label-wrap';
    wrap.style.cssText = 'display:none;align-items:center;gap:6px';
    wrap.innerHTML = `
      <span style="font-size:11px;font-weight:700;color:var(--text-muted);white-space:nowrap">🔒 الفرع</span>
      <span id="topbar-branch-label" style="font-size:12px;font-weight:700;color:var(--primary);white-space:nowrap;padding:6px 10px;border-radius:8px;background:var(--surface);border:1px solid var(--border)"></span>`;
    actions.insertBefore(wrap, actions.firstChild);
  }

  function refreshSurfaces() {
    void refreshSurfacesAsync();
  }

  async function refreshSurfacesAsync() {
    if (global.SqliteBridge?.rehydrateBranchView) {
      try {
        await global.SqliteBridge.rehydrateBranchView();
      } catch { /* non-fatal — fall back to DB.get */ }
    }
    if (typeof global.refreshAllBranchScopedViews === 'function') {
      global.refreshAllBranchScopedViews({ fromBranchSwitch: true });
      return;
    }
    if (typeof global.reloadClientStoreFromDb === 'function') global.reloadClientStoreFromDb();
    if (typeof global.refreshCaseDerivedViews === 'function') global.refreshCaseDerivedViews();
    if (typeof global.refreshDashboard === 'function') global.refreshDashboard();
    if (typeof global.refreshDailyTable === 'function') global.refreshDailyTable();
    if (typeof global.refreshBookingsTable === 'function') global.refreshBookingsTable();
    if (typeof global.refreshClientsView === 'function') global.refreshClientsView(false);
    if (typeof global.refreshInvoicesPage === 'function') global.refreshInvoicesPage(false);
    if (typeof global.refreshDashboardAlerts === 'function') global.refreshDashboardAlerts();
    if (typeof global.refreshDoctorsTable === 'function') global.refreshDoctorsTable();
    if (typeof global.renderOwnerHubPage === 'function') global.renderOwnerHubPage();
    if (typeof global.showPage === 'function') {
      try {
        const active = document.querySelector('.page.active')?.id?.replace('page-', '');
        if (active) global.showPage(active);
      } catch { /* empty */ }
    }
    if (typeof global.BranchSwitcher?.populate === 'function') global.BranchSwitcher.populate();
    if (typeof global.BranchSwitcher?.updateBranchLabel === 'function') global.BranchSwitcher.updateBranchLabel();
    if (typeof global.applyBranchViewModeUi === 'function') global.applyBranchViewModeUi();
  }

  function notifySwitchDenied(gate) {
    const err = gate?.error || 'branch_switch_denied';
    if (err === 'device_branch_locked') {
      global.notify?.(`⛔ الجهاز مقفل على فرع ${branchName(gate.lockedBranchId)} — لا يمكن التبديل`, 'danger');
      return;
    }
    if (err === 'branch_access_denied') {
      global.notify?.('⛔ لا يمكنك الوصول لهذا الفرع', 'danger');
      return;
    }
    if (err === 'pending_writes_in_flight') {
      global.notify?.('⏳ انتظر اكتمال الحفظ الجاري قبل تبديل الفرع', 'warning');
      return;
    }
    global.notify?.('⛔ لا يمكن تبديل الفرع الآن', 'danger');
  }

  async function applyBranchSwitch(bid) {
    if (_switchInFlight) return { ok: false, error: 'branch_switch_in_flight' };

    const gate = global.BranchAuthority?.assertSwitchAllowed?.(global.currentUser, bid)
      || { ok: global.BranchScope?.userCanAccessBranch?.(global.currentUser, bid) || bid === ALL_BRANCHES_VALUE };
    if (!gate.ok) {
      notifySwitchDenied(gate);
      return gate;
    }

    if (global.SqliteBridge?.hasPendingCommits?.()) {
      const pending = { ok: false, error: 'pending_writes_in_flight' };
      notifySwitchDenied(pending);
      return pending;
    }

    const from = global.BranchAuthority?.activeBranchId?.(global.currentUser)
      || global.BranchContexts?.getOperationalWriteBranch?.()
      || global.BranchScope?.getActiveBranchId?.()
      || global.DeviceConfig?.getLockedBranchId?.()
      || null;

    const toKey = bid === ALL_BRANCHES_VALUE ? '*' : bid;
    const fromKey = from === ALL_BRANCHES_VALUE ? '*' : from;
    if (toKey === fromKey || (bid === ALL_BRANCHES_VALUE && from === '*')) {
      return { ok: true, noop: true };
    }

    _switchInFlight = true;
    try {
      try { global.BranchDataIsolation?.beforeBranchSwitch?.(from, bid); } catch { /* empty */ }
      global.BranchSwitchCache?.invalidateAll?.('branch_switch');

      if (bid === ALL_BRANCHES_VALUE) {
        try { global.OwnerBranchMode?.exitToOwnerMode?.(); } catch { /* empty */ }
        global.BranchContexts?.clearOperationalWriteBranch?.();
        global.BranchScope?.setActiveBranchId?.('*');
        global.notify?.('🌐 عرض كل الفروع (تجميعي) — وضع قراءة للعمليات', 'info');
      } else if (gate.viewOnly && gate.deviceLockedBranchId) {
        global.BranchContexts?.setViewBranchOnly?.(bid, gate.deviceLockedBranchId);
        global.notify?.(
          `👁️ عرض فرع ${branchName(bid)} — الكتابة على ${branchName(gate.deviceLockedBranchId)} فقط`,
          'info'
        );
      } else {
        global.BranchContexts?.setOperationalWriteBranch?.(bid, { bindDevice: false });
        global.BranchScope?.setActiveBranchId?.(bid);
        try {
          if (global.RolePolicy?.isOrganizationOwner?.(global.currentUser)
            || String(global.currentUser?.role || '').toLowerCase() === 'owner') {
            global.OwnerBranchMode?.enterBranchMode?.(bid);
          }
        } catch { /* empty */ }
        global.notify?.('🌿 تم التبديل إلى: ' + branchName(bid), 'info');
      }

      try { global.BranchAuthority?.persistDurableViewState?.(global.currentUser); } catch { /* empty */ }

      if (from !== bid) {
        global.AuditLogger?.logSyncEvent?.('BRANCH_SESSION_SWITCHED', {
          entity: 'branch',
          entityId: bid === ALL_BRANCHES_VALUE ? '*' : bid,
          summary: `Branch session: ${branchName(from)} → ${branchName(bid)}`,
          meta: {
            fromBranchId: from,
            toBranchId: bid,
            userId: global.currentUser?.id || '',
            role: global.currentUser?.role || '',
            scopeGeneration: global.BranchSwitchCache?.getScopeGeneration?.() || 0,
          }
        });
      }

      try {
        if (bid !== ALL_BRANCHES_VALUE) global.BranchDataIsolation?.afterBranchSwitch?.(bid);
      } catch { /* empty */ }

      await refreshSurfacesAsync();
      if (typeof global.applyBranchViewModeUi === 'function') global.applyBranchViewModeUi();

      return { ok: true, fromBranchId: from, toBranchId: bid };
    } finally {
      _switchInFlight = false;
    }
  }

  function confirmSwitch(bid, sel) {
    if (_confirmOpen) return;
    const from = getDisplayBranchId() || ALL_BRANCHES_VALUE;
    if (bid === from || (bid === ALL_BRANCHES_VALUE && (from === '*' || from === ALL_BRANCHES_VALUE))) {
      void applyBranchSwitch(bid);
      return;
    }
    const msg = bid === ALL_BRANCHES_VALUE
      ? 'التبديل إلى عرض كل الفروع؟ العمليات التشغيلية للقراءة فقط.'
      : `تأكيد العمل على فرع «${branchName(bid)}» (${bid})؟ سيتم تحديث القوائم والحفظ لهذا الفرع.`;
    _pendingBranch = bid;
    _confirmOpen = true;
    const revertSel = () => {
      if (!sel) return;
      const active = getDisplayBranchId();
      sel.value = active === '*' ? ALL_BRANCHES_VALUE : (active || sel.value);
    };
    if (typeof global.confirmAsync === 'function') {
      global.confirmAsync(msg, { title: 'تبديل فرع العمل' }).then((ok) => {
        _confirmOpen = false;
        if (ok) void applyBranchSwitch(bid);
        else revertSel();
        _pendingBranch = null;
      });
      return;
    }
    if (global.confirm(msg)) {
      _confirmOpen = false;
      void applyBranchSwitch(bid);
    } else {
      revertSel();
    }
    _pendingBranch = null;
    _confirmOpen = false;
  }

  function ensureDOM() {
    if (document.getElementById('topbar-branch-switcher')) return;
    const actions = document.querySelector('.topbar-actions');
    if (!actions) return;
    const wrap = document.createElement('div');
    wrap.id = 'topbar-branch-switch-wrap';
    wrap.style.cssText = 'display:none;align-items:center;gap:6px';
    wrap.innerHTML = `
      <label for="topbar-branch-switcher" style="font-size:11px;font-weight:700;color:var(--text-muted);white-space:nowrap">🌿 الفرع</label>
      <select id="topbar-branch-switcher" class="form-control" style="min-width:130px;max-width:180px;padding:6px 10px;font-size:12px;font-weight:700;height:34px"></select>`;
    actions.insertBefore(wrap, actions.firstChild);
    const sel = wrap.querySelector('#topbar-branch-switcher');
    if (sel) {
      sel.addEventListener('change', () => {
        const bid = sel.value;
        if (!bid) return;
        const gate = global.BranchAuthority?.assertSwitchAllowed?.(global.currentUser, bid);
        if (gate && !gate.ok) {
          notifySwitchDenied(gate);
          sel.value = getDisplayBranchId() === '*' ? ALL_BRANCHES_VALUE : (getDisplayBranchId() || bid);
          return;
        }
        if (!global.BranchScope?.userCanAccessBranch?.(global.currentUser, bid)
          && bid !== ALL_BRANCHES_VALUE) {
          global.notify?.('⛔ لا يمكنك الوصول لهذا الفرع', 'danger');
          sel.value = global.BranchScope?.getActiveBranchId?.() || bid;
          return;
        }
        confirmSwitch(bid, sel);
      });
    }
  }

  function populate() {
    const sel = document.getElementById('topbar-branch-switcher');
    if (!sel) return;
    const branches = getBranches();
    const scope = global.BranchScope?.getUserBranchScope?.(global.currentUser) || [];
    const canAll = scope.includes('*')
      || global.RolePolicy?.isOrganizationOwner?.(global.currentUser)
      || String(global.currentUser?.role || '').toLowerCase() === 'owner';
    const visible = scope.includes('*') ? branches : branches.filter(b => scope.includes(b.id));
    let active = getDisplayBranchId() || branches[0]?.id;
    const opts = [];
    if (canAll) {
      opts.push(`<option value="${ALL_BRANCHES_VALUE}">🌐 كل الفروع (All Branches)</option>`);
    }
    visible.forEach((b) => {
      const label = global.BranchDisplay?.formatBranchOption?.(b) || b.name || b.id;
      opts.push(`<option value="${String(b.id).replace(/"/g, '&quot;')}">${label}</option>`);
    });
    sel.innerHTML = opts.join('');
    if (active === '*') sel.value = ALL_BRANCHES_VALUE;
    else if (active && [...sel.options].some((o) => o.value === active)) sel.value = active;
    else if (canAll && active === ALL_BRANCHES_VALUE) sel.value = ALL_BRANCHES_VALUE;
  }

  function applyVisibility() {
    ensureDOM();
    ensureBranchLabelDOM();
    const wrap = document.getElementById('topbar-branch-switch-wrap');
    const labelWrap = document.getElementById('topbar-branch-label-wrap');
    const showSwitcher = shouldShow();
    if (wrap) wrap.style.display = showSwitcher ? 'flex' : 'none';
    const showLabel = shouldShowBranchLabel();
    if (labelWrap) labelWrap.style.display = showLabel ? 'flex' : 'none';
    if (showLabel) updateBranchLabel();
    if (showSwitcher) populate();
  }

  global.BranchSwitcher = {
    shouldShow,
    shouldShowBranchLabel,
    applyVisibility,
    populate,
    applyBranchSwitch,
    refreshSurfacesAsync,
    updateBranchLabel,
    ALL_BRANCHES_VALUE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
