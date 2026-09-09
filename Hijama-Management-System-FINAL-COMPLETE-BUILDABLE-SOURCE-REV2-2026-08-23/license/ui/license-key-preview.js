/**
 * License key preview — before activation (client / dev panel).
 */
(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  const ERROR_AR = {
    empty: 'أدخل مفتاح التفعيل للمعاينة',
    format: 'صيغة المفتاح غير صحيحة',
    signature: 'توقيع المفتاح غير صالح — قد يكون مُعدّلاً',
    invalid: 'مفتاح غير صالح',
    expired: 'انتهت صلاحية الترخيص',
    bundle_missing: 'مفتاح صالح — سيتم تفعيله عند التطبيق (حزمة غير محلية)',
    license_not_found: 'المفتاح غير مسجّل لدى المطور بعد'
  };

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function packageLabel(id) {
    const pkgs = CL.registries?.package?.packages || [];
    const p = pkgs.find(x => x.id === String(id).padStart(2, '0'));
    return p ? (p.displayNameAr || p.displayName) : ('باقة ' + id);
  }

  function subscriptionLabelFromDays(expiryIso) {
    if (!expiryIso) return '—';
    const days = Math.ceil((new Date(expiryIso + 'T12:00:00') - new Date()) / 86400000);
    if (days <= 0) return 'منتهي';
    if (days <= 7) return '7 أيام';
    if (days <= 31) return '30 يوم';
    if (days <= 93) return '90 يوم';
    if (days <= 186) return '180 يوم';
    if (days <= 366) return '365 يوم';
    return days + ' يوم';
  }

  function formatDevicesLabel(v) {
    if (v === 0 || v == null) return 'غير محدود';
    return String(v);
  }

  function renderPreviewCard(model) {
    if (!model) return '';
    if (!model.ok) {
      return `<div class="lic-key-preview lic-key-preview--err">
        <div class="lic-key-preview-title">⚠️ ${esc(model.title || 'لا يمكن معاينة المفتاح')}</div>
        <p class="lic-key-preview-msg">${esc(model.message || '')}</p>
      </div>`;
    }
    const feats = (model.features || []).slice(0, 12);
    const featMore = (model.featureCount || 0) - feats.length;
    return `<div class="lic-key-preview lic-key-preview--ok">
      <div class="lic-key-preview-title">👁️ معاينة الترخيص — ${esc(model.versionLabel || 'V5')}</div>
      <dl class="lic-key-preview-dl">
        <dt>الباقة</dt><dd>${esc(model.packageName)}${model.packageId ? ` <span dir="ltr">(${esc(model.packageId)})</span>` : ''}</dd>
        <dt>الانتهاء</dt><dd>${esc(model.expiry || '—')}${model.expiryNote ? ` <span class="lic-key-preview-muted">(${esc(model.expiryNote)})</span>` : ''}</dd>
        <dt>الأجهزة</dt><dd>${esc(formatDevicesLabel(model.devices))}</dd>
        <dt>الفروع</dt><dd>${esc(model.branches ?? '—')}</dd>
        <dt>الجهاز</dt><dd>${esc(model.deviceLabel || 'أي جهاز')}</dd>
        ${model.licenseId ? `<dt>المعرّف</dt><dd dir="ltr">${esc(model.licenseId)}</dd>` : ''}
        ${model.customer ? `<dt>العميل</dt><dd>${esc(model.customer)}</dd>` : ''}
      </dl>
      ${feats.length ? `<div class="lic-key-preview-feats"><span class="lic-key-preview-feats-lbl">الخصائص (${model.featureCount || feats.length}):</span>
        ${feats.map(f => `<span class="lic-key-preview-chip">${esc(f)}</span>`).join('')}
        ${featMore > 0 ? `<span class="lic-key-preview-chip lic-key-preview-chip--more">+${featMore}</span>` : ''}
      </div>` : ''}
      <p class="lic-key-preview-foot">${esc(model.footnote || 'هذه معاينة فقط — اضغط «تطبيق» للتفعيل الفعلي')}</p>
    </div>`;
  }

  async function previewKey(code) {
    code = String(code || '').trim();
    if (!code) return { ok: false, title: 'معاينة', message: ERROR_AR.empty };

    if (CL.router?.isV5Key?.(code)) {
      await CL.engine?.ensureReady?.().catch(() => {});
      const decoded = await CL.codecV5?.decodeV5Key?.(code);
      if (!decoded?.ok) {
        return { ok: false, title: 'مفتاح V5', message: ERROR_AR[decoded?.error] || ERROR_AR.invalid };
      }
      const pkgId = decoded.packageId || decoded.fields?.packageId;
      const licenseId = CL.store?.formatLicenseId?.(decoded.licenseSeq || decoded.fields?.licenseSeq);
      const record = licenseId ? CL.store?.getLicense?.(licenseId) : null;
      const expiry = decoded.expiry || record?.expiryDate;
      if (expiry && new Date(expiry + 'T23:59:59') < new Date()) {
        return { ok: false, title: 'منتهي', message: ERROR_AR.expired + ' (' + expiry + ')' };
      }
      let featureCount = 0;
      let featureNames = [];
      try {
        const resolved = CL.featureResolver?.resolvePackageCached?.(pkgId);
        featureCount = (resolved?.featureIds || []).length;
        const fl = CL.registries?.feature?.features || [];
        featureNames = (resolved?.featureIds || []).slice(0, 12).map(id => {
          const f = fl.find(x => x.id === id);
          return f?.name || f?.key || id;
        });
      } catch { /* empty */ }
      return {
        ok: true,
        versionLabel: 'V5',
        packageId: pkgId,
        packageName: packageLabel(pkgId),
        expiry,
        expiryNote: subscriptionLabelFromDays(expiry),
        devices: record?.devices ?? '—',
        branches: record?.branches ?? '—',
        deviceLabel: record?.deviceBinding === 'DEVICE_ANY' || !record?.deviceBinding ? 'أي جهاز' : 'مرتبط بجهاز',
        licenseId: record?.licenseId || licenseId || '',
        customer: record?.customer?.name || record?.customer?.company || '',
        featureCount,
        features: featureNames,
        footnote: record ? 'المفتاح مسجّل — جاهز للتفعيل' : 'مفتاح V5 صالح — سيتم ربطه عند التفعيل'
      };
    }

    if (typeof global.licParseActivationCode === 'function') {
      const parsed = await global.licParseActivationCode(code);
      if (!parsed.ok) {
        return { ok: false, title: 'معاينة', message: ERROR_AR[parsed.error] || ERROR_AR.invalid };
      }
      const p = parsed.payload || {};
      if (p.expiry && new Date(p.expiry + 'T23:59:59') < new Date()) {
        return { ok: false, title: 'منتهي', message: ERROR_AR.expired };
      }
      return {
        ok: true,
        versionLabel: parsed.format || 'Legacy',
        packageName: p.edition || licTypeLabel?.(p.licType) || 'تجديد',
        expiry: p.expiry,
        expiryNote: subscriptionLabelFromDays(p.expiry),
        devices: '—',
        branches: '—',
        deviceLabel: p.device === 'DEVICE_ANY' ? 'أي جهاز' : 'مرتبط',
        featureCount: p.features ? Object.keys(p.features).filter(k => p.features[k]).length : 0,
        features: [],
        footnote: 'مفتاح تجديد/تفعيل — راجع التفاصيل قبل التطبيق'
      };
    }

    return { ok: false, title: 'معاينة', message: 'صيغة غير معروفة' };
  }

  let _debounceTimer = null;

  function bindPreviewInput(textareaId, previewHostId) {
    const ta = document.getElementById(textareaId);
    const host = document.getElementById(previewHostId);
    if (!ta || !host || ta.dataset.licPreviewBound === '1') return;
    ta.dataset.licPreviewBound = '1';
    const run = async () => {
      const code = ta.value.trim();
      if (!code) {
        host.innerHTML = '';
        host.hidden = true;
        return;
      }
      host.hidden = false;
      host.innerHTML = '<div class="lic-key-preview lic-key-preview--loading">⏳ جارٍ تحليل المفتاح...</div>';
      try {
        const model = await previewKey(code);
        host.innerHTML = renderPreviewCard(model);
      } catch (e) {
        host.innerHTML = renderPreviewCard({ ok: false, message: e.message || 'خطأ في المعاينة' });
      }
    };
    const schedule = () => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(run, 380);
    };
    ta.addEventListener('input', schedule);
    ta.addEventListener('paste', () => setTimeout(schedule, 50));
  }

  function initPreviewBindings() {
    bindPreviewInput('lic-renew-code', 'lic-renew-preview');
    bindPreviewInput('lic-manage-renew-code', 'lic-manage-renew-preview');
  }

  CL.keyPreview = { previewKey, renderPreviewCard, initPreviewBindings };
  global.licPreviewActivationKey = previewKey;
  global.licRenderKeyPreviewCard = renderPreviewCard;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPreviewBindings);
  } else {
    setTimeout(initPreviewBindings, 0);
  }
})(typeof window !== 'undefined' ? window : globalThis);
