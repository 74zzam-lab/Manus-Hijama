/**
 * Center Setup UI — one wizard for Google / branch / device / manage (before or after login).
 */
(function (global) {
  'use strict';

  let _tab = 'overview';

  function injectStyles() {
    if (document.getElementById('center-setup-styles')) return;
    const s = document.createElement('style');
    s.id = 'center-setup-styles';
    s.textContent = `
.cs-overlay{position:fixed;inset:0;z-index:100010;background:rgba(6,14,10,.72);display:none;place-items:center;box-sizing:border-box;padding-block:clamp(24px,5vh,48px);padding-inline:clamp(16px,3vw,32px);overflow:hidden}
.cs-overlay.open{display:grid}
.cs-modal,.cs-modal.modal-shell{max-width:560px;width:min(560px,100%);max-height:calc(100dvh - (2 * clamp(24px,5vh,48px)));overflow:hidden;display:grid;grid-template-rows:auto auto minmax(0,1fr);background:var(--card);border-radius:16px;border:1px solid var(--border);box-shadow:0 24px 56px rgba(0,0,0,.35);min-height:0;box-sizing:border-box}
.cs-head{padding:18px 20px 10px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-shrink:0}
.cs-head h2{margin:0;font-size:18px;font-weight:900;color:var(--primary)}
.cs-head p{margin:6px 0 0;font-size:12px;color:var(--text-muted);line-height:1.6}
.cs-close{border:none;background:transparent;font-size:20px;cursor:pointer;color:var(--text-muted);padding:4px 8px;min-width:44px;min-height:44px}
.cs-tabs{display:flex;gap:6px;padding:10px 16px;border-bottom:1px solid var(--border);flex-wrap:nowrap;overflow-x:auto;flex-shrink:0}
.cs-tab{padding:7px 12px;border-radius:8px;border:1px solid var(--border);background:transparent;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap;min-height:44px}
.cs-tab.active{background:rgba(201,168,76,.18);border-color:rgba(201,168,76,.45);color:var(--primary)}
.cs-body{padding:16px 20px 20px;min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.cs-step{padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--surface);margin-bottom:10px}
.cs-step h3{margin:0 0 6px;font-size:14px;font-weight:900}
.cs-step p{margin:0 0 10px;font-size:12px;color:var(--text-muted);line-height:1.65}
.cs-step.done{border-color:rgba(45,122,95,.45);background:rgba(45,122,95,.08)}
.cs-step.pending{border-color:rgba(255,193,7,.4);background:rgba(255,193,7,.06)}
.cs-status{font-size:11px;font-weight:800;margin-bottom:8px}
.cs-list{display:grid;gap:8px;margin-top:8px}
.cs-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card);font-size:12px}
.cs-row-name{font-weight:800}
.cs-row-meta{font-size:10px;color:var(--text-muted)}
.cs-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
`;
    document.head.appendChild(s);
  }

  function ensureDOM() {
    injectStyles();
    if (document.getElementById('centerSetupModal')) return;
    const el = document.createElement('div');
    el.id = 'centerSetupModal';
    el.className = 'cs-overlay';
    el.innerHTML = `
      <div class="cs-modal modal-shell" role="dialog">
        <header class="cs-head modal-header">
          <div><h2>⚙️ إعداد المركز</h2><p>Google · فرع · جهاز — <strong>بدون تكرار مفتاح التفعيل</strong> على الأجهزة الإضافية</p></div>
          <button type="button" class="cs-close" id="cs-close" aria-label="إغلاق">✕</button>
        </header>
        <div class="cs-tabs">
          <button type="button" class="cs-tab active" data-cs-tab="overview">📋 نظرة عامة</button>
          <button type="button" class="cs-tab" data-cs-tab="bootstrap">☁️ Google</button>
          <button type="button" class="cs-tab" data-cs-tab="branch">🏥 فرع وجهاز</button>
          <button type="button" class="cs-tab" data-cs-tab="manage">🛠️ إدارة</button>
        </div>
        <section class="cs-body modal-body" id="cs-body"></section>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#cs-close').onclick = close;
    el.onclick = e => { if (e.target === el) close(); };
    el.querySelectorAll('[data-cs-tab]').forEach(btn => {
      btn.onclick = () => open(btn.dataset.csTab);
    });
  }

  function stepClass(done, pending) {
    if (done) return 'cs-step done';
    if (pending) return 'cs-step pending';
    return 'cs-step';
  }

  function renderOverview() {
    const s = global.CenterSetup?.getSetupState?.() || {};
    return `
      <div class="${stepClass(s.hasGoogle, !s.hasGoogle && (s.hasLegacyLicense || s.hasCloudLicense))}">
        <div class="cs-status">${s.hasGoogle ? '✅' : '⬜'} 1 — Google</div>
        <h3>ربط Google Drive</h3>
        <p>مطلوب للمزامنة بين الأجهزة. <strong>جهاز إضافي:</strong> Google + سحب فقط — بدون مفتاح.</p>
        <button type="button" class="btn btn-secondary btn-sm" onclick="CenterSetupUI.open('bootstrap')">☁️ Google</button>
      </div>
      <div class="${stepClass(s.hasLegacyLicense || s.hasCloudLicense, !s.hasLegacyLicense && !s.hasCloudLicense)}">
        <div class="cs-status">${s.hasLegacyLicense || s.hasCloudLicense ? '✅' : '⬜'} 2 — الترخيص</div>
        <h3>تفعيل المفتاح — مرة واحدة فقط</h3>
        <p>على <strong>جهاز المدير الأول</strong> فقط. باقي الأجهزة لا تحتاج المفتاح.</p>
        <button type="button" class="btn btn-secondary btn-sm" onclick="typeof openLicenseScreen==='function'&&openLicenseScreen()">🔑 إدخال المفتاح</button>
      </div>
      <div class="${stepClass(s.branchLocked, s.hasCloudLicense && s.needsBranchSetup)}">
        <div class="cs-status">${s.branchLocked ? '✅' : '⬜'} 3 — فرع وجهاز</div>
        <h3>ربط الجهاز بفرع مصرّح</h3>
        <p>${s.branchLocked ? `مربوط: ${(typeof BranchDisplay !== 'undefined' && BranchDisplay.resolveBranchName ? BranchDisplay.resolveBranchName(s.lockedBranchId) : s.lockedBranchId) || '—'} / ${s.deviceName || '—'}` : 'اختر فرعاً موجوداً واربط هذا الجهاز — إنشاء الفروع من Owner Hub فقط.'}</p>
        <button type="button" class="btn btn-primary btn-sm" onclick="CenterSetupUI.openBranchStep()">🏥 فرع وجهاز</button>
      </div>
      ${s.centerId ? `<p style="font-size:11px;color:var(--text-muted);margin:12px 0 0" dir="ltr">Center ID: ${s.centerId}</p>` : ''}`;
  }

  function renderBootstrap() {
    const s = global.CenterSetup?.getSetupState?.() || {};
    const isElectron = !!(s.isElectron || global.BackupBridge?.isElectron?.() || global.cuppingElectron?.backup);
    if (!isElectron) {
      return '<p style="color:var(--danger)">☁️ Google متاح في تطبيق Electron لسطح المكتب فقط.</p>';
    }
    return `
      <div class="cs-step">
        <h3>☁️ جهاز جديد — سحب من Google</h3>
        <p>اربط <strong>نفس حساب Google للمركز</strong> ثم اسحب الترخيص وبيانات الفرع — <strong>بدون مفتاح تفعيل</strong>.</p>
        <div id="cs-branch-fields" class="login-drive-fields" style="margin:12px 0">
          <div><label>اسم هذا الجهاز</label>
            <input type="text" id="cs-device-name" class="form-control" placeholder="Reception-PC"></div>
          <div><label>الفرع</label>
            <select id="cs-branch-id" class="form-control"><option value="BR-MAIN">الفرع الرئيسي</option></select></div>
        </div>
        <button type="button" class="btn btn-primary" id="cs-google-btn" onclick="CenterSetupUI.runGoogleBootstrap()">🔗 ربط Google وسحب الترخيص</button>
        <div id="cs-bootstrap-status" style="margin-top:10px;font-size:12px;color:var(--text-muted)"></div>
      </div>
      <div class="cs-step" style="margin-top:10px">
        <h3>🔑 أو: تفعيل بمفتاح الترخيص</h3>
        <p>مرة واحدة على أول جهاز — من شاشة التفعيل.</p>
        <button type="button" class="btn btn-secondary btn-sm" onclick="typeof openLicenseScreen==='function'&&openLicenseScreen()">فتح شاشة التفعيل</button>
      </div>`;
  }

  function renderBranch() {
    return `
      <div class="cs-step">
        <h3>🏥 ربط هذا الجهاز بفرع</h3>
        <p>اختر فرعاً مصرّحاً موجوداً. إنشاء فرع جديد متاح للمالك فقط من Owner Hub.</p>
        <button type="button" class="btn btn-primary" onclick="CenterSetupUI.openBranchStep()">فتح نافذة ربط الجهاز</button>
      </div>`;
  }

  function renderManage() {
    const doc = global.LicenseCloud?.loadLocal?.() || {};
    const branches = (doc.branches || []).filter(b => b && b.active !== false);
    const devices = global.DeviceRegistry?.getRegistered?.(doc)?.filter(d => d && d.active !== false) || [];
    const selfUuid = global.DeviceConfig?.load?.()?.deviceUuid || '';
    const canOwner = !!global.RolePolicy?.canManageOrganization?.(global.currentUser);

    const branchRows = branches.length ? branches.map(b => {
      const dc = devices.filter(d => d.branchId === b.id).length;
      return `<div class="cs-row">
        <div><div class="cs-row-name">${b.name || b.id}</div><div class="cs-row-meta">${b.id} · ${dc} جهاز</div></div>
        ${canOwner ? `<button type="button" class="btn btn-ghost btn-sm" onclick="CenterSetupUI.removeBranch('${String(b.id).replace(/'/g, "\\'")}')">🗑️</button>` : ''}
      </div>`;
    }).join('') : '<div class="cs-row-meta">لا فروع — أنشئ الفرع الأول من Owner Hub (المالك فقط)</div>';

    const devRows = devices.length ? devices.map(d => {
      const isSelf = d.deviceUuid === selfUuid;
      return `<div class="cs-row">
        <div><div class="cs-row-name">${d.deviceName || d.deviceUuid?.slice(0, 8)}${isSelf ? ' (هذا الجهاز)' : ''}</div>
        <div class="cs-row-meta">${d.branchId || '—'} · ${d.deviceUuid?.slice(0, 8) || ''}</div></div>
        ${(!isSelf && canOwner) ? `<button type="button" class="btn btn-ghost btn-sm" onclick="CenterSetupUI.deactivateDevice('${d.deviceUuid}')">⏸️</button>` : ''}
      </div>`;
    }).join('') : '<div class="cs-row-meta">لا أجهزة مسجّلة</div>';

    return `
      <div class="cs-step">
        <h3>🌿 الفروع (${branches.length}/${global.LicenseLimits?.getMaxBranches?.(doc) || 1})</h3>
        <div class="cs-list">${branchRows}</div>
        <div class="cs-actions">
          <button type="button" class="btn btn-primary btn-sm" onclick="CenterSetupUI.openBranchStep()">🔗 ربط هذا الجهاز بفرع</button>
          ${canOwner ? '<button type="button" class="btn btn-secondary btn-sm" onclick="CenterSetupUI.openOwnerHubBranches()">➕ إنشاء فرع (Owner Hub)</button>' : ''}
        </div>
      </div>
      <div class="cs-step" style="margin-top:10px">
        <h3>🖥️ الأجهزة (${devices.length})</h3>
        <div class="cs-list">${devRows}</div>
      </div>`;
  }

  function render() {
    const body = document.getElementById('cs-body');
    if (!body) return;
    document.querySelectorAll('.cs-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.csTab === _tab);
    });
    if (_tab === 'overview') body.innerHTML = renderOverview();
    else if (_tab === 'bootstrap') body.innerHTML = renderBootstrap();
    else if (_tab === 'branch') body.innerHTML = renderBranch();
    else if (_tab === 'manage') body.innerHTML = renderManage();

    if (_tab === 'bootstrap') {
      const doc = global.LicenseCloud?.loadLocal?.();
      if (doc && typeof populateDriveBootstrapBranchFields === 'function') {
        populateDriveBootstrapBranchFields(doc, 'cs-');
      }
    }
  }

  function open(tab) {
    try {
      ensureDOM();
      _tab = tab || 'overview';
      document.getElementById('cloudConnectModal')?.classList.remove('open');
      const modal = document.getElementById('centerSetupModal');
      if (modal) {
        document.body.appendChild(modal);
        modal.classList.add('open');
      }
      render();
    } catch (err) {
      console.error('CenterSetupUI.open:', err);
      global.notify?.('⚠️ تعذّر فتح معالج الإعداد: ' + (err.message || 'خطأ'), 'danger');
    }
  }

  function close() {
    document.getElementById('centerSetupModal')?.classList.remove('open');
  }

  async function openBranchStep() {
    const prep = await global.CenterSetup?.prepareForBranchSetup?.();
    if (!prep?.ok) {
      global.notify?.('⚠️ ' + (prep?.message || prep?.error || 'أكمل التفعيل أو Google أولاً'), 'warning');
      return;
    }
    close();
    global.BranchLockUI?.openBranchLockModal?.();
  }

  function openOwnerHubBranches() {
    if (!global.RolePolicy?.canManageOrganization?.(global.currentUser)) {
      global.notify?.('⛔ إنشاء الفروع للمالك فقط من Owner Hub', 'danger');
      return;
    }
    close();
    if (typeof global.showPage === 'function') global.showPage('owner-hub');
    else global.notify?.('افتح Owner Hub لإضافة فرع', 'info');
  }

  async function runGoogleBootstrap() {
    if (typeof loginConnectGoogleAndBootstrap !== 'function') {
      global.notify?.('⚠️ Bootstrap غير متاح', 'danger');
      return;
    }
    const status = document.getElementById('cs-bootstrap-status');
    if (status) status.textContent = '⏳ جاري الربط...';
    const res = await loginConnectGoogleAndBootstrap({ context: 'center-setup', fieldPrefix: 'cs' }, false);
    if (res?.ok) {
      if (status) status.textContent = '✅ تم — يمكنك الآن ربط الجهاز بفرع';
      global.notify?.('✅ تم سحب الترخيص — اختر فرعاً مصرّحاً', 'success');
      setTimeout(() => openBranchStep(), 800);
    } else if (status) {
      status.textContent = '❌ ' + (res?.error || 'فشل');
    }
  }

  async function removeBranch(branchId) {
    if (!global.RolePolicy?.canManageOrganization?.(global.currentUser)) {
      global.notify?.('⛔ حذف الفروع للمالك فقط', 'danger');
      return;
    }
    const ask = global.tdwConfirm || ((opts) => Promise.resolve(!!global.confirm?.(opts?.message || opts)));
    if (!(await ask({ message: 'حذف/إيقاف الفرع ' + branchId + '؟' }))) return;
    const res = await global.CenterSetup?.removeBranch?.(branchId, { force: false });
    if (!res?.ok && res?.error === 'branch_has_devices') {
      if (await ask({ message: 'الفرع عليه أجهزة — إيقافها أيضاً؟' })) {
        const doc = global.LicenseCloud?.loadLocal?.();
        const devs = global.DeviceRegistry?.getRegistered?.(doc)?.filter(d => d.branchId === branchId && d.active !== false) || [];
        for (const d of devs) {
          await global.CenterSetup.deactivateDevice(d.deviceUuid, { allowSelf: true });
        }
        const retry = await global.CenterSetup.removeBranch(branchId, { force: true });
        if (!retry?.ok) global.notify?.('⛔ ' + (retry?.error || 'فشل'), 'danger');
      } else return;
    } else if (!res?.ok) {
      global.notify?.('⛔ ' + (res?.message || res?.error || 'فشل'), 'danger');
    } else {
      global.notify?.('✅ تم إيقاف الفرع', 'success');
    }
    render();
    global.OwnerHub?.refresh?.();
  }

  async function deactivateDevice(uuid) {
    if (!global.RolePolicy?.canManageOrganization?.(global.currentUser)) {
      global.notify?.('⛔ إدارة الأجهزة للمالك فقط', 'danger');
      return;
    }
    const ask = global.tdwConfirm || ((opts) => Promise.resolve(!!global.confirm?.(opts?.message || opts)));
    if (!(await ask({ message: 'إيقاف الجهاز من الترخيص؟' }))) return;
    const res = await global.CenterSetup?.deactivateDevice?.(uuid);
    if (!res?.ok) global.notify?.('⛔ ' + (res?.message || res?.error || 'فشل'), 'danger');
    else global.notify?.('✅ تم إيقاف الجهاز', 'success');
    render();
    global.OwnerHub?.refresh?.();
  }

  function maybeAutoOpen() {
    // V2-5.10: customer first-run = BootFlow only; post-login branch/device work = Owner Hub.
    // CenterSetupUI.open() remains for Advanced Support / Owner Hub buttons — never auto-prompt.
    return;
  }

  global.CenterSetupUI = {
    open,
    close,
    openBranchStep,
    openOwnerHubBranches,
    runGoogleBootstrap,
    removeBranch,
    deactivateDevice,
    maybeAutoOpen,
    render
  };
})(typeof window !== 'undefined' ? window : globalThis);
