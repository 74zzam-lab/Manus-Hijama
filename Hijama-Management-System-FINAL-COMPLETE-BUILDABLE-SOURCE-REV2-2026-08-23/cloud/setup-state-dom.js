/**
 * Apply SetupStateService visibility to all activation-related DOM surfaces.
 * Called on startup, after BootFlow steps, login gate, settings render, Owner Hub render.
 */
(function (global) {
  'use strict';

  function qs(sel, root) {
    try { return (root || document).querySelector(sel); } catch { return null; }
  }

  function qsa(sel, root) {
    try { return Array.from((root || document).querySelectorAll(sel)); } catch { return []; }
  }

  function setVisible(el, show) {
    if (!el) return;
    el.hidden = !show;
    el.style.display = show ? '' : 'none';
    if (el.classList) el.classList.toggle('ss-hidden-by-state', !show);
  }

  function isSupportMode() {
    return !!(global.currentUser?.isDev
      || global.__tdw_support_mode__
      || (typeof global.location !== 'undefined'
        && /[?&]support=1/.test(String(global.location.search || ''))));
  }

  function applyDomVisibility(options) {
    options = options || {};
    const SS = global.SetupStateService;
    if (!SS?.getState || typeof document === 'undefined') {
      return { ok: false, reason: 'setup_state_unavailable' };
    }

    const state = SS.getState({ supportMode: isSupportMode() || !!options.supportMode });
    const ready = state.state === SS.STATES.READY;
    const support = isSupportMode() || !!options.supportMode;

    // 1) Login boot CTA + hint
    const bootCta = qs('#login-boot-cta');
    setVisible(bootCta, state.showLoginBootCta);
    const hint = qs('#login-setup-hint');
    if (hint) setVisible(hint, state.showLoginBootCta);

    // 2) Login support details — always visible (collapsed <details>); license/dev access after READY
    const loginSupport = qs('#loginScreen details.login-support-details')
      || qs('.login-support-details');
    setVisible(loginSupport, true);

    // 3) Dead drive bootstrap panel — always hidden for customers
    setVisible(qs('#login-drive-bootstrap-panel'), false);

    // 4) Settings BootFlow button — HIDE_AFTER_COMPLETE
    qsa('button').forEach((btn) => {
      const label = String(btn.textContent || '');
      const onclick = String(btn.getAttribute('onclick') || '');
      if (onclick.includes('openBootWizardFromLogin') || /معالج الإعداد \(BootFlow\)/.test(label)) {
        // Keep visible only when setup incomplete OR support mode
        setVisible(btn, state.showLoginBootCta || support);
        btn.setAttribute('data-ss-class', state.showLoginBootCta ? 'KEEP' : 'HIDE_AFTER_COMPLETE');
      }
      if (onclick.includes("CenterSetupUI.open") || /إعداد المركز \(دعم\)/.test(label)) {
        setVisible(btn, support || !ready);
        btn.setAttribute('data-ss-class', 'ADVANCED_ONLY');
      }
    });

    // 5) Explicit settings / owner-hub ids if present
    const settingsBoot = qs('#settings-bootflow-cta');
    if (settingsBoot) setVisible(settingsBoot, state.showLoginBootCta || support);
    const settingsCenter = qs('#settings-centersetup-cta');
    if (settingsCenter) setVisible(settingsCenter, support || !ready);
    const ohBoot = qs('#ownerhub-bootflow-cta');
    if (ohBoot) setVisible(ohBoot, state.showLoginBootCta || support);
    const ohCenter = qs('#ownerhub-centersetup-cta');
    if (ohCenter) setVisible(ohCenter, support || !ready);
    qsa('[data-ss-surface="ownerhub_setup_guide"]').forEach((el) => {
      setVisible(el, state.showLoginBootCta || support);
    });

    // 6) Sync manual button — show when sync_manual visibility says so
    const syncVis = SS.visibilityFor('sync_manual');
    qsa('[data-ss-surface="sync_manual"], #btn-cloud-v2-sync-now, #btn-bk-sync-now-top').forEach((el) => {
      setVisible(el, syncVis.show || support);
    });

    // 7) Cloud V2 setup hint from readiness (detailed missing)
    const hintCv2 = qs('#bk-cv2-setup-hint');
    if (hintCv2) {
      const readySync = state.syncReadiness || global.SyncEngine?.getReadiness?.();
      if (!ready && readySync && !readySync.ready) {
        hintCv2.style.display = '';
        hintCv2.innerHTML = `⚠️ <strong>المزامنة غير جاهزة</strong><br>`
          + `الحالة: <code dir="ltr">${readySync.state || state.state}</code><br>`
          + `المتطلبات الناقصة: <code dir="ltr">${(readySync.missing || []).join(', ') || '—'}</code>`;
      } else if (ready && readySync?.ready) {
        hintCv2.style.display = 'none';
        hintCv2.textContent = '';
      }
    }

    // 8) Close BootFlow overlay if READY (unless forced support)
    const overlay = qs('#bootFlowOverlay');
    if (overlay && ready && !options.keepBootOpen && !support) {
      if (overlay.classList.contains('open') && global.BootFlow?.closeToLogin) {
        try { global.BootFlow.closeToLogin(); } catch { /* empty */ }
      }
    }

    return { ok: true, state: state.state, ready, support };
  }

  function needsBootFlow() {
    const SS = global.SetupStateService;
    if (!SS?.getState) return !!global.BootFlow?.needsBootScreen?.();
    const s = SS.getState({ ignoreRestart: true });
    return !!s.needsBootFlow;
  }

  function inventoryClassFor(surface) {
    const s = global.SetupStateService?.getState?.() || {};
    const ready = s.state === 'READY';
    switch (surface) {
      case 'login_boot_cta':
      case 'ready_restart':
      case 'sync_manual':
      case 'forced_password_modal':
      case 'backup_v2':
        return 'KEEP';
      case 'bootflow':
      case 'settings_bootflow':
      case 'ownerhub_bootflow':
        return ready ? 'HIDE_AFTER_COMPLETE' : 'KEEP';
      case 'center_setup':
      case 'settings_centersetup':
      case 'login_support_details':
      case 'license_screen_support':
        return 'ADVANCED_ONLY';
      case 'login_drive_bootstrap_panel':
      case 'v1_sync_buttons':
        return 'DELETE';
      case 'needsBootScreen_callers':
      case 'ownerhub_setup_guide':
        return 'MERGE';
      default:
        return 'KEEP';
    }
  }

  global.SetupStateDom = {
    applyDomVisibility,
    needsBootFlow,
    isSupportMode,
    inventoryClassFor,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.SetupStateDom;
  }
})(typeof window !== 'undefined' ? window : globalThis);
