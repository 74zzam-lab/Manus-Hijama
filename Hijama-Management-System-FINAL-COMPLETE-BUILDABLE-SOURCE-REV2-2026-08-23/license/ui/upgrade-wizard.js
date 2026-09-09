(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};
  let _step = 1;
  let _state = {};
  let _result = null;
  const TOTAL_STEPS = 5;

  function el(id) { return document.getElementById(id); }

  function ensureOverlay() {
    const root = CL.env?.modalHost?.() || document.body;
    let existing = el('lic-v2-upgrade-overlay');
    if (existing) {
      if (existing.parentElement !== root) root.appendChild(existing);
      return;
    }
    const html = `
<div id="lic-v2-upgrade-overlay" class="lic-v2-overlay lic-v2-wizard-overlay" aria-hidden="true">
  <div class="lic-v2-drawer" role="dialog">
    <div class="lic-v2-header">
      <h2>⬆️ معالج الترقية</h2>
      <button type="button" class="lic-v2-close" id="lic-v2-upgrade-close">✕</button>
    </div>
    <div class="lic-v2-steps" id="lic-v2-upgrade-steps"></div>
    <div class="lic-v2-body" id="lic-v2-upgrade-body"></div>
    <div class="lic-v2-footer">
      <button type="button" class="lic-v2-btn lic-v2-btn-secondary" id="lic-v2-upgrade-prev">← السابق</button>
      <button type="button" class="lic-v2-btn lic-v2-btn-danger" id="lic-v2-upgrade-cancel">إلغاء</button>
      <button type="button" class="lic-v2-btn lic-v2-btn-primary" id="lic-v2-upgrade-next">التالي →</button>
    </div>
  </div>
</div>`;
    root.insertAdjacentHTML('beforeend', html);
    el('lic-v2-upgrade-close').onclick = close;
    el('lic-v2-upgrade-cancel').onclick = close;
    el('lic-v2-upgrade-prev').onclick = () => goStep(_step - 1);
    el('lic-v2-upgrade-next').onclick = onNext;
    el('lic-v2-upgrade-overlay').onclick = e => {
      if (e.target === el('lic-v2-upgrade-overlay')) close();
    };
  }

  function resetState() {
    _step = 1;
    _result = null;
    _state = {
      licenseId: '',
      targetPackageId: '03',
      mode: 'upgrade_only',
      keepExpiration: true,
      keepDevices: true,
      keepBranches: true,
      subscriptionId: '05'
    };
  }

  function open() {
    if (CL.env?.isLicenseScreenOpen && !CL.env.isLicenseScreenOpen()) {
      if (typeof notify === 'function') notify('افتح إدارة الترخيص من لوحة المطور أولاً', 'warning');
      return;
    }
    ensureOverlay();
    resetState();
    CL.engine.ensureReady().then(() => {
      el('lic-v2-upgrade-overlay').classList.add('open');
      render();
    }).catch(err => {
      if (typeof notify === 'function') notify('فشل تحميل: ' + err.message, 'danger');
    });
  }

  function close() {
    const o = el('lic-v2-upgrade-overlay');
    if (o) o.classList.remove('open');
  }

  function goStep(n) {
    if (n < 1 || n > TOTAL_STEPS) return;
    _step = n;
    render();
  }

  function renderDots() {
    const wrap = el('lic-v2-upgrade-steps');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      const d = document.createElement('div');
      d.className = 'lic-v2-step-dot' + (i === _step ? ' active' : '') + (i < _step ? ' done' : '');
      wrap.appendChild(d);
    }
  }

  function featureLabel(id) {
    const f = (CL.registries?.feature?.features || []).find(x => x.id === id);
    return f ? (f.name || f.displayNameAr || f.displayName || f.key || id) : id;
  }

  function formatFeatureDiff(ids, max) {
    const limit = max || 12;
    const shown = ids.slice(0, limit).map(id => featureLabel(id));
    const tail = ids.length > limit ? ` … +${ids.length - limit}` : '';
    return shown.join('، ') + tail || '—';
  }

  function getRecord() {
    return _state.licenseId ? CL.store.getLicense(_state.licenseId) : null;
  }

  function resolveForRecord(rec) {
    if (!rec) return null;
    if (rec.packageId === '99' && rec.customPackageId) {
      return CL.featureResolver.resolveCustomPackage(rec.customPackageId);
    }
    return CL.featureResolver.resolvePackageCached(rec.packageId);
  }

  function renderStep1(body) {
    const entries = CL.store.listLicenses();
    const q = _state.search || '';
    const filtered = entries.filter(e => {
      if (!q) return true;
      const hay = [e.licenseId, e.customer, e.company].join(' ').toLowerCase();
      return hay.includes(q.toLowerCase());
    });
    body.innerHTML = `
      <input type="text" class="lic-v2-search" id="lic-v2-upg-search" placeholder="🔍 بحث بالمعرّف أو العميل..." value="${q}">
      <div id="lic-v2-upg-list">${filtered.length ? filtered.map(e => `
        <label class="lic-v2-action-row" style="padding:10px;border:1px solid rgba(255,255,255,0.1);border-radius:8px;margin-bottom:8px;display:block">
          <input type="radio" name="lic-upg-lic" value="${e.licenseId}"${_state.licenseId === e.licenseId ? ' checked' : ''}>
          ${e.licenseId} — ${e.customer || '—'} — ${e.company || '—'} — exp ${e.expiryDate || '—'}
        </label>`).join('') : '<p>لا توجد تراخيص — أنشئ ترخيصًا من منشئ التراخيص أولاً.</p>'}</div>`;
    const search = el('lic-v2-upg-search');
    if (search) search.oninput = () => { _state.search = search.value; renderStep1(body); };
    body.querySelectorAll('input[name="lic-upg-lic"]').forEach(inp => {
      inp.onchange = () => { _state.licenseId = inp.value; };
    });
  }

  function renderStep2(body) {
    const rec = getRecord();
    const cur = resolveForRecord(rec);
    const pkg = (CL.registries?.package?.packages || []).find(p => p.id === rec?.packageId);
    body.innerHTML = rec ? `
      <div class="lic-v2-preview">
        <dl>
          <dt>المعرّف</dt><dd>${rec.licenseId}</dd>
          <dt>الباقة الحالية</dt><dd>${pkg?.displayName || rec.packageId} (${rec.packageId})</dd>
          <dt>الخصائص</dt><dd>${(cur?.featureIds || []).length}</dd>
          <dt>الأجهزة</dt><dd>${rec.devices}</dd>
          <dt>الفروع</dt><dd>${rec.branches}</dd>
          <dt>الانتهاء</dt><dd>${rec.expiryDate}</dd>
        </dl>
      </div>` : '<p>اختر ترخيصًا من الخطوة السابقة.</p>';
  }

  function renderStep3(body) {
    const allPkgs = CL.registries?.package?.packages || [];
    const pkgs = global.PackageRegistryViewer?.filterLicenseBuilderPackages?.(allPkgs)
      || allPkgs.filter(p => p.visible !== false && p.id !== '99' && !['05', '06', '10'].includes(p.id));
    body.innerHTML = '<p>الباقة المستهدفة:</p><div class="lic-v2-pkg-grid">' +
      pkgs.map(p => `
        <div class="lic-v2-pkg-card${_state.targetPackageId === p.id ? ' selected' : ''}" data-pkg="${p.id}">
          <div class="icon">${p.icon || '📦'}</div>
          <div class="name">${p.displayNameAr || p.displayName}</div>
          <div class="meta">${p.id}</div>
        </div>`).join('') + '</div>';
    body.querySelectorAll('.lic-v2-pkg-card').forEach(card => {
      card.onclick = () => { _state.targetPackageId = card.dataset.pkg; render(); };
    });
  }

  function renderStep4(body) {
    const rec = getRecord();
    const cur = resolveForRecord(rec);
    let target;
    try { target = CL.featureResolver.resolvePackageCached(_state.targetPackageId); } catch { target = { featureIds: [] }; }
    const diff = CL.upgrade.compareFeatureSets(cur?.featureIds, target.featureIds);
    body.innerHTML = `
      <p>مقارنة الخصائص:</p>
      <p class="lic-v2-diff-added">✅ مضافة (${diff.added.length}): ${formatFeatureDiff(diff.added, 12)}</p>
      <p class="lic-v2-diff-removed">❌ محذوفة (${diff.removed.length}): ${formatFeatureDiff(diff.removed, 12)}</p>
      <p>⚪ بدون تغيير: ${diff.unchanged.length} خاصية</p>`;
  }

  function renderStep5(body) {
    if (_result) {
      body.innerHTML = `
        <p>✅ تم توليد مفتاح الترقية</p>
        <div class="lic-v2-key-box">${_result.key}</div>
        <div class="lic-v2-actions-row">
          <button type="button" class="lic-v2-btn lic-v2-btn-primary" id="lic-v2-upg-copy">📋 نسخ المفتاح</button>
        </div>`;
      el('lic-v2-upg-copy').onclick = async () => {
        const ok = typeof licCopyToClipboard === 'function'
          ? await licCopyToClipboard(_result.key)
          : false;
        if (typeof notify === 'function') notify(ok ? 'تم النسخ' : 'فشل النسخ', ok ? 'success' : 'danger');
      };
      return;
    }
    body.innerHTML = `
      <p>وضع الترقية:</p>
      <div class="lic-v2-action-row"><label><input type="radio" name="upg-mode" value="upgrade_only"${_state.mode === 'upgrade_only' ? ' checked' : ''}> ترقية فقط</label></div>
      <div class="lic-v2-action-row"><label><input type="radio" name="upg-mode" value="upgrade_renew"${_state.mode === 'upgrade_renew' ? ' checked' : ''}> ترقية + تجديد</label></div>
      <div class="lic-v2-action-row"><label><input type="radio" name="upg-mode" value="upgrade_extend"${_state.mode === 'upgrade_extend' ? ' checked' : ''}> ترقية + تمديد</label></div>
      <div class="lic-v2-action-row"><label><input type="radio" name="upg-mode" value="upgrade_lifetime"${_state.mode === 'upgrade_lifetime' ? ' checked' : ''}> ترقية + مدى الحياة</label></div>
      <div class="lic-v2-action-row" style="margin-top:12px"><label><input type="checkbox" id="upg-keep-exp"${_state.keepExpiration ? ' checked' : ''}> الاحتفاظ بتاريخ الانتهاء</label></div>
      <div class="lic-v2-action-row"><label><input type="checkbox" id="upg-keep-dev"${_state.keepDevices ? ' checked' : ''}> الاحتفاظ بعدد الأجهزة</label></div>
      <div class="lic-v2-action-row"><label><input type="checkbox" id="upg-keep-br"${_state.keepBranches ? ' checked' : ''}> الاحتفاظ بعدد الفروع</label></div>`;
    body.querySelectorAll('input[name="upg-mode"]').forEach(inp => {
      inp.onchange = () => { _state.mode = inp.value; };
    });
    const ke = el('upg-keep-exp');
    const kd = el('upg-keep-dev');
    const kb = el('upg-keep-br');
    if (ke) ke.onchange = () => { _state.keepExpiration = ke.checked; };
    if (kd) kd.onchange = () => { _state.keepDevices = kd.checked; };
    if (kb) kb.onchange = () => { _state.keepBranches = kb.checked; };
  }

  async function runUpgrade() {
    if (!_state.licenseId) {
      if (typeof notify === 'function') notify('اختر ترخيصًا', 'danger');
      return;
    }
    try {
      _result = await CL.upgrade.upgrade(_state.licenseId, {
        targetPackageId: _state.targetPackageId,
        mode: _state.mode,
        keepExpiration: _state.keepExpiration,
        keepDevices: _state.keepDevices,
        keepBranches: _state.keepBranches,
        subscriptionId: _state.subscriptionId
      });
      render();
    } catch (e) {
      if (typeof notify === 'function') notify('فشل الترقية: ' + e.message, 'danger');
    }
  }

  function onNext() {
    if (_step === 5 && !_result) {
      runUpgrade();
      return;
    }
    if (_result) { close(); return; }
    if (_step < TOTAL_STEPS) goStep(_step + 1);
  }

  function render() {
    renderDots();
    const body = el('lic-v2-upgrade-body');
    const prev = el('lic-v2-upgrade-prev');
    const next = el('lic-v2-upgrade-next');
    if (prev) prev.disabled = _step <= 1 || !!_result;
    if (next) {
      next.textContent = _step === 5 && !_result ? '🔑 توليد مفتاح الترقية' : (_result ? 'إغلاق' : 'التالي →');
    }
    [null, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5][_step](body);
  }

  CL.upgradeWizard = { open, close };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
