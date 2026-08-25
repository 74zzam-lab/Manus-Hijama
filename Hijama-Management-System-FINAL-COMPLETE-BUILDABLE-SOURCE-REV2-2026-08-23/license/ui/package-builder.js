(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  let _state = {
    kind: 'basic',
    packageId: '10',
    customPackageId: '',
    internalName: '',
    displayName: '',
    displayNameAr: '',
    color: '#2980b9',
    featureIds: []
  };

  let _fpMount = null;

  function el(id) { return document.getElementById(id); }

  function nextRegistryId() {
    const pkgs = CL.registries?.package?.packages || [];
    const userPkgs = Object.values(CL.store?.getUserPackages?.() || {});
    const used = new Set([...pkgs, ...userPkgs].map(p => p.id));
    for (let n = 10; n <= 98; n++) {
      const id = String(n).padStart(2, '0');
      if (!used.has(id)) return id;
    }
    return '10';
  }

  function listSavedPackages() {
    const registryPkgs = CL.registries?.package?.packages || [];
    const filtered = global.PackageRegistryViewer?.filterLicenseBuilderPackages?.(registryPkgs)
      || registryPkgs.filter(p => p.visible !== false && !['05', '06', '99', '10'].includes(p.id));
    const registry = filtered
      .map(p => ({
        type: 'registry',
        id: p.id,
        customPackageId: null,
        displayName: p.displayNameAr || p.displayName,
        internalName: p.internalName,
        kind: p.packageKind || (p.featureIds?.length ? 'custom' : 'basic'),
        featureCount: (p.featureIds || []).length
      }));
    const userStored = Object.values(CL.store?.getUserPackages?.() || {}).map(p => ({
      type: 'registry',
      id: p.id,
      customPackageId: null,
      displayName: p.displayNameAr || p.displayName,
      internalName: p.internalName,
      kind: p.packageKind || 'basic',
      featureCount: 0
    }));
    const custom = Object.values(CL.store?.loadState?.()?.customPackages || {}).map(cp => ({
      type: 'custom',
      id: '99',
      customPackageId: cp.customPackageId,
      displayName: cp.displayName,
      internalName: cp.internalName,
      kind: 'custom',
      featureCount: (cp.featureIds || []).length
    }));
    const byKey = new Map();
    [...registry, ...userStored, ...custom].forEach(p => {
      byKey.set(p.type === 'custom' ? 'cp:' + p.customPackageId : 'reg:' + p.id, p);
    });
    return [...byKey.values()];
  }

  function ensureOverlay() {
    const root = CL.env?.modalHost?.() || document.body;
    let existing = el('lic-v2-pkg-overlay');
    if (existing) {
      if (existing.parentElement !== root) root.appendChild(existing);
      return;
    }
    const html = `
<div id="lic-v2-pkg-overlay" class="lic-v2-overlay" aria-hidden="true">
  <div class="lic-v2-drawer lic-v2-drawer--wide lic-v2-drawer--pkg" role="dialog">
    <div class="lic-v2-header">
      <h2>📦 قوالب الباقات (Templates)</h2>
      <button type="button" class="lic-v2-close" id="lic-v2-pkg-close" aria-label="إغلاق">✕</button>
    </div>
    <div class="lic-v2-body" id="lic-v2-pkg-body"></div>
    <div class="lic-v2-footer lic-v2-footer--wrap">
      <button type="button" class="lic-v2-btn lic-v2-btn-secondary" id="lic-v2-pkg-cancel">إلغاء</button>
      <button type="button" class="lic-v2-btn lic-v2-btn-secondary" id="lic-v2-pkg-goto-lic" style="display:none">→ منشئ التراخيص</button>
      <button type="button" class="lic-v2-btn lic-v2-btn-primary" id="lic-v2-pkg-save">💾 حفظ القالب</button>
    </div>
  </div>
</div>`;
    root.insertAdjacentHTML('beforeend', html);
    el('lic-v2-pkg-close').onclick = close;
    el('lic-v2-pkg-cancel').onclick = close;
    el('lic-v2-pkg-save').onclick = saveTemplate;
    el('lic-v2-pkg-goto-lic').onclick = () => {
      close();
      CL.drawer?.open?.({ fromPackageBuilder: true });
    };
    el('lic-v2-pkg-overlay').onclick = e => {
      if (e.target === el('lic-v2-pkg-overlay')) close();
    };
  }

  function resetState(kind) {
    _state = {
      kind: kind || 'basic',
      packageId: nextRegistryId(),
      customPackageId: '',
      internalName: '',
      displayName: '',
      displayNameAr: '',
      color: '#2980b9',
      featureIds: []
    };
    _fpMount = null;
  }

  function open(opts) {
    if (CL.env?.isLicenseScreenOpen && !CL.env.isLicenseScreenOpen()) {
      if (typeof notify === 'function') notify('افتح إدارة الترخيص من لوحة المطور أولاً', 'warning');
      return;
    }
    ensureOverlay();
    resetState(opts?.kind || 'basic');
    if (opts?.customPackageId) loadCustomPackage(opts.customPackageId);
    else if (opts?.packageId) loadRegistryPackage(opts.packageId);

    CL.engine.ensureReady().then(() => {
      el('lic-v2-pkg-overlay').classList.add('open');
      render();
    }).catch(err => {
      const body = el('lic-v2-pkg-body');
      const msg = err?.message || 'فشل تحميل السجلات';
      if (body) body.innerHTML = '<p style="color:#ff8888">فشل تحميل السجلات: ' + msg + '</p>';
      el('lic-v2-pkg-overlay').classList.add('open');
      if (typeof notify === 'function') notify('فشل تحميل سجل التراخيص: ' + msg, 'danger');
    });
  }

  function close() {
    el('lic-v2-pkg-overlay')?.classList.remove('open');
  }

  function loadRegistryPackage(id) {
    const pkg = (CL.registries?.package?.packages || []).find(p => p.id === id);
    if (!pkg) return;
    _state.packageId = pkg.id;
    _state.internalName = pkg.internalName || '';
    _state.displayName = pkg.displayName || '';
    _state.displayNameAr = pkg.displayNameAr || pkg.displayName || '';
    _state.color = pkg.color || '#2980b9';
    _state.kind = pkg.packageKind || ((pkg.featureIds || []).length ? 'custom' : 'basic');
    _state.featureIds = pkg.featureIds || [];
  }

  function loadCustomPackage(cpId) {
    const cp = CL.store?.loadState?.()?.customPackages?.[cpId];
    if (!cp) return;
    _state.kind = 'custom';
    _state.customPackageId = cp.customPackageId;
    _state.displayName = cp.displayName || '';
    _state.displayNameAr = cp.displayName || '';
    _state.internalName = cp.internalName || '';
    _state.color = cp.color || '#2980b9';
    _state.featureIds = cp.featureIds || [];
  }

  function collectFields() {
    _state.packageId = el('pkg-id')?.value?.padStart(2, '0').slice(-2) || _state.packageId;
    _state.internalName = el('pkg-internal')?.value?.trim() || '';
    _state.displayName = el('pkg-display')?.value?.trim() || '';
    _state.displayNameAr = el('pkg-display-ar')?.value?.trim() || _state.displayName;
    _state.color = el('pkg-color')?.value || '#2980b9';
    if (_state.kind === 'custom' && _fpMount) {
      _state.featureIds = CL.featurePicker?.collectFeatureIds?.(_fpMount.container, _fpMount.prefix) || [];
    }
  }

  function renderSavedList() {
    const items = listSavedPackages();
    if (!items.length) {
      return `<p class="lic-v2-pkg-empty">لا توجد باقات محفوظة — أنشئ باقة أساسية أو مخصصة أولاً.</p>`;
    }
    return `<div class="lic-v2-pkg-saved-grid">${items.map(p => `
      <div class="lic-v2-pkg-saved-card" data-pkg-type="${p.type}" data-pkg-id="${p.id}" data-cp-id="${p.customPackageId || ''}">
        <div class="lic-v2-pkg-saved-icon">${p.kind === 'basic' ? '📋' : '⚙️'}</div>
        <div class="lic-v2-pkg-saved-name">${p.displayName}</div>
        <div class="lic-v2-pkg-saved-meta">${p.type === 'custom' ? p.customPackageId : p.id} · ${p.kind === 'basic' ? 'أساسية' : p.featureCount + ' خاصية'}</div>
        <button type="button" class="lic-v2-btn lic-v2-btn-secondary lic-v2-pkg-edit-btn" data-edit-pkg>تعديل</button>
      </div>`).join('')}</div>`;
  }

  function render() {
    const body = el('lic-v2-pkg-body');
    if (!body) return;
    const isCustom = _state.kind === 'custom';

    body.innerHTML = `
      <p class="lic-v2-pkg-intro">أنشئ الباقات أولاً — ثم استخدمها في <strong>منشئ التراخيص</strong> لإصدار تراخيص العملاء.</p>

      <div class="lic-v2-pkg-kind-tabs">
        <button type="button" class="lic-v2-pkg-kind-tab${_state.kind === 'basic' ? ' active' : ''}" data-kind="basic">📋 باقة أساسية</button>
        <button type="button" class="lic-v2-pkg-kind-tab${_state.kind === 'custom' ? ' active' : ''}" data-kind="custom">⚙️ باقة مخصصة</button>
      </div>

      <div class="lic-v2-pkg-form-grid">
        <div class="lic-v2-pkg-form-col">
          <div class="lic-v2-field"><label>معرّف الباقة (10–98)</label>
            <input type="text" id="pkg-id" value="${_state.packageId}" dir="ltr" maxlength="2"></div>
          <div class="lic-v2-field"><label>الاسم الداخلي (English)</label>
            <input type="text" id="pkg-internal" value="${_state.internalName}" placeholder="clinic_pro"></div>
          <div class="lic-v2-field"><label>اسم العرض (English)</label>
            <input type="text" id="pkg-display" value="${_state.displayName}" placeholder="Clinic Pro"></div>
          <div class="lic-v2-field"><label>اسم العرض (عربي)</label>
            <input type="text" id="pkg-display-ar" value="${_state.displayNameAr}" placeholder="عيادة احترافية"></div>
          ${isCustom ? '' : `<p class="lic-v2-pkg-hint">الباقة الأساسية تحفظ الاسم والمعرّف فقط — الخصائص والأجهزة تُحدَّد عند إنشاء الترخيص أو في باقة مخصصة.</p>`}
          ${isCustom ? '' : `<div class="lic-v2-field"><label>لون البطاقة</label><input type="color" id="pkg-color" value="${_state.color}"></div>`}
        </div>
        <div class="lic-v2-pkg-preview-col" id="lic-v2-pkg-preview-out"></div>
      </div>

      ${isCustom ? `<div class="lic-v2-pkg-features"><h3>اختيار الخصائص</h3><div id="pkg-feat-host"></div></div>` : ''}

      <div class="lic-v2-pkg-saved-section">
        <h3>الباقات المحفوظة</h3>
        ${renderSavedList()}
      </div>`;

    body.querySelectorAll('[data-kind]').forEach(btn => {
      btn.onclick = () => { _state.kind = btn.dataset.kind; render(); };
    });

    body.querySelectorAll('[data-edit-pkg]').forEach(btn => {
      btn.onclick = () => {
        const card = btn.closest('.lic-v2-pkg-saved-card');
        if (card.dataset.pkgType === 'custom') loadCustomPackage(card.dataset.cpId);
        else loadRegistryPackage(card.dataset.pkgId);
        render();
      };
    });

    if (isCustom) {
      const host = body.querySelector('#pkg-feat-host');
      if (host && CL.featurePicker?.mount) {
        _fpMount = CL.featurePicker.mount(host, {
          prefix: 'pkg-fp-',
          fullEdition: false,
          initialFeatureIds: _state.featureIds,
          onChange: ids => { _state.featureIds = ids; updatePreview(); }
        });
      }
    }

    ['pkg-id', 'pkg-internal', 'pkg-display', 'pkg-display-ar', 'pkg-color'].forEach(id => {
      body.querySelector('#' + id)?.addEventListener('input', updatePreview);
    });

    const gotoBtn = el('lic-v2-pkg-goto-lic');
    if (gotoBtn) gotoBtn.style.display = listSavedPackages().length ? '' : 'none';

    updatePreview();
  }

  function updatePreview() {
    collectFields();
    const out = el('lic-v2-pkg-preview-out');
    if (!out) return;
    const isCustom = _state.kind === 'custom';
    out.innerHTML = `<div class="lic-v2-preview lic-v2-preview--card lic-v2-pkg-preview-sticky">
      <div class="lic-v2-preview-head">👁️ معاينة</div>
      <dl>
        <dt>النوع</dt><dd>${isCustom ? 'مخصصة' : 'أساسية'}</dd>
        <dt>المعرّف</dt><dd dir="ltr">${_state.packageId}</dd>
        <dt>اسم العرض</dt><dd>${_state.displayNameAr || _state.displayName || '—'}</dd>
        <dt>الاسم الداخلي</dt><dd dir="ltr">${_state.internalName || '—'}</dd>
        ${isCustom ? `<dt>الخصائص</dt><dd>${(_state.featureIds || []).length} مفعّلة</dd>` : ''}
      </dl>
    </div>`;
  }

  async function saveTemplate() {
    collectFields();
    if (!_state.internalName || !_state.displayName) {
      if (typeof notify === 'function') notify('أدخل اسم القالب واسم العرض', 'danger');
      return;
    }

    try {
      if (_state.kind === 'basic') {
        const pkgNum = parseInt(_state.packageId, 10);
        if (Number.isNaN(pkgNum) || pkgNum < 10 || pkgNum > 98) {
          if (typeof notify === 'function') notify('معرّف القالب الأساسي: 10–98', 'danger');
          return;
        }
        const pkgDef = {
          id: _state.packageId,
          internalName: _state.internalName,
          displayName: _state.displayName,
          displayNameAr: _state.displayNameAr || _state.displayName,
          inherits: null,
          capabilityIds: [],
          featureIds: [],
          devices: null,
          branches: null,
          color: _state.color,
          visible: true,
          order: pkgNum,
          packageKind: 'basic',
          icon: '📋'
        };
        try {
          await CL.persistence.appendPackageToRegistry(pkgDef);
          await CL.engine.loadRegistries();
        } catch (regErr) {
          if (regErr?.message === 'package_registry_persist_unavailable') {
            CL.store.saveUserPackage(pkgDef);
            CL.engine.mergeUserPackagesIntoRegistry?.();
            CL.featureResolver?.invalidateCache?.();
          } else throw regErr;
        }
        CL.auditLog.log('package_registry_save', _state.packageId, { kind: 'basic' });
        if (typeof notify === 'function') notify('✅ تم حفظ القالب ' + _state.packageId + ' — افتح منشئ التراخيص لتوليد Batch', 'success');
      } else {
        const featureIds = _state.featureIds.length
          ? _state.featureIds
          : (CL.featurePicker?.collectFeatureIds?.(_fpMount?.container, _fpMount?.prefix) || CL.featurePicker?.coreIds?.() || []);
        const cpId = _state.customPackageId || CL.store.allocateCustomPackageId(CL.store.loadState());
        const featureHash = await CL.crypto.computeFeatureHash(featureIds);
        const cp = {
          customPackageId: cpId,
          displayName: _state.displayNameAr || _state.displayName,
          internalName: _state.internalName,
          inherits: null,
          featureIds,
          featureHash,
          devices: null,
          branches: null,
          color: _state.color,
          packageKind: 'custom',
          updatedAt: new Date().toISOString(),
          createdAt: _state.customPackageId ? undefined : new Date().toISOString()
        };
        if (!cp.createdAt) delete cp.createdAt;
        CL.store.saveCustomPackage(cp);
        try { await CL.persistence.writeCustomPackage(cp); } catch { /* browser */ }
        CL.auditLog.log('custom_package_save', cpId, { featureCount: featureIds.length });
        if (typeof notify === 'function') notify('✅ تم حفظ القالب ' + cpId + ' — افتح منشئ التراخيص لتوليد Batch', 'success');
      }
      close();
    } catch (e) {
      if (typeof notify === 'function') notify('فشل الحفظ: ' + (e.message || 'خطأ'), 'danger');
    }
  }

  async function saveAndOpenLicenseBuilder() {
    await saveTemplate();
    CL.drawer?.open?.({});
  }

  CL.packageBuilder = { open, close, listSavedPackages };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
