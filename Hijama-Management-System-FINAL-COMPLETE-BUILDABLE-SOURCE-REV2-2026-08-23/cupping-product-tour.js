/**
 * Product Tour — lazy-loaded licensed feature (sys_product_tour)
 */
(function (global) {
  'use strict';

  const TOUR_STEPS = [
    { sel: '#sidebar', title: 'مرحبًا بك', body: 'ابدأ من هنا — القائمة الجانبية تحتوي جميع أقسام النظام.', page: 'dashboard' },
    { sel: '[data-page="clients"]', title: 'سجل العملاء', body: 'اذهب إلى العملاء وأضف أول عميل لمركزك.', page: 'clients', action: () => global.showPage?.('clients') },
    { sel: '#page-clients .card-header .btn-primary, #page-clients button[onclick*="openClient"]', title: 'أول عميل', body: 'استخدم زر الإضافة لتسجيل بيانات العميل.', page: 'clients' },
    { sel: '[data-page="daily"]', title: 'السجل اليومي', body: 'من هنا تُسجّل الجلسات وتُصدر الفواتير.', page: 'daily', action: () => global.showPage?.('daily') },
    { sel: '#page-daily .card-title', title: 'أول حالة', body: 'أدخل بيانات الجلسة ثم احفظ لإصدار أول فاتورة.', page: 'daily' },
    { sel: '[data-page="doctors"]', title: 'الموظفون', body: 'أضف الأخصائيين وموظفي الاستقبال من قسم الموظفين.', page: 'doctors', action: () => global.showPage?.('doctors') },
    { sel: '[data-page="users"]', title: 'المستخدمون', body: 'أنشئ حسابات الدخول وحدد الصلاحيات لكل دور.', page: 'users', action: () => global.showPage?.('users') },
    { sel: '[data-page="settings"]', title: 'النسخ الاحتياطي', body: 'فعّل النسخ الاحتياطي لحماية بيانات مركزك.', page: 'settings', action: () => { global.showPage?.('settings'); global.switchSettingsTab?.('backup'); } },
    { sel: '#page-dashboard', title: 'مبروك!', body: 'النظام أصبح جاهزًا للاستخدام اليومي. يمكنك إعادة الجولة من الإعدادات › المساعدة.', page: 'dashboard', action: () => global.showPage?.('dashboard') }
  ];

  let _tourStep = 0;
  let _mounted = false;

  function featOn() {
    return typeof global.isFeatureEnabled === 'function' && global.isFeatureEnabled('sys_product_tour');
  }

  function notify(msg, type) {
    if (typeof global.notify === 'function') global.notify(msg, type);
  }

  function saveFirstRunState(patch) {
    if (typeof global.ensureFirstRunSettings === 'function') global.ensureFirstRunSettings();
    if (!global.settings?.firstRun) return;
    Object.assign(global.settings.firstRun, patch);
    global.DB?.set('settings', global.settings);
  }

  function isAdminUser() {
    const u = global.currentUser || global.getActiveUser?.();
    if (typeof global.RolePolicy !== 'undefined' && global.RolePolicy.isManager(u)) return true;
    return !!u?.isDev;
  }

  function injectTourStyles() {
    if (document.getElementById('product-tour-styles')) return;
    const s = document.createElement('style');
    s.id = 'product-tour-styles';
    s.textContent = `
.fr-tour-overlay{position:fixed;inset:0;z-index:10150;display:none;pointer-events:none}
.fr-tour-overlay.open{display:block;pointer-events:auto}
.fr-tour-spot{position:absolute;border:3px solid var(--accent);border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,.78),0 0 24px color-mix(in srgb,var(--accent) 50%,transparent);pointer-events:none;transition:all .3s cubic-bezier(.4,0,.2,1);z-index:1}
.fr-tour-arrow{position:absolute;width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:12px solid var(--accent);z-index:2;pointer-events:none;transition:all .3s ease;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))}
.fr-tour-pop{position:absolute;max-width:360px;background:var(--card);border-radius:14px;padding:16px 18px;box-shadow:0 16px 48px rgba(0,0,0,.35);border:1px solid var(--border);z-index:3;pointer-events:auto;animation:frTourPopIn .25s ease}
@keyframes frTourPopIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.fr-tour-pop h4{margin:0 0 8px;font-size:16px;font-weight:900;color:var(--primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fr-tour-pop p{margin:0 0 14px;font-size:13px;color:var(--text-muted);line-height:1.7}
.fr-tour-actions{display:flex;gap:8px;flex-wrap:wrap}`;
    document.head.appendChild(s);
  }

  function ensureTourDOM() {
    if (document.getElementById('productTourOverlay')) return;
    injectTourStyles();
    const tour = document.createElement('div');
    tour.id = 'productTourOverlay';
    tour.className = 'fr-tour-overlay';
    tour.setAttribute('data-feature', 'sys_product_tour');
    tour.innerHTML = `
      <div class="fr-tour-spot" id="frTourSpot" style="display:none"></div>
      <div class="fr-tour-arrow" id="frTourArrow" style="display:none"></div>
      <div class="fr-tour-pop" id="frTourPop" style="display:none">
        <h4 id="frTourTitle"></h4>
        <p id="frTourBody"></p>
        <div class="fr-tour-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="frTourSkip">تخطي</button>
          <button type="button" class="btn btn-ghost btn-sm" id="frTourPrev">السابق</button>
          <button type="button" class="btn btn-primary btn-sm" id="frTourNext">التالي</button>
        </div>
      </div>`;
    document.body.appendChild(tour);
    tour.querySelector('#frTourSkip').onclick = skipProductTour;
    tour.querySelector('#frTourPrev').onclick = () => goTourStep(_tourStep - 1);
    tour.querySelector('#frTourNext').onclick = onTourNext;
    _mounted = true;
  }

  function destroyTour() {
    document.getElementById('productTourOverlay')?.remove();
    document.getElementById('product-tour-styles')?.remove();
    _mounted = false;
    _tourStep = 0;
  }

  function positionTour() {
    const step = TOUR_STEPS[_tourStep];
    const spot = document.getElementById('frTourSpot');
    const arrow = document.getElementById('frTourArrow');
    const pop = document.getElementById('frTourPop');
    if (!step || !spot || !pop) return;
    if (step.action) try { step.action(); } catch {}
    setTimeout(() => {
      const target = document.querySelector(step.sel);
      document.getElementById('frTourTitle').textContent = step.title;
      document.getElementById('frTourBody').textContent = step.body;
      const prevBtn = document.getElementById('frTourPrev');
      if (prevBtn) prevBtn.style.display = _tourStep > 0 ? '' : 'none';
      const nextBtn = document.getElementById('frTourNext');
      if (nextBtn) nextBtn.textContent = _tourStep >= TOUR_STEPS.length - 1 ? 'إنهاء ✓' : 'التالي';
      if (!target) {
        spot.style.display = 'none';
        if (arrow) arrow.style.display = 'none';
        pop.style.display = 'block';
        pop.style.top = '18%';
        pop.style.right = '24px';
        pop.style.left = 'auto';
        return;
      }
      const r = target.getBoundingClientRect();
      spot.style.display = 'block';
      spot.style.top = (r.top - 8) + 'px';
      spot.style.left = (r.left - 8) + 'px';
      spot.style.width = (r.width + 16) + 'px';
      spot.style.height = (r.height + 16) + 'px';
      if (arrow) {
        arrow.style.display = 'block';
        const popTop = Math.min(window.innerHeight - 220, Math.max(16, r.bottom + 14));
        const arrowTop = r.bottom + 4;
        arrow.style.top = arrowTop + 'px';
        arrow.style.left = (r.left + r.width / 2 - 10) + 'px';
        arrow.style.transform = popTop > arrowTop + 20 ? 'rotate(0deg)' : 'rotate(180deg)';
      }
      pop.style.display = 'block';
      const popTop = Math.min(window.innerHeight - 200, r.bottom + 28);
      pop.style.top = popTop + 'px';
      pop.style.right = Math.max(16, window.innerWidth - r.right) + 'px';
      pop.style.left = 'auto';
      target.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }, step.action ? 650 : 120);
  }

  function closeProductTour() {
    document.getElementById('productTourOverlay')?.classList.remove('open');
  }

  function onTourNext() {
    if (_tourStep >= TOUR_STEPS.length - 1) return completeProductTour();
    goTourStep(_tourStep + 1);
  }

  function goTourStep(n) {
    _tourStep = Math.max(0, Math.min(TOUR_STEPS.length - 1, n));
    saveFirstRunState({ tourStep: _tourStep });
    positionTour();
  }

  function skipProductTour() {
    saveFirstRunState({ tourSkipped: true, tourCompleted: false });
    global.logAudit?.('PRODUCT_TOUR', `تخطي الجولة التعريفية عند الخطوة ${_tourStep + 1}`, { step: _tourStep, action: 'skip' });
    closeProductTour();
  }

  function completeProductTour() {
    saveFirstRunState({ tourCompleted: true, tourSkipped: false, tourStep: TOUR_STEPS.length - 1 });
    global.logAudit?.('PRODUCT_TOUR', 'إكمال الجولة التعريفية', { step: _tourStep, action: 'complete' });
    closeProductTour();
    notify('🎉 اكتملت الجولة التعريفية — بالتوفيق!');
  }

  function openProductTour(step) {
    if (!featOn()) return;
    if (!isAdminUser()) return;
    if (typeof global.ensureFirstRunSettings === 'function') global.ensureFirstRunSettings();
    if (global.settings?.firstRun?.tourCompleted && typeof step !== 'number') {
      notify('اكتملت الجولة التعريفية — يمكنك إعادتها من الإعدادات › المساعدة', 'success');
      return;
    }
    ensureTourDOM();
    _tourStep = typeof step === 'number' ? step : (global.settings?.firstRun?.tourStep || 0);
    global.logAudit?.('PRODUCT_TOUR', `بدء الجولة التعريفية — الخطوة ${_tourStep + 1} من ${TOUR_STEPS.length}`, { step: _tourStep });
    document.getElementById('productTourOverlay')?.classList.add('open');
    positionTour();
  }

  function maybeStartProductTour() {
    if (!shouldShowProductTour()) return;
    setTimeout(() => openProductTour(global.settings?.firstRun?.tourStep || 0), 800);
  }

  function shouldShowProductTour() {
    if (!featOn()) return false;
    if (typeof global.ensureFirstRunSettings === 'function') global.ensureFirstRunSettings();
    const fr = global.settings?.firstRun || {};
    return isAdminUser() && (fr.wizardCompleted || fr.wizardSkipped)
      && !fr.tourCompleted && !fr.tourSkipped;
  }

  function restartProductTour() {
    if (!featOn()) return;
    if (!isAdminUser()) { notify('⛔ الجولة التعريفية متاحة لمدير النظام', 'danger'); return; }
    saveFirstRunState({ tourCompleted: false, tourSkipped: false, tourStep: 0 });
    global.logAudit?.('PRODUCT_TOUR', 'إعادة تشغيل الجولة التعريفية', { action: 'restart' });
    openProductTour(0);
  }

  global.ProductTour = {
    open: openProductTour,
    close: closeProductTour,
    skip: skipProductTour,
    complete: completeProductTour,
    restart: restartProductTour,
    maybeStart: maybeStartProductTour,
    shouldShow: shouldShowProductTour,
    destroy: destroyTour,
    isMounted: () => _mounted
  };

})(typeof window !== 'undefined' ? window : globalThis);
