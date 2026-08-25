/**
 * First Run Experience — Setup Wizard, Product Tour, Readiness & Health Check
 * NajjarTech — Hijama Management System
 */
(function (global) {
  'use strict';

  function licFeat(id) {
    return typeof global.isFeatureEnabled === 'function' && global.isFeatureEnabled(id);
  }

  let _tourLoadPromise = null;

  function loadProductTourModule() {
    if (!licFeat('sys_product_tour')) return Promise.resolve(null);
    if (global.ProductTour) return Promise.resolve(global.ProductTour);
    if (_tourLoadPromise) return _tourLoadPromise;
    _tourLoadPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'cupping-product-tour.js';
      s.onload = () => resolve(global.ProductTour || null);
      s.onerror = () => { _tourLoadPromise = null; reject(new Error('product tour load failed')); };
      document.head.appendChild(s);
    });
    return _tourLoadPromise;
  }

  async function openProductTour(step) {
    if (!licFeat('sys_product_tour')) return;
    try {
      const tour = await loadProductTourModule();
      tour?.open?.(step);
    } catch {}
  }

  async function maybeStartProductTour() {
    if (!licFeat('sys_product_tour')) return;
    try {
      const tour = await loadProductTourModule();
      tour?.maybeStart?.();
    } catch {}
  }

  function shouldShowProductTour() {
    if (!licFeat('sys_product_tour')) return false;
    ensureFirstRunSettings();
    return isAdminUser() && (global.settings.firstRun.wizardCompleted || global.settings.firstRun.wizardSkipped)
      && !global.settings.firstRun.tourCompleted && !global.settings.firstRun.tourSkipped;
  }

  async function skipProductTour() {
    if (!licFeat('sys_product_tour')) return;
    try { (await loadProductTourModule())?.skip?.(); } catch {}
  }

  async function completeProductTour() {
    if (!licFeat('sys_product_tour')) return;
    try { (await loadProductTourModule())?.complete?.(); } catch {}
  }

  async function restartProductTour() {
    if (!licFeat('sys_product_tour')) return;
    if (!isAdminUser()) { notify('⛔ الجولة التعريفية متاحة لمدير النظام', 'danger'); return; }
    try {
      const tour = await loadProductTourModule();
      tour?.restart?.();
    } catch {}
  }

  function onProductTourFeatureChange(enabled) {
    if (enabled) return;
    global.ProductTour?.destroy?.();
    _tourLoadPromise = null;
  }

  const WIZARD_STEPS = [
    { id: 'welcome', title: 'مرحبًا بك', icon: '👋' },
    { id: 'center', title: 'بيانات المركز', icon: '🏥' },
    { id: 'invoice', title: 'إعداد الفواتير', icon: '🧾' },
    { id: 'devices', title: 'الأجهزة', icon: '🖨️' },
    { id: 'catalog', title: 'الخدمات والباقات', icon: '📦' },
    { id: 'staff', title: 'الموظفون', icon: '👥' },
    { id: 'users', title: 'المستخدمون', icon: '🔐' },
    { id: 'attendance', title: 'الحضور والإجازات', icon: '🕐' },
    { id: 'messages', title: 'الرسائل', icon: '💬' },
    { id: 'review', title: 'مراجعة الإعداد', icon: '✅' }
  ];

  const DEFAULT_FIRST_RUN = {
    wizardCompleted: false,
    wizardSkipped: false,
    tourCompleted: false,
    tourSkipped: false,
    tourStep: 0,
    wizardStep: 0,
    wizardMaxStep: 0,
    readinessDismissed: false,
    readinessDismissedPct: 0
  };

  let _wizardStep = 0;
  let _domReady = false;
  let _wizardAutoSaveTimer = null;

  function notify(msg, type) {
    if (typeof global.notify === 'function') global.notify(msg, type);
  }

  function ensureFirstRunSettings() {
    if (!global.settings) return;
    if (!global.settings.firstRun) global.settings.firstRun = { ...DEFAULT_FIRST_RUN };
    else global.settings.firstRun = { ...DEFAULT_FIRST_RUN, ...global.settings.firstRun };
    if (!global.settings.centerCity) global.settings.centerCity = '';
    if (!global.settings.centerEmail) global.settings.centerEmail = '';
    if (!global.settings.centerWebsite) global.settings.centerWebsite = '';
  }

  function saveFirstRunState(patch) {
    ensureFirstRunSettings();
    Object.assign(global.settings.firstRun, patch);
    global.DB?.set('settings', global.settings);
  }

  function getActiveUser() {
    if (global.currentUser) return global.currentUser;
    if (typeof global.getActiveUser === 'function') return global.getActiveUser();
    return null;
  }

  function isAppAuthed() {
    if (typeof global.isAppAuthed === 'function') return global.isAppAuthed();
    return !!global._appAuthed;
  }

  function isAdminUser() {
    const u = getActiveUser();
    if (typeof global.RolePolicy !== 'undefined' && global.RolePolicy.isManager(u)) return true;
    return !!u?.isDev;
  }

  function injectStyles() {
    if (document.getElementById('first-run-styles')) return;
    const s = document.createElement('style');
    s.id = 'first-run-styles';
    s.textContent = `
.fr-wizard-overlay{position:fixed;inset:0;z-index:10100;background:rgba(8,18,14,.55);display:none;align-items:center;justify-content:center;padding:16px}
.fr-wizard-overlay.open{display:flex}
.fr-wizard{max-width:720px;width:100%;max-height:94vh;background:var(--card);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--border)}
.fr-wizard-head{padding:18px 22px 12px;border-bottom:1px solid var(--border);background:linear-gradient(135deg,var(--surface),var(--card))}
.fr-wizard-step-meta{font-size:12px;font-weight:700;color:var(--text-muted);margin-top:4px}
.fr-wizard-progress{height:8px;background:var(--border);border-radius:99px;overflow:hidden;margin-top:10px}
.fr-wizard-progress-bar{height:100%;background:linear-gradient(90deg,var(--primary),var(--accent));transition:width .45s cubic-bezier(.4,0,.2,1);border-radius:99px;box-shadow:0 0 8px color-mix(in srgb,var(--primary) 40%,transparent)}
.fr-wizard-steps-nav{display:flex;gap:4px;flex-wrap:wrap;margin-top:12px;justify-content:center}
.fr-wiz-step{width:28px;height:28px;border-radius:8px;border:1.5px solid var(--border);background:var(--card);font-size:11px;font-weight:800;color:var(--text-muted);cursor:pointer;padding:0;font-family:inherit;transition:all .2s}
.fr-wiz-step.done{background:color-mix(in srgb,var(--primary) 12%,var(--card));border-color:var(--primary-light);color:var(--primary)}
.fr-wiz-step.active{background:var(--primary);border-color:var(--primary);color:#fff;box-shadow:0 2px 8px color-mix(in srgb,var(--primary) 35%,transparent)}
.fr-wiz-step:disabled{opacity:.35;cursor:not-allowed}
.fr-wizard-foot-left{display:flex;gap:6px;flex-wrap:wrap}
.fr-wizard-body{padding:20px 22px;overflow-y:auto;flex:1;min-height:280px}
.fr-wizard-foot{padding:14px 22px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap;background:var(--surface)}
.fr-wizard-brand{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.fr-wizard-brand img{width:48px;height:48px;border-radius:12px;object-fit:contain;background:#fff;border:1px solid var(--border)}
.fr-wizard-step-title{font-size:18px;font-weight:900;color:var(--primary);display:flex;align-items:center;gap:8px}
.fr-wizard-welcome{text-align:center;padding:24px 12px}
.fr-wizard-welcome .fr-big{font-size:42px;margin-bottom:12px}
.fr-wizard-welcome h2{font-size:22px;font-weight:900;color:var(--primary);margin:0 0 10px}
.fr-wizard-welcome p{font-size:14px;color:var(--text-muted);line-height:1.8;max-width:480px;margin:0 auto 20px}
.fr-checklist{display:grid;gap:8px}
.fr-check-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--surface);border:1px solid var(--border);font-size:13px;font-weight:600}
.fr-check-item.done{border-color:#86efac;background:#f0fdf4}
.fr-readiness-card{border:1.5px solid var(--accent);background:linear-gradient(135deg,#fffef8,var(--card));border-radius:14px;padding:16px 18px;margin-bottom:14px}
.fr-readiness-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.fr-readiness-head h3{margin:0;font-size:16px;font-weight:900;color:var(--primary)}
.fr-readiness-pct{font-size:22px;font-weight:900;color:var(--accent)}
.fr-readiness-bar{height:8px;background:var(--border);border-radius:99px;overflow:hidden;margin-bottom:12px}
.fr-readiness-bar-fill{height:100%;background:linear-gradient(90deg,var(--primary),var(--accent));border-radius:99px;transition:width .4s}
.fr-readiness-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px;font-size:12px}
.fr-readiness-item{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:8px;background:var(--surface)}
.fr-health-meta{font-size:11px;color:var(--text-muted);margin-bottom:12px;padding:8px 12px;background:var(--surface);border-radius:8px;border:1px solid var(--border)}
.fr-health-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:stretch;grid-auto-rows:1fr}
.fr-health-row{display:flex;flex-direction:column;align-items:stretch;gap:8px;padding:14px 16px;border-radius:12px;border:1px solid var(--border);background:var(--surface);font-size:13px;min-height:132px;height:100%;justify-content:space-between}
.fr-health-row.ok{border-color:#86efac;background:linear-gradient(135deg,#f0fdf4,var(--surface))}
.fr-health-row.warn{border-color:#fcd34d}
.fr-health-row.bad{border-color:#fca5a5;background:linear-gradient(135deg,#fef2f2,var(--surface))}
.fr-health-label{display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px}
.fr-health-msg{font-size:12px;color:var(--text-muted);line-height:1.5}
@media(max-width:768px){.fr-health-list{grid-template-columns:1fr}}
@media(max-width:640px){.fr-wizard{max-height:100vh;border-radius:12px}.fr-readiness-grid{grid-template-columns:1fr 1fr}.fr-wiz-step{width:24px;height:24px;font-size:10px}}
`;
    document.head.appendChild(s);
  }

  function getReadinessItems() {
    const s = global.settings || {};
    const d = s.devices || {};
    const lastBk = (global.backupLog || [])[0];
    const bkAge = lastBk ? (Date.now() - new Date(lastBk.at).getTime()) / 86400000 : 999;
    return [
      { id: 'center', label: 'بيانات المركز', check: () => !!(s.centerName && s.centerName.trim() && s.centerName !== 'مركز الحجامة') || !!(s.phone && s.phone.trim()) },
      { id: 'services', label: 'الخدمات', check: () => (global.services || []).length > 0 },
      { id: 'packages', label: 'الباقات', check: () => (global.packages || []).length > 0 },
      { id: 'pricing', label: 'الأسعار', check: () => (s.cupPrice > 0 || (global.packages || []).length > 0) },
      { id: 'staff', label: 'الموظفون', check: () => (global.doctors || []).length > 0 },
      { id: 'users', label: 'المستخدمون', check: () => (global.users || []).length >= 1 },
      { id: 'thermal', label: 'الطابعة الحرارية', check: () => !!(d.thermal?.name || d.thermalPrinter) },
      { id: 'a4', label: 'طابعة A4', check: () => !!(d.report?.name || d.a4Printer) },
      { id: 'messages', label: 'الرسائل', check: () => !!(s.waTemplate || s.messaging?.enabled || s.appointmentTemplate) },
      { id: 'tax', label: 'الضريبة', check: () => s.vatRate != null && s.taxNum },
      { id: 'backup', label: 'النسخة الاحتياطية', check: () => bkAge <= 15 || (s.backup?.localEnabled !== false) },
      { id: 'license', label: 'الترخيص', check: () => global._licStatus === 'valid' },
      { id: 'client', label: 'أول عميل', check: () => (global.clientsRegistry || []).length > 0 || (global.cases || []).length > 0 },
      { id: 'invoice', label: 'أول فاتورة', check: () => (global.cases || []).length > 0 }
    ];
  }

  function evaluateReadiness() {
    const items = getReadinessItems();
    const done = items.filter(i => { try { return i.check(); } catch { return false; } });
    return { items, done: done.length, total: items.length, pct: Math.round((done.length / items.length) * 100) };
  }

  function getIntegritySnapshot() {
    if (typeof global.verifyRestoredDataIntegrity !== 'function') return { ok: true, issues: [], warnings: [] };
    const data = typeof global.buildFullBackupObject === 'function'
      ? global.buildFullBackupObject()
      : { users: global.users, cases: global.cases, clientsRegistry: global.clientsRegistry, invoiceCounter: global.invoiceCounter, clientFileCounter: global.clientFileCounter };
    return global.verifyRestoredDataIntegrity(data);
  }

  function getHealthChecks() {
    const s = global.settings || {};
    const d = s.devices || {};
    const lastBk = (global.backupLog || [])[0];
    const bkDays = lastBk ? Math.floor((Date.now() - new Date(lastBk.at).getTime()) / 86400000) : null;
    const adminCount = (global.users || []).filter(u => u.active && global.RolePolicy?.isManager?.(u)).length;
    return [
      { id: 'lic', label: 'الترخيص', ok: global._licStatus === 'valid', msg: global._licStatus === 'valid' ? 'الترخيص سليم' : 'الترخيص غير مفعّل أو منتهٍ', fix: () => global.openLicenseScreen?.() },
      { id: 'db', label: 'قاعدة البيانات', ok: !!global.DB, msg: 'قاعدة البيانات سليمة', fix: null },
      { id: 'thermal', label: 'الطابعة الحرارية', ok: !!(d.thermal?.name || d.thermalPrinter), msg: d.thermal?.name ? 'الطابعة الحرارية جاهزة' : 'لا توجد طابعة حرارية محددة', fix: () => { global.showPage?.('settings'); global.switchSettingsTab?.('devices'); } },
      { id: 'a4', label: 'طابعة A4', ok: !!(d.report?.name || d.a4Printer), msg: d.report?.name ? 'طابعة A4 جاهزة' : 'لم تُحدد طابعة A4', fix: () => { global.showPage?.('settings'); global.switchSettingsTab?.('devices'); } },
      { id: 'backup', label: 'النسخ الاحتياطي', ok: s.backup?.localEnabled !== false, msg: s.backup?.localEnabled !== false ? 'النسخ المحلي مفعّل' : 'النسخ الاحتياطي غير مفعّل', fix: () => { global.showPage?.('settings'); global.switchSettingsTab?.('backup'); } },
      { id: 'bkage', label: 'آخر نسخة', ok: bkDays == null || bkDays <= 15, msg: bkDays == null ? 'لم تُنشأ نسخة بعد' : (bkDays <= 15 ? `آخر نسخة منذ ${bkDays} يوم` : `آخر نسخة منذ ${bkDays} يومًا — يُنصح بالنسخ`), fix: () => global.runBackupNow?.('health') },
      { id: 'svc', label: 'الخدمات', ok: (global.services || []).length > 0, msg: (global.services || []).length ? `${global.services.length} خدمة` : 'لم تُضف أي خدمة', fix: () => global.showPage?.('packages') },
      { id: 'staff', label: 'الموظفون', ok: (global.doctors || []).length > 0, msg: (global.doctors || []).length ? `${global.doctors.length} موظف` : 'لا يوجد موظفون', fix: () => global.showPage?.('doctors') },
      { id: 'users', label: 'المستخدمون', ok: (global.users || []).length > 0, msg: (global.users || []).length ? `${global.users.length} مستخدم` : 'لا يوجد مستخدمون', fix: () => global.showPage?.('users') },
      { id: 'admin', label: 'مدير احتياطي', ok: adminCount >= 1, msg: adminCount ? 'يوجد مدير نظام' : 'لا يوجد مستخدم مدير', fix: () => global.showPage?.('users') },
      { id: 'tax', label: 'الضريبة', ok: s.vatRate != null, msg: `نسبة الضريبة ${s.vatRate || 0}%`, fix: () => global.showPage?.('packages') },
      { id: 'msg', label: 'الرسائل', ok: !!(s.messaging?.enabled || s.waTemplate), msg: s.messaging?.enabled ? 'الرسائل مفعّلة' : 'قوالب الرسائل الافتراضية جاهزة', fix: () => global.showPage?.('messages') },
      { id: 'gw', label: 'التكاملات', ok: !!(s.communication?.providers?.length), msg: s.communication?.providers?.length ? 'Gateway مُعد' : 'التكاملات اختيارية — جاهزة للإعداد', fix: () => global.openLicenseScreen?.('gateway') },
      { id: 'integrity', label: 'سلامة البيانات', ok: (() => {
        const r = getIntegritySnapshot();
        return r.ok && !r.warnings.length;
      })(), msg: (() => {
        const r = getIntegritySnapshot();
        if (r.issues.length) return `${r.issues.length} مشكلة حرجة`;
        if (r.warnings.length) return `${r.warnings.length} تنبيه — راجع الاستعادة`;
        return 'البيانات مترابطة وسليمة';
      })(), fix: () => { global.showPage?.('settings'); global.switchSettingsTab?.('help'); } }
    ];
  }

  function ensureWizardDOM() {
    if (document.getElementById('setupWizardModal')) return;
    const el = document.createElement('div');
    el.id = 'setupWizardModal';
    el.className = 'fr-wizard-overlay';
    el.innerHTML = `
      <div class="fr-wizard" role="dialog" aria-labelledby="frWizardTitle">
        <div class="fr-wizard-head">
          <div class="fr-wizard-step-title" id="frWizardTitle">معالج الإعداد</div>
          <div class="fr-wizard-step-meta" id="frWizardStepMeta">الخطوة 1 من ${WIZARD_STEPS.length}</div>
          <div class="fr-wizard-progress"><div class="fr-wizard-progress-bar" id="frWizardBar" style="width:10%"></div></div>
          <div class="fr-wizard-steps-nav" id="frWizardStepsNav"></div>
        </div>
        <div class="fr-wizard-body" id="frWizardBody"></div>
        <div class="fr-wizard-foot">
          <div class="fr-wizard-foot-left">
            <button type="button" class="btn btn-ghost btn-sm" id="frWizardLater">إنهاء لاحقًا</button>
            <button type="button" class="btn btn-ghost btn-sm" id="frWizardSkip">تخطي المعالج</button>
          </div>
          <div style="display:flex;gap:8px">
            <button type="button" class="btn btn-ghost" id="frWizardPrev" style="display:none">السابق</button>
            <button type="button" class="btn btn-primary" id="frWizardNext">التالي</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#frWizardSkip').onclick = skipSetupWizard;
    el.querySelector('#frWizardLater').onclick = finishWizardLater;
    el.querySelector('#frWizardPrev').onclick = () => goWizardStep(_wizardStep - 1);
    el.querySelector('#frWizardNext').onclick = onWizardNext;
    el.onclick = e => { if (e.target === el) finishWizardLater(); };
  }

  function wizardProgress() {
    const bar = document.getElementById('frWizardBar');
    if (bar) bar.style.width = Math.round(((_wizardStep + 1) / WIZARD_STEPS.length) * 100) + '%';
    const title = document.getElementById('frWizardTitle');
    const meta = document.getElementById('frWizardStepMeta');
    const step = WIZARD_STEPS[_wizardStep];
    if (title && step) title.textContent = `${step.icon} ${step.title}`;
    if (meta) meta.textContent = `الخطوة ${_wizardStep + 1} من ${WIZARD_STEPS.length}`;
    const prev = document.getElementById('frWizardPrev');
    const next = document.getElementById('frWizardNext');
    const later = document.getElementById('frWizardLater');
    const skip = document.getElementById('frWizardSkip');
    if (prev) prev.style.display = _wizardStep > 0 ? '' : 'none';
    if (next) next.textContent = _wizardStep === WIZARD_STEPS.length - 1 ? '🚀 ابدأ استخدام النظام' : 'التالي ←';
    if (later) later.style.display = _wizardStep > 0 && _wizardStep < WIZARD_STEPS.length - 1 ? '' : 'none';
    if (skip) skip.style.display = _wizardStep === 0 ? '' : 'none';
    renderWizardStepsNav();
  }

  function renderWizardStepsNav() {
    const nav = document.getElementById('frWizardStepsNav');
    if (!nav) return;
    const maxReach = Math.max(global.settings?.firstRun?.wizardMaxStep || 0, _wizardStep);
    nav.innerHTML = WIZARD_STEPS.map((s, i) => {
      const cls = i === _wizardStep ? 'active' : (i < _wizardStep ? 'done' : '');
      const canGo = i <= maxReach;
      return `<button type="button" class="fr-wiz-step ${cls}" title="${s.title}" ${canGo ? `onclick="FirstRun.goWizardStep(${i})"` : 'disabled'}>${i + 1}</button>`;
    }).join('');
  }

  function scheduleWizardAutoSave() {
    clearTimeout(_wizardAutoSaveTimer);
    _wizardAutoSaveTimer = setTimeout(() => {
      if (_wizardStep > 0 && _wizardStep < WIZARD_STEPS.length - 1) saveWizardStepData();
      const max = global.settings?.firstRun?.wizardMaxStep || 0;
      saveFirstRunState({ wizardStep: _wizardStep, wizardMaxStep: Math.max(max, _wizardStep) });
    }, 450);
  }

  function bindWizardAutoSave() {
    const body = document.getElementById('frWizardBody');
    if (!body || body.dataset.autosaveBound === '1') return;
    body.dataset.autosaveBound = '1';
    body.querySelectorAll('input, textarea, select').forEach(el => {
      el.addEventListener('input', scheduleWizardAutoSave);
      el.addEventListener('change', scheduleWizardAutoSave);
    });
  }

  function renderWizardStep() {
    const body = document.getElementById('frWizardBody');
    if (!body) return;
    const step = WIZARD_STEPS[_wizardStep];
    const meta = global.APP_META || { company: 'NajjarTech', productNameAr: 'نظام إدارة الحجامة' };
    const logo = global.getCenterBrandLogo?.() || global.settings?.brandLogo || 'branding/Center-Logo.png';
    const s = global.settings || {};

    if (step.id === 'welcome') {
      const logoHtml = logo
        ? '<img src="' + esc(logo) + '" alt="">'
        : '';
      body.innerHTML = `
        <div class="fr-wizard-welcome">
          <div class="fr-wizard-brand" style="justify-content:center;margin-bottom:16px">
            ${logoHtml}
            <div><div style="font-weight:900;font-size:15px">${meta.company}</div><div style="font-size:12px;color:var(--text-muted)">${meta.productNameAr}</div></div>
          </div>
          <div class="fr-big">👋</div>
          <h2>مرحبًا بك في نظام إدارة مراكز الحجامة</h2>
          <p>سيقوم هذا المعالج بمساعدتك في إعداد النظام بالكامل خلال دقائق، حتى يصبح جاهزًا للاستخدام اليومي — دون الحاجة لدليل خارجي.</p>
          <button type="button" class="btn btn-primary btn-lg" onclick="FirstRun.goWizardStep(1)">ابدأ الإعداد ←</button>
        </div>`;
    } else if (step.id === 'center') {
      body.innerHTML = `
        <div class="form-grid form-grid-2" style="gap:12px">
          <div class="form-group"><label class="form-label">اسم المركز</label><input class="form-control" id="fr-center-name" value="${esc(s.centerName || '')}"></div>
          <div class="form-group"><label class="form-label">الشعار (رابط أو يُرفع لاحقًا)</label><input class="form-control" id="fr-center-logo-note" placeholder="من الإعدادات › النظام" disabled></div>
          <div class="form-group"><label class="form-label">العنوان</label><input class="form-control" id="fr-center-address" value="${esc(s.address || '')}"></div>
          <div class="form-group"><label class="form-label">المدينة</label><input class="form-control" id="fr-center-city" value="${esc(s.centerCity || '')}"></div>
          <div class="form-group"><label class="form-label">رقم الجوال</label><input class="form-control" id="fr-center-phone" dir="ltr" value="${esc(s.phone || '')}"></div>
          <div class="form-group"><label class="form-label">واتساب</label><input class="form-control" id="fr-center-wa" dir="ltr" value="${esc(s.waNumber || '')}"></div>
          <div class="form-group"><label class="form-label">البريد الإلكتروني</label><input class="form-control" id="fr-center-email" dir="ltr" value="${esc(s.centerEmail || '')}"></div>
          <div class="form-group"><label class="form-label">الموقع الإلكتروني</label><input class="form-control" id="fr-center-website" dir="ltr" value="${esc(s.centerWebsite || '')}"></div>
          <div class="form-group" style="grid-column:1/-1"><label class="form-label">Google Maps</label><input class="form-control" id="fr-center-maps" dir="ltr" value="${esc(s.siteUrl || '')}"></div>
          <div class="form-group"><label class="form-label">السجل التجاري</label><input class="form-control" id="fr-center-cr" value="${esc(s.crNum || '')}"></div>
          <div class="form-group"><label class="form-label">الرقم الضريبي</label><input class="form-control" id="fr-center-tax" value="${esc(s.taxNum || '')}"></div>
        </div>`;
    } else if (step.id === 'invoice') {
      const d = s.devices?.thermal || {};
      body.innerHTML = `
        <div class="form-grid form-grid-2" style="gap:12px">
          <div class="form-group"><label class="form-label">عرض الورق الحراري</label>
            <select class="form-control" id="fr-inv-width"><option value="58" ${d.paperWidth == 58 ? 'selected' : ''}>58mm</option><option value="80" ${d.paperWidth != 58 ? 'selected' : ''}>80mm</option></select></div>
          <div class="form-group"><label class="form-label">رقم بداية الفواتير</label><input class="form-control" type="number" id="fr-inv-start" min="1" value="${global.invoiceCounter || 1}"></div>
          <div class="form-group"><label class="form-label">نسبة الضريبة %</label><input class="form-control" type="number" id="fr-inv-vat" value="${s.vatRate ?? 15}"></div>
          <div class="form-group"><label class="form-label">سعر الكاسة الافتراضي</label><input class="form-control" type="number" id="fr-inv-cup" value="${s.cupPrice ?? 50}"></div>
          <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="fr-inv-logo" ${d.printLogo !== false ? 'checked' : ''}> تفعيل الشعار على الفاتورة</label>
          <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="fr-inv-qr" ${d.printQR !== false ? 'checked' : ''}> تفعيل QR على الفاتورة</label>
        </div>`;
    } else if (step.id === 'devices') {
      body.innerHTML = `
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px">اختر الأجهزة واختبرها — يمكنك تعديلها لاحقًا من الإعدادات › الأجهزة.</p>
        <div class="form-grid" style="gap:12px">
          <div class="form-group"><label class="form-label">الطابعة الحرارية</label>
            <div style="display:flex;gap:8px"><input class="form-control" id="fr-dev-thermal" readonly placeholder="اضغط اختيار" value="${esc(s.devices?.thermal?.name || '')}" onclick="openPrinterPicker('thermal')"><button type="button" class="btn btn-accent btn-sm" onclick="openPrinterPicker('thermal')">اختيار</button><button type="button" class="btn btn-ghost btn-sm" onclick="testThermalPrint()">اختبار</button></div></div>
          <div class="form-group"><label class="form-label">طابعة A4</label>
            <div style="display:flex;gap:8px"><input class="form-control" id="fr-dev-a4" readonly value="${esc(s.devices?.report?.name || '')}" onclick="openPrinterPicker('a4')"><button type="button" class="btn btn-accent btn-sm" onclick="openPrinterPicker('a4')">اختيار</button><button type="button" class="btn btn-ghost btn-sm" onclick="testA4Print()">اختبار</button></div></div>
          <div class="form-group"><label class="form-label">درج الكاش</label>
            <button type="button" class="btn btn-ghost btn-sm" onclick="openCashDrawer({reason:'اختبار من معالج الإعداد'})">🔓 اختبار فتح الدرج</button></div>
        </div>
        <p style="font-size:12px;color:var(--text-muted);margin-top:12px">بعد الاختيار من نافذة الطابعات، اضغط «التالي» لحفظ الإعدادات.</p>`;
    } else if (step.id === 'catalog') {
      body.innerHTML = `
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">الخدمات: ${(global.services || []).length} | الباقات: ${(global.packages || []).length}</p>
        <div class="form-grid form-grid-2" style="gap:12px;margin-bottom:14px">
          <div class="form-group"><label class="form-label">اسم باقة</label><input class="form-control" id="fr-pkg-name" placeholder="باقة أساسية"></div>
          <div class="form-group"><label class="form-label">عدد الكاسات</label><input class="form-control" type="number" id="fr-pkg-cups" value="6"></div>
          <div class="form-group"><label class="form-label">السعر</label><input class="form-control" type="number" id="fr-pkg-price" value="300"></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary btn-sm" onclick="FirstRun.wizardAddPackage()">+ إضافة باقة</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="FirstRun.wizardSeedCatalog()">📥 بيانات تجريبية</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="showPage('packages')">فتح صفحة الباقات</button>
        </div>`;
    } else if (step.id === 'staff') {
      body.innerHTML = `
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">الموظفون الحاليون: ${(global.doctors || []).length}</p>
        <div class="form-grid form-grid-2" style="gap:12px">
          <div class="form-group"><label class="form-label">اسم الموظف / الأخصائي</label><input class="form-control" id="fr-staff-name" placeholder="د. أحمد"></div>
          <div class="form-group"><label class="form-label">التخصص</label><input class="form-control" id="fr-staff-spec" placeholder="أخصائي حجامة"></div>
        </div>
        <button type="button" class="btn btn-primary btn-sm" style="margin-top:10px" onclick="FirstRun.wizardAddStaff()">+ إضافة موظف</button>
        <button type="button" class="btn btn-ghost btn-sm" style="margin-top:10px;margin-right:8px" onclick="showPage('doctors')">فتح إدارة الموظفين</button>`;
    } else if (step.id === 'users') {
      body.innerHTML = `
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">المستخدمون: ${(global.users || []).length}</p>
        <div class="form-grid form-grid-2" style="gap:12px">
          <div class="form-group"><label class="form-label">الاسم الكامل</label><input class="form-control" id="fr-user-name" placeholder="موظف الاستقبال"></div>
          <div class="form-group"><label class="form-label">اسم المستخدم</label><input class="form-control" id="fr-user-login" dir="ltr" placeholder="reception"></div>
          <div class="form-group"><label class="form-label">كلمة المرور</label><input class="form-control" type="password" id="fr-user-pw"></div>
          <div class="form-group"><label class="form-label">الدور</label>
            <select class="form-control" id="fr-user-role"><option value="reception">استقبال</option><option value="accountant">محاسب</option><option value="employee">موظف</option><option value="admin">مدير</option></select></div>
        </div>
        <button type="button" class="btn btn-primary btn-sm" style="margin-top:10px" onclick="FirstRun.wizardAddUser()">+ إضافة مستخدم</button>`;
    } else if (step.id === 'attendance') {
      const lp = s.leavePolicy || {};
      body.innerHTML = `
        <div class="form-grid form-grid-2" style="gap:12px;font-size:13px">
          <div class="form-group"><label class="form-label">بداية الدوام</label><input class="form-control" id="fr-att-in" value="09:00" dir="ltr"></div>
          <div class="form-group"><label class="form-label">نهاية الدوام</label><input class="form-control" id="fr-att-out" value="17:00" dir="ltr"></div>
          <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="fr-att-workdays" ${lp.countWorkDaysOnly ? 'checked' : ''}> احتساب أيام العمل فقط (استثناء الجمعة)</label>
          <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="fr-att-saturday" ${(lp.weekendDays || []).includes(6) ? 'checked' : ''}> استثناء السبت أيضًا</label>
          <div class="form-group"><label class="form-label">الإجازة السنوية (يوم)</label><input class="form-control" type="number" id="fr-att-annual" value="${lp.maxAnnualLeaveDays || 30}"></div>
        </div>`;
    } else if (step.id === 'messages') {
      body.innerHTML = `
        <div class="form-grid" style="gap:12px">
          <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="fr-msg-enabled" ${s.messaging?.enabled ? 'checked' : ''}> تفعيل الرسائل التلقائية</label>
          <div class="form-group"><label class="form-label">قالب المتابعة</label><textarea class="form-control" id="fr-msg-follow" rows="2">${esc(s.waTemplate || '')}</textarea></div>
          <div class="form-group"><label class="form-label">قالب التذكير بالموعد</label><textarea class="form-control" id="fr-msg-appt" rows="2">${esc(s.appointmentTemplate || '')}</textarea></div>
          <div class="form-group"><label class="form-label">قالب العروض</label><textarea class="form-control" id="fr-msg-promo" rows="2">${esc(s.promoTemplate || '')}</textarea></div>
        </div>`;
    } else if (step.id === 'review') {
      const r = evaluateReadiness();
      body.innerHTML = `
        <p style="font-size:14px;font-weight:700;color:var(--primary);margin-bottom:14px">مراجعة الإعدادات — جاهزية النظام ${r.pct}%</p>
        <div class="fr-checklist">${r.items.map(i => {
          const ok = i.check();
          return `<div class="fr-check-item ${ok ? 'done' : ''}">${ok ? '✅' : '☐'} ${i.label}</div>`;
        }).join('')}</div>`;
    }
    wizardProgress();
    const max = global.settings?.firstRun?.wizardMaxStep || 0;
    saveFirstRunState({ wizardStep: _wizardStep, wizardMaxStep: Math.max(max, _wizardStep) });
    bindWizardAutoSave();
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function saveWizardStepData() {
    const step = WIZARD_STEPS[_wizardStep];
    if (!step || step.id === 'welcome' || step.id === 'review') return;
    const s = global.settings;
    if (step.id === 'center') {
      s.centerName = document.getElementById('fr-center-name')?.value.trim() || s.centerName;
      s.address = document.getElementById('fr-center-address')?.value.trim() || '';
      s.centerCity = document.getElementById('fr-center-city')?.value.trim() || '';
      s.phone = document.getElementById('fr-center-phone')?.value.trim() || '';
      s.waNumber = (document.getElementById('fr-center-wa')?.value || '').replace(/\D/g, '');
      s.centerEmail = document.getElementById('fr-center-email')?.value.trim() || '';
      s.centerWebsite = document.getElementById('fr-center-website')?.value.trim() || '';
      s.siteUrl = document.getElementById('fr-center-maps')?.value.trim() || '';
      s.crNum = document.getElementById('fr-center-cr')?.value.trim() || '';
      s.taxNum = document.getElementById('fr-center-tax')?.value.trim() || '';
    } else if (step.id === 'invoice') {
      if (typeof global.ensureDeviceSettings === 'function') global.ensureDeviceSettings();
      const w = parseInt(document.getElementById('fr-inv-width')?.value, 10) || 80;
      s.devices.thermal.paperWidth = w;
      s.devices.thermal.printLogo = !!document.getElementById('fr-inv-logo')?.checked;
      s.devices.thermal.printQR = !!document.getElementById('fr-inv-qr')?.checked;
      s.vatRate = parseFloat(document.getElementById('fr-inv-vat')?.value) || 15;
      s.cupPrice = parseFloat(document.getElementById('fr-inv-cup')?.value) || 50;
      const start = parseInt(document.getElementById('fr-inv-start')?.value, 10);
      if (start > 0) { global.invoiceCounter = start; global.DB?.set('invoiceCounter', start); }
    } else if (step.id === 'devices') {
      if (typeof global.ensureDeviceSettings === 'function') global.ensureDeviceSettings();
      const th = document.getElementById('fr-dev-thermal')?.value.trim() || document.getElementById('set-printer-thermal')?.value.trim();
      const a4 = document.getElementById('fr-dev-a4')?.value.trim() || document.getElementById('set-printer-a4')?.value.trim();
      if (th) { s.devices.thermal.name = th; s.devices.thermalPrinter = th; }
      if (a4) { s.devices.report.name = a4; s.devices.a4Printer = a4; }
    } else if (step.id === 'attendance') {
      if (!s.leavePolicy) s.leavePolicy = {};
      s.leavePolicy.countWorkDaysOnly = !!document.getElementById('fr-att-workdays')?.checked;
      s.leavePolicy.maxAnnualLeaveDays = parseInt(document.getElementById('fr-att-annual')?.value, 10) || 30;
      const wd = [5];
      if (document.getElementById('fr-att-saturday')?.checked) wd.push(6);
      s.leavePolicy.weekendDays = wd;
      if (!s.attendanceDefaults) s.attendanceDefaults = {};
      s.attendanceDefaults.workIn = document.getElementById('fr-att-in')?.value || '09:00';
      s.attendanceDefaults.workOut = document.getElementById('fr-att-out')?.value || '17:00';
    } else if (step.id === 'messages') {
      if (typeof global.ensureMessagingSettings === 'function') global.ensureMessagingSettings();
      s.messaging.enabled = !!document.getElementById('fr-msg-enabled')?.checked;
      s.waTemplate = document.getElementById('fr-msg-follow')?.value.trim() || '';
      s.appointmentTemplate = document.getElementById('fr-msg-appt')?.value.trim() || s.appointmentTemplate;
      s.promoTemplate = document.getElementById('fr-msg-promo')?.value.trim() || '';
    }
    global.DB?.set('settings', s);
    if (typeof global.applyCenterBranding === 'function') global.applyCenterBranding();
    if (typeof global.syncThermalPreviewCss === 'function') global.syncThermalPreviewCss();
  }

  function onWizardNext() {
    if (_wizardStep > 0 && _wizardStep < WIZARD_STEPS.length - 1) saveWizardStepData();
    if (_wizardStep === WIZARD_STEPS.length - 1) return completeSetupWizard();
    goWizardStep(_wizardStep + 1);
  }

  function goWizardStep(n) {
    if (n !== _wizardStep && _wizardStep > 0 && _wizardStep < WIZARD_STEPS.length - 1) saveWizardStepData();
    _wizardStep = Math.max(0, Math.min(WIZARD_STEPS.length - 1, n));
    renderWizardStep();
  }

  function openSetupWizard(step) {
    if (!licFeat('sys_setup_wizard')) { notify('⛔ معالج الإعداد غير متاح في إصدار ترخيصك', 'danger'); return; }
    if (!isAdminUser()) {
      notify('معالج الإعداد متاح فقط لمدير النظام لأنه يقوم بتعديل الإعدادات الأساسية للبرنامج.', 'danger');
      return;
    }
    ensureWizardDOM();
    const fr = global.settings?.firstRun || {};
    if (typeof step === 'number') _wizardStep = step;
    else if (fr.wizardCompleted || fr.wizardSkipped) _wizardStep = 0;
    else _wizardStep = fr.wizardStep || 0;
    document.getElementById('setupWizardModal')?.classList.add('open');
    renderWizardStep();
  }

  function closeSetupWizard() {
    document.getElementById('setupWizardModal')?.classList.remove('open');
  }

  function finishWizardLater() {
    if (_wizardStep > 0 && _wizardStep < WIZARD_STEPS.length - 1) saveWizardStepData();
    const max = global.settings?.firstRun?.wizardMaxStep || 0;
    saveFirstRunState({ wizardStep: _wizardStep, wizardMaxStep: Math.max(max, _wizardStep) });
    closeSetupWizard();
    if (typeof global.logAudit === 'function') global.logAudit('SETUP_WIZARD_PAUSE', `إيقاف معالج الإعداد مؤقتًا عند الخطوة ${_wizardStep + 1}`);
    notify('💾 تم حفظ التقدم — يمكنك متابعة الإعداد لاحقًا من الإعدادات › المساعدة', 'success');
  }

  function skipSetupWizard() {
    if (!confirm('تخطي معالج الإعداد؟ يمكنك تشغيله لاحقًا من الإعدادات › المساعدة.')) return;
    saveFirstRunState({ wizardSkipped: true, wizardStep: _wizardStep });
    closeSetupWizard();
    if (typeof global.logAudit === 'function') global.logAudit('SETUP_WIZARD_SKIPPED', `تخطي معالج الإعداد عند الخطوة ${_wizardStep + 1}`);
    maybeStartProductTour();
  }

  function completeSetupWizard() {
    saveWizardStepData();
    saveFirstRunState({ wizardCompleted: true, wizardSkipped: false, wizardStep: WIZARD_STEPS.length - 1 });
    closeSetupWizard();
    global.refreshDashboard?.();
    renderReadinessCard();
    notify('✅ اكتمل إعداد النظام — مرحبًا بك!');
    if (typeof global.logAudit === 'function') global.logAudit('SETUP_WIZARD_COMPLETE', 'إكمال معالج الإعداد الأول');
    setTimeout(maybeStartProductTour, 600);
  }

  function shouldShowSetupWizard() {
    if (!licFeat('sys_setup_wizard')) return false;
    if (!isAppAuthed() || !isAdminUser()) return false;
    ensureFirstRunSettings();
    if (global.settings.firstRun.wizardCompleted || global.settings.firstRun.wizardSkipped) return false;
    const fr = global.settings.firstRun;
    if ((fr.wizardStep || 0) > 0) return true;
    const fresh = !(global.doctors || []).length && !(global.cases || []).length;
    return fresh || fr.forceWizard;
  }

  function wizardSeedCatalog() {
    if (typeof global.initServices === 'function' && !(global.services || []).length) global.initServices();
    if (!(global.packages || []).length) {
      global.packages = global.packages || [];
      global.packages.push({ id: Date.now().toString(), name: 'باقة أساسية', cups: 6, price: 300, active: true, shareable: false, createdAt: new Date().toISOString() });
      global.DB?.set('packages', global.packages);
      global.populatePackageSelect?.();
    }
    notify('✅ تم تحميل بيانات تجريبية');
    renderWizardStep();
  }

  function wizardAddPackage() {
    const name = document.getElementById('fr-pkg-name')?.value.trim();
    const cups = parseInt(document.getElementById('fr-pkg-cups')?.value, 10);
    const price = parseFloat(document.getElementById('fr-pkg-price')?.value);
    if (!name || !cups) { notify('⚠️ أدخل اسم الباقة وعدد الكاسات', 'danger'); return; }
    global.packages = global.packages || [];
    global.packages.push({ id: Date.now().toString(), name, cups, price: price || 0, active: true, shareable: false, createdAt: new Date().toISOString() });
    global.DB?.set('packages', global.packages);
    global.populatePackageSelect?.();
    notify('✅ تمت إضافة الباقة');
    renderWizardStep();
  }

  function wizardAddStaff() {
    const name = document.getElementById('fr-staff-name')?.value.trim();
    if (!name) { notify('⚠️ أدخل اسم الموظف', 'danger'); return; }
    global.doctors = global.doctors || [];
    global.doctors.push({
      id: Date.now().toString(), name, specialty: document.getElementById('fr-staff-spec')?.value.trim() || 'أخصائي',
      salary: 0, housing: 0, transport: 0, otRate: 0, active: true, commissionType: 'global'
    });
    global.DB?.set('doctors', global.doctors);
    global.populateDoctorSelects?.();
    notify('✅ تمت إضافة الموظف');
    renderWizardStep();
  }

  async function wizardAddUser() {
    const fullName = document.getElementById('fr-user-name')?.value.trim();
    const username = document.getElementById('fr-user-login')?.value.trim();
    const pw = document.getElementById('fr-user-pw')?.value;
    const role = document.getElementById('fr-user-role')?.value || 'reception';
    if (!fullName || !username || !pw) { notify('⚠️ أكمل بيانات المستخدم', 'danger'); return; }
    if (typeof global.hashPW !== 'function') return;
    global.users = global.users || [];
    const usernameKey = username.toLowerCase();
    const duplicate = global.users.find(u => String(u?.username || '').toLowerCase() === usernameKey);
    if (duplicate) { notify('⚠️ اسم المستخدم مستخدم بالفعل', 'danger'); return; }
    global.users.push({
      id: Date.now().toString(), fullName, username,
      password: await global.hashPW(pw, username), role, active: true, empNum: ''
    });
    global.DB?.set('users', global.users);
    global.filterLoginUsers?.();
    notify('✅ تمت إضافة المستخدم');
    renderWizardStep();
  }

  /* ── Readiness card ── */
  function renderReadinessCard() {
    const host = document.getElementById('dash-readiness-card');
    if (!host || !isAppAuthed()) return;
    if (!licFeat('sys_readiness')) { host.style.display = 'none'; return; }
    const r = evaluateReadiness();
    const fr = global.settings?.firstRun || {};
    if (r.pct >= 100) {
      host.style.display = 'none';
      return;
    }
    if (fr.readinessDismissed && r.pct >= (fr.readinessDismissedPct ?? 0)) {
      host.style.display = 'none';
      return;
    }
    host.style.display = '';
    host.innerHTML = `
      <div class="fr-readiness-card">
        <div class="fr-readiness-head">
          <h3>📋 جاهزية النظام</h3>
          <span class="fr-readiness-pct">${r.pct}%</span>
        </div>
        <div class="fr-readiness-bar"><div class="fr-readiness-bar-fill" style="width:${r.pct}%"></div></div>
        <div class="fr-readiness-grid">${r.items.map(i => {
          const ok = i.check();
          return `<div class="fr-readiness-item">${ok ? '✅' : '☐'} ${i.label}</div>`;
        }).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
          ${r.pct < 100 ? '<button type="button" class="btn btn-primary btn-sm" onclick="FirstRun.openSetupWizard()">⚙️ متابعة الإعداد</button>' : ''}
          <button type="button" class="btn btn-ghost btn-sm" onclick="showPage(\'settings\');switchSettingsTab(\'help\')">فحص الجاهزية</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="FirstRun.dismissReadiness()">إخفاء</button>
        </div>
      </div>`;
  }

  function dismissReadiness() {
    const r = evaluateReadiness();
    saveFirstRunState({ readinessDismissed: true, readinessDismissedPct: r.pct });
    const host = document.getElementById('dash-readiness-card');
    if (host) host.style.display = 'none';
  }

  function showReadinessCard() {
    saveFirstRunState({ readinessDismissed: false });
    renderReadinessCard();
  }

  /* ── Health check panel ── */
  function renderHealthCheckUI() {
    const el = document.getElementById('fr-health-check-body');
    if (!el) return;
    if (!licFeat('sys_health_check')) {
      el.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:13px">فحص الجاهزية غير متاح في إصدار ترخيصك.</div>';
      return;
    }
    el.innerHTML = '<div class="fr-health-meta">🔄 جارٍ إعادة فحص النظام...</div>';
    const run = () => {
      if (typeof global.migrateClientsFromCases === 'function') try { global.migrateClientsFromCases(); } catch {}
      const checks = getHealthChecks();
      const stamp = new Date().toLocaleString('ar-SA', { hour12: false });
      const okCount = checks.filter(c => c.ok).length;
      el.innerHTML = `
      <div class="fr-health-meta">🔄 آخر فحص: ${stamp} — ${okCount}/${checks.length} بند سليم (فحص مباشر)</div>
      <div class="fr-health-list">${checks.map(c => `
      <div class="fr-health-row ${c.ok ? 'ok' : 'bad'}">
        <span class="fr-health-label">${c.ok ? '🟢' : '🔴'} ${c.label}</span>
        <span class="fr-health-msg">${c.msg}</span>
        ${c.fix ? `<button type="button" class="btn ${c.ok ? 'btn-ghost' : 'btn-accent'} btn-sm" style="align-self:flex-start" onclick="FirstRun.runHealthFix('${c.id}')">${c.ok ? 'فتح الإعداد' : 'إصلاح الآن'}</button>` : ''}
      </div>`).join('')}</div>`;
    };
    requestAnimationFrame(() => setTimeout(run, 60));
  }

  function runHealthFix(id) {
    const c = getHealthChecks().find(x => x.id === id);
    if (c?.fix) c.fix();
  }

  function initFirstRunExperience() {
    if (!_domReady) {
      injectStyles();
      if (licFeat('sys_setup_wizard')) ensureWizardDOM();
      _domReady = true;
    }
    ensureFirstRunSettings();
    renderReadinessCard();
    if (shouldShowSetupWizard()) {
      const resume = global.settings.firstRun.wizardStep || 0;
      setTimeout(() => openSetupWizard(resume), 500);
    } else if (shouldShowProductTour()) {
      maybeStartProductTour();
    }
  }

  function restartSetupWizard() {
    if (!licFeat('sys_setup_wizard')) { notify('⛔ معالج الإعداد غير متاح في إصدار ترخيصك', 'danger'); return; }
    if (!isAdminUser()) {
      notify('معالج الإعداد متاح فقط لمدير النظام لأنه يقوم بتعديل الإعدادات الأساسية للبرنامج.', 'danger');
      return;
    }
    saveFirstRunState({ wizardCompleted: false, wizardSkipped: false, wizardStep: 0, wizardMaxStep: 0, forceWizard: true });
    if (typeof global.logAudit === 'function') global.logAudit('SETUP_WIZARD_RESTART', 'إعادة تشغيل معالج الإعداد الأولي');
    openSetupWizard(0);
  }

  global.FirstRun = {
    initFirstRunExperience,
    openSetupWizard,
    closeSetupWizard,
    skipSetupWizard,
    completeSetupWizard,
    goWizardStep,
    openProductTour,
    skipProductTour,
    completeProductTour,
    renderReadinessCard,
    renderHealthCheckUI,
    evaluateReadiness,
    getHealthChecks,
    runHealthFix,
    finishWizardLater,
    restartSetupWizard,
    restartProductTour,
    wizardSeedCatalog,
    wizardAddPackage,
    wizardAddStaff,
    wizardAddUser,
    dismissReadiness,
    showReadinessCard,
    onProductTourFeatureChange
  };

  global.ensureFirstRunSettings = ensureFirstRunSettings;
  global.renderReadinessCard = renderReadinessCard;
  global.renderHealthCheckUI = renderHealthCheckUI;
  global.showReadinessCard = showReadinessCard;

})(typeof window !== 'undefined' ? window : globalThis);
