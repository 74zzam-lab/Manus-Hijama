/**
 * V2-5.9 Activation Wizard — simplified customer journey (no Owner Bootstrap).
 * Welcome → Language → Google (+auto discovery) → License → Organization → Branch → Restore/Data → Sync → Ready
 * Existing path: … → Branch Select (not create) → …
 *
 * Google Login never implies Owner. Owner is a seeded normal user account.
 * Dashboard/login completion requires Google + license + org + device branch + data decision + sync.
 */
(function (global) {
  'use strict';

  const BOOT_DONE_KEY = '__tdw_boot_complete__';
  const WIZARD_KEY = '__tdw_boot_wizard__';
  const LANG_KEY = '__tdw_ui_lang__';
  const RESTART_REQUIRED_KEY = '__tdw_restart_required__';

  const PATHS = { NEW: 'new', EXISTING: 'existing' };

  /** V2-5.9 stepper — Owner step removed from customer journey */
  const NEW_STEPS = ['language', 'google', 'license', 'organization', 'branch', 'restore', 'sync', 'ready'];
  const EXISTING_STEPS = ['language', 'google', 'license', 'organization', 'branch_select', 'restore', 'sync', 'ready'];

  const STEP_LABELS = {
    language: 'اللغة',
    google: 'ربط Google',
    license: 'التفعيل والترخيص',
    organization: 'المؤسسة',
    branch: 'إنشاء أول فرع',
    branch_select: 'اختيار فرع موجود',
    owner: 'حساب المالك (دعم)',
    restore: 'مصدر البيانات',
    sync: 'المزامنة الأولية',
    ready: 'الجاهزية وإعادة التشغيل'
  };

  /** Compact stepper labels — avoid tall wrap inside modal header */
  const STEP_SHORT = {
    language: 'لغة',
    google: 'Google',
    license: 'ترخيص',
    organization: 'مؤسسة',
    branch: 'فرع',
    branch_select: 'فرع',
    owner: 'مالك',
    restore: 'بيانات',
    sync: 'مزامنة',
    ready: 'جاهز'
  };

  const STEP_HINTS = {
    language: 'اختر لغة الواجهة.',
    google: 'اربط حساب Google للمركز — يبدأ الفحص تلقائياً.',
    license: 'يُسحب الترخيص من Drive إن وُجد؛ وإلا أدخل المفتاح.',
    organization: 'أكد المؤسسة المصرّح بها فقط.',
    branch: 'اسم الفرع الأول + اسم هذا الجهاز.',
    branch_select: 'اختر فرعاً موجوداً واربط الجهاز به.',
    owner: 'مسار دعم فقط — ليس في رحلة العميل اليومية.',
    restore: 'فحص مصادر البيانات — سحب سحابي / محلي / Backup V2 / فارغ (لا استبدال DB للسحابة).',
    sync: 'المزامنة تُفعَّل بعد اكتمال الربط.',
    ready: 'أعد تشغيل التطبيق لتطبيق التفعيل.'
  };

  let oauthInFlight = false;
  let branchCreateInFlight = false;
  let licenseActivateInFlight = false;
  let restoreInFlight = false;
  let syncInFlight = false;
  let googleAuthorityRefreshInFlight = false;
  let lastFocusEl = null;

  function isCriticalOpInFlight() {
    if (oauthInFlight || licenseActivateInFlight || branchCreateInFlight || restoreInFlight || syncInFlight) {
      return true;
    }
    return !!global.OwnerManagement?.isOwnerCreationInProgress?.();
  }

  function ownerCreateInFlight() {
    return !!global.OwnerManagement?.isOwnerCreationInProgress?.();
  }

  function normalizeWizardState(raw) {
    const w = raw && typeof raw === 'object' ? { ...raw } : {};
    const steps = stepsFor(w.path);
    const rawStep = w.currentStep;
    let stepIndex = Number.isInteger(rawStep) ? rawStep : Number(rawStep);
    if (!Number.isFinite(stepIndex)) stepIndex = steps.indexOf(String(rawStep || ''));
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= steps.length) stepIndex = 0;
    w.currentStep = stepIndex;
    if (!Array.isArray(w.completedSteps)) w.completedSteps = [];
    if (typeof w.path !== 'string' || !Object.values(PATHS).includes(w.path)) w.path = null;
    if (!w.lang) w.lang = global.UxI18n?.getLang?.() || 'ar';
    if (typeof w.syncDone !== 'boolean') w.syncDone = !!w.syncDone;
    return w;
  }

  function loadWizard() {
    const fallback = {
      path: null,
      currentStep: 0,
      completedSteps: [],
      startedAt: null,
      lang: global.UxI18n?.getLang?.() || 'ar',
      restoreChoice: null,
      syncDone: false,
      oauthLockAt: null
    };
    return normalizeWizardState(global.DB?.get?.(WIZARD_KEY, fallback) || fallback);
  }

  function saveWizard(w) {
    const normalized = normalizeWizardState(w);
    global.DB?.set?.(WIZARD_KEY, normalized);
    syncWizardToMain(normalized);
    return normalized;
  }

  function syncWizardToMain(wizard) {
    try {
      const api = global.cuppingElectron || global.tadawi;
      if (api?.bootstrap?.syncWizardState) {
        void api.bootstrap.syncWizardState(wizard).catch(() => {});
      }
    } catch { /* best effort */ }
  }

  function resetWizard(path) {
    return saveWizard({
      path,
      currentStep: 0,
      completedSteps: [],
      startedAt: new Date().toISOString(),
      lang: loadWizard().lang || 'ar',
      restoreChoice: null,
      syncDone: false,
      oauthLockAt: null
    });
  }

  function stepsFor(path) {
    return path === PATHS.EXISTING ? EXISTING_STEPS : NEW_STEPS;
  }

  function userError(err, code) {
    if (global.ActivationErrors?.toUserError) {
      return global.ActivationErrors.toUserError(err, code);
    }
    return { title: 'خطأ', detail: String(err && err.message || err || code || ''), diagnosticCode: 'TDW-ACT-FALLBACK' };
  }

  function setStatus(msg, isError) {
    const el = document.getElementById('bf-wizard-status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('bf-status-error', !!isError);
    el.setAttribute('role', isError ? 'alert' : 'status');
  }

  function setStatusFromErr(err, code) {
    const ue = userError(err, code);
    setStatus(global.ActivationErrors?.formatForUi?.(ue) || `${ue.title} — ${ue.detail}`, true);
    return ue;
  }

  function bootstrapRestoreVerifyOptions(extra) {
    return {
      requireOwner: false,
      requireData: false,
      ...(extra || {}),
    };
  }

  async function establishBootSyncBaseline() {
    try {
      await global.DeviceCache?.syncLicenseToMainCache?.();
    } catch { /* non-fatal */ }
    try {
      return await global.SyncBaseline?.establishFromLocalState?.({ source: 'boot_flow' });
    } catch {
      return { ok: false };
    }
  }

  function formatSyncCycleError(result) {
    if (!result) return 'sync_failed';
    const parts = [
      result.error,
      result.message,
      result.pull?.error,
      result.push?.error,
      global.SyncCoordinator?.getLastCycleResult?.()?.error,
    ].filter(Boolean);
    return parts[0] || 'sync_cycle_failed';
  }

  async function waitForSyncLifecycleReady(options = {}) {
    const maxMs = Number(options.maxMs) || 120000;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      while (global.SyncCoordinator?.isCycleInFlight?.()) {
        await sleep(250);
      }
      const lc = global.SyncLifecycle?.resolveLifecycle?.({
        force: true,
        relaxedBaseline: options.relaxedBaseline !== false,
      }) || null;
      if (lc?.lifecycle === 'READY') return lc;
      if (lc && ['FAILED', 'CONFLICT_REQUIRES_ACTION', 'PAUSED_OFFLINE'].includes(lc.lifecycle)) return lc;
      await sleep(350);
    }
    return global.SyncLifecycle?.resolveLifecycle?.({ force: true, relaxedBaseline: true }) || null;
  }

  function hasValidLicense() {
    const lic = typeof global.licLoad === 'function' ? global.licLoad() : null;
    const cloud = global.LicenseCloud?.loadLocal?.();
    if (global._licStatus === 'valid') return true;
    if (lic && global._licStatus !== 'expired' && global._licStatus !== 'blocked') return true;
    if (cloud?.centerId && global.LicenseActivationGate?.isConsumed?.(cloud)) return true;
    if (cloud?.centerId && (cloud.branches || []).length) return true;
    return false;
  }

  function hasGoogle() {
    if (global.DriveAdapter?.isConnected?.()) return true;
    const snap = global.DriveAdapter?.authoritySnapshot?.();
    if (snap?.verified && snap?.connected && !snap?.needsReauth && !snap?.stale) return true;
    const prov = global.settings?.backup?.providers?.google;
    return !!(prov?.connected && !prov?.userDisconnected && prov?.oauth !== false);
  }

  function hasCenterData() {
    const cid = global.CenterId?.getStoredCenterId?.() || global.ConfigLayer?.getCenterId?.()
      || global.LicenseCloud?.loadLocal?.()?.centerId;
    const name = global.settings?.centerName || global.LicenseCloud?.loadLocal?.()?.centerName;
    return !!(cid && name);
  }

  function hasBranch() {
    const lic = global.LicenseCloud?.loadLocal?.();
    const branches = (lic?.branches || []).filter((b) => b && b.active !== false);
    return branches.length > 0;
  }

  function hasDeviceBranch() {
    const cfg = global.DeviceConfig?.load?.();
    return !!(cfg?.lockedBranchId && (cfg?.deviceName || cfg?.deviceUuid));
  }

  function hasOwnerPasswordAccount() {
    // Delegate to Single Source of Truth — do not re-implement Owner detection here.
    if (global.OwnerManagement?.getOwnerState) {
      return global.OwnerManagement.getOwnerState().state === 'OWNER_EXISTS';
    }
    if (!global.OwnerProfile?.hasProfile?.()) return false;
    const users = global.users || global.DB?.get?.('users', []) || [];
    return users.some((u) => u && u.active !== false && String(u.role || '').toLowerCase() === 'owner' && u.password);
  }

  function ownerSetupRequirementMet() {
    return hasOwnerPasswordAccount();
  }

  function hasRestoreDecision() {
    const w = loadWizard();
    return ['empty', 'cloud', 'backup_v2', 'skip_existing', 'local', 'file'].includes(w.restoreChoice);
  }

  function hasSyncDone() {
    return !!loadWizard().syncDone;
  }

  function isBootComplete() {
    // V2-5.9: Owner account is NOT required for activation completion.
    const base = hasGoogle() && hasValidLicense() && hasCenterData() && hasDeviceBranch()
      && hasRestoreDecision() && hasSyncDone();
    if (!base) {
      try { localStorage.removeItem(BOOT_DONE_KEY); } catch { /* empty */ }
      return false;
    }
    return true;
  }

  function markBootComplete() {
    if (!isBootComplete()) return false;
    try { localStorage.setItem(BOOT_DONE_KEY, '1'); } catch { /* empty */ }
    try { global.SetupStateService?.markBootCompleteDurable?.(); } catch { /* empty */ }
    try { global.ActivationSyncDefaults?.applyDefaults?.({ startSync: true, startBackup: true }); } catch { /* empty */ }
    global.AuditLogger?.logSyncEvent?.('BOOTSTRAP', { summary: 'V2-5.9 activation wizard complete' });
    return true;
  }

  function needsBootScreen() {
    // Delegate to SetupStateService (via SetupStateDom) as sole SoT.
    if (global.SetupStateDom?.needsBootFlow) return global.SetupStateDom.needsBootFlow();
    const ss = global.SetupStateService?.getState?.({ ignoreRestart: true });
    if (ss && typeof ss.needsBootFlow === 'boolean') return !!ss.needsBootFlow;
    if (bootDonePersisted() && isBootComplete()) return false;
    if (ss?.state === 'READY') return false;
    return !isBootComplete();
  }

  function bootDonePersisted() {
    try { return localStorage.getItem(BOOT_DONE_KEY) === '1'; } catch { return false; }
  }

  /**
   * Call once on app startup after relaunch — consume restart marker and never reopen Ready.
   */
  function onAppStartupAfterRelaunch() {
    const consumed = global.SetupStateService?.consumeRestartMarker?.()
      || (() => {
        try {
          if (localStorage.getItem(RESTART_REQUIRED_KEY)) {
            localStorage.removeItem(RESTART_REQUIRED_KEY);
            localStorage.setItem(BOOT_DONE_KEY, '1');
            return { consumed: true, loopDetected: false };
          }
        } catch { /* empty */ }
        return { consumed: false };
      })();
    if (consumed?.loopDetected) {
      global.notify?.('⚠️ حلقة إعادة تشغيل مكتشفة — راجع Diagnostic في أدوات الدعم', 'danger');
    }
    if (consumed?.consumed && isBootComplete()) {
      close({ showLogin: true });
      applyLoginGate();
    }
    return consumed;
  }

  function shouldAutoOpenBoot() {
    try {
      const bootParam = new URLSearchParams(global.location?.search || '').get('boot');
      if (bootParam === '0') return false;
      if (bootParam === '1' || bootParam === 'force') return true;
    } catch { /* empty */ }
    // V2-5.9: NEVER auto-open solely because Owner is missing — Google ≠ Owner.
    // Only open when the activation journey itself is incomplete.
    return needsBootScreen() && !global.currentUser;
  }

  function canShowLogin() {
    const w = loadWizard();
    if (w.completedSteps?.includes('ready') && isBootComplete()) return true;
    return isBootComplete();
  }

  function canOpenDashboard() {
    return isBootComplete() && !!global.currentUser;
  }

  function validateStep(step) {
    switch (step) {
      case 'language': return !!(loadWizard().lang);
      case 'google': return hasGoogle();
      case 'license': return hasValidLicense();
      case 'organization': return hasCenterData();
      case 'branch': return hasBranch() && hasDeviceBranch();
      case 'branch_select': return hasBranch() && hasDeviceBranch();
      case 'owner': return ownerSetupRequirementMet();
      case 'restore': return hasRestoreDecision();
      case 'sync': return hasSyncDone();
      case 'ready': return isBootComplete();
      default: return false;
    }
  }

  function completeCurrentStep(w) {
    w = w || loadWizard();
    const steps = stepsFor(w.path);
    const step = steps[w.currentStep];
    if (!w.completedSteps.includes(step)) w.completedSteps.push(step);
    if (w.currentStep < steps.length - 1) w.currentStep += 1;
    return saveWizard(w);
  }

  function hideBlockingScreens() {
    document.getElementById('licenseScreen')?.classList.add('hidden');
    document.getElementById('devContactModal')?.classList.remove('open');
    if (typeof global.CenterSetupUI?.close === 'function') global.CenterSetupUI.close();
  }

  function injectStyles() {
    const styleId = 'boot-flow-styles-v260';
    let s = document.getElementById(styleId);
    if (!s) {
      s = document.createElement('style');
      s.id = styleId;
      document.head.appendChild(s);
      ['boot-flow-styles-v258', 'boot-flow-styles-v259'].forEach((id) => {
        document.getElementById(id)?.remove();
      });
    }
    s.textContent = `
.bf-overlay{position:fixed;inset:0;z-index:100030;background:linear-gradient(145deg,#1a2f42,#2c4159);display:none;place-items:center;box-sizing:border-box;padding-block:clamp(24px,5vh,48px);padding-inline:clamp(16px,3vw,32px);overflow:hidden}
.bf-overlay.open{display:grid}
.bf-card,.bf-card.modal-shell{position:relative;z-index:1;width:min(720px,100%);max-height:calc(100dvh - (2 * clamp(24px,5vh,48px)));display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:var(--card,#fff);border-radius:var(--tdw-radius-lg,16px);border:1px solid rgba(255,255,255,.12);box-shadow:0 24px 64px rgba(0,0,0,.35);pointer-events:auto;overflow:hidden;min-height:0;box-sizing:border-box}
.bf-card-header{flex:0 0 auto;padding:14px 20px 8px;position:relative;min-height:0;border-bottom:1px solid var(--border,#e5e7eb);background:var(--card,#fff)}
.bf-card-body{min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;padding:0 20px 12px;-webkit-overflow-scrolling:touch}
.bf-card-footer{flex-shrink:0;padding:10px 20px 14px;border-top:1px solid var(--border,#e5e7eb);background:var(--card,#fff);display:grid;gap:8px;position:sticky;bottom:0;z-index:3}
.bf-card h1{margin:0 0 6px;font-size:clamp(1.05rem,2.2vw,1.35rem);font-weight:900;color:var(--primary,#3D5A80);text-align:center}
.bf-card>p,.bf-lead{margin:0 0 10px;font-size:13px;color:var(--text-muted,#666);text-align:center;line-height:1.6}
.bf-progress{display:flex;gap:4px;margin-bottom:8px;justify-content:center;flex-wrap:nowrap;overflow-x:auto;max-height:16px}
.bf-dot{width:10px;height:10px;border-radius:50%;background:var(--border,#ccc);flex:0 0 auto}
.bf-dot.done{background:#2d7a5f}
.bf-dot.current{background:var(--primary,#3D5A80);transform:scale(1.2)}
.bf-dot.failed{background:var(--tdw-color-danger-600,#a94045)}
.tdw-stepper.bf-stepper{display:flex;flex-wrap:nowrap;gap:4px;overflow-x:auto;overflow-y:hidden;max-height:2.75rem;padding-bottom:4px}
.tdw-stepper.bf-stepper>li{flex:1 0 auto;min-width:4.5rem;max-width:7rem;font-size:11px;text-align:center;padding:6px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-block-end:3px solid var(--tdw-color-neutral-300,#cbd5e1)}
.tdw-stepper.bf-stepper>li[data-state="done"]{border-color:#2d7a5f;color:#2d7a5f}
.tdw-stepper.bf-stepper>li[data-state="failed"]{border-color:var(--tdw-color-danger-600);color:var(--tdw-color-danger-600)}
.tdw-stepper.bf-stepper>li[aria-current="step"]{border-color:var(--tdw-color-accent-500,#2f8f83);color:var(--tdw-color-primary-700)}
.bf-step-meta{font-size:12px;color:var(--text-muted);text-align:center;margin-bottom:6px}
.bf-step-hint{font-size:12px;color:var(--primary);background:var(--surface,#f4f6f8);border:1px solid var(--border,#ddd);border-radius:10px;padding:10px 12px;margin-bottom:12px;line-height:1.7}
.bf-step-content{min-height:60px}
.bf-actions{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin:0;width:100%}
.bf-actions:empty{display:none}
.bf-actions .btn{width:100%;min-width:0;min-height:44px;white-space:normal;text-align:center}
.bf-choice-actions{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:12px}
.bf-choice-actions .btn{width:100%;min-height:44px;white-space:normal;text-align:center}
.bf-nav-row{display:flex;gap:8px;flex-wrap:nowrap}
.bf-nav-row .btn{flex:1 1 0;min-width:0;min-height:44px;white-space:nowrap}
.bf-status{margin-top:8px;font-size:12px;color:var(--text-muted);min-height:18px;text-align:center;line-height:1.5}
.bf-status-error{color:var(--tdw-color-danger-600,#a94045);font-weight:700}
.bf-choices{display:grid;gap:12px}
.bf-choice{padding:16px;border-radius:14px;border:2px solid var(--border,#ddd);background:var(--surface,#f8f9fa);cursor:pointer;text-align:inherit;width:100%}
.bf-choice h3{margin:0 0 6px;font-size:16px;font-weight:900;color:var(--primary)}
.bf-choice p{margin:0;font-size:12px;color:var(--text-muted)}
.bf-step{display:none}.bf-step.active{display:block}
.bf-close-btn{position:absolute;top:8px;inset-inline-start:8px;width:40px;height:40px;border-radius:10px;border:1px solid var(--border);background:var(--surface);cursor:pointer;z-index:2}
.bf-lang-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bf-lang-row .btn{min-width:0;min-height:44px}
.tdw-password-row{display:flex;gap:8px;align-items:center}
.tdw-password-row .form-control{flex:1;min-width:0}
.tdw-field-error{color:var(--tdw-color-danger-600,#a94045);font-size:12px;margin-top:4px;font-weight:700}
.ocf-form .form-group{margin-bottom:12px}
.bf-support{margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}
.bf-support-title{font-size:13px;font-weight:900;text-align:center;margin-bottom:8px}
body.bf-active #login-drive-bootstrap-panel,
body.bf-active #lic-drive-bootstrap-panel{display:none!important}
body.bf-active #licenseScreen:not(.hidden){z-index:100040!important}
body.bf-active #cloudConnectModal.open{z-index:100039!important}
body.bf-active #ops-ux-restore-wizard{z-index:100050!important}
.bf-source-card{border:1px solid var(--border,#e5e7eb);border-radius:12px;padding:12px 14px;background:var(--surface,#f8fafc);display:grid;gap:6px;text-align:start}
.bf-source-card[data-status="ready"]{border-color:#86efac;background:#f0fdf4}
.bf-source-card[data-status="not_found"],.bf-source-card[data-status="offline"],.bf-source-card[data-status="timeout"]{border-color:#fcd34d;background:#fffbeb}
.bf-source-card[data-status="error"],.bf-source-card[data-status="token_expired"]{border-color:#fca5a5;background:#fef2f2}
.bf-source-card h4{margin:0;font-size:14px}
.bf-source-meta{font-size:12px;color:var(--text-muted,#64748b);line-height:1.6;dir:rtl}
.bf-source-meta code{font-size:11px}
.bf-restore-progress{margin-top:10px;border:1px solid var(--border);border-radius:10px;padding:10px;background:#fff}
.bf-restore-progress .bar{height:8px;background:#e5e7eb;border-radius:999px;overflow:hidden}
.bf-restore-progress .bar>i{display:block;height:100%;width:0;background:#3D5A80;transition:width .2s}
@media (max-height:720px){.bf-card-header{padding-top:10px}.bf-card h1{font-size:1.05rem}}
@media (max-width:640px){.bf-nav-row{display:grid;grid-template-columns:1fr 1fr}.tdw-stepper.bf-stepper>li{min-width:3.25rem;max-width:5rem;font-size:10px}}
@media (max-width:420px){.bf-overlay{padding-inline:10px}.bf-card{width:100%}.bf-nav-row{grid-template-columns:1fr}.bf-actions .btn,.bf-choice-actions .btn{font-size:13px;white-space:normal;overflow-wrap:anywhere}}
@media (min-resolution:1.5dppx) and (max-width:1100px){.bf-actions .btn,.bf-nav-row .btn{min-height:48px;font-size:13px;white-space:normal}}
`;
  }

  function ensureDOM() {
    injectStyles();
    let el = document.getElementById('bootFlowOverlay');
    if (el) {
      // Upgrade if missing shell parts or actions still inside scroll body
      const actionsInFooter = !!el.querySelector('.bf-card-footer #bf-step-actions');
      if (!el.querySelector('.bf-card-body') || !actionsInFooter) {
        el.remove();
        el = null;
      }
    }
    if (el) return;
    el = document.createElement('div');
    el.id = 'bootFlowOverlay';
    el.className = 'bf-overlay';
    el.setAttribute('role', 'presentation');
    el.innerHTML = `
      <div class="bf-card modal-shell tdw-modal tdw-modal--wizard" role="dialog" aria-modal="true" aria-labelledby="bf-main-title" id="bf-dialog">
        <header class="bf-card-header modal-header">
          <button type="button" class="bf-close-btn" id="bf-close-btn" title="إغلاق" aria-label="إغلاق">✕</button>
          <div id="bf-step-choose" class="bf-step active">
            <h1 id="bf-main-title">مرحباً بك</h1>
            <p class="bf-lead">رحلة إعداد موحّدة — لا يمكن تخطي الخطوات المطلوبة</p>
          </div>
          <div id="bf-step-wizard" class="bf-step">
            <h1 id="bf-wizard-title">الإعداد</h1>
            <ul class="tdw-stepper bf-stepper" id="bf-stepper" aria-label="خطوات الإعداد"></ul>
            <div class="bf-progress" id="bf-progress" aria-hidden="true"></div>
            <div class="bf-step-meta" id="bf-step-meta"></div>
          </div>
        </header>
        <section class="bf-card-body modal-body">
          <div id="bf-step-choose-body" class="bf-step active">
            <div class="bf-choices">
              <button type="button" class="bf-choice" id="bf-new-customer">
                <h3>🆕 عميل جديد</h3>
                <p>ربط Google ثم التفعيل وإنشاء أول فرع</p>
              </button>
              <button type="button" class="bf-choice" id="bf-existing-customer">
                <h3>☁️ عميل حالي / جهاز جديد</h3>
                <p>ربط Google وسحب الترخيص واختيار فرع موجود ثم الاستعادة</p>
              </button>
            </div>
          </div>
          <div id="bf-wizard-body" class="bf-step">
            <p id="bf-step-label" style="font-weight:800;text-align:center"></p>
            <div class="bf-step-hint" id="bf-step-hint"></div>
            <div class="bf-step-content" id="bf-step-content"></div>
            <div class="bf-status" id="bf-wizard-status" role="status"></div>
          </div>
          <div id="bf-support-host"></div>
        </section>
        <footer class="bf-card-footer modal-footer">
          <div class="bf-actions modal-actions" id="bf-step-actions"></div>
          <div class="bf-nav-row" id="bf-step-nav"></div>
        </footer>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#bf-new-customer').onclick = () => startPath(PATHS.NEW);
    el.querySelector('#bf-existing-customer').onclick = () => startPath(PATHS.EXISTING);
    el.querySelector('#bf-close-btn')?.addEventListener('click', () => closeToLogin());
    el.addEventListener('keydown', onDialogKeydown);
  }

  function onDialogKeydown(ev) {
    if (ev.key === 'Escape') {
      // Safe close only when not in critical in-flight
      if (oauthInFlight || licenseActivateInFlight || branchCreateInFlight || ownerCreateInFlight() || restoreInFlight || syncInFlight) {
        setStatus('⚠️ عملية جارية — انتظر أو أكمل قبل الإغلاق', true);
        ev.preventDefault();
        return;
      }
      closeToLogin();
      return;
    }
    if (ev.key !== 'Tab') return;
    const dialog = document.getElementById('bf-dialog');
    if (!dialog || !document.getElementById('bootFlowOverlay')?.classList.contains('open')) return;
    const focusables = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((n) => !n.disabled && n.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      last.focus();
      ev.preventDefault();
    } else if (!ev.shiftKey && document.activeElement === last) {
      first.focus();
      ev.preventDefault();
    }
  }

  function showStep(id) {
    document.querySelectorAll('#bootFlowOverlay .bf-step').forEach((s) => s.classList.remove('active'));
    if (id === 'bf-step-choose') {
      document.getElementById('bf-step-choose')?.classList.add('active');
      document.getElementById('bf-step-choose-body')?.classList.add('active');
      const nav = document.getElementById('bf-step-nav');
      if (nav) nav.innerHTML = '';
      const actions = document.getElementById('bf-step-actions');
      if (actions) actions.innerHTML = '';
    } else {
      document.getElementById('bf-step-wizard')?.classList.add('active');
      document.getElementById('bf-wizard-body')?.classList.add('active');
    }
  }

  function renderProgress(w) {
    const steps = stepsFor(w.path);
    const host = document.getElementById('bf-progress');
    const stepper = document.getElementById('bf-stepper');
    if (host) {
      host.innerHTML = steps.map((s, i) => {
        let cls = 'bf-dot';
        if (w.completedSteps.includes(s)) cls += ' done';
        else if (i === w.currentStep) cls += ' current';
        return `<div class="${cls}" title="${STEP_LABELS[s] || s}"></div>`;
      }).join('');
    }
    if (stepper) {
      stepper.innerHTML = steps.map((s, i) => {
        let state = 'pending';
        if (w.completedSteps.includes(s)) state = 'done';
        else if (i === w.currentStep) state = 'current';
        const cur = i === w.currentStep ? 'step' : undefined;
        const short = STEP_SHORT[s] || STEP_LABELS[s] || s;
        const full = STEP_LABELS[s] || s;
        return `<li data-state="${state}" title="${full}" ${cur ? 'aria-current="step"' : ''}>${short}</li>`;
      }).join('');
    }
    const meta = document.getElementById('bf-step-meta');
    if (meta) meta.textContent = `الخطوة ${w.currentStep + 1} من ${steps.length}`;
    const label = document.getElementById('bf-step-label');
    if (label) label.textContent = STEP_LABELS[steps[w.currentStep]] || '';
    const hint = document.getElementById('bf-step-hint');
    if (hint) hint.textContent = STEP_HINTS[steps[w.currentStep]] || '';
    const title = document.getElementById('bf-wizard-title');
    if (title) title.textContent = w.path === PATHS.NEW ? 'إعداد عميل جديد' : 'جهاز / عميل حالي';
  }

  function renderNavButtons(w) {
    const nav = document.getElementById('bf-step-nav');
    if (!nav) return;
    nav.innerHTML = '';
    const steps = stepsFor(w.path);
    const step = steps[w.currentStep];
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'btn btn-ghost btn-sm';
    prev.textContent = w.currentStep > 0 ? '◀ السابق' : '◀ مرحباً بك';
    prev.onclick = () => prevStep();
    nav.appendChild(prev);

    // On ready step: no duplicate "إنهاء والدخول" — primary CTA lives in step actions only.
    if (step === 'ready') {
      return;
    }

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn btn-primary btn-sm';
    next.id = 'bf-next-btn';
    next.textContent = 'متابعة ▶';
    next.disabled = !validateStep(step);
    next.onclick = () => advanceWizard();
    nav.appendChild(next);
  }

  function addBtn(host, label, cls, handler, disabled) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + (cls || 'btn-primary');
    b.textContent = label;
    b.disabled = !!disabled;
    b.onclick = (ev) => {
      if (typeof global.runWithButtonLock === 'function') {
        return global.runWithButtonLock(b, () => handler(ev));
      }
      return handler(ev);
    };
    host.appendChild(b);
    return b;
  }

  async function refreshGoogleConnectionState() {
    if (typeof global.syncCloudStatusFromElectron === 'function') {
      try { await global.syncCloudStatusFromElectron(); } catch { /* empty */ }
    }
    let snapshot = null;
    if (typeof global.DriveAdapter?.refreshAuthoritativeConnection === 'function') {
      snapshot = await global.DriveAdapter.refreshAuthoritativeConnection();
    } else if (typeof global.DriveAdapter?.ensureConnected === 'function') {
      await global.DriveAdapter.ensureConnected();
    }
    if (typeof global.licCheck === 'function') {
      try { await global.licCheck(); } catch { /* empty */ }
    }
    return snapshot || global.DriveAdapter?.authoritySnapshot?.() || null;
  }

  async function reconcileGoogleAuthorityForOpenWizard() {
    if (googleAuthorityRefreshInFlight) return null;
    googleAuthorityRefreshInFlight = true;
    try {
      const snapshot = await refreshGoogleConnectionState();
      const overlay = document.getElementById('bootFlowOverlay');
      const wizard = loadWizard();
      if (overlay?.classList.contains('open') && wizard.path) {
        renderProgress(wizard);
        renderStepUI(wizard);
        renderNavButtons(wizard);
      }
      return snapshot;
    } finally {
      googleAuthorityRefreshInFlight = false;
    }
  }

  /**
   * After Google connects: automatically scan Drive for activation (Scenario A).
   * Single valid license → pull; multiple → needsSelection; none → Scenario B (enter key).
   */
  async function autoDiscoverActivationAfterGoogle() {
    setStatus('🔍 جارٍ فحص بيانات التفعيل على Drive/Cloud...');
    try {
      const bootstrap = global.CloudBootstrap;
      if (!bootstrap?.discoverAndFetchLicenseFromDrive) {
        return { ok: false, error: 'bootstrap_unavailable' };
      }
      let lic = await bootstrap.discoverAndFetchLicenseFromDrive({ forceList: false });
      if (lic?.error === 'multiple_licenses' && lic.needsSelection) {
        setStatus('⚠️ وُجد أكثر من ترخيص — اختر الترخيص الصحيح من القائمة');
        const host = document.getElementById('bf-license-candidates');
        if (host && typeof global.renderDriveLicenseCandidates === 'function') {
          host.style.display = '';
          global.renderDriveLicenseCandidates('bf-license-candidates', lic.candidates, {
            context: 'bootflow',
            skipModal: true,
            skipDeviceBootstrap: true,
            recovery: true
          });
        }
        return lic;
      }
      if (!lic?.ok) {
        // Retry force list scan once for legacy roots
        lic = await bootstrap.discoverAndFetchLicenseFromDrive({ forceList: true });
      }
      if (lic?.error === 'multiple_licenses') return lic;
      if (lic?.ok && lic.license) {
        const bridge = global.LicenseLegacyBridge
          || (typeof global.tdwLicenseLegacyBridge === 'function' ? global.tdwLicenseLegacyBridge() : null);
        if (bridge?.applyFromCloudDoc) {
          const applied = await bridge.applyFromCloudDoc(lic.license);
          if (!applied?.ok) return { ...applied, discovery: true };
        }
        if (typeof global.licCheck === 'function') await global.licCheck();
        const w = loadWizard();
        if (hasBranch()) {
          w.path = PATHS.EXISTING;
          if (!w.completedSteps.includes('license')) w.completedSteps.push('license');
          if (hasCenterData() && !w.completedSteps.includes('organization')) w.completedSteps.push('organization');
        } else {
          w.path = w.path || PATHS.NEW;
          if (!w.completedSteps.includes('license')) w.completedSteps.push('license');
        }
        saveWizard(w);
        setStatus('✅ تم العثور على بيانات التفعيل وسحبها بنجاح. يرجى اختيار الفرع وإدخال اسم هذا الجهاز لإكمال التسجيل.');
        return { ok: true, discovered: true, license: lic.license };
      }
      setStatus('ℹ️ لم يُعثر على تفعيل على Drive — أدخل مفتاح الترخيص للمتابعة (عميل جديد).');
      return { ok: false, error: 'no_activation_on_drive', scenario: 'B' };
    } catch (e) {
      setStatusFromErr(e, 'license_timeout');
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  async function runGoogleConnect() {
    if (oauthInFlight) {
      setStatus('⏳ ربط Google جارٍ بالفعل — انتظر', true);
      return { ok: false, error: 'oauth_in_flight' };
    }
    oauthInFlight = true;
    setStatus('🔗 جارٍ فتح Google للمصادقة...');
    try {
      const res = await global.connectGoogleDriveOnly?.({
        context: 'boot-wizard',
        skipModal: true
      }) || await global.loginConnectGoogleAndBootstrap?.({
        context: 'boot-wizard',
        fieldPrefix: 'bf',
        skipDeviceBootstrap: true,
        connectOnly: true
      }, true);
      await refreshGoogleConnectionState();
      if (!hasGoogle()) {
        setStatusFromErr(res || { message: 'oauth_failed' }, res?.error || 'oauth_failed');
        return res || { ok: false };
      }
      setStatus('✅ تم ربط Google' + (res?.email ? ' — ' + res.email : '') + ' — بدء الفحص التلقائي...');
      const discovered = await autoDiscoverActivationAfterGoogle();
      if (discovered?.ok && global.LicenseCloud?.loadLocal?.()) {
        global.populateDriveBootstrapBranchFields?.(global.LicenseCloud.loadLocal(), 'bf');
      }
      return { ok: true, email: res?.email || '', discovery: discovered };
    } catch (e) {
      setStatusFromErr(e);
      return { ok: false, error: String(e && e.message || e) };
    } finally {
      oauthInFlight = false;
      const w = loadWizard();
      renderProgress(w);
      renderNavButtons(w);
      renderStepUI(w);
    }
  }

  async function activateLicenseKey() {
    if (licenseActivateInFlight) {
      setStatus('⏳ التفعيل جارٍ — لا تضغط مجدداً', true);
      return { ok: false, error: 'activate_in_flight' };
    }
    const input = document.getElementById('bf-license-key');
    let key = String(input?.value || '').replace(/\s+/g, '').trim().toUpperCase();
    if (input) input.value = key;
    if (!key) {
      setStatus('⚠️ أدخل مفتاح الترخيص', true);
      return { ok: false, error: 'key_required' };
    }
    licenseActivateInFlight = true;
    try { global.OwnerManagement?.setSystemBusy?.('license_refresh'); } catch { /* empty */ }
    setStatus('⏳ جارٍ التحقق من الترخيص...');
    try {
      let res;
      if (typeof global.licApplyRenewal === 'function') {
        res = await global.licApplyRenewal(key, {
          errEl: document.getElementById('bf-license-error'),
          okEl: document.getElementById('bf-license-ok')
        });
      } else if (typeof global.applyLicenseKey === 'function') {
        res = await global.applyLicenseKey(key);
      } else if (global.CommercialLicense?.activateWithKey) {
        res = await global.CommercialLicense.activateWithKey(key);
      }
      if (typeof global.licCheck === 'function') await global.licCheck();
      if (res?.ok === false) {
        setStatusFromErr(res, res.error || 'license_invalid');
        return { ok: false, result: res };
      }
      if (hasValidLicense()) {
        if (res?.pendingRemoteConfirmation || res?.pendingDriveReplication || res?.remotePublished === false) {
          setStatus('⚠️ تم التفعيل محلياً، لكن تأكيد Google/Drive ما زال معلقاً. أعد المحاولة عند عودة الاتصال.', true);
        } else {
          setStatus('✅ تم التفعيل بنجاح');
        }
        return { ok: true, result: res };
      }
      setStatusFromErr(res || { message: 'license_invalid' }, 'license_invalid');
      return { ok: false, result: res };
    } catch (e) {
      setStatusFromErr(e, 'license_invalid');
      return { ok: false, error: String(e && e.message || e) };
    } finally {
      licenseActivateInFlight = false;
      try { global.OwnerManagement?.clearSystemBusy?.('license_refresh'); } catch { /* empty */ }
      const w = loadWizard();
      renderNavButtons(w);
    }
  }

  async function createFirstBranchFromForm() {
    if (branchCreateInFlight) {
      setStatusFromErr({ message: 'duplicate create' }, 'branch_duplicate_create');
      return { ok: false, error: 'in_flight' };
    }
    const nameAr = String(document.getElementById('bf-branch-name-ar')?.value || '').trim();
    const nameEn = String(document.getElementById('bf-branch-name-en')?.value || '').trim();
    const code = String(document.getElementById('bf-branch-code')?.value || '').trim();
    const city = String(document.getElementById('bf-branch-city')?.value || '').trim();
    const phone = String(document.getElementById('bf-branch-phone')?.value || '').trim();
    const deviceName = String(document.getElementById('bf-device-name')?.value || '').trim();
    if (!nameAr) {
      setStatusFromErr({ message: 'branch_name_required' }, 'branch_name_required');
      return { ok: false };
    }
    // V2-5.9: never treat placeholder / center name as the branch name.
    const centerName = String(global.settings?.centerName || global.LicenseCloud?.loadLocal?.()?.centerName || '').trim();
    const banned = ['مركز الحجامة', 'الفرع الرئيسي', 'Hijama Center', 'Main Branch', centerName].filter(Boolean);
    if (banned.some((b) => b && nameAr === b)) {
      setStatus('⚠️ أدخل اسماً مخصصاً للفرع — لا تستخدم اسم المركز أو القيمة الافتراضية', true);
      return { ok: false, error: 'branch_name_placeholder' };
    }
    if (!deviceName) {
      setStatus('⚠️ أدخل اسم هذا الجهاز', true);
      return { ok: false, error: 'device_name_required' };
    }
    branchCreateInFlight = true;
    setStatus('⏳ جارٍ إنشاء الفرع...');
    try {
      let doc = global.LicenseCloud?.loadLocal?.();
      if (!doc?.centerId) {
        setStatus('⚠️ لا يوجد ترخيص/مؤسسة صالحة لإنشاء فرع', true);
        return { ok: false, error: 'no_center' };
      }
      if (hasBranch()) {
        setStatus('ℹ️ يوجد فرع بالفعل — استخدم ربط الجهاز', true);
      } else {
        const enrolled = await global.BranchEnrollment?.enrollBranch?.(doc, {
          source: 'activation_wizard',
          branchName: nameAr,
          branchNameEn: nameEn,
          branchId: code || undefined,
          city,
          phone,
          idempotencyKey: `act-first-branch-${doc.centerId}`
        });
        if (!enrolled?.ok) {
          setStatusFromErr(enrolled, enrolled?.error === 'branch_id_exists' ? 'branch_code_duplicate' : 'branch_fetch_failed');
          return enrolled;
        }
        doc = global.LicenseCloud?.loadLocal?.() || enrolled.doc || doc;
      }
      // Lock device to branch
      const branchId = (doc.branches || []).find((b) => b && b.active !== false)?.id;
      if (branchId && global.DeviceConfig?.lockToBranch) {
        await global.DeviceConfig.lockToBranch(branchId, { deviceName, activation: true });
      } else if (branchId && global.applyDriveBootstrapDeviceLock) {
        const sel = document.getElementById('bf-branch-id');
        if (sel) sel.value = branchId;
        const nameInput = document.getElementById('bf-device-name');
        if (nameInput) nameInput.value = deviceName;
        await global.applyDriveBootstrapDeviceLock('bf');
      } else if (branchId) {
        if (global.DeviceConfig?.lockToBranch) {
          await global.DeviceConfig.lockToBranch(branchId, { deviceName, activation: true });
        } else {
          global.DeviceConfig?.setBranchLock?.(branchId, true, deviceName, { activation: true });
        }
      }
      try {
        await global.LicenseCloud?.ensurePushedToDrive?.();
      } catch { /* empty */ }
      try { global.ActivationSyncDefaults?.applyDefaults?.({ startSync: false }); } catch { /* empty */ }
      try { global.ensureBranchStaffAccounts?.(global.DB?.get?.('users', global.users || []), branchId); } catch { /* empty */ }
      try { localStorage.setItem(RESTART_REQUIRED_KEY, '1'); } catch { /* empty */ }
      const bLabel = global.BranchDisplay?.resolveBranchName?.(branchId) || branchId;
      setStatus(`✅ تم تسجيل الجهاز وربطه بفرع «${bLabel}» بنجاح. سيتم إعادة تشغيل البرنامج لتطبيق التفعيل واستكمال المزامنة.`);
      return { ok: true, restartRequired: true };
    } catch (e) {
      setStatusFromErr(e);
      return { ok: false };
    } finally {
      branchCreateInFlight = false;
      const w = loadWizard();
      renderNavButtons(w);
      renderStepUI(w);
    }
  }

  async function bindExistingBranch() {
    const deviceName = String(document.getElementById('bf-device-name')?.value || '').trim();
    const branchId = String(document.getElementById('bf-branch-id')?.value || '').trim();
    if (!deviceName || !branchId) {
      setStatus('⚠️ أدخل اسم الجهاز واختر الفرع', true);
      return { ok: false };
    }
    setStatus('⏳ جارٍ ربط الجهاز بالفرع...');
    try {
      const lock = await global.applyDriveBootstrapDeviceLock?.('bf');
      if (lock && lock.ok === false) {
        setStatus('⚠️ ' + (global._DRIVE_BOOTSTRAP_ERR_AR?.[lock.error] || lock.error || 'فشل الربط'), true);
        return lock;
      }
      if (!lock && global.DeviceConfig?.lockToBranch) {
        await global.DeviceConfig.lockToBranch(branchId, { deviceName, activation: true });
      } else if (!hasDeviceBranch()) {
        if (global.DeviceConfig?.lockToBranch) {
          await global.DeviceConfig.lockToBranch(branchId, { deviceName, activation: true });
        } else {
          global.DeviceConfig?.setBranchLock?.(branchId, true, deviceName, { activation: true });
        }
      }
      try {
        await global.DeviceRegistry?.registerDevice?.({ deviceName, branchId });
      } catch { /* empty */ }
      try {
        await global.LicenseCloud?.ensurePushedToDrive?.();
      } catch { /* empty */ }
      try { global.ActivationSyncDefaults?.applyDefaults?.({ startSync: false }); } catch { /* empty */ }
      try { global.ensureBranchStaffAccounts?.(global.DB?.get?.('users', global.users || []), branchId); } catch { /* empty */ }
      try { localStorage.setItem(RESTART_REQUIRED_KEY, '1'); } catch { /* empty */ }
      const bLabel = global.BranchDisplay?.resolveBranchName?.(branchId) || branchId;
      setStatus(`✅ تم تسجيل الجهاز وربطه بفرع «${bLabel}» بنجاح. سيتم إعادة تشغيل البرنامج لتطبيق التفعيل واستكمال المزامنة.`);
      return { ok: true, restartRequired: true };
    } catch (e) {
      setStatusFromErr(e);
      return { ok: false };
    } finally {
      renderNavButtons(loadWizard());
      renderStepUI(loadWizard());
    }
  }

  async function createOwnerFromWizard() {
    if (ownerCreateInFlight()) {
      setStatus('⏳ إنشاء المالك جارٍ — انتظر', true);
      return { ok: false, error: 'creation_in_progress' };
    }
    if (hasOwnerPasswordAccount()) {
      setStatus('✅ حساب المالك جاهز');
      return { ok: true, already: true };
    }
    const mode = global.OwnerLifecycleAuthority?.getMode?.();
    const w = loadWizard();
    if (
      w.path === PATHS.EXISTING
      || mode === 'existing'
      || mode === 'restore'
      || mode === 'replacement'
    ) {
      setStatus('⚠️ مسار العميل الحالي — استرداد فقط، لا إنشاء مالك جديد', true);
      return { ok: false, error: 'owner_create_blocked', code: 'EXISTING_NO_CREATE', mode };
    }
    const busy = global.OwnerManagement?.getSystemBusyReason?.();
    if (busy === 'restore' || busy === 'sync' || busy === 'license_refresh') {
      setStatus('⚠️ انتظر انتهاء ' + busy + ' قبل إنشاء Owner', true);
      return { ok: false, error: 'system_busy', busy };
    }
    setStatus('⏳ جارٍ إنشاء حساب المالك...');
    try {
      // PR11: canonical first-owner commit (idempotent retry/restart).
      let res;
      if (global.OwnerManagement?.setupCommitOwner) {
        res = await global.OwnerManagement.setupCommitOwner({ idPrefix: 'ocf' });
      } else if (global.OwnerManagement?.createOwner) {
        res = await global.OwnerManagement.createOwner({ idPrefix: 'ocf' });
      } else {
        res = await global.OwnerCreateForm?.createOwnerFromForm?.('ocf');
      }
      if (!res?.ok) {
        setStatusFromErr(res, res?.code || res?.error);
        return res || { ok: false };
      }
      try { global.OwnerSetupState?.clearRequired?.(); } catch { /* empty */ }
      try { global.OwnerManagement?.clearBootstrapOpenRequest?.(); } catch { /* empty */ }
      setStatus('✅ تم إنشاء حساب المالك (Owner)');
      try { global.OwnerHub?.applyNavVisibility?.(); } catch { /* empty */ }
      return res;
    } catch (e) {
      setStatusFromErr(e);
      return { ok: false };
    } finally {
      renderNavButtons(loadWizard());
      renderStepUI(loadWizard());
    }
  }

  function renderStepUI(w) {
    const steps = stepsFor(w.path);
    const step = steps[w.currentStep];
    const content = document.getElementById('bf-step-content');
    const actions = document.getElementById('bf-step-actions');
    if (!content || !actions) return;
    content.innerHTML = '';
    actions.innerHTML = '';

    switch (step) {
      case 'language': {
        content.innerHTML = '<p class="bf-lead">اختر لغة الواجهة</p><div class="bf-lang-row" id="bf-lang-row"></div>';
        const row = content.querySelector('#bf-lang-row');
        [['ar', 'العربية'], ['en', 'English']].forEach(([code, label]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn ' + ((w.lang || 'ar') === code ? 'btn-primary' : 'btn-secondary');
          b.textContent = label;
          b.onclick = () => {
            w.lang = code;
            saveWizard(w);
            try { localStorage.setItem(LANG_KEY, code); } catch { /* empty */ }
            global.UxI18n?.setLang?.(code);
            global.UxI18n?.applyDocumentLang?.(document, code);
            setStatus(code === 'ar' ? '✅ العربية' : '✅ English');
            renderProgress(loadWizard());
            renderNavButtons(loadWizard());
            renderStepUI(loadWizard());
          };
          row.appendChild(b);
        });
        break;
      }
      case 'google': {
        content.innerHTML = '<p>اربط حساب Google الخاص بالمركز. بعد الربط يبدأ فحص التفعيل تلقائياً (بدون زر إضافي).</p><div id="bf-google-email" class="bf-lead" dir="ltr"></div><div id="bf-license-candidates" style="display:none"></div>';
        const emailEl = content.querySelector('#bf-google-email');
        const provEmail = global.settings?.backup?.providers?.google?.email || '';
        if (hasGoogle() && provEmail) emailEl.textContent = '✅ ' + provEmail;
        const btn = addBtn(actions, oauthInFlight ? '⏳ جارٍ الربط...' : '🔗 ربط Google', 'btn-primary', () => runGoogleConnect(), oauthInFlight);
        btn.id = 'bf-google-connect-btn';
        if (hasGoogle()) {
          addBtn(actions, '🔌 فصل حساب Google', 'btn-ghost', async () => {
            if (!window.confirm('فصل حساب Google ومسح بيانات الإعداد المرتبطة (الترخيص/المركز/الفرع)؟')) return;
            setStatus('⏳ جاري فصل Google...');
            const res = await global.BootstrapGoogleDisconnect?.disconnectGoogleDuringBootstrap?.();
            if (!res?.ok) {
              setStatus('❌ ' + (res?.error || 'disconnect_failed'), true);
              return;
            }
            setStatus('✅ تم فصل Google — يمكنك ربط حساب آخر');
            renderStepUI(loadWizard());
          }, oauthInFlight);
          addBtn(actions, '🔄 تغيير حساب Google', 'btn-secondary', async () => {
            if (!window.confirm('سيتم فصل الحساب الحالي ثم ربط حساب Google جديد. متابعة؟')) return;
            setStatus('⏳ جاري فصل Google...');
            const res = await global.BootstrapGoogleDisconnect?.disconnectGoogleDuringBootstrap?.();
            if (!res?.ok) {
              setStatus('❌ ' + (res?.error || 'disconnect_failed'), true);
              return;
            }
            await runGoogleConnect();
          }, oauthInFlight);
        }
        if (hasGoogle() && hasValidLicense()) setStatus('✅ Google متصل والترخيص جاهز — تابع للمؤسسة/الفرع');
        else if (hasGoogle()) setStatus('✅ Google متصل — إن لم يُعثر على تفعيل أدخل المفتاح في الخطوة التالية');
        break;
      }
      case 'license': {
        content.innerHTML = `
          <p>${hasValidLicense() ? '✅ الترخيص جاهز من الفحص التلقائي.' : 'لم يُعثر على تفعيل تلقائي — أدخل مفتاح الترخيص.'}</p>
          <label for="bf-license-key">مفتاح التفعيل</label>
          <input type="text" id="bf-license-key" class="form-control" dir="ltr" autocomplete="off" placeholder="XXXX-XXXX-...">
          <div id="bf-license-error" class="bf-status-error" role="alert" style="display:none;margin-top:8px"></div>
          <div id="bf-license-ok" role="status" style="display:none;margin-top:8px;color:var(--success,#1f8f54)"></div>
          <div id="bf-license-candidates" style="display:none;margin-top:8px"></div>`;
        const keyInput = content.querySelector('#bf-license-key');
        keyInput?.addEventListener('paste', () => {
          setTimeout(() => { keyInput.value = String(keyInput.value || '').replace(/\s+/g, '').trim().toUpperCase(); }, 0);
        });
        addBtn(actions, licenseActivateInFlight ? '⏳ جارٍ التفعيل...' : '✅ تحقق وتفعيل', 'btn-primary', () => activateLicenseKey(), licenseActivateInFlight);
        addBtn(actions, '🔁 إعادة فحص Drive', 'btn-secondary', async () => {
          setStatus('⏳ جارٍ إعادة الفحص...');
          await autoDiscoverActivationAfterGoogle();
          renderNavButtons(loadWizard());
          renderStepUI(loadWizard());
        });
        if (hasValidLicense()) setStatus('✅ الترخيص صالح');
        break;
      }
      case 'organization': {
        const lic = global.LicenseCloud?.loadLocal?.() || {};
        const cid = lic.centerId || global.CenterId?.getStoredCenterId?.() || '';
        const cname = lic.centerName || global.settings?.centerName || '';
        const isExisting = w.path === PATHS.EXISTING;
        const nameReadonly = isExisting;
        const intro = isExisting
          ? '<p>هوية المؤسسة من الترخيص/Drive — للعرض والتأكيد فقط (لا تعديل أثناء الإعداد).</p>'
          : '<p>أدخل اسم المؤسسة قبل الإنشاء. <code dir="ltr">Center ID</code> يُثبت من النظام/الترخيص.</p>';
        content.innerHTML = `${intro}
          <div class="form-group"><label>Center ID</label><input class="form-control" id="bf-org-id" dir="ltr" value="${String(cid).replace(/"/g, '&quot;')}" readonly tabindex="-1"></div>
          <div class="form-group"><label>اسم المؤسسة</label><input class="form-control" id="bf-org-name" value="${String(cname).replace(/"/g, '&quot;')}" ${nameReadonly ? 'readonly tabindex="-1"' : ''}></div>`;
        addBtn(actions, isExisting ? '✔️ تأكيد هوية المؤسسة' : '💾 تأكيد المؤسسة', 'btn-primary', () => {
          const name = String(document.getElementById('bf-org-name')?.value || '').trim();
          if (!name) { setStatus('⚠️ أدخل اسم المؤسسة', true); return; }
          if (isExisting && cname && name !== cname) {
            setStatus('⚠️ في مسار عميل حالي لا يُسمح بتغيير اسم المؤسسة أثناء الإعداد', true);
            return;
          }
          if (!global.settings) global.settings = global.DB?.get?.('settings', {}) || {};
          if (!isExisting) {
            global.settings.centerName = name;
            global.DB?.set?.('settings', global.settings);
            if (lic.centerId) {
              lic.centerName = name;
              global.LicenseCloud?.saveLocal?.(lic);
            }
            try { global.Organization?.saveDisplayName?.(name); } catch { /* empty */ }
          }
          setStatus(isExisting ? '✅ تم تأكيد هوية المؤسسة' : '✅ تم تأكيد المؤسسة');
          renderNavButtons(loadWizard());
        });
        if (hasCenterData()) setStatus('✅ بيانات المؤسسة جاهزة');
        break;
      }
      case 'branch': {
        if (hasBranch()) {
          content.innerHTML = `
            <p>يوجد فرع في الترخيص — اربط هذا الجهاز به.</p>
            <div class="form-group"><label>اسم الجهاز</label><input id="bf-device-name" class="form-control" placeholder="Reception-PC"></div>
            <div class="form-group"><label>الفرع</label><select id="bf-branch-id" class="form-control"></select></div>`;
          global.populateDriveBootstrapBranchFields?.(global.LicenseCloud.loadLocal(), 'bf');
          addBtn(actions, '🔗 ربط الجهاز بالفرع', 'btn-primary', () => bindExistingBranch());
        } else {
          content.innerHTML = `
            <p><strong>إنشاء أول فرع</strong> — لا توجد فروع بعد.</p>
            <div class="form-group"><label>اسم الفرع (عربي) *</label><input id="bf-branch-name-ar" class="form-control" required></div>
            <div class="form-group"><label>الاسم بالإنجليزية</label><input id="bf-branch-name-en" class="form-control" dir="ltr"></div>
            <div class="form-group"><label>رمز داخلي (اختياري — للمزامنة فقط)</label><input id="bf-branch-code" class="form-control" dir="ltr" placeholder="يُولَّد تلقائياً"></div>
            <p class="bf-source-meta" style="margin:-4px 0 8px">الاسم العربي أعلاه هو ما يظهر في الواجهة — الرمز الداخلي لا يُعرض للمستخدمين.</p>
            <div class="form-group"><label>المدينة</label><input id="bf-branch-city" class="form-control"></div>
            <div class="form-group"><label>الهاتف</label><input id="bf-branch-phone" class="form-control" dir="ltr"></div>
            <div class="form-group"><label>اسم هذا الجهاز *</label><input id="bf-device-name" class="form-control" placeholder="Reception-PC"></div>
            <select id="bf-branch-id" class="form-control" hidden></select>`;
          addBtn(actions, branchCreateInFlight ? '⏳ جارٍ الإنشاء...' : '➕ إنشاء أول فرع وربطه', 'btn-primary', () => createFirstBranchFromForm(), branchCreateInFlight);
        }
        break;
      }
      case 'branch_select': {
        content.innerHTML = `
          <p><strong>اختيار فرع موجود</strong> وربط هذا الجهاز به (ليس إنشاء فرع جديد).</p>
          <div class="form-group"><label>اسم الجهاز</label><input id="bf-device-name" class="form-control" placeholder="Clinic-PC-2"></div>
          <div class="form-group"><label>الفرع الموجود</label><select id="bf-branch-id" class="form-control"></select></div>`;
        const lic = global.LicenseCloud?.loadLocal?.();
        if (lic) global.populateDriveBootstrapBranchFields?.(lic, 'bf');
        if (!hasBranch()) {
          content.innerHTML += '<p class="tdw-field-error">لا توجد فروع — ارجع لمسار عميل جديد أو أنشئ فرعاً من Owner Hub بعد الدخول.</p>';
        }
        addBtn(actions, '🔗 ربط هذا الجهاز بالفرع', 'btn-primary', () => bindExistingBranch(), !hasBranch());
        break;
      }
      case 'owner': {
        const st = global.OwnerManagement?.getOwnerState?.()?.state;
        const mode = global.OwnerLifecycleAuthority?.getMode?.();
        const recoverOnly = w.path === PATHS.EXISTING
          || mode === 'existing'
          || mode === 'restore'
          || mode === 'replacement';
        if (st === 'OWNER_EXISTS' || hasOwnerPasswordAccount()) {
          content.innerHTML = '<p>✅ حساب المالك (Owner) موجود بكلمة مرور. يمكنك المتابعة.</p>';
          setStatus('✅ Owner جاهز');
        } else if (st === 'OWNER_CREATION_IN_PROGRESS') {
          content.innerHTML = '<p>⏳ إنشاء المالك جارٍ — لا تبدأ عملية ثانية.</p>';
          setStatus('⏳ OWNER_CREATION_IN_PROGRESS', true);
        } else if (recoverOnly) {
          content.innerHTML = '<p>مسار استرداد — لا يمكن إنشاء مالك جديد. استعد من النسخة الاحتياطية أو سجّل الدخول بحساب المالك الموجود.</p>';
          setStatus('⚠️ EXISTING/RESTORE: استرداد فقط — لا create', true);
        } else {
          const label = (st === 'OWNER_CORRUPTED' || st === 'OWNER_RECOVERY_REQUIRED')
            ? 'استرداد / إصلاح حساب المالك — كلمة المرور إلزامية.'
            : 'أنشئ حساب المالك المستقل — كلمة المرور إلزامية.';
          content.innerHTML = `<p>${label}</p>`
            + (global.OwnerCreateForm?.renderFormHtml?.({ idPrefix: 'ocf' }) || '<p>OwnerCreateForm غير محمّل</p>');
          global.OwnerCreateForm?.bindPasswordToggles?.(content);
          const creating = ownerCreateInFlight();
          addBtn(actions, creating ? '⏳ جارٍ الإنشاء...' : '👤 إنشاء حساب المالك', 'btn-primary', () => createOwnerFromWizard(), creating);
        }
        break;
      }
      case 'restore': {
        // Fast Discovery (metadata) then Confirmed Restore — never silent infinite loader.
        content.innerHTML = `
          <p><strong>اختر مصدر البيانات</strong> — يتم فحص الخيارات المتاحة بسرعة قبل أي تنزيل.</p>
          <div id="bf-discovery-status" class="bf-source-meta">⏳ جارٍ فحص مصادر البيانات (بدون تنزيل)…</div>
          <div class="bf-choice-actions" id="bf-restore-choices" style="display:grid;gap:10px;margin-top:10px"></div>
          <div id="bf-restore-progress-host"></div>`;
        const choiceHost = content.querySelector('#bf-restore-choices') || content;
        const statusEl = content.querySelector('#bf-discovery-status');
        const progressHost = content.querySelector('#bf-restore-progress-host');
        const Discovery = global.CloudDataDiscovery;

        const markRestore = (choice, msg) => {
          const w2 = loadWizard();
          w2.restoreChoice = choice;
          w2.cloudDiscovery = Discovery?.getLastDiscovery?.() || w2.cloudDiscovery || null;
          saveWizard(w2);
          setStatus(msg);
          renderNavButtons(loadWizard());
          establishBootSyncBaseline().catch(() => {});
        };

        const renderProgress = (snap) => {
          if (!progressHost || !snap) return;
          const stageLine = snap.stageCount
            ? `${snap.stageIndex || 0}/${snap.stageCount} — ${snap.stageLabel || '—'}`
            : (snap.stageLabel || 'فحص مصادر البيانات');
          const eta = snap.etaMs > 0 ? ` · متبقٍ ~${Math.round(snap.etaMs / 1000)}ث` : '';
          const stalled = snap.stalled ? '<br><span class="tdw-field-error">⚠️ لم يصل تقدم جديد — يمكنك إعادة الفحص</span>' : '';
          progressHost.innerHTML = `<div class="bf-restore-progress" dir="rtl">
            <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px">
              <span>${stageLine}</span>
              <strong dir="ltr">${snap.percent || 0}%</strong>
            </div>
            <div class="bar"><i style="width:${snap.percent || 0}%"></i></div>
            <div class="bf-source-meta" style="margin-top:6px">
              المنقضي: ${Math.round((snap.elapsedMs || 0) / 1000)}ث${eta}
              ${snap.budgetMs ? ` / ~${Math.round(snap.budgetMs / 1000)}ث` : ''}
              ${snap.backupCount ? ` · نسخ Backup: ${snap.backupCount}` : (snap.foundCount ? ` · وُجد: ${snap.foundCount}` : '')}
              ${snap.downloadedBytes ? ` · منزّل: ${Discovery.formatBytes(snap.downloadedBytes)}` : ''}
              ${snap.totalBytes ? ` / ${Discovery.formatBytes(snap.totalBytes)}` : ''}<br>
              آخر نشاط: ${snap.lastActivity || '—'}
              ${snap.diagnosticId ? `<br>Diagnostic ID: <code dir="ltr">${snap.diagnosticId}</code>` : ''}
              ${stalled}
            </div>
          </div>`;
        };

        const renderBackupTable = (backups, hostEl, onSelect) => {
          if (!hostEl || !Array.isArray(backups) || !backups.length) return;
          const formatValidation = (bp) => {
            if (bp.validation === 'metadata_suspicious_small') return '⚠️ صغيرة جداً';
            const type = bp.backupClassLabel || bp.backupClass || '—';
            const scope = bp.scopeLabel || '—';
            const sizeHint = (bp.sizeBytes || 0) < 100 * 1024 ? ' · قد تكون فارغة' : '';
            return `${type} · ${scope}${sizeHint}`;
          };
          const rows = backups.map((bp, i) => {
            const rec = i === 0 ? ' (الأحدث — موصى به)' : '';
            return `<tr>
              <td>#${i + 1}${rec}</td>
              <td>${Discovery.formatWhen(bp.modifiedAt)}</td>
              <td dir="ltr">${Discovery.formatBytes(bp.sizeBytes)}</td>
              <td>${formatValidation(bp)}</td>
              <td><button type="button" class="btn btn-sm btn-accent bf-pick-backup" data-idx="${i}">استعادة Backup V2</button></td>
            </tr>`;
          }).join('');
          hostEl.innerHTML = `<table class="table table-sm" dir="rtl" style="width:100%;margin-top:8px">
            <thead><tr><th>النسخة</th><th>التاريخ</th><th>الحجم</th><th>النوع / النطاق</th><th></th></tr></thead>
            <tbody>${rows}</tbody></table>`;
          hostEl.querySelectorAll('.bf-pick-backup').forEach((btn) => {
            btn.addEventListener('click', () => {
              const idx = Number(btn.getAttribute('data-idx'));
              if (backups[idx]) onSelect(backups[idx]);
            });
          });
        };

        const addSourceCard = (opts) => {
          const card = document.createElement('div');
          card.className = 'bf-source-card';
          card.dataset.status = opts.status || 'unknown';
          card.innerHTML = `<h4>${opts.title}</h4>
            <div class="bf-source-meta">${opts.metaHtml || ''}</div>
            <div class="bf-source-actions" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px"></div>`;
          const actions = card.querySelector('.bf-source-actions');
          choiceHost.appendChild(card);
          return { card, actions };
        };

        const runDiscovery = async () => {
          if (restoreInFlight) {
            setStatus('⚠️ عملية جارية — انتظر', true);
            return;
          }
          if (!Discovery?.discoverAllSources) {
            if (statusEl) {
              statusEl.textContent = '⚠️ وحدة الاكتشاف غير محمّلة — حدّث التطبيق أو أعد التحميل.';
            }
            // Still show non-cloud alternatives
            addBtn(choiceHost, '💾 استخدام البيانات المحلية الموجودة', 'btn-secondary', async () => {
              markRestore('local', '✅ سيتم استخدام قاعدة البيانات المحلية الحالية');
            });
            addBtn(choiceHost, '📁 اختيار ملف Backup / Database', 'btn-secondary', async () => {
              try { await global.OpsUxBridge?.openRestoreWizard?.({ preferFile: true }); } catch { /* empty */ }
              markRestore('file', '✅ تم اختيار مسار ملف النسخة/قاعدة البيانات');
            });
            addBtn(choiceHost, '📭 البدء بدون قاعدة بيانات سابقة', 'btn-ghost', () => {
              markRestore('empty', '✅ بدء صريح بدون قاعدة سابقة');
            });
            return;
          }

          restoreInFlight = true;
          try { global.OwnerManagement?.setSystemBusy?.('discovery'); } catch { /* empty */ }
          const discoveryBudgetMs = Discovery.DISCOVERY_TIMEOUT_MS || 60000;
          setStatus(`🔍 فحص مصادر البيانات (حتى ${Math.round(discoveryBudgetMs / 1000)}ث) — بلا تنزيل…`);
          choiceHost.innerHTML = '';
          if (statusEl) statusEl.textContent = '⏳ جارٍ الفحص: سحابة / محلي / نسخ — مع مؤشر تقدم…';
          if (progressHost) {
            renderProgress({
              stageLabel: 'بدء الفحص',
              percent: 2,
              elapsedMs: 0,
              budgetMs: discoveryBudgetMs,
              lastActivity: 'بيانات وصفية فقط — لا تنزيل',
            });
          }

          let discovery;
          try {
            discovery = await Discovery.discoverAllSources({
              timeoutMs: discoveryBudgetMs,
              onProgress: (snap) => {
                renderProgress(snap);
                if (statusEl && snap?.stageLabel) {
                  statusEl.textContent = `⏳ ${snap.stageLabel} — ${snap.percent || 0}%`;
                }
              },
            });
          } catch (e) {
            discovery = { ok: false, error: e.message || String(e), cloud: { status: 'error', message: e.message } };
          } finally {
            restoreInFlight = false;
            try { global.OwnerManagement?.clearSystemBusy?.('discovery'); } catch { /* empty */ }
          }

          const cloud = discovery?.cloud || {};
          const dur = discovery?.durationMs != null ? `${discovery.durationMs}ms` : '—';
          const cloudHasPoint = !!(cloud.newestBackup || (cloud.newest && (cloud.newest.kind === 'backup_v2' || cloud.newest.kind === 'backup_file')) || (cloud.status === 'ready' || cloud.status === 'ipc_missing') && cloud.latestBackups?.length);
          const cloudPartial = !!(cloud.partialScan || cloud.timedOut);
          if (statusEl) {
            if (cloudHasPoint && cloudPartial) {
              statusEl.textContent = `⚠️ نتائج Drive جزئية (${dur}) — وُجدت نسخة للتأكيد، لكن القائمة ليست كاملة.`;
            } else if (cloudPartial) {
              statusEl.textContent = `⚠️ نتائج Drive غير مكتملة (${dur}). أعد المحاولة أو اختر مصدراً آخر.`;
            } else {
              statusEl.textContent = `✅ اكتمل الفحص خلال ${dur}. لا تنزيل أثناء الاكتشاف.`;
            }
          }
          setStatus(cloudPartial && !cloudHasPoint
            ? '⚠️ نتائج Drive غير مكتملة — لا يمكن الجزم بعدم وجود نسخة'
            : (cloudHasPoint && cloudPartial ? '⚠️ نتائج جزئية — يمكن تأكيد النقطة المختارة فقط' : '✅ نتائج الفحص جاهزة'));

          // --- Cloud card ---
          const latestBackups = (cloud.latestBackups && cloud.latestBackups.length)
            ? cloud.latestBackups
            : (cloud.newestBackup ? [cloud.newestBackup] : (cloud.newest && (cloud.newest.kind === 'backup_v2' || cloud.newest.kind === 'backup_file') ? [cloud.newest] : []));
          const newestBackup = cloud.newestBackup || latestBackups[0] || null;
          const syncRestorePoints = cloud.syncRestorePoints || [];
          const newestSyncCheckpoint = cloud.newestSyncCheckpoint || syncRestorePoints[0] || null;
          const cloudStatus = cloud.status || 'unknown';
          const summaryHtml = cloud.summary && Discovery.formatDiscoverySummaryHtml
            ? `<div class="bf-discovery-summary" style="margin:8px 0;padding:8px;border:1px solid var(--border,#ddd);border-radius:6px">${Discovery.formatDiscoverySummaryHtml(cloud.summary)}</div>`
            : '';
          const cloudMeta = newestBackup
            ? `الحالة: <strong>${cloudPartial ? 'جاهزة للتأكيد (نتائج جزئية)' : 'جاهزة للتأكيد'}</strong><br>
               ${cloudPartial ? `<span class="bf-source-meta">⚠️ ${cloud.message || 'نتائج Drive غير مكتملة؛ لا تعتبر القائمة كاملة.'}</span><br>` : ''}
               ${summaryHtml}
               ${newestSyncCheckpoint ? `<span class="bf-source-meta">Sync checkpoint: <code dir="ltr">${newestSyncCheckpoint.path || newestSyncCheckpoint.name || '—'}</code></span><br>` : '<span class="bf-source-meta">Sync hydrate: لا توجد بيانات Sync للفرع في metadata</span><br>'}
               <div id="bf-cloud-backup-table"></div>`
            : `${summaryHtml}الحالة: <strong>${cloudStatus}</strong><br>${cloud.message || 'لم يتم العثور على نسخ سحابية — جرّب «ملف Backup» أو تأكد من حساب Google.'}`;

          const cloudCard = addSourceCard({
            title: '☁️ بيانات سحابية (آخر 3 نسخ Backup V2)',
            status: newestBackup ? 'ready' : cloudStatus,
            metaHtml: cloudMeta,
          });

          if (latestBackups.length) {
            const tableHost = cloudCard.card.querySelector('#bf-cloud-backup-table');
            renderBackupTable(latestBackups, tableHost, (point) => {
              cloudCard.card.dataset.selectedBackup = point.path || point.name;
              void runCloudBackupV2Restore(point);
            });
          }

          const runCloudBackupV2Restore = async (point) => {
            if (!point) return;
            if (restoreInFlight || Discovery.isRestoreLocked?.()) {
              setStatus('⚠️ عملية استعادة جارية — انتظر', true);
              return;
            }
            if (!Discovery?.confirmedBackupV2Restore) {
              setStatus('⚠️ مسار استعادة Backup V2 غير متاح — حدّث التطبيق', true);
              return;
            }
            restoreInFlight = true;
            try { global.OwnerManagement?.setSystemBusy?.('restore'); } catch { /* empty */ }
            setStatus('⏳ جارٍ تنزيل واستعادة Backup V2 (atomic — استبدال SQLite)…');
            try {
              const result = await Discovery.confirmedBackupV2Restore(point, {
                onProgress: (snap) => {
                  renderProgress(snap);
                  setStatus(`⏳ ${snap.stageLabel} — ${snap.percent}%`);
                },
              });
              if (!result?.ok) {
                setStatus(
                  `❌ فشل استعادة Backup V2: ${result?.message || result?.error || 'unknown'}`
                  + (result?.diagnosticId ? ` · ID ${result.diagnosticId}` : ''),
                  true
                );
                if (progressHost && result?.verified?.summary) {
                  progressHost.innerHTML += global.RestoreVerification?.formatSummaryHtml?.(result.verified.summary) || '';
                }
                return;
              }
              try { await global.reconcileAuthUsersAfterHydrate?.(); } catch { /* empty */ }
              if (progressHost && global.RestoreVerification?.formatSummaryHtml && result?.verified?.summary) {
                progressHost.innerHTML += global.RestoreVerification.formatSummaryHtml(result.verified.summary);
              }
              markRestore('backup_v2', '✅ تمت استعادة Backup V2 والتحقق — انتقل للمزامنة');
              setStatus('✅ تم استعادة Backup V2 والتحقق منه — المزامنة التالية تسحب الأحدث فقط');
            } catch (e) {
              setStatusFromErr(e, 'restore_interrupted');
            } finally {
              restoreInFlight = false;
              try { global.OwnerManagement?.clearSystemBusy?.('restore'); } catch { /* empty */ }
              renderNavButtons(loadWizard());
            }
          };

          const runCloudSyncHydrate = async (point) => {
            if (!point) return;
            if (!Discovery?.isSyncHydrateRestorePoint?.(point)) {
              setStatus('⚠️ لا توجد بيانات Sync صالحة — استخدم استعادة Backup V2', true);
              return;
            }
            if (restoreInFlight || Discovery.isRestoreLocked?.()) {
              setStatus('⚠️ عملية سحب جارية — انتظر', true);
              return;
            }
            restoreInFlight = true;
            try { global.OwnerManagement?.setSystemBusy?.('restore'); } catch { /* empty */ }
            setStatus('⏳ جارٍ سحب/دمج أحدث بيانات المزامنة للفرع (بدون استبدال DB)…');
            try {
              const result = await Discovery.confirmedCloudRestore(point, {
                onProgress: (snap) => {
                  renderProgress(snap);
                  setStatus(`⏳ ${snap.stageLabel} — ${snap.percent}%`);
                },
              });
              if (!result?.ok) {
                setStatus(
                  `❌ فشل سحب السحابة: ${result?.message || result?.error || 'unknown'}`
                  + (result?.diagnosticId ? ` · ID ${result.diagnosticId}` : ''),
                  true
                );
                if (progressHost) {
                  progressHost.innerHTML += `<p class="bf-source-meta">لم تُستبدل قاعدة البيانات المحلية — هذا سحب أحدث بيانات المزامنة للفرع فقط.</p>`;
                }
                return;
              }
              setStatus('⏳ جاري التحقق من البيانات المستعادة...');
              try { await global.reconcileAuthUsersAfterHydrate?.(); } catch { /* empty */ }
              const verified = await global.RestoreVerification?.verifyPostRestore?.({
                kind: 'cloud_hydrate',
                point,
                source: 'bootflow_cloud_restore',
                ...bootstrapRestoreVerifyOptions(),
              });
              if (!verified?.verified) {
                setStatus(
                  `❌ فشل التحقق بعد الاستعادة: ${verified?.error || 'restore_verification_failed'}`,
                  true
                );
                if (progressHost) {
                  progressHost.innerHTML += `<p class="tdw-field-error">لم تُكمل خطوة الاستعادة — البيانات غير مؤكدة.</p>`;
                }
                return;
              }
              try { await global.reconcileAuthUsersAfterHydrate?.(); } catch { /* empty */ }
              if (progressHost && global.RestoreVerification?.formatSummaryHtml) {
                progressHost.innerHTML += global.RestoreVerification.formatSummaryHtml(verified.summary);
              }
              markRestore('cloud', '✅ تم سحب/دمج بيانات السحابة والتحقق — انتقل للمزامنة');
              setStatus('✅ تم سحب السحابة — المزامنة التالية تسحب الأحدث فقط');
            } catch (e) {
              setStatusFromErr(e, 'restore_interrupted');
            } finally {
              restoreInFlight = false;
              try { global.OwnerManagement?.clearSystemBusy?.('restore'); } catch { /* empty */ }
              renderNavButtons(loadWizard());
            }
          };

          if (newestBackup && (cloudStatus === 'ready' || cloudStatus === 'ipc_missing')) {
            addBtn(cloudCard.actions, 'استعادة أحدث نسخة Backup V2', 'btn-primary', () => runCloudBackupV2Restore(newestBackup));
            if (newestSyncCheckpoint) {
              addBtn(cloudCard.actions, 'سحب أحدث بيانات المزامنة للفرع', 'btn-secondary', () => runCloudSyncHydrate(newestSyncCheckpoint));
            } else {
              addBtn(cloudCard.actions, 'سحب أحدث بيانات المزامنة للفرع (لا توجد بيانات)', 'btn-secondary', () => {
                setStatus('⚠️ لا توجد بيانات Sync للفرع — استخدم استعادة Backup V2', true);
              }, true);
            }
            if (latestBackups.length > 1) {
              addBtn(cloudCard.actions, 'استعادة النسخة المحددة Backup V2', 'btn-secondary', () => {
                const sel = cloudCard.card.dataset.selectedBackup;
                const point = latestBackups.find((p) => (p.path || p.name) === sel) || newestBackup;
                runCloudBackupV2Restore(point);
              });
            }
          } else {
            addBtn(cloudCard.actions, 'إعادة فحص السحابة', 'btn-secondary', () => {
              renderStepUI(loadWizard());
            });
          }

          // --- Local DB card ---
          const local = discovery?.localDb || {};
          const localCard = addSourceCard({
            title: '💾 البيانات المحلية',
            status: local.status === 'valid' ? 'ready' : (local.status || 'unknown'),
            metaHtml: `المسار: <code dir="ltr">${local.path || '—'}</code><br>الحالة: ${local.message || local.status || '—'}`,
          });
          addBtn(localCard.actions, 'استخدام البيانات المحلية', 'btn-secondary', async () => {
            try {
              setStatus('⏳ مواءمة ما بعد الاستعادة (سحب الأحدث — بلا رفع فوري)...');
              if (global.RestoreReconciliation?.afterRestoreDataSourceSelected) {
                await global.RestoreReconciliation.afterRestoreDataSourceSelected('local');
              }
              const verified = await global.RestoreVerification?.verifyPostRestore?.({
                kind: 'local',
                source: 'bootflow_local',
                ...bootstrapRestoreVerifyOptions(),
              });
              if (!verified?.verified) {
                setStatus('❌ فشل التحقق من البيانات المحلية: ' + (verified?.error || 'unknown'), true);
                return;
              }
              try { await global.reconcileAuthUsersAfterHydrate?.(); } catch { /* empty */ }
              if (progressHost && global.RestoreVerification?.formatSummaryHtml) {
                progressHost.innerHTML = global.RestoreVerification.formatSummaryHtml(verified.summary);
              }
              markRestore('local', '✅ تم التحقق من البيانات المحلية — تابع للمزامنة');
            } catch (e) {
              setStatusFromErr(e, 'restore_interrupted');
            }
            try { global.ActivationSyncDefaults?.applyDefaults?.({ startSync: true }); } catch { /* empty */ }
          });

          // --- Local backups / file ---
          const lb = discovery?.localBackup || {};
          const fileCard = addSourceCard({
            title: '📁 استعادة Backup V2 (.tdw)',
            status: lb.available ? 'ready' : 'not_found',
            metaHtml: `${lb.message || 'اختيار ملف Backup V2...'}<br>النسخ المحلية: ${lb.count || 0}<br><small>مسار DR الوحيد — atomic pipeline</small>`,
          });
          addBtn(fileCard.actions, 'اختيار ملف Backup V2…', 'btn-secondary', async () => {
            if (restoreInFlight || Discovery.isRestoreLocked?.()) {
              setStatus('⚠️ عملية استعادة جارية — انتظر', true);
              return;
            }
            try {
              const api = global.cuppingElectron?.backup;
              const bootstrapApi = global.cuppingElectron?.bootstrap || global.tadawiElectron?.bootstrap;
              if (!api?.v2PickFile || !api?.v2RestoreUnified) {
                setStatus('⚠️ Backup V2 غير متاح — استخدم نسخة Electron كاملة', true);
                return;
              }
              const picked = await api.v2PickFile();
              if (picked?.canceled || !picked?.filePath) return;

              setStatus('⏳ فحص ملف النسخة…');
              let inspected = null;
              try {
                inspected = await api.v2Inspect?.({ filePath: picked.filePath });
              } catch { /* inspect optional */ }
              const manifest = inspected?.manifest || inspected?.data?.manifest || null;
              const scopeTruth = manifest?.scopeTruth || inspected?.scopeTruth || null;
              const lic = global.LicenseCloud?.loadLocal?.() || null;
              const identity = {
                centerId: manifest?.centerId || scopeTruth?.centerId || lic?.centerId || global.DeviceConfig?.load?.()?.centerId || global.settings?.centerId,
                branchId: manifest?.branchId || scopeTruth?.includedBranchIds?.[0] || global.DeviceConfig?.load?.()?.lockedBranchId || global.BranchScope?.getActiveBranchId?.(),
                organizationId: manifest?.organizationId || lic?.organizationId || lic?.centerId,
              };
              const licensedBranchIds = (lic?.branches || []).filter((b) => b && b.active !== false).map((b) => b.id);

              const flow = await global.OpsUxBridge?.openRestoreWizard?.({
                filePath: picked.filePath,
                identity,
                manifest,
                scopeSummary: scopeTruth,
                validate: () => ({ ok: true, validation: 'valid', filePath: picked.filePath }),
                execute: async () => {
                  if (!bootstrapApi?.issueRestoreCapability) {
                    return { ok: false, error: 'bootstrap_restore_unavailable' };
                  }
                  try { await global.DeviceCache?.syncLicenseToMainCache?.(lic); } catch { /* non-fatal */ }
                  const cap = await bootstrapApi.issueRestoreCapability({
                    bootFlow: true,
                    source: 'local',
                    localPath: picked.filePath,
                    filePath: picked.filePath,
                    centerId: identity.centerId,
                    organizationId: identity.organizationId,
                    branchId: identity.branchId,
                    backupId: manifest?.backupId || picked.filePath,
                    licensedBranchIds,
                    licenseSnapshot: lic,
                  });
                  if (!cap?.ok) {
                    return { ok: false, error: cap.error || 'restore_authorization_required', message: cap.message };
                  }
                  return api.v2RestoreUnified({
                    source: 'local',
                    context: 'bootstrap',
                    localPath: picked.filePath,
                    filePath: picked.filePath,
                    relaunch: false,
                    bootstrapRestoreCapabilityId: cap.capabilityId,
                    centerId: identity.centerId,
                    organizationId: identity.organizationId,
                    branchId: identity.branchId,
                    licensedBranchIds,
                    licenseSnapshot: lic,
                  });
                },
              });
              if (!flow?.ok) {
                if (flow?.error && flow.error !== 'overwrite_phrase_mismatch' && flow.error !== 'confirm_failed') {
                  setStatus('❌ فشلت استعادة Backup V2: ' + (flow?.error || 'unknown'), true);
                }
                return;
              }
              restoreInFlight = true;
              try { global.OwnerManagement?.setSystemBusy?.('restore'); } catch { /* empty */ }
              try {
                setStatus('⏳ التحقق من البيانات بعد الاستعادة…');
                try { await global.reconcileAuthUsersAfterHydrate?.(); } catch { /* empty */ }
                const verified = await global.RestoreVerification?.verifyPostRestore?.({
                  kind: 'backup_v2',
                  restoreKind: 'backup_v2',
                  source: 'bootflow_local_file',
                  ...bootstrapRestoreVerifyOptions(),
                });
                if (!verified?.verified) {
                  setStatus('❌ فشل التحقق: ' + (verified?.error || 'restore_verification_failed'), true);
                  return;
                }
                if (progressHost && global.RestoreVerification?.formatSummaryHtml) {
                  progressHost.innerHTML += global.RestoreVerification.formatSummaryHtml(verified.summary);
                }
                markRestore('file', '✅ تمت استعادة Backup V2 من ملف محلي');
                setStatus('✅ تمت استعادة Backup V2 — تابع للمزامنة');
                if (global.RestoreReconciliation?.afterRestoreDataSourceSelected) {
                  await global.RestoreReconciliation.afterRestoreDataSourceSelected('file');
                }
              } finally {
                restoreInFlight = false;
                try { global.OwnerManagement?.clearSystemBusy?.('restore'); } catch { /* empty */ }
                renderNavButtons(loadWizard());
              }
            } catch (e) {
              setStatusFromErr(e, 'restore_interrupted');
            }
          });

          // --- Empty start ---
          const emptyCard = addSourceCard({
            title: '📭 البدء بدون بيانات سابقة',
            status: 'ready',
            metaHtml: 'إنشاء قاعدة جديدة بقرار صريح منك — لن يحدث تلقائياً عند فشل السحابة.',
          });
          addBtn(emptyCard.actions, 'بدء قاعدة جديدة', 'btn-ghost', () => {
            markRestore('empty', '✅ بدء صريح بدون قاعدة سابقة');
          });

          if (w.path === PATHS.EXISTING) {
            addBtn(choiceHost, '✔️ تأكيد البيانات الحالية (جهاز موجود)', 'btn-ghost', () => {
              markRestore('skip_existing', '✅ تم تأكيد البيانات الحالية');
            });
          }
        };

        // Kick discovery asynchronously so the step paints first
        setTimeout(() => { runDiscovery().catch(() => {}); }, 0);
        break;
      }
      case 'sync': {
        const lifecycle = global.SyncLifecycle?.resolveLifecycle?.() || null;
        content.innerHTML = `<p>نفّذ المزامنة الأولية بعد الاستعادة/البدء.</p>
          <div class="bf-source-meta" id="bf-sync-readiness">${
            lifecycle
              ? global.SyncLifecycle.renderPanelHtml(lifecycle)
              : (() => {
                const readiness = global.SyncEngine?.getReadiness?.() || null;
                return readiness
                  ? (readiness.ready
                    ? `✅ ${readiness.messageAr || readiness.state}`
                    : `⚠️ ${readiness.messageAr || (readiness.missing || []).join(', ')}`)
                  : 'جارٍ فحص جاهزية المزامنة…';
              })()
          }</div>
          <div id="bf-sync-progress-host"></div>`;
        addBtn(actions, '▶️ بدء المزامنة الأولية', 'btn-primary', async () => {
          if (syncInFlight || ownerCreateInFlight()) {
            setStatus('⚠️ عملية جارية — انتظر', true);
            return;
          }
          syncInFlight = true;
          try { global.OwnerManagement?.setSystemBusy?.('sync'); } catch { /* empty */ }
          setStatus('⏳ جارٍ المزامنة...');
          try {
            let ok = true;
            try { global.ActivationSyncDefaults?.applyDefaults?.({ startSync: true, startBackup: true }); } catch { /* empty */ }
            const ready = global.SyncEngine?.getReadiness?.({ force: true });
            if (ready && !ready.ready) {
              setStatus(`⚠️ ${ready.messageAr || ('غير جاهز: ' + (ready.missing || []).join(', '))}`, true);
              ok = false;
            } else if (global.SyncEngine?.runOnce) {
              if (!global.SyncEngine.isRunning?.()) {
                global.SyncEngine.start?.({ pollIntervalMs: global.SyncState?.load?.()?.pollIntervalMs });
              }
              const restoreChoice = loadWizard().restoreChoice;
              const afterRestore = restoreChoice === 'backup_v2' || restoreChoice === 'file';
              const r = await global.SyncEngine.runOnce({
                force: true,
                afterRestore,
                direction: afterRestore ? 'pull' : undefined,
              });
              ok = r?.ok !== false;
              if (!ok) setStatus(`⚠️ فشلت المزامنة: ${formatSyncCycleError(r)}`, true);
              else {
                setStatus('⏳ انتظار اكتمال دورة المزامنة…');
                await waitForSyncLifecycleReady({ relaxedBaseline: true });
              }
            } else if (global.CloudBootstrap?.hydrateFromDrive && loadWizard().restoreChoice === 'cloud') {
              const r = await global.CloudBootstrap.hydrateFromDrive(null, { allowMissingLicense: true });
              ok = !!r?.ok || r?.skipped;
            }
            if (ok) {
              if (loadWizard().path === PATHS.EXISTING) {
                try { global.OwnerLifecycleAuthority?.markReplacementHydrate?.(); } catch { /* empty */ }
              }
              const bootstrap = await global.ensureCloudBootstrapReady?.();
              if (bootstrap?.runNewDeviceBootstrap) {
                await bootstrap.runNewDeviceBootstrap({
                  branchId: global.DeviceConfig?.load?.()?.lockedBranchId,
                  startSync: true,
                  allowMissingLicense: true
                });
              }
            }
            const w2 = loadWizard();
            const lifecycleAfter = await waitForSyncLifecycleReady({ relaxedBaseline: true })
              || global.SyncLifecycle?.resolveLifecycle?.({ force: true, relaxedBaseline: true })
              || null;
            const syncReady = lifecycleAfter?.lifecycle === 'READY'
              && lifecycleAfter?.readiness?.ready !== false
              && lifecycleAfter?.conflictCount === 0;
            w2.syncDone = ok !== false && syncReady;
            saveWizard(w2);
            if (w2.syncDone) {
              setStatus('✅ اكتملت المزامنة الأولية — الحالة: جاهزة');
            } else if (ok !== false) {
              setStatus(
                `⚠️ المزامنة لم تصل READY بعد (${lifecycleAfter?.labelAr || lifecycleAfter?.lifecycle || '—'})`,
                true
              );
            }
          } catch (e) {
            setStatusFromErr(e, 'sync_interrupted');
          } finally {
            syncInFlight = false;
            try { global.OwnerManagement?.clearSystemBusy?.('sync'); } catch { /* empty */ }
            renderNavButtons(loadWizard());
            renderStepUI(loadWizard());
          }
        });
        if (lifecycle?.lifecycle === 'CONFLICT_REQUIRES_ACTION' && global.ConflictManagerUI?.open) {
          addBtn(actions, '⚖️ مراجعة التعارضات', 'btn-secondary', () => {
            try { global.ConflictManagerUI.open(); } catch { /* empty */ }
          });
        }
        if (lifecycle?.readiness?.recoverablePause) {
          addBtn(actions, '▶️ استئناف المزامنة', 'btn-secondary', () => {
            global.SyncEngine?.resumeFromGuard?.('bootflow_resume');
            renderStepUI(loadWizard());
          });
        }
        if (hasSyncDone()) {
          const lc = global.SyncLifecycle?.resolveLifecycle?.() || null;
          if (lc?.lifecycle === 'READY') {
            setStatus('✅ المزامنة مسجّلة كمكتملة');
          } else {
            setStatus(`⚠️ المزامنة غير جاهزة بعد — ${lc?.labelAr || lc?.lifecycle || '—'}`, true);
          }
        }
        break;
      }
      case 'ready': {
        const checks = [
          ['Google', hasGoogle()],
          ['الترخيص', hasValidLicense()],
          ['المؤسسة', hasCenterData()],
          ['الفرع والجهاز', hasDeviceBranch()],
          ['مصدر البيانات', hasRestoreDecision()],
          ['المزامنة', hasSyncDone()]
        ];
        const setupState = global.SetupStateService?.getState?.({ ignoreRestart: true });
        const lockedBranchId = global.DeviceConfig?.load?.()?.lockedBranchId || '';
        const lockedBranchLabel = global.BranchDisplay?.resolveBranchName?.(lockedBranchId) || lockedBranchId || '—';
        content.innerHTML = `${hasDeviceBranch() ? `<p class="bf-source-meta" style="margin-bottom:10px">✅ الفرع المربوط: <strong>${lockedBranchLabel}</strong></p>` : ''}<ul style="font-size:13px;line-height:1.9">${checks.map(([l, ok]) => `<li>${ok ? '✅' : '❌'} ${l}</li>`).join('')}</ul>
          <p>اكتمل الإعداد بنجاح. اضغط الزر الوحيد أدناه لإعادة تشغيل البرنامج وتطبيق التفعيل، ثم سجّل الدخول.</p>
          <p class="bf-source-meta">لن تُعرض هذه الشاشة مرة أخرى بعد إعادة التشغيل الناجحة.</p>`;
        // Single terminal CTA — no duplicate finish / login / restart buttons.
        addBtn(actions, '🔄 إعادة تشغيل البرنامج وتطبيق الإعداد', 'btn-primary', async () => {
          if (!isBootComplete()) {
            setStatus('⚠️ لم تكتمل جميع المتطلبات', true);
            return;
          }
          markBootComplete();
          try { global.SetupStateService?.markBootCompleteDurable?.(); } catch { /* empty */ }
          const meta = global.SetupStateService?.markRestartRequired?.('setup_finalize')
            || (() => { try { localStorage.setItem(RESTART_REQUIRED_KEY, '1'); } catch { /* empty */ } return null; })();
          setStatus('⏳ جارٍ حفظ الحالة وإعادة التشغيل…');
          try {
            // Flush durable state before relaunch
            try { global.DB?.set?.('settings', global.settings); } catch { /* empty */ }
            try { global.SyncEngine?.stop?.(); } catch { /* empty */ }
            const api = global.cuppingElectron || global.tadawiElectron;
            if (api?.relaunchApp) {
              await api.relaunchApp({ reason: meta?.id || 'setup_finalize' });
              return;
            }
            if (api?.app?.relaunch) {
              await api.app.relaunch();
              return;
            }
          } catch (e) {
            setStatus('⚠️ تعذّر relaunch التلقائي — أعد التشغيل يدوياً من النظام', true);
            return;
          }
          setStatus('ℹ️ أعد تشغيل التطبيق يدوياً من قائمة النظام لتطبيق الإعداد', true);
        }, !isBootComplete());
        break;
      }
      default:
        break;
    }
    renderNavButtons(w);
  }

  function startPath(path) {
    const w = resetWizard(path);
    try {
      if (path === PATHS.NEW) {
        global.OwnerLifecycleAuthority?.setMode?.('new', { createBlocked: false });
      } else if (path === PATHS.EXISTING) {
        global.OwnerLifecycleAuthority?.setMode?.('existing', { createBlocked: true });
        global.OwnerLifecycleAuthority?.reconcileExistingCustomer?.();
      }
    } catch { /* empty */ }
    showStep('bf-step-wizard');
    renderProgress(w);
    renderStepUI(w);
  }

  function prevStep() {
    const w = loadWizard();
    if (!w.path) return;
    if (w.currentStep <= 0) {
      w.path = null;
      w.currentStep = 0;
      saveWizard(w);
      showStep('bf-step-choose');
      setStatus('');
      return;
    }
    w.currentStep -= 1;
    saveWizard(w);
    renderProgress(w);
    renderStepUI(w);
    setStatus('');
  }

  function advanceWizard() {
    let w = loadWizard();
    const steps = stepsFor(w.path);
    const step = steps[w.currentStep];
    if (!validateStep(step)) {
      setStatusFromErr({ message: 'step_required' }, 'step_required');
      return;
    }
    if (w.currentStep >= steps.length - 1) {
      if (!markBootComplete()) {
        setStatus('⚠️ لم تكتمل جميع متطلبات الإعداد', true);
        return;
      }
      close({ showLogin: true });
      return;
    }
    w = completeCurrentStep(w);
    renderProgress(w);
    renderStepUI(w);
    setStatus('');
  }

  function setBootActive(active) {
    document.body?.classList.toggle('bf-active', !!active);
  }

  function openOverlay(force) {
    if (!force && !needsBootScreen()) return false;
    lastFocusEl = document.activeElement;
    hideBlockingScreens();
    ensureDOM();
    const w = loadWizard();
    if (w.path) {
      showStep('bf-step-wizard');
      renderProgress(w);
      renderStepUI(w);
    } else {
      showStep('bf-step-choose');
    }
    document.getElementById('bootFlowOverlay')?.classList.add('open');
    setBootActive(true);
    // Refresh once on open. Until the main process confirms OAuth, the UI fails
    // closed at Google rather than trusting persisted renderer cache.
    void reconcileGoogleAuthorityForOpenWizard().catch(() => {});
    const login = document.getElementById('loginScreen');
    if (login) login.classList.add('hidden');
    setTimeout(() => document.getElementById('bf-dialog')?.querySelector('button,input')?.focus?.(), 30);
    return true;
  }

  function open() { return openOverlay(true); }
  function forceOpen() { return openOverlay(true); }

  /**
   * Jump wizard to a specific step id (e.g. 'owner') and open overlay.
   * Used by self-healing Owner Bootstrap when org has no Owner.
   */
  function openAtStep(stepId, opts) {
    opts = opts || {};
    let w = loadWizard();
    if (!w.path) {
      w.path = opts.path || (hasValidLicense() ? PATHS.EXISTING : PATHS.NEW);
      w = saveWizard(w);
    }
    const steps = stepsFor(w.path);
    const idx = steps.indexOf(stepId);
    if (idx >= 0) {
      w.currentStep = idx;
      saveWizard(w);
    }
    return openOverlay(true);
  }

  /**
   * V2-5.9: Owner Bootstrap is support/emergency only — never for Google activation.
   */
  function ensureOwnerBootstrapWizard(reason) {
    const why = String(reason || '');
    const allowed = /^(emergency|support|migration|owner_hub)/i.test(why);
    if (!allowed) {
      return { ok: true, opened: false, skipped: true, reason: 'v2_5_9_no_auto_owner_bootstrap', why };
    }
    if (global.OwnerManagement?.requestOwnerBootstrap) {
      return global.OwnerManagement.requestOwnerBootstrap(why);
    }
    if (hasOwnerPasswordAccount()) {
      try { global.OwnerSetupState?.clearRequired?.(); } catch { /* empty */ }
      return { ok: true, opened: false, reason: 'owner_present' };
    }
    try { global.OwnerSetupState?.ensureMissingOwner?.(why); } catch { /* empty */ }
    openAtStep('owner');
    return { ok: true, opened: true, reason: why };
  }

  function close(opts) {
    document.getElementById('bootFlowOverlay')?.classList.remove('open');
    setBootActive(false);
    const login = document.getElementById('loginScreen');
    const forceLogin = !!(opts?.showLogin || !global.currentUser);
    if (login && (forceLogin || canShowLogin())) {
      login.classList.remove('hidden');
      login.style.display = '';
      login.style.pointerEvents = '';
    }
    applyLoginGate();
    try { lastFocusEl?.focus?.(); } catch { /* empty */ }
    if (forceLogin && typeof global.ensureUserLoginScreenVisible === 'function') {
      global.ensureUserLoginScreenVisible();
    }
  }

  function closeToLogin() {
    close({ showLogin: true });
    global.notify?.('ℹ️ يمكنك إعادة فتح الإعداد من «🚀 بدء الإعداد»', 'info');
  }

  function refreshBootState() {
    if (isBootComplete()) {
      markBootComplete();
      close();
      global.filterLoginUsers?.();
    } else {
      const w = loadWizard();
      if (w.path && document.getElementById('bootFlowOverlay')?.classList.contains('open')) {
        renderProgress(w);
        renderStepUI(w);
      }
    }
  }

  function ensureLoginAccessible() {
    // Do not force-close wizard if activation incomplete — only ensure login DOM usable when shown.
    const login = document.getElementById('loginScreen');
    if (login && !document.getElementById('bootFlowOverlay')?.classList.contains('open')) {
      login.classList.remove('hidden');
      login.style.display = '';
      login.style.pointerEvents = '';
    }
    document.getElementById('centerSetupModal')?.classList.remove('open');
  }

  function updateLoginSetupHint() {
    const el = document.getElementById('login-setup-hint');
    const bootCta = document.getElementById('login-boot-cta')
      || document.querySelector('#loginScreen .login-activate-btn, #loginScreen button[onclick*="openBootWizard"]');
    const complete = isBootComplete() || global.SetupStateService?.getState?.()?.state === 'READY';
    if (el) {
      if (complete) {
        el.style.display = 'none';
        el.textContent = '';
      } else {
        el.style.display = '';
        el.innerHTML = '💡 لم يكتمل الإعداد — <button type="button" class="btn btn-primary btn-sm" id="login-open-activation-wizard">🚀 بدء الإعداد الموحّد</button>';
        document.getElementById('login-open-activation-wizard')?.addEventListener('click', () => forceOpen());
      }
    }
    // Hide completed-step boot CTA on login when READY
    if (bootCta) {
      bootCta.style.display = complete ? 'none' : '';
      bootCta.hidden = !!complete;
    }
    // License/dev support entry stays in collapsed <details> — never hide after activation
  }

  function applyLoginGate() {
    ensureLoginAccessible();
    updateLoginSetupHint();
    try { global.SetupStateDom?.applyDomVisibility?.({ reason: 'bootflow-login-gate' }); } catch { /* empty */ }
  }

  // Inventory helpers for tests
  function getStepCatalog() {
    return { NEW_STEPS: NEW_STEPS.slice(), EXISTING_STEPS: EXISTING_STEPS.slice(), STEP_LABELS: { ...STEP_LABELS } };
  }

  global.BootFlow = {
    PATHS,
    NEW_STEPS,
    EXISTING_STEPS,
    open,
    forceOpen,
    openAtStep,
    ensureOwnerBootstrapWizard,
    close,
    closeToLogin,
    needsBootScreen,
    shouldAutoOpenBoot,
    isBootComplete,
    markBootComplete,
    onAppStartupAfterRelaunch,
    canShowLogin,
    canOpenDashboard,
    ensureLoginAccessible,
    updateLoginSetupHint,
    applyLoginGate,
    refreshBootState,
    startPath,
    validateStep,
    loadWizard,
    saveWizard,
    getStepCatalog,
    hasOwnerPasswordAccount,
    /** @deprecated alias — prefer hasOwnerPasswordAccount */
    hasOwnerAccount: hasOwnerPasswordAccount,
    hasGoogle,
    hasValidLicense,
    hasCenterData,
    hasBranch,
    hasDeviceBranch,
    hasRestoreDecision,
    hasSyncDone,
    normalizeWizardState,
    reconcileGoogleAuthorityForOpenWizard,
    autoDiscoverActivationAfterGoogle,
    isCriticalOpInFlight,
    version: 'v2-5.10'
  };
})(typeof window !== 'undefined' ? window : globalThis);
