/**
 * Developer Control Panel — compact UX layer (no licensing engine changes).
 */
(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};
  const ELECTRON_ONLY_MSG_AR = 'هذه الوظيفة متاحة فقط في تطبيق Electron لسطح المكتب.';
  const ELECTRON_ONLY_MSG_EN = 'This feature is available only in the Electron desktop application.';

  function isDesktop() {
    return !!(CL.env?.isDesktop?.() || global.cuppingElectron || global.tadawiElectron);
  }

  function statusIcon(cls) {
    return ({ ok: '✅', warn: '⚠️', bad: '❌', info: 'ℹ️' })[cls] || 'ℹ️';
  }

  function devToast(msg, type) {
    const hosts = [
      document.getElementById('lic-devtools-feedback'),
      document.getElementById('lic-licensing-feedback'),
    ].filter(Boolean);
    hosts.forEach(host => {
      host.textContent = msg;
      host.className = 'lic-devtools-feedback lic-devtools-feedback--' + (type || 'success');
      host.style.display = 'block';
    });
    if (typeof global.notify === 'function') global.notify(msg, type || 'success');
  }

  function applyElectronOnlyButtons(root) {
    (root || document).querySelectorAll('[data-electron-only="true"]').forEach(btn => {
      if (!isDesktop()) {
        btn.disabled = true;
        btn.title = ELECTRON_ONLY_MSG_AR + '\n' + ELECTRON_ONLY_MSG_EN;
        btn.setAttribute('aria-disabled', 'true');
      }
    });
  }

  async function runWithButtonFeedback(btn, fn) {
    if (!btn || btn.disabled) {
      devToast(ELECTRON_ONLY_MSG_AR, 'warning');
      return;
    }
    btn.classList.add('lic-btn-busy');
    btn.disabled = true;
    try {
      await Promise.resolve(fn());
    } catch (e) {
      devToast('✗ ' + (e.message || 'فشلت العملية'), 'danger');
    } finally {
      btn.classList.remove('lic-btn-busy');
      btn.disabled = false;
      applyElectronOnlyButtons(btn.closest('#lic-commercial-toolbar, #lic-devtools-content, #lic-tab-gateway') || document);
    }
  }

  function getActiveCommercialRecord() {
    const v1 = typeof global.licLoad === 'function' ? global.licLoad() : null;
    const licenseId = v1?.licenseId;
    if (licenseId && CL.store?.getLicense) return CL.store.getLicense(licenseId);
    const entries = CL.store?.listLicenses?.() || [];
    const active = entries.find(e => e.status === 'active') || entries[0];
    return active?.licenseId ? CL.store.getLicense(active.licenseId) : null;
  }

  function packageLabel(packageId, rec) {
    if (!packageId || packageId === '—') return '—';
    const pkgs = CL.registries?.package?.packages || [];
    const p = pkgs.find(x => x.id === packageId);
    if (p) return p.displayNameAr || p.displayName || packageId;
    if (rec?.customPackageId) return 'مخصص ' + rec.customPackageId;
    return packageId;
  }

  function licenseSummaryModel() {
    const lic = typeof global.licLoad === 'function' ? global.licLoad() : null;
    const now = new Date();
    const expiry = lic?.expiry ? new Date(lic.expiry) : null;
    const daysLeft = expiry && expiry > now ? Math.ceil((expiry - now) / 86400000) : null;
    const rec = getActiveCommercialRecord();
    const fp = typeof global.licGetFingerprint === 'function' ? global.licGetFingerprint() : '—';
    let status = 'غير مفعل';
    let statusCls = 'bad';
    if (lic && expiry) {
      if (expiry > now) {
        status = rec?.status === 'suspended' ? 'معلّق' : 'صالح';
        statusCls = rec?.status === 'suspended' ? 'warn' : 'ok';
      } else status = 'منتهٍ';
    }
    const pkgId = rec?.packageId || lic?.commercial?.packageId || '—';
    return {
      status, statusCls,
      packageName: packageLabel(pkgId, rec),
      expiry: lic?.expiry || '—',
      daysLeft: daysLeft != null ? daysLeft : '—',
      deviceId: fp,
      licenseId: rec?.licenseId || lic?.licenseId || '—',
    };
  }

  function renderLicenseSummary() {
    const el = document.getElementById('lic-summary-card');
    if (!el) return;
    const m = licenseSummaryModel();
    const items = [
      { label: 'حالة الترخيص', val: m.status, cls: m.statusCls },
      { label: 'الباقة الحالية', val: m.packageName, cls: 'info' },
      { label: 'تاريخ الانتهاء', val: m.expiry, cls: m.statusCls === 'ok' ? 'ok' : m.statusCls },
      { label: 'الأيام المتبقية', val: m.daysLeft === '—' ? '—' : m.daysLeft + ' يوم', cls: m.statusCls },
      { label: 'Device ID', val: m.deviceId, cls: 'info', ltr: true },
      { label: 'License ID', val: m.licenseId, cls: 'info', ltr: true },
    ];
    el.innerHTML = `<div class="lic-lic-kpi-row">${items.map(k => `
      <div class="lic-lic-kpi lic-lic-kpi--${k.cls}">
        <span class="lic-lic-kpi-icon" aria-hidden="true">${statusIcon(k.cls)}</span>
        <span class="lic-lic-kpi-label">${k.label}</span>
        <span class="lic-lic-kpi-val"${k.ltr ? ' dir="ltr"' : ''}>${k.val}</span>
      </div>`).join('')}</div>`;
    const statusBar = document.getElementById('lic-current-status');
    const deviceBar = document.querySelector('#lic-step-manage .lic-device-id-display');
    if (statusBar) statusBar.style.display = 'none';
    if (deviceBar) deviceBar.style.display = 'none';
  }

  const WS_TITLES = {
    renew: '🔄 Renew — تجديد الترخيص',
    downgrade: '⬇️ Downgrade — خفض الباقة',
    restore: '♻️ Restore — استعادة السجل',
  };

  function openLicensingWorkspace(mode) {
    const ws = document.getElementById('lic-licensing-workspace');
    if (!ws) return;
    ws.style.display = '';
    ws.dataset.mode = mode || '';
    const titleEl = document.getElementById('lic-ws-title');
    if (titleEl) titleEl.textContent = WS_TITLES[mode] || 'أداة الترخيص';
    ['renew', 'downgrade', 'restore'].forEach(m => {
      const pane = document.getElementById('lic-ws-' + m);
      if (pane) pane.style.display = m === mode ? '' : 'none';
    });
    if (mode === 'renew') {
      if (typeof global.licSwitchLicensingSub === 'function') global.licSwitchLicensingSub('renew');
      if (typeof global.licGenTypeChange === 'function') global.licGenTypeChange();
    }
    if (mode === 'downgrade') renderDowngradePanel();
    if (mode === 'restore') initRestorePanel();
    ws.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeLicensingWorkspace() {
    const ws = document.getElementById('lic-licensing-workspace');
    if (ws) ws.style.display = 'none';
  }

  async function renderDowngradePanel() {
    const host = document.getElementById('lic-ws-downgrade');
    if (!host) return;
    const rec = getActiveCommercialRecord();
    if (!rec) {
      host.innerHTML = '<p class="lic-ws-hint">لا يوجد ترخيص تجاري نشط للخفض.</p>';
      return;
    }
    try { await CL.engine?.ensureReady?.(); } catch (e) {
      host.innerHTML = '<p class="lic-ws-hint" style="color:#ff8888">' + (e.message || 'فشل تحميل السجلات') + '</p>';
      return;
    }
    const pkgs = (CL.registries?.package?.packages || []).filter(p => {
      if (!p || p.visible === false || p.id === rec.packageId) return false;
      return global.PackageRegistryViewer?.isCustomerPackageId?.(p.id)
        || ['01', '02', '03', '04'].includes(p.id);
    });
    const opts = pkgs.map(p => `<option value="${p.id}">${p.displayNameAr || p.displayName} (${p.id})</option>`).join('');
    host.innerHTML = `
      <p class="lic-ws-hint">اختر باقة أقل من الحالية (${rec.packageId}). سيتم إنشاء مفتاح جديد.</p>
      <div class="lic-field"><label>الباقة المستهدفة</label><select id="lic-dwg-target" class="lic-product-key-input" style="text-transform:none;letter-spacing:0">${opts}</select></div>
      <label class="lic-ws-check"><input type="checkbox" id="lic-dwg-confirm"> أؤكد خفض الباقة وإزالة الميزات الزائدة</label>
      <button type="button" class="lic-btn" onclick="licDevRunDowngrade()">تنفيذ Downgrade</button>
      <div id="lic-dwg-result" class="lic-ws-result"></div>`;
  }

  function confirmDevAction(title, detail) {
    return global.confirm(`${title}\n\n${detail || 'لا يمكن التراجع عن هذه العملية.'}`);
  }

  async function runDowngrade() {
    const rec = getActiveCommercialRecord();
    const target = document.getElementById('lic-dwg-target')?.value;
    const confirmed = document.getElementById('lic-dwg-confirm')?.checked;
    const out = document.getElementById('lic-dwg-result');
    if (!rec || !target) { devToast('اختر باقة مستهدفة', 'warning'); return; }
    if (!confirmed) { devToast('يجب تأكيد عملية الخفض', 'warning'); return; }
    if (!confirmDevAction('⬇️ تأكيد خفض الباقة', `سيتم خفض ${rec.licenseId} إلى ${target} وإزالة الميزات الزائدة.`)) return;
    try {
      const result = await CL.downgrade?.downgrade?.(rec.licenseId, { targetPackageId: target, confirmed: true });
      if (out) {
        out.innerHTML = `<div class="lic-key-panel"><div>✅ تم الخفض إلى ${target}</div><div class="pk-value">${result.key}</div></div>`;
      }
      devToast('✅ تم خفض الباقة بنجاح', 'success');
      renderLicenseSummary();
    } catch (e) {
      devToast('✗ Downgrade: ' + (e.message || 'فشل'), 'danger');
    }
  }

  function initRestorePanel() {
    const host = document.getElementById('lic-ws-restore');
    if (!host || host.dataset.ready) return;
    host.dataset.ready = '1';
    host.innerHTML = `
      <p class="lic-ws-hint">استعادة نسخة سجل التراخيص المحفوظة محلياً.</p>
      <div class="lic-field"><label>تاريخ النسخة</label><input type="date" id="lic-restore-date" class="lic-product-key-input" style="text-transform:none;letter-spacing:0"></div>
      <button type="button" class="lic-btn" onclick="licDevRestoreRegistry()">استعادة</button>`;
    const d = document.getElementById('lic-restore-date');
    if (d) d.value = new Date().toISOString().slice(0, 10);
  }

  const TOOL_DEFS = [
    { id: 'pkg', icon: '📦', title: 'منشئ الباقات', desc: 'إنشاء باقات أساسية أو مخصصة بالخصائص — الخطوة الأولى', tone: 'create', run: () => CL.packageBuilder?.open?.() },
    { id: 'builder', icon: '🏗️', title: 'منشئ التراخيص', desc: 'اختيار باقة محفوظة ثم توليد ترخيص للعميل', tone: 'create', run: () => CL.drawer?.open?.() },
    { id: 'upgrade', icon: '⬆️', title: 'معالج الترقية', desc: 'ترقية الترخيص الحالي إلى باقة أعلى', tone: 'update', run: () => CL.upgradeWizard?.open?.() },
    { id: 'renew', icon: '🔄', title: 'Renew', desc: 'تطبيق مفتاح تجديد أو توليد مفتاح كلاسيكي', tone: 'update', run: () => openLicensingWorkspace('renew') },
    { id: 'downgrade', icon: '⬇️', title: 'Downgrade', desc: 'خفض باقة الترخيص مع تأكيد صريح', tone: 'danger', run: () => openLicensingWorkspace('downgrade') },
    { id: 'repair', icon: '🔧', title: 'Repair License', desc: 'إصلاح حزمة التفعيل للترخيص الحالي', tone: 'maintain', run: () => repairLicense() },
    { id: 'suspend', icon: '⏸', title: 'Suspend / Resume', desc: 'تعليق أو استئناف الترخيص التجاري', tone: 'maintain', run: () => toggleSuspend() },
    { id: 'backup', icon: '💾', title: 'Backup', desc: 'حفظ نسخة احتياطية للسجل محلياً', tone: 'backup', run: () => backupRegistry() },
    { id: 'restore', icon: '♻️', title: 'Restore', desc: 'استعادة نسخة سجل محفوظة', tone: 'backup', run: () => openLicensingWorkspace('restore') },
    { id: 'export', icon: '📤', title: 'Export', desc: 'تصدير سجل التراخيص إلى ملف JSON', tone: 'backup', run: () => exportRegistry() },
    { id: 'import', icon: '📥', title: 'Import', desc: 'استيراد سجل تراخيص من ملف JSON', tone: 'danger', run: () => importRegistry() },
  ];

  const TOOL_GROUPS = [
    { title: 'إنشاء التراخيص', ids: ['pkg', 'builder', 'upgrade'] },
    { title: 'إدارة الترخيص', ids: ['renew', 'downgrade', 'repair', 'suspend'] },
    { title: 'النسخ الاحتياطي', ids: ['backup', 'restore', 'export', 'import'] },
  ];

  function renderToolCard(t) {
    const disabled = t.electronOnly && !isDesktop();
    return `<div class="lic-tool-card">
      <button type="button" class="lic-tool-card-btn lic-tool-tone-${t.tone}" id="lic-tool-${t.id}" data-tool="${t.id}"${disabled ? ' disabled data-electron-only="true"' : ''}>
        <span class="lic-tool-card-icon">${t.icon}</span>
        <span class="lic-tool-card-title">${t.title}</span>
      </button>
      <p class="lic-tool-card-desc">${t.desc}</p>
    </div>`;
  }

  function bindToolButtons(host) {
    TOOL_DEFS.forEach(t => {
      const btn = host.querySelector('#lic-tool-' + t.id);
      if (!btn) return;
      btn.addEventListener('click', () => runWithButtonFeedback(btn, async () => {
        if (t.electronOnly && !isDesktop()) throw new Error(ELECTRON_ONLY_MSG_AR);
        const r = t.run();
        if (r && typeof r.then === 'function') await r;
        if (['backup', 'export'].includes(t.id)) return;
        if (!['builder', 'upgrade', 'pkg', 'renew', 'downgrade', 'restore'].includes(t.id)) return;
        devToast('✅ تم فتح ' + t.title, 'success');
      }));
    });
  }

  function renderToolsGrid() {
    const host = document.getElementById('lic-commercial-toolbar');
    if (!host) return;
    host.innerHTML = TOOL_GROUPS.map(g => `
      <div class="lic-tool-group">
        <div class="lic-tool-group-title">${g.title}</div>
        <div class="lic-tool-grid">${g.ids.map(id => renderToolCard(TOOL_DEFS.find(t => t.id === id))).join('')}</div>
      </div>`).join('') +
      (isDesktop() ? '' : `<p class="lic-v2-browser-note">ℹ️ منشئ الباقات يتطلب Electron. باقي الأدوات متاحة في المتصفح.</p>`);
    bindToolButtons(host);
    applyElectronOnlyButtons(host);
  }

  function kpiMetric(label, val, cls) {
    return { label, val, cls: cls || 'info' };
  }

  function collectDiagnosticsMetrics() {
    const lic = typeof global.licLoad === 'function' ? global.licLoad() : null;
    const now = new Date();
    const expiry = lic?.expiry ? new Date(lic.expiry) : null;
    const licValid = !!(lic && expiry && expiry > now);
    let integrity = { ok: true, issues: [] };
    try { integrity = global.verifyRestoredDataIntegrity?.(global.buildFullBackupObject?.()) || integrity; } catch {}
    const storageB = typeof global.licEstimateStorageBytes === 'function' ? global.licEstimateStorageBytes() : 0;
    const gw = global.settings?.communicationGateway || global.settings?.communication;
    const gwOk = Array.isArray(gw?.providers) && gw.providers.length > 0;
    let registryOk = false;
    try { registryOk = !!(CL.registries?.package && CL.engine?.isReady?.()); } catch {}
    const desktop = isDesktop();
    let sessionKeys = 0;
    try { sessionKeys = sessionStorage.length; } catch {}
    return {
      database: kpiMetric('Database', typeof global.licFormatBytes === 'function' ? global.licFormatBytes(storageB) : '—', storageB ? 'ok' : 'warn'),
      licenseEngine: kpiMetric('License Engine', global._licStatus === 'valid' ? 'يعمل' : (global._licStatus || '—'), global._licStatus === 'valid' ? 'ok' : 'bad'),
      registry: kpiMetric('Registry', registryOk ? 'محمّل' : 'غير جاهز', registryOk ? 'ok' : 'warn'),
      storage: kpiMetric('Storage', desktop ? 'FS + LS' : 'localStorage', 'ok'),
      runtime: kpiMetric(desktop ? 'Electron' : 'Browser', desktop ? (global.BrandingEngine?.runtime?.electron || 'Desktop') : 'Web', 'ok'),
      integrity: kpiMetric('Integrity', integrity.ok ? 'سليم' : integrity.issues.length + ' مشكلة', integrity.ok ? 'ok' : 'bad'),
      cache: kpiMetric('Cache', sessionKeys + ' keys', 'ok'),
      communication: kpiMetric('Communication', gwOk ? 'مُعدّ' : 'غير مُعدّ', gwOk ? 'ok' : 'warn'),
      licValid,
      integrityIssues: Array.isArray(integrity.issues) ? integrity.issues.length : 0,
      integrityWarnings: Array.isArray(integrity.warnings) ? integrity.warnings.length : 0,
    };
  }

  function buildDiagnosticsSnapshot() {
    const m = collectDiagnosticsMetrics();
    const now = new Date().toISOString();
    return {
      capturedAt: now,
      runtime: {
        desktop: isDesktop(),
        environment: m.runtime?.val || 'unknown',
      },
      license: {
        status: m.licenseEngine?.val || 'unknown',
        valid: !!m.licValid,
        registry: m.registry?.val || 'unknown',
      },
      data: {
        integrity: m.integrity?.val || 'unknown',
        integrityIssues: m.integrityIssues || 0,
        integrityWarnings: m.integrityWarnings || 0,
        storage: m.storage?.val || 'unknown',
        cache: m.cache?.val || 'unknown',
      },
      communication: {
        status: m.communication?.val || 'unknown',
      },
    };
  }

  const DIAG_TOOLS = [
    { id: 'refresh', icon: '🔄', title: 'تحديث التشخيص', desc: 'تحديث بطاقات الحالة', tone: 'update', run: () => refreshDiagnostics() },
    { id: 'integrity', icon: '✅', title: 'فحص سلامة البيانات', desc: 'فحص سلامة قاعدة البيانات', tone: 'maintain', run: () => global.licDevDataIntegrity?.() },
    { id: 'copyid', icon: '📋', title: 'نسخ معرف الجهاز', desc: 'نسخ Device ID للحافظة', tone: 'backup', run: () => global.licDevCopyDeviceId?.() },
    { id: 'registry', icon: '📚', title: 'Registry Health', desc: 'التحقق من سجلات الترخيص', tone: 'maintain', run: () => runRegistryHealth() },
    { id: 'bundle', icon: '📦', title: 'Bundle Health', desc: 'التحقق من حزم التفعيل', tone: 'maintain', run: () => runBundleHealth() },
    { id: 'cache', icon: '🗂️', title: 'Cache Status', desc: 'عرض حالة الكاش', tone: 'info', run: () => runCacheStatus() },
    { id: 'audit', icon: '📜', title: 'Audit Log', desc: 'عرض سجل عمليات الترخيص', tone: 'info', run: () => showAuditLog() },
    { id: 'backupval', icon: '💾', title: 'Backup Validation', desc: 'آخر نسخة احتياطية ناجحة', tone: 'backup', run: () => runBackupValidation() },
    { id: 'recovery', icon: '♻️', title: 'Recovery Validation', desc: 'آخر عملية استعادة', tone: 'backup', run: () => runRecoveryValidation() },
    { id: 'dbcheck', icon: '🔍', title: 'فحص قاعدة البيانات', desc: 'إعادة فحص الجداول', tone: 'maintain', run: () => global.licDevRecheckDb?.() },
    { id: 'cleancache', icon: '🧹', title: 'تنظيف الكاش', desc: 'مسح الكاش المؤقت', tone: 'maintain', run: () => global.licDevCleanCache?.() },
    { id: 'snapshot', icon: '🧾', title: 'Diagnostics Snapshot', desc: 'عرض/تصدير لقطة JSON للتشخيص', tone: 'info', run: () => showDiagnosticsSnapshot() },
  ];

  function bindDiagTools(root) {
    DIAG_TOOLS.forEach(t => {
      const btn = root.querySelector(`[data-diag="${t.id}"]`);
      if (!btn) return;
      btn.addEventListener('click', () => runWithButtonFeedback(btn, async () => {
        const r = t.run();
        if (r && typeof r.then === 'function') await r;
      }));
    });
  }

  function renderDiagnosticsDashboard() {
    const el = document.getElementById('lic-devtools-content');
    if (!el) return;
    const m = collectDiagnosticsMetrics();
    const kpis = [m.database, m.licenseEngine, m.registry, m.storage, m.runtime, m.integrity, m.cache, m.communication];
    el.innerHTML = `
      <div id="lic-devtools-feedback" class="lic-devtools-feedback" style="display:none"></div>
      <div class="lic-kpi-row">${kpis.map(k => `
        <div class="lic-kpi-card lic-kpi-card--${k.cls || ''}">
          <span class="lic-kpi-icon" aria-hidden="true">${statusIcon(k.cls)}</span>
          <span class="lic-kpi-label">${k.label}</span>
          <span class="lic-kpi-val">${k.val}</span>
        </div>`).join('')}
      </div>
      <div class="lic-diag-section-title">أدوات التشخيص</div>
      <div class="lic-tool-grid lic-tool-grid--compact">${DIAG_TOOLS.map(t => `
        <div class="lic-tool-card lic-tool-card--compact">
          <button type="button" class="lic-tool-card-btn lic-tool-tone-${t.tone || 'info'}" data-diag="${t.id}">
            <span class="lic-tool-card-icon">${t.icon}</span>
            <span class="lic-tool-card-title">${t.title}</span>
          </button>
          <p class="lic-tool-card-desc">${t.desc}</p>
        </div>`).join('')}
      </div>
      <div id="lic-license-recovery-section"></div>
      <div id="lic-owner-mgmt-section"></div>
      <div id="lic-devtools-detail"></div>
      ${CL.cloudProvidersPanel ? CL.cloudProvidersPanel.renderSection() : ''}`;
    bindDiagTools(el);
    applyElectronOnlyButtons(el);
    renderLicenseRecoverySection();
    renderOwnerManagementSection();
    if (typeof global.licCloudProvidersRefresh === 'function') global.licCloudProvidersRefresh();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function googleConnectedLabel() {
    const email = global.settings?.backup?.providers?.google?.email || '';
    const connected = !!(global.settings?.backup?.providers?.google?.connected);
    if (connected && email) return 'متصل: ' + email;
    if (connected) return 'Google متصل';
    return 'Google غير متصل — سيتم فتح الربط عند السحب';
  }

  /**
   * License Recovery — always visible in Developer Tools (even when Owner exists / activation complete).
   * Uses existing OAuth + DriveAdapter + CloudBootstrap + LicenseCloud / LegacyBridge only.
   */
  function renderLicenseRecoverySection() {
    const host = document.getElementById('lic-license-recovery-section');
    if (!host) return;
    const desktop = isDesktop();
    host.innerHTML = `
      <div class="lic-diag-section-title" style="margin-top:18px">📥 License Recovery</div>
      <p style="font-size:11px;color:rgba(255,255,255,0.55);margin:0 0 10px;line-height:1.65">
        استعادة ترخيص موجود على Google Drive للعملاء القدامى — بدون مفتاح جديد.
        متاح دائماً حتى مع وجود Owner أو اكتمال التفعيل. فشل السحب لا يحذف الترخيص المحلي / Device ID / Branch / Owner / النسخ الاحتياطية.
      </p>
      <div class="lic-tool-grid lic-tool-grid--compact" style="margin-bottom:8px">
        <div class="lic-tool-card lic-tool-card--compact">
          <button type="button" class="lic-tool-card-btn lic-tool-tone-info" id="lic-devtools-drive-pull-btn"
            ${desktop ? '' : ' disabled data-electron-only="true"'}>
            ☁️ Pull License from Google Drive
          </button>
          <p class="lic-tool-card-desc">ربط/تحقق Google ثم سحب الترخيص والتحقق والحفظ محلياً وتحديث حالة التطبيق</p>
        </div>
      </div>
      <p id="lic-devtools-drive-google-state" style="font-size:11px;opacity:.75;margin:0 0 6px" dir="ltr">${escapeHtml(googleConnectedLabel())}</p>
      <div id="lic-devtools-drive-status" class="login-drive-status" style="margin-top:4px;font-size:12px"></div>
      <div id="lic-devtools-drive-candidates" style="display:none"></div>`;

    const pullBtn = document.getElementById('lic-devtools-drive-pull-btn');
    pullBtn?.addEventListener('click', () => runWithButtonFeedback(pullBtn, async () => {
      if (!desktop) throw new Error(ELECTRON_ONLY_MSG_AR);
      if (typeof global.loginConnectGoogleAndBootstrap !== 'function') {
        throw new Error('مسار سحب الترخيص غير محمّل');
      }
      const res = await global.loginConnectGoogleAndBootstrap({
        context: 'devtools',
        skipDeviceBootstrap: true,
        recovery: true
      }, false);
      if (res?.pending) {
        devToast('🔗 أكمل ربط Google ثم أعد السحب', 'warning');
        return;
      }
      if (res?.error === 'multiple_licenses') {
        devToast('⚠️ اختر الترخيص من القائمة أدناه', 'warning');
        return;
      }
      if (res?.ok) {
        devToast('✅ تم سحب الترخيص من Google Drive وحفظه محلياً', 'success');
        renderLicenseSummary();
        try { global.OwnerHub?.refresh?.(); } catch { /* empty */ }
        return;
      }
      if (res?.preservedLocal) {
        devToast('⚠️ ' + (global._DRIVE_BOOTSTRAP_ERR_AR?.[res.error] || res.error || 'فشل السحب') + ' — البيانات المحلية محفوظة', 'warning');
        return;
      }
      throw new Error(global._DRIVE_BOOTSTRAP_ERR_AR?.[res?.error] || res?.error || 'فشل سحب الترخيص');
    }));
    applyElectronOnlyButtons(host);
  }

  function renderOwnerManagementSection() {
    const host = document.getElementById('lic-owner-mgmt-section');
    if (!host) return;
    const OM = global.OwnerManagement;
    if (!OM) {
      host.innerHTML = '';
      return;
    }
    if (!OM.shouldShowEmergencyOwnerTools?.(global.currentUser)
      && !OM.shouldShowOwnerManagementSection?.(global.currentUser)) {
      host.innerHTML = '';
      return;
    }

    const needsBootstrap = (() => {
      const st = OM.getOwnerState?.()?.state;
      if (st) return st === 'NO_OWNER' || st === 'OWNER_CORRUPTED' || st === 'OWNER_RECOVERY_REQUIRED';
      return !!OM.needsOwnerBootstrap?.();
    })();
    const ownerStateLabel = OM.getOwnerState?.()?.state || (needsBootstrap ? 'NO_OWNER' : 'OWNER_EXISTS');
    const formHtml = needsBootstrap
      ? (global.OwnerCreateForm?.renderFormHtml?.({ idPrefix: 'devom' }) || `
      <div class="form-grid" style="gap:10px;text-align:right">
        <div class="form-group"><label class="form-label">الاسم</label><input class="form-control" id="devom-name"></div>
        <div class="form-group"><label class="form-label">البريد</label><input class="form-control" id="devom-email" type="email" dir="ltr"></div>
        <div class="form-group"><label class="form-label">اسم المستخدم</label><input class="form-control" id="devom-username" dir="ltr"></div>
        <div class="form-group"><label class="form-label">كلمة المرور</label><input class="form-control" id="devom-password" type="password" dir="ltr"></div>
        <div class="form-group"><label class="form-label">تأكيد كلمة المرور</label><input class="form-control" id="devom-confirm" type="password" dir="ltr"></div>
        <div class="form-group"><label class="form-label">كود الاسترداد</label><input class="form-control" id="devom-recovery" dir="ltr"></div>
        <label style="font-size:12px"><input type="checkbox" id="devom-accept" checked> ربط المالك بالمؤسسة والترخيص الحاليين</label>
        <div id="devom-form-err" class="field-error" hidden></div>
      </div>`)
      : '';

    host.innerHTML = `
      <div class="lic-diag-section-title" style="margin-top:18px">🆘 Owner Support (Developer Mode)</div>
      <p style="font-size:11px;color:rgba(255,255,255,0.55);margin:0 0 10px;line-height:1.65">
        V2-5.9: الوظيفة اليومية هنا هي <strong>Reset Owner Password</strong> فقط.
        لا يُفتح Owner Bootstrap أثناء تفعيل Google. حالة: <code dir="ltr">${escapeHtml(ownerStateLabel)}</code>.
        إنشاء Owner = عملية دعم/ترحيل موثّقة — الإدارة اليومية من Owner Hub.
      </p>
      <div class="lic-tool-grid lic-tool-grid--compact" style="margin-bottom:12px">
        <div class="lic-tool-card lic-tool-card--compact">
          <button type="button" class="lic-tool-card-btn lic-tool-tone-warn" id="lic-om-reset-password">🔑 Reset Owner Password</button>
          <p class="lic-tool-card-desc">إعادة تعيين كلمة مرور Owner عبر مسار الدعم</p>
        </div>
        <div class="lic-tool-card lic-tool-card--compact">
          <button type="button" class="lic-tool-card-btn lic-tool-tone-info" data-om-repair="membership">🔧 Repair Owner Membership</button>
          <p class="lic-tool-card-desc">إصلاح عضوية المستخدم ↔ دور Owner</p>
        </div>
        <div class="lic-tool-card lic-tool-card--compact">
          <button type="button" class="lic-tool-card-btn lic-tool-tone-info" data-om-repair="binding">🔗 Repair Owner Binding</button>
          <p class="lic-tool-card-desc">إعادة ربط النطاق/المؤسسة/الفروع</p>
        </div>
        <div class="lic-tool-card lic-tool-card--compact">
          <button type="button" class="lic-tool-card-btn lic-tool-tone-info" data-om-repair="license">📜 Repair Owner License Link</button>
          <p class="lic-tool-card-desc">ربط الترخيص الحالي بحسابات Owner</p>
        </div>
        <div class="lic-tool-card lic-tool-card--compact">
          <button type="button" class="lic-tool-card-btn lic-tool-tone-info" data-om-repair="permissions">🛡️ Rebuild Owner Permissions</button>
          <p class="lic-tool-card-desc">إعادة صلاحيات دور Owner المضمّنة</p>
        </div>
        <div class="lic-tool-card lic-tool-card--compact">
          <button type="button" class="lic-tool-card-btn lic-tool-tone-info" id="lic-om-diagnostics">🩺 Owner Diagnostics</button>
          <p class="lic-tool-card-desc">لقطة تشخيص بدون أسرار</p>
        </div>
      </div>
      ${needsBootstrap ? `<div id="lic-owner-create-wrap">
        <div class="lic-diag-section-title">Create First Owner (Migration / Emergency only)</div>
        <p style="font-size:11px;color:rgba(255,255,255,0.55);margin:0 0 8px">ليس جزءاً من رحلة العميل. استخدم seed <code>owner</code> أو هذا النموذج للترحيل فقط.</p>
        ${formHtml}
        <div style="margin-top:10px"><button type="button" class="btn btn-primary" id="lic-om-create-btn">إنشاء أول مالك (طوارئ/ترحيل)</button></div>
      </div>` : '<p style="font-size:11px;color:rgba(255,255,255,0.55)">يوجد Owner — للإدارة اليومية افتح Owner Hub.</p>'}
      <pre id="lic-om-diag-out" class="lic-devtools-pre" style="display:none;margin-top:10px"></pre>`;

    global.OwnerCreateForm?.bindPasswordToggles?.(host);

    document.getElementById('lic-om-reset-password')?.addEventListener('click', () => {
      if (typeof global.OwnerHub?.resetOwnerPasswordInteractive === 'function') {
        global.OwnerHub.resetOwnerPasswordInteractive();
        devToast('🔑 مسار إعادة تعيين كلمة مرور Owner', 'info');
        return;
      }
      devToast('⚠️ Reset Owner Password غير متاح — افتح Owner Hub', 'warning');
    });

    document.getElementById('lic-om-diagnostics')?.addEventListener('click', () => {
      const out = document.getElementById('lic-om-diag-out');
      const snap = OM.buildOwnerDiagnostics?.() || {};
      if (out) {
        out.style.display = 'block';
        out.textContent = JSON.stringify(snap, null, 2);
      }
      devToast('✅ Owner Diagnostics', 'success');
    });

    host.querySelectorAll('[data-om-repair]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.getAttribute('data-om-repair');
        let res = { ok: false, error: 'unknown' };
        if (kind === 'membership') res = OM.repairOwnerMembership?.() || res;
        else if (kind === 'binding') res = OM.repairOwnerBinding?.() || res;
        else if (kind === 'license') res = OM.repairOwnerLicenseLink?.() || res;
        else if (kind === 'permissions') res = OM.rebuildOwnerPermissions?.() || res;
        if (res.ok) devToast(`✅ Repair OK · fixed=${res.fixed ?? 0}`, 'success');
        else devToast('⚠️ ' + (res.message || res.error || 'فشل الإصلاح'), 'warning');
        renderOwnerManagementSection();
      });
    });

    const createBtn = document.getElementById('lic-om-create-btn');
    if (createBtn) {
      createBtn.addEventListener('click', async () => {
        createBtn.disabled = true;
        try {
          const raw = global.OwnerCreateForm?.readForm?.('devom') || {
            fullName: document.getElementById('devom-name')?.value,
            email: document.getElementById('devom-email')?.value,
            username: document.getElementById('devom-username')?.value,
            password: document.getElementById('devom-password')?.value,
            passwordConfirm: document.getElementById('devom-confirm')?.value,
            recoveryCode: document.getElementById('devom-recovery')?.value,
            acceptOrganization: !!document.getElementById('devom-accept')?.checked
          };
          const res = await (OM.createOwner || OM.createOwnerAccount)({ ...raw, idPrefix: 'devom' });
          if (res?.ok) {
            devToast('✅ تم إنشاء أول Owner (طوارئ) عبر createOwner()', 'success');
            renderOwnerManagementSection();
            if (typeof global.renderUsersList === 'function') global.renderUsersList();
            try { global.OwnerHub?.refresh?.(); } catch { /* empty */ }
          } else {
            const msg = res?.message || res?.error || 'تعذّر الإنشاء';
            devToast('⚠️ ' + msg, 'warning');
            global.OwnerCreateForm?.showFieldError?.('devom', 'form', msg);
          }
        } catch (e) {
          devToast('✗ ' + (e.message || 'فشل'), 'danger');
        } finally {
          createBtn.disabled = false;
        }
      });
    }
  }

  function refreshDiagnostics() {
    renderDiagnosticsDashboard();
    renderLicenseSummary();
    devToast('✅ تم تحديث التشخيص', 'success');
  }

  async function runRegistryHealth() {
    try {
      const ok = await CL.engine?.ensureReady?.();
      if (!ok) {
        devToast('⚠️ Registry: السجلات غير محمّلة بعد', 'warning');
        return;
      }
      const keys = ['feature', 'capability', 'package', 'subscription', 'action', 'template'];
      const missing = keys.filter(k => !CL.registries?.[k]);
      if (missing.length) { devToast('❌ Registry: ملفات ناقصة — ' + missing.join(', '), 'danger'); return; }
      const ver = CL.featureResolver?.getCacheVersion?.() || '—';
      devToast('✅ Registry Health: سليم · v' + ver, 'success');
    } catch (e) {
      const msg = String(e?.message || '');
      if (/fetch|CORS|file:/i.test(msg)) {
        devToast('ℹ️ Registry: تحقق جزئي في المتصفح — التحقق الكامل في Electron', 'warning');
        return;
      }
      if (/invalidateCache|featureResolver/i.test(msg)) {
        devToast('⚠️ Registry: تعذّر تحديث الكاش — أعد تحميل الصفحة', 'warning');
        return;
      }
      devToast('⚠️ Registry: ' + (msg || 'تعذّر التحقق'), 'warning');
    }
  }

  async function runBundleHealth() {
    const state = CL.store?.loadState?.() || { bundles: {} };
    const ids = Object.keys(state.bundles || {});
    if (!ids.length) { devToast('ℹ️ لا توجد حزم تفعيل', 'warning'); return; }
    let bad = 0;
    for (const id of ids) {
      try { await CL.activationBundle?.verifyBundle?.(state.bundles[id]); } catch { bad++; }
    }
    devToast(bad ? `❌ ${bad}/${ids.length} حزمة تالفة` : `✅ ${ids.length} حزمة سليمة`, bad ? 'danger' : 'success');
  }

  function runCacheStatus() {
    let n = 0;
    try { n = sessionStorage.length; } catch {}
    const ready = !!CL.engine?.isReady?.();
    const ver = ready ? (CL.featureResolver?.getCacheVersion?.() || '—') : 'غير محمّل';
    devToast(`ℹ️ Cache: ${n} session · registry ${ver}`, ready ? 'success' : 'warning');
  }

  function showAuditLog() {
    const audit = CL.auditLog?.loadAudit?.();
    const entries = audit?.entries || [];
    const host = document.getElementById('lic-devtools-detail');
    if (host) {
      host.innerHTML = `<pre class="lic-devtools-pre">${entries.slice(-40).reverse().map(e => `${e.ts} · ${e.action} · ${e.target}`).join('\n') || '—'}</pre>`;
    }
    devToast(entries.length ? `✅ Audit Log: ${entries.length} سجل` : 'ℹ️ لا توجد سجلات', entries.length ? 'success' : 'warning');
  }

  function runRecoveryValidation() {
    const last = typeof global.licGetLastRestoreEntry === 'function' ? global.licGetLastRestoreEntry() : null;
    devToast(last ? '✅ Recovery: ' + String(last.at || '').slice(0, 19) : 'ℹ️ لا توجد استعادة مسجّلة', last ? 'success' : 'warning');
  }

  function showDiagnosticsSnapshot() {
    const host = document.getElementById('lic-devtools-detail');
    const snap = buildDiagnosticsSnapshot();
    if (host) {
      host.innerHTML = `<pre class="lic-devtools-pre">${JSON.stringify(snap, null, 2)}</pre>`;
    }
    const warn = snap.data.integrityIssues > 0 || !snap.license.valid;
    devToast(
      warn ? '⚠️ Snapshot: توجد إشارات تحتاج متابعة' : '✅ Snapshot: الحالة العامة جيدة',
      warn ? 'warning' : 'success'
    );
    return snap;
  }

  function runBackupValidation() {
    const ok = (global.backupLog || []).find(e => e.status === 'success');
    devToast(ok ? '✅ Backup: ' + String(ok.at || '').slice(0, 19) : '⚠️ لا توجد نسخة ناجحة', ok ? 'success' : 'warning');
  }

  async function exportRegistry() {
    const data = CL.store?.exportData?.();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'license-registry-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    devToast('✅ تم التصدير', 'success');
  }

  function importRegistry() {
    if (!confirmDevAction('📥 استيراد سجل التراخيص', 'سيتم استبدال بيانات السجل الحالية بالملف المختار.')) return;
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const file = inp.files?.[0];
      if (!file) { devToast('ℹ️ تم إلغاء الاستيراد', 'warning'); return; }
      try {
        const data = JSON.parse(await file.text());
        if (data.state) CL.store.importData(data.state);
        else if (data.licenses) CL.store.importData(data);
        else throw new Error('invalid_format');
        devToast('✅ تم الاستيراد', 'success');
        renderLicenseSummary();
      } catch (e) { devToast('✗ Import: ' + (e.message || 'فشل'), 'danger'); }
    };
    inp.click();
  }

  function backupRegistry() {
    CL.store?.createBackup?.('manual');
    CL.migration?.exportRegistryBackup?.();
    devToast('✅ تم الحفظ الاحتياطي', 'success');
  }

  function restoreRegistry() {
    const day = document.getElementById('lic-restore-date')?.value || new Date().toISOString().slice(0, 10);
    if (!confirmDevAction('♻️ استعادة سجل التراخيص', `سيتم استعادة نسخة بتاريخ ${day}.`)) return;
    CL.store?.restoreBackup?.(day);
    devToast('✅ تمت الاستعادة', 'success');
    renderLicenseSummary();
    closeLicensingWorkspace();
  }

  async function repairLicense() {
    const rec = getActiveCommercialRecord();
    if (!rec) { devToast('⚠️ لا يوجد ترخيص لإصلاحه', 'warning'); return; }
    const resolved = rec.customPackageId
      ? await CL.featureResolver.resolveCustomPackage(rec.customPackageId)
      : CL.featureResolver.resolvePackageCached(rec.packageId);
    await CL.activationBundle.buildBundle(rec, resolved);
    devToast('✅ تم إصلاح ' + rec.licenseId, 'success');
    await runBundleHealth();
  }

  function toggleSuspend() {
    const rec = getActiveCommercialRecord();
    if (!rec) { devToast('⚠️ لا يوجد ترخيص', 'warning'); return; }
    const next = rec.status === 'suspended' ? 'active' : 'suspended';
    const msg = next === 'suspended' ? '⏸ تعليق الترخيص' : '▶️ استئناف الترخيص';
    if (!confirmDevAction(msg, `${rec.licenseId} — ${rec.packageId || ''}`)) return;
    rec.status = next;
    CL.store.saveLicense(rec);
    devToast(rec.status === 'suspended' ? '⏸ تم التعليق' : '▶️ تم الاستئناف', 'success');
    renderLicenseSummary();
  }

  function applyGatewayBrowserLimits() {
    const desktop = isDesktop();
    const msg = ELECTRON_ONLY_MSG_AR + '\n' + ELECTRON_ONLY_MSG_EN;
    document.querySelectorAll('#lic-tab-gateway [data-electron-only="true"]').forEach(btn => {
      if (!desktop) {
        btn.disabled = true;
        btn.title = msg;
        btn.setAttribute('aria-disabled', 'true');
      }
    });
    const qBtn = document.getElementById('btn-process-comm-queue');
    if (qBtn && !desktop) {
      qBtn.disabled = true;
      qBtn.title = msg;
      qBtn.setAttribute('data-electron-only', 'true');
    }
    const clearBtn = document.getElementById('btn-clear-comm-queue');
    if (clearBtn && !desktop) {
      clearBtn.disabled = true;
      clearBtn.title = msg;
      clearBtn.setAttribute('data-electron-only', 'true');
    }
  }

  function refreshLicensingTab() {
    renderLicenseSummary();
    renderToolsGrid();
  }

  function refreshDeveloperPanel() {
    const devtools = document.getElementById('lic-tab-devtools');
    const licensing = document.getElementById('lic-tab-licensing');
    const gateway = document.getElementById('lic-tab-gateway');
    if (licensing && licensing.style.display !== 'none') refreshLicensingTab();
    if (devtools && devtools.style.display !== 'none') renderDiagnosticsDashboard();
    if (gateway && gateway.style.display !== 'none') applyGatewayBrowserLimits();
    applyElectronOnlyButtons();
  }

  CL.developerPanel = {
    isDesktop, devToast, renderLicenseSummary, renderToolsGrid,
    renderDiagnosticsDashboard, renderOwnerManagementSection, renderLicenseRecoverySection,
    refreshLicensingTab, refreshDeveloperPanel,
    applyGatewayBrowserLimits, ELECTRON_ONLY_MSG_AR, ELECTRON_ONLY_MSG_EN,
  };

  global.licDevPanelRefresh = refreshDeveloperPanel;
  global.licDevCloseWorkspace = closeLicensingWorkspace;
  global.licDevRunDowngrade = runDowngrade;
  global.licDevUpdateDiagnostics = refreshDiagnostics;
  global.licDevDataIntegrity = () => {
    if (typeof global.licRunIntegrityCheck === 'function') {
      global.licRunIntegrityCheck();
      return;
    }
    devToast('❌ فحص السلامة غير متاح', 'danger');
  };
  global.licDevCopyDeviceId = async () => {
    if (typeof global.licCopyDeviceId === 'function') {
      await global.licCopyDeviceId();
      devToast('✅ تم نسخ معرف الجهاز', 'success');
      return;
    }
    devToast('❌ نسخ المعرف غير متاح', 'danger');
  };
  global.licDevRegistryHealth = runRegistryHealth;
  global.licDevBundleHealth = runBundleHealth;
  global.licDevCacheStatus = runCacheStatus;
  global.licDevAuditLog = showAuditLog;
  global.licDevRecoveryValidation = runRecoveryValidation;
  global.licDevBackupValidation = runBackupValidation;
  global.licDevDiagnosticsSnapshot = showDiagnosticsSnapshot;
  global.licDevExportRegistry = exportRegistry;
  global.licDevImportRegistry = importRegistry;
  global.licDevBackupRegistry = backupRegistry;
  global.licDevRestoreRegistry = restoreRegistry;
  global.licDevRepairLicense = repairLicense;
  global.licDevToggleSuspend = toggleSuspend;
  global.licSwitchLicensingSub = (sub) => {
    ['activate', 'renew'].forEach(s => {
      const pane = document.getElementById(s === 'activate' ? 'lic-tab-activate' : 'lic-tab-renew');
      if (pane) pane.style.display = s === sub ? '' : 'none';
    });
    document.querySelectorAll('.lic-subtab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sub === sub);
    });
  };

  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
