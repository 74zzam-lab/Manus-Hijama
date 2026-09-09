(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};
  let _step = 1;
  let _state = {};
  let _result = null;
  const TOTAL_STEPS = 5;
  const STEP_LABELS = ['القالب', 'العملية', 'المدة', 'Batch', 'التوليد'];

  function el(id) { return document.getElementById(id); }

  function ensureOverlay() {
    const root = CL.env?.modalHost?.() || document.body;
    let existing = el('lic-v2-overlay');
    if (existing) {
      if (existing.parentElement !== root) root.appendChild(existing);
      return;
    }
    const html = `
<div id="lic-v2-overlay" class="lic-v2-overlay" aria-hidden="true">
  <div class="lic-v2-drawer lic-v2-drawer--lic" role="dialog" aria-labelledby="lic-v2-title">
    <div class="lic-v2-header">
      <h2 id="lic-v2-title">🔑 منشئ التراخيص (Batch)</h2>
      <button type="button" class="lic-v2-close" id="lic-v2-close" aria-label="إغلاق">✕</button>
    </div>
    <div class="lic-v2-steps lic-v2-steps--5" id="lic-v2-steps"></div>
    <div class="lic-v2-body" id="lic-v2-body"></div>
    <div class="lic-v2-footer">
      <button type="button" class="lic-v2-btn lic-v2-btn-secondary" id="lic-v2-pkg-link">📦 منشئ الباقات</button>
      <button type="button" class="lic-v2-btn lic-v2-btn-secondary" id="lic-v2-prev">← السابق</button>
      <button type="button" class="lic-v2-btn lic-v2-btn-secondary" id="lic-v2-cancel">إلغاء</button>
      <button type="button" class="lic-v2-btn lic-v2-btn-primary" id="lic-v2-next">التالي →</button>
    </div>
  </div>
</div>`;
    root.insertAdjacentHTML('beforeend', html);
    el('lic-v2-close').onclick = close;
    el('lic-v2-cancel').onclick = close;
    el('lic-v2-prev').onclick = () => goStep(_step - 1);
    el('lic-v2-next').onclick = onNext;
    el('lic-v2-pkg-link').onclick = () => { close(); CL.packageBuilder?.open?.(); };
    el('lic-v2-overlay').onclick = e => { if (e.target === el('lic-v2-overlay')) close(); };
  }

  function resetState(opts) {
    opts = opts || {};
    _step = 1;
    _result = null;
    _state = {
      packageId: opts.packageId || '',
      customPackageId: opts.customPackageId || '',
      actionId: '01',
      subscriptionId: '05',
      customDays: 365,
      customExpiryDate: '',
      devices: 0,
      branches: 1,
      branchesList: null,
      customer: { name: '', company: '', phone: '', email: '', deviceReference: '' },
      notes: '',
      batchCount: 1,
      deviceBinding: 'DEVICE_ANY'
    };
  }

  function buildDefaultBranches(count, company) {
    if (global.LicenseCloud?.defaultBranches) {
      return global.LicenseCloud.defaultBranches(count, company || '');
    }
    const n = Math.max(1, Math.min(15, Number(count) || 1));
    if (n === 1) return [{ id: 'BR-MAIN', name: company || 'الفرع الرئيسي', code: 'MAIN', active: true }];
    return Array.from({ length: n }, (_, i) => ({
      id: 'BR' + String(i + 1).padStart(2, '0'),
      name: 'فرع ' + (i + 1),
      code: String(i + 1).padStart(2, '0'),
      active: true
    }));
  }

  function resolvedFeaturesForState() {
    try {
      if (_state.customPackageId) return CL.featureResolver.resolveCustomPackage(_state.customPackageId);
      if (_state.packageId) return CL.featureResolver.resolvePackageCached(_state.packageId);
    } catch { /* empty */ }
    return { featureKeys: {} };
  }

  function packageHasCloudSync() {
    const keys = resolvedFeaturesForState()?.featureKeys || {};
    return !!(keys.cloud_multi_device || keys.cloud_owner_hub || keys.bk_drive);
  }

  function suggestDeviceBinding() {
    if (packageHasCloudSync() || (_state.branches || 1) > 1) return 'DEVICE_ANY';
    return 'DEVICE_BIND_FIRST';
  }

  function listUserPackages() {
    const fromBuilder = CL.packageBuilder?.listSavedPackages?.();
    if (fromBuilder?.length) {
      return fromBuilder.filter((p) => {
        if (p.type === 'custom') return true;
        return global.PackageRegistryViewer?.isCustomerPackageId?.(p.id)
          || ['01', '02', '03', '04'].includes(String(p.id || ''));
      });
    }
    const registryPkgs = CL.registries?.package?.packages || [];
    const filtered = global.PackageRegistryViewer?.filterLicenseBuilderPackages?.(registryPkgs)
      || registryPkgs.filter(p => p.visible !== false && !['05', '06', '99', '10'].includes(p.id));
    const registry = filtered
      .map(p => ({
        type: 'registry',
        id: p.id,
        customPackageId: null,
        displayName: p.displayNameAr || p.displayName,
        kind: p.packageKind || 'basic',
        featureCount: (p.featureIds || []).length
      }));
    const custom = Object.values(CL.store?.loadState?.()?.customPackages || {}).map(cp => ({
      type: 'custom',
      id: '99',
      customPackageId: cp.customPackageId,
      displayName: cp.displayName,
      kind: 'custom',
      featureCount: (cp.featureIds || []).length
    }));
    return [...registry, ...custom];
  }

  function open(opts) {
    opts = opts || {};
    const licScreen = el('licenseScreen');
    if (licScreen?.classList.contains('hidden')) licScreen.classList.remove('hidden');
    ensureOverlay();
    resetState(opts);
    const overlay = el('lic-v2-overlay');
    if (overlay) overlay.classList.add('open');
    const body = el('lic-v2-body');
    if (body) body.innerHTML = '<p style="opacity:0.7">جارٍ تحميل سجلات الترخيص...</p>';
    CL.engine.ensureReady().then(() => {
      if (!_state.packageId && !_state.customPackageId) {
        const pkgs = listUserPackages();
        if (pkgs.length === 1) {
          if (pkgs[0].type === 'custom') {
            _state.packageId = '99';
            _state.customPackageId = pkgs[0].customPackageId;
          } else {
            _state.packageId = pkgs[0].id;
          }
        }
      }
      render();
    }).catch(err => {
      if (body) body.innerHTML = '<p style="color:#ff8888">فشل تحميل السجلات: ' + (err.message || 'خطأ') + '</p>';
      if (typeof notify === 'function') notify('فشل تحميل سجل التراخيص: ' + err.message, 'danger');
    });
  }

  function close() {
    el('lic-v2-overlay')?.classList.remove('open');
  }

  function goStep(n) {
    if (n < 1 || n > TOTAL_STEPS) return;
    if (n === 4) collectStep4();
    if (n === 3) collectStep3();
    _step = n;
    render();
  }

  function onNext() {
    if (_step === 3) collectStep3();
    if (_step === 4) collectStep4();
    if (_step === 5 && !_result) {
      generateLicense();
      return;
    }
    if (_step < TOTAL_STEPS) goStep(_step + 1);
  }

  function renderStepDots() {
    const wrap = el('lic-v2-steps');
    if (!wrap) return;
    wrap.innerHTML = '';
    wrap.className = 'lic-v2-steps lic-v2-steps--labeled lic-v2-steps--5';
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      const d = document.createElement('div');
      d.className = 'lic-v2-step-item' + (i === _step ? ' active' : '') + (i < _step ? ' done' : '');
      d.innerHTML = `<span class="lic-v2-step-num">${i}</span><span class="lic-v2-step-lbl">${STEP_LABELS[i - 1]}</span>`;
      wrap.appendChild(d);
    }
  }

  function pkgKey(p) {
    return p.type === 'custom' ? 'cp:' + p.customPackageId : 'reg:' + p.id;
  }

  function isPkgSelected(p) {
    if (p.type === 'custom') return _state.customPackageId === p.customPackageId;
    return _state.packageId === p.id && !_state.customPackageId;
  }

  function countPackageFeatures(p) {
    if (p.type === 'custom') return p.featureCount || 0;
    try {
      return (CL.featureResolver.resolvePackageCached(p.id).featureIds || []).length;
    } catch { return p.featureCount || 0; }
  }

  function renderStep1(body) {
    const pkgs = listUserPackages();
    if (!pkgs.length) {
      body.innerHTML = `
        <p class="lic-v2-empty-packages">لا توجد باقات — أنشئ باقة في <strong>منشئ الباقات</strong> أولاً.</p>
        <button type="button" class="lic-v2-btn lic-v2-btn-primary" id="lic-v2-open-pkg">📦 فتح منشئ الباقات</button>`;
      body.querySelector('#lic-v2-open-pkg').onclick = () => { close(); CL.packageBuilder?.open?.(); };
      return;
    }
    const cards = pkgs.map(p => `
      <div class="lic-v2-pkg-card${isPkgSelected(p) ? ' selected' : ''}" data-pkg-key="${pkgKey(p)}">
        <div class="icon">${p.kind === 'basic' ? '📋' : '⚙️'}</div>
        <div class="name">${p.displayName}</div>
        <div class="meta">${p.type === 'custom' ? p.customPackageId : p.id} · ${p.kind === 'basic' ? 'أساسية' : countPackageFeatures(p) + ' خاصية'}</div>
      </div>`).join('');
    body.innerHTML = `
      <p class="lic-v2-step-intro">اختر <strong>قالب الباقة</strong> (Template) — للخصائص فقط. التراخيص تُولَّد منفصلة في الخطوة التالية:</p>
      <div class="lic-v2-pkg-grid lic-v2-pkg-grid--select">${cards}</div>
      <p class="lic-v2-step-footnote"><button type="button" class="lic-v2-link-btn" id="lic-v2-new-pkg">+ إنشاء باقة جديدة</button></p>`;
    body.querySelectorAll('.lic-v2-pkg-card').forEach(card => {
      card.onclick = () => {
        const key = card.dataset.pkgKey;
        const p = pkgs.find(x => pkgKey(x) === key);
        if (!p) return;
        if (p.type === 'custom') {
          _state.packageId = '99';
          _state.customPackageId = p.customPackageId;
        } else {
          _state.packageId = p.id;
          _state.customPackageId = '';
        }
        render();
      };
    });
    body.querySelector('#lic-v2-new-pkg')?.addEventListener('click', () => { close(); CL.packageBuilder?.open?.(); });
  }

  function renderStep2(body) {
    const actions = (CL.registries?.action?.actions || [])
      .filter(a => ['01', '02', '06', '07'].includes(a.id));
    body.innerHTML = `
      <p class="lic-v2-step-intro">نوع العملية:</p>
      <div class="lic-v2-action-grid">${actions.map(a => `
        <label class="lic-v2-action-card${_state.actionId === a.id ? ' selected' : ''}">
          <input type="radio" name="lic-v2-action" value="${a.id}"${_state.actionId === a.id ? ' checked' : ''}>
          <span class="lic-v2-action-name">${a.name}</span>
          <span class="lic-v2-action-id" dir="ltr">${a.id}</span>
        </label>`).join('')}</div>
      <p class="lic-v2-step-footnote">الترقية والخفض عبر معالج الترقية المستقل.</p>`;
    body.querySelectorAll('input[name="lic-v2-action"]').forEach(inp => {
      inp.onchange = () => { _state.actionId = inp.value; render(); };
    });
  }

  function computeExpiryPreview() {
    const cfg = {
      subscriptionId: _state.subscriptionId,
      customDays: _state.customDays,
      expiryDate: _state.customExpiryDate || null
    };
    if (_state.subscriptionId === '09' && _state.customExpiryDate) {
      return _state.customExpiryDate;
    }
    return CL.generator?.resolveExpiry?.(cfg) || '—';
  }

  function subscriptionSummary() {
    const subs = CL.registries?.subscription?.subscriptions || [];
    const sub = subs.find(s => s.id === _state.subscriptionId);
    if (_state.subscriptionId === '08') return 'مدى الحياة — بدون انتهاء';
    if (_state.subscriptionId === '09') {
      if (_state.customExpiryDate) return 'مخصص — ينتهي ' + _state.customExpiryDate;
      return 'مخصص — ' + (_state.customDays || 365) + ' يوم';
    }
    return (sub?.name || _state.subscriptionId) + (sub?.days ? ' (' + sub.days + ' يوم)' : '');
  }

  function renderStep3(body) {
    const subs = CL.registries?.subscription?.subscriptions || [];
    const expiry = computeExpiryPreview();
    const isCustom = _state.subscriptionId === '09';
    body.innerHTML = `
      <div class="lic-v2-duration-banner">
        <div><span class="lic-v2-duration-label">مدة الاشتراك</span><strong id="lic-v2-sub-summary">${subscriptionSummary()}</strong></div>
        <div><span class="lic-v2-duration-label">تاريخ الانتهاء المتوقع</span><strong dir="ltr" id="lic-v2-expiry-preview">${expiry}</strong></div>
      </div>
      <p class="lic-v2-step-intro">اختر فترة الاشتراك:</p>
      <div class="lic-v2-sub-grid">${subs.filter(s => !s.internal).map(s => `
        <div class="lic-v2-sub-chip${_state.subscriptionId === s.id ? ' selected' : ''}" data-sub="${s.id}">
          ${s.name}${s.days ? `<span class="lic-v2-sub-days">${s.days} يوم</span>` : ''}
        </div>`).join('')}</div>
      <div class="lic-v2-custom-duration" id="lic-v2-custom-duration" style="display:${isCustom ? '' : 'none'}">
        <div class="lic-v2-field-row">
          <div class="lic-v2-field"><label>عدد الأيام</label>
            <input type="number" id="lic-v2-custom-days" min="1" max="3650" value="${_state.customDays || 365}"></div>
          <div class="lic-v2-field"><label>أو تاريخ انتهاء محدد</label>
            <input type="date" id="lic-v2-custom-expiry" dir="ltr" value="${_state.customExpiryDate || ''}"></div>
        </div>
        <p class="lic-v2-step-footnote">يمكنك تحديد عدد الأيام أو تاريخ انتهاء — الأولوية لتاريخ الانتهاء إن وُجد.</p>
      </div>`;
    body.querySelectorAll('.lic-v2-sub-chip').forEach(chip => {
      chip.onclick = () => { _state.subscriptionId = chip.dataset.sub; render(); };
    });
    const daysIn = el('lic-v2-custom-days');
    const dateIn = el('lic-v2-custom-expiry');
    const refreshPreview = () => {
      collectStep3();
      const sum = el('lic-v2-sub-summary');
      const exp = el('lic-v2-expiry-preview');
      if (sum) sum.textContent = subscriptionSummary();
      if (exp) exp.textContent = computeExpiryPreview();
    };
    daysIn?.addEventListener('input', refreshPreview);
    dateIn?.addEventListener('change', refreshPreview);
  }

  function collectStep3() {
    const daysEl = el('lic-v2-custom-days');
    const dateEl = el('lic-v2-custom-expiry');
    if (daysEl) _state.customDays = Math.max(1, parseInt(daysEl.value, 10) || 365);
    if (dateEl) _state.customExpiryDate = dateEl.value || '';
  }

  function renderStep4(body) {
    const branchCounts = [1, 2, 3, 5, 10, 15];
    body.innerHTML = `
      <p class="lic-v2-step-intro">إعدادات الترخيص / Batch:</p>
      <div class="lic-v2-field"><label>عدد الأكواد (Batch)</label>
        <input type="number" id="lic-v2-batch-count" min="1" max="100" value="${_state.batchCount || 1}">
        <p class="lic-v2-step-footnote">1 = عميل واحد · أكثر = مخزون أكواد <code>unused</code> في الشيت — تسلّم أي كود للعميل لاحقاً.</p>
      </div>
      <div class="lic-v2-field"><label>عدد الفروع المسموح</label>
        <div class="lic-v2-sub-grid lic-v2-branch-count-grid">${branchCounts.map(n => `
          <div class="lic-v2-sub-chip${_state.branches === n ? ' selected' : ''}" data-branch-count="${n}">${n} ${n === 1 ? 'فرع' : 'فروع'}</div>`).join('')}
        </div>
        <p class="lic-v2-step-footnote">العميل يسمّي الفروع عند التفعيل.</p>
      </div>
      <div class="lic-v2-preview lic-v2-preview--card" style="margin-bottom:12px">
        <div class="lic-v2-preview-head">☁️ التفعيل والأجهزة</div>
        <p class="lic-v2-step-footnote" style="margin:0">• <strong>أول مرة:</strong> المفتاح + Spreadsheet (مرة واحدة)<br>• <strong>بعدها:</strong> أي جهاز يسحب من Google — بدون بصمة</p>
      </div>
      <div class="lic-v2-field"><label>اسم الشركة / المركز (اختياري — لترخيص واحد)</label>
        <input type="text" id="lic-v2-company" value="${_state.customer.company || ''}"></div>
      <div class="lic-v2-field"><label>اسم العميل (اختياري — يُترك فارغاً في Batch)</label>
        <input type="text" id="lic-v2-customer" value="${_state.customer.name || ''}"></div>
        <div class="lic-v2-field-row">
        <div class="lic-v2-field"><label>الهاتف</label>
          <input type="text" id="lic-v2-phone" dir="ltr" value="${_state.customer.phone || ''}"></div>
        <div class="lic-v2-field"><label>بريد Google (اختياري — للسجل)</label>
          <input type="email" id="lic-v2-email" dir="ltr" value="${_state.customer.email || ''}" placeholder="owner@clinic.com"></div>
      </div>
      <div class="lic-v2-field"><label>مرجع الجهاز (اختياري)</label>
        <input type="text" id="lic-v2-device-ref" dir="ltr" value="${_state.customer.deviceReference || ''}" placeholder="SN-12345"></div>
      <div class="lic-v2-field"><label>ملاحظات</label>
        <textarea id="lic-v2-notes" rows="2">${_state.notes || ''}</textarea></div>`;

    body.querySelectorAll('[data-branch-count]').forEach(chip => {
      chip.onclick = () => {
        _state.branches = parseInt(chip.dataset.branchCount, 10) || 1;
        collectStep4Partial();
        render();
      };
    });
    el('lic-v2-company')?.addEventListener('input', e => {
      _state.customer.company = e.target.value;
    });
  }

  function collectStep4Partial() {
    _state.customer.company = el('lic-v2-company')?.value || _state.customer.company || '';
  }

  function collectStep4() {
    collectStep4Partial();
    const customerEl = el('lic-v2-customer');
    const phoneEl = el('lic-v2-phone');
    const emailEl = el('lic-v2-email');
    const deviceRefEl = el('lic-v2-device-ref');
    const notesEl = el('lic-v2-notes');
    const batchEl = el('lic-v2-batch-count');
    if (customerEl) _state.customer.name = customerEl.value || '';
    if (phoneEl) _state.customer.phone = phoneEl.value || '';
    if (emailEl) _state.customer.email = emailEl.value || '';
    if (deviceRefEl) _state.customer.deviceReference = deviceRefEl.value || '';
    if (notesEl) _state.notes = notesEl.value || '';
    _state.devices = 0;
    _state.deviceBinding = 'DEVICE_ANY';
    if (batchEl) {
      _state.batchCount = Math.max(1, Math.min(100, parseInt(batchEl.value, 10) || 1));
    }
    _state.branchesList = null;
  }

  function selectedPackageLabel() {
    if (_state.customPackageId) {
      const cp = CL.store?.loadState?.()?.customPackages?.[_state.customPackageId];
      return cp?.displayName || _state.customPackageId;
    }
    const pkg = (CL.registries?.package?.packages || []).find(p => p.id === _state.packageId);
    return pkg?.displayNameAr || pkg?.displayName || _state.packageId;
  }

  function featureNamesFromIds(ids, limit) {
    const fl = CL.registries?.feature?.features || [];
    return (ids || []).slice(0, limit || 14).map(id => {
      const f = fl.find(x => x.id === id);
      return f?.name || f?.key || id;
    });
  }

  function buildPreviewHtml() {
    let resolved;
    try {
      if (_state.customPackageId) resolved = CL.featureResolver.resolveCustomPackage(_state.customPackageId);
      else resolved = CL.featureResolver.resolvePackageCached(_state.packageId);
    } catch {
      resolved = { featureIds: [] };
    }
    const sub = (CL.registries?.subscription?.subscriptions || []).find(s => s.id === _state.subscriptionId);
    const act = (CL.registries?.action?.actions || []).find(a => a.id === _state.actionId);
    const expiry = computeExpiryPreview();
    const featIds = resolved.featureIds || [];
    const featNames = featureNamesFromIds(featIds, 12);
    const featMore = featIds.length - featNames.length;
    return `
      <div class="lic-v2-preview lic-v2-preview--card">
        <div class="lic-v2-preview-head">👁️ معاينة الترخيص قبل التوليد</div>
        <dl>
          <dt>الباقة</dt><dd>${selectedPackageLabel()}</dd>
          <dt>الاشتراك</dt><dd>${subscriptionSummary()}</dd>
          <dt>العملية</dt><dd>${act?.name || _state.actionId}</dd>
          <dt>الخصائص</dt><dd>${featIds.length} مفعّلة</dd>
          <dt>الأجهزة</dt><dd>غير محدود</dd>
          <dt>الفروع</dt><dd>${_state.branches} (العميل يسمّيها عند التفعيل)</dd>
          <dt>الحماية</dt><dd>Spreadsheet (مرة واحدة) + Google للأجهزة الإضافية</dd>
          <dt>Batch</dt><dd>${_state.batchCount || 1} كود</dd>
          <dt>الانتهاء</dt><dd dir="ltr">${expiry}</dd>
          <dt>العميل</dt><dd>${_state.customer.name || '—'}</dd>
          <dt>Google المعتمد</dt><dd dir="ltr">${_state.customer.email || '— (يُحدَّد عند أول ربط)'}</dd>
          <dt>الشركة</dt><dd>${_state.customer.company || '—'}</dd>
        </dl>
        ${featNames.length ? `<div class="lic-v2-preview-feats">${featNames.map(n => `<span class="lic-v2-preview-chip">${n}</span>`).join('')}${featMore > 0 ? `<span class="lic-v2-preview-chip lic-v2-preview-chip--more">+${featMore}</span>` : ''}</div>` : ''}
      </div>`;
  }

  function formatVaultActivationRow(result) {
    const s = result.summary || {};
    const c = s.customer || result.record?.customer || {};
    return [
      result.key,
      'unused',
      c.name || '',
      c.company || '',
      c.phone || '',
      s.notes || result.record?.notes || ''
    ].join('\t');
  }

  function formatVaultBundleCell(result) {
    return JSON.stringify(result.bundle || {}).replace(/\r?\n/g, ' ');
  }

  function formatVaultBundleRow(result) {
    return result.key + '\t' + formatVaultBundleCell(result);
  }

  const SHEET_ROW_SEP = '\r\n';

  function formatBatchVaultActivationRows(batchResult) {
    return (batchResult.items || []).map(item => formatVaultActivationRow(item)).join(SHEET_ROW_SEP);
  }

  function formatBatchVaultBundleRows(batchResult) {
    return (batchResult.items || []).map(item => formatVaultBundleRow(item)).join(SHEET_ROW_SEP);
  }

  function renderBatchResult(body, batchResult) {
    const keys = (batchResult.items || []).map(i => i.key);
    body.innerHTML = `
      <p>✅ تم توليد <strong>${batchResult.count}</strong> ترخيص — قالب: ${batchResult.templateLabel || '—'}</p>
      <div class="lic-v2-key-box" style="max-height:120px;overflow:auto;font-size:12px" dir="ltr">${keys.join('\n')}</div>
      <div class="lic-v2-actions-row">
        <button type="button" class="lic-v2-btn lic-v2-btn-primary" id="lic-v2-copy-all-keys">📋 نسخ كل المفاتيح</button>
        <button type="button" class="lic-v2-btn lic-v2-btn-secondary" id="lic-v2-copy-vault-rows">📊 activations (${batchResult.count})</button>
        <button type="button" class="lic-v2-btn lic-v2-btn-secondary" id="lic-v2-copy-vault-bundles">📦 bundles (${batchResult.count})</button>
        <button type="button" class="lic-v2-btn lic-v2-btn-secondary" id="lic-v2-export-batch-json">💾 JSON Batch</button>
      </div>
      <p class="lic-v2-step-footnote">الصق activations من <strong>A1</strong> · bundles من <strong>A1</strong> — كل سطر = صف، Tab يفصل الأعمدة · سلّم أي كود <code>unused</code> للعميل.</p>`;
    el('lic-v2-copy-all-keys').onclick = () => copyText(keys.join('\n'), 'تم نسخ ' + batchResult.count + ' مفتاح');
    el('lic-v2-copy-vault-rows').onclick = () => copyText(formatBatchVaultActivationRows(batchResult), 'تم نسخ ' + batchResult.count + ' صف — الصق في تبويب activations من A1');
    el('lic-v2-copy-vault-bundles').onclick = () => copyText(formatBatchVaultBundleRows(batchResult), 'تم نسخ ' + batchResult.count + ' صف — الصق في تبويب bundles من A1');
    el('lic-v2-export-batch-json').onclick = () => exportBatchJson(batchResult);
  }

  function renderStep5(body) {
    if (_result?.batch) {
      renderBatchResult(body, _result);
      return;
    }
    if (_result) {
      const s = _result.summary;
      body.innerHTML = `
        <p>✅ تم توليد الترخيص بنجاح</p>
        <div class="lic-v2-key-box" id="lic-v2-generated-key">${_result.key}</div>
        <div class="lic-v2-actions-row">
          <button type="button" class="lic-v2-btn lic-v2-btn-primary" id="lic-v2-copy-key">📋 نسخ المفتاح</button>
          <button type="button" class="lic-v2-btn lic-v2-btn-secondary" id="lic-v2-copy-summary">📋 نسخ الملخص</button>
          <button type="button" class="lic-v2-btn lic-v2-btn-secondary" id="lic-v2-copy-vault-row">📊 صف activations</button>
          <button type="button" class="lic-v2-btn lic-v2-btn-secondary" id="lic-v2-copy-vault-bundle">📦 bundle للشيت</button>
          <button type="button" class="lic-v2-btn lic-v2-btn-secondary" id="lic-v2-export-json">💾 JSON</button>
          <button type="button" class="lic-v2-btn lic-v2-btn-secondary" id="lic-v2-export-pdf">📄 PDF</button>
        </div>
        <p class="lic-v2-step-footnote" style="margin-top:10px">للعميل: يكفي المفتاح فقط إذا رفعت الـ bundle في تبويب <b>bundles</b> بالشيت. بدون bundle في الشيت — سلّم ملف JSON أو انسخه يدوياً.</p>
        <div class="lic-v2-preview lic-v2-preview--card" style="margin-top:14px">
          <div class="lic-v2-preview-head">📋 ملخص الترخيص</div>
          <dl>
            <dt>المعرّف</dt><dd dir="ltr">${s.licenseId}</dd>
            <dt>الباقة</dt><dd>${s.package}</dd>
            <dt>الانتهاء</dt><dd dir="ltr">${s.expiry}</dd>
            <dt>الأجهزة</dt><dd>${s.devices === 0 ? 'غير محدود' : s.devices}</dd>
            <dt>الفروع</dt><dd>${s.branches || '—'}</dd>
            <dt>الخصائص</dt><dd>${s.featureCount || '—'}</dd>
          </dl>
        </div>
        <div id="lic-v2-gen-key-preview"></div>`;
      el('lic-v2-copy-key').onclick = () => copyText(_result.key, 'تم نسخ المفتاح');
      el('lic-v2-copy-summary').onclick = () => copyText(formatSummaryText(_result), 'تم نسخ الملخص');
      el('lic-v2-copy-vault-row').onclick = () => copyText(formatVaultActivationRow(_result), 'تم نسخ صف activations — الصق في Google Sheet من A1');
      el('lic-v2-copy-vault-bundle').onclick = () => copyText(formatVaultBundleRow(_result), 'تم نسخ bundle — الصق في تبويب bundles من A1');
      el('lic-v2-export-json').onclick = () => exportJson(_result);
      el('lic-v2-export-pdf').onclick = () => exportPdf(_result);
      const prevHost = el('lic-v2-gen-key-preview');
      if (prevHost && CL.keyPreview?.previewKey) {
        CL.keyPreview.previewKey(_result.key).then(model => {
          prevHost.innerHTML = CL.keyPreview.renderPreviewCard(model);
        }).catch(() => {});
      }
      return;
    }
    body.innerHTML = `
      <p class="lic-v2-step-intro">👁️ الخطوة 5 — معاينة نهائية</p>
      ${buildPreviewHtml()}
      <p class="lic-v2-step-footnote">راجع البيانات ثم اضغط «توليد الترخيص».</p>`;
  }

  function formatSummaryText(result) {
    const s = result.summary;
    return [
      'ترخيص Hijama Management System V5',
      `المفتاح: ${result.key}`,
      `المعرّف: ${s.licenseId}`,
      `الباقة: ${s.package} (${s.packageId})`,
      `الاشتراك: ${s.subscription}`,
      `الانتهاء: ${s.expiry}`,
      `الأجهزة: ${s.devices === 0 ? 'غير محدود' : s.devices} | الفروع: ${s.branches}`,
      `Google (سجل): ${s.customer?.email || '—'}`,
      `مرجع الجهاز: ${s.customer?.deviceReference || '—'}`,
      `الخصائص: ${s.featureCount}`
    ].join('\n');
  }

  function licV2Toast(msg, type) {
    let host = document.getElementById('lic-v2-toast');
    if (!host) {
      host = document.createElement('div');
      host.id = 'lic-v2-toast';
      host.className = 'lic-v2-toast';
      document.body.appendChild(host);
    }
    host.textContent = msg;
    host.className = 'lic-v2-toast lic-v2-toast--' + (type || 'success') + ' show';
    clearTimeout(host._licV2ToastTimer);
    host._licV2ToastTimer = setTimeout(() => host.classList.remove('show'), 2800);
  }

  async function copyText(text, msg) {
    let ok = false;
    if (typeof licCopyToClipboard === 'function') ok = await licCopyToClipboard(text);
    else {
      try { await navigator.clipboard.writeText(text); ok = true; } catch { ok = false; }
    }
    licV2Toast(ok ? msg : 'تعذّر النسخ — انسخ يدوياً', ok ? 'success' : 'danger');
    if (typeof notify === 'function') notify(ok ? msg : 'تعذّر النسخ', ok ? 'success' : 'danger');
  }

  function exportBatchJson(batchResult) {
    const blob = new Blob([JSON.stringify(batchResult, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'licenses-batch-' + batchResult.count + '.json');
  }

  function exportJson(result) {
    const blob = new Blob([JSON.stringify({ key: result.key, record: result.record, bundle: result.bundle, summary: result.summary }, null, 2)], { type: 'application/json' });
    downloadBlob(blob, result.record.licenseId + '.json');
  }

  function exportPdf(result) {
    const text = formatSummaryText(result);
    const html = `<html dir="rtl"><head><meta charset="utf-8"><title>License ${result.record.licenseId}</title></head>
      <body style="font-family:sans-serif;padding:40px"><h1>ترخيص NajjarTech — نظام الحجامة</h1><pre style="font-size:14px;line-height:1.6">${text.replace(/</g, '&lt;')}</pre></body></html>`;
    downloadBlob(new Blob([html], { type: 'text/html' }), result.record.licenseId + '.html');
    if (typeof notify === 'function') notify('تم تصدير HTML للطباعة كـ PDF', 'success');
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function generateLicense() {
    collectStep4();
    if (!_state.batchCount || _state.batchCount < 1) _state.batchCount = 1;
    if (!_state.packageId && !_state.customPackageId) {
      if (typeof notify === 'function') notify('اختر قالب باقة أولاً', 'danger');
      goStep(1);
      return;
    }
    const config = {
      packageId: _state.customPackageId ? '99' : _state.packageId,
      customPackageId: _state.customPackageId || null,
      actionId: _state.actionId,
      subscriptionId: _state.subscriptionId,
      customDays: _state.customDays,
      expiryDate: _state.subscriptionId === '09' && _state.customExpiryDate ? _state.customExpiryDate : null,
      devices: 0,
      branches: _state.branches,
      branchesList: null,
      customer: _state.customer,
      notes: _state.notes,
      deviceBinding: 'DEVICE_ANY'
    };
    const count = _state.batchCount || 1;
    try {
      if (count > 1 && !CL.generator?.generateBatch) {
        licV2Toast('توليد Batch غير متاح — أعد تحميل الصفحة أو حدّث التطبيق', 'danger');
        return;
      }
      if (count > 1 && CL.generator.generateBatch) {
        _result = await CL.generator.generateBatch(config, count);
        licV2Toast('تم توليد ' + _result.count + ' كود بنجاح', 'success');
      } else {
        _result = await CL.generator.generate(config);
        licV2Toast('تم توليد الترخيص بنجاح', 'success');
      }
      render();
    } catch (e) {
      if (typeof notify === 'function') notify('فشل التوليد: ' + e.message, 'danger');
    }
  }

  function render() {
    renderStepDots();
    const body = el('lic-v2-body');
    const prev = el('lic-v2-prev');
    const next = el('lic-v2-next');
    if (!body) return;
    if (prev) prev.disabled = _step <= 1 || !!_result;
    if (next) {
      if (_step === 5 && !_result) next.textContent = '🔑 توليد الترخيص';
      else if (_result) next.textContent = 'إغلاق';
      else next.textContent = 'التالي →';
    }
    const renders = [null, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5];
    renders[_step](body);
    if (_result && next) next.onclick = close;
    else next.onclick = onNext;
  }

  function injectRenewButtons() {
    const tab = el('lic-tab-renew');
    if (!tab || el('lic-v2-toggle-classic')) return;
    const classic = tab.querySelector('.lic-divider')?.nextElementSibling;
    if (!classic) return;
    classic.style.display = 'none';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'lic-v2-toggle-classic';
    btn.className = 'lic-v2-btn lic-v2-btn-secondary lic-v2-classic-toggle';
    btn.style.cssText = 'width:100%;margin-bottom:8px';
    btn.textContent = 'عرض الوضع الكلاسيكي V1';
    tab.insertBefore(btn, tab.firstChild);
    btn.onclick = () => {
      const hidden = classic.style.display === 'none';
      classic.style.display = hidden ? '' : 'none';
      btn.textContent = hidden ? 'إخفاء الوضع الكلاسيكي' : 'عرض الوضع الكلاسيكي V1';
    };
  }

  CL.drawer = { open, close, injectRenewButtons };
  global.CommercialLicense = CL;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectRenewButtons);
  } else {
    injectRenewButtons();
  }
})(typeof window !== 'undefined' ? window : global);
