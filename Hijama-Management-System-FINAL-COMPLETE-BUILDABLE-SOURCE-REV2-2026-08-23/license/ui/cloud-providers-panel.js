/**
 * Developer Panel — Cloud Providers settings (configuration layer only).
 */
(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  function cloudApi() {
    return global.cuppingElectron?.cloudOAuth || global.tadawiElectron?.cloudOAuth || null;
  }

  function isDesktop() {
    return !!(CL.developerPanel?.isDesktop?.() || global.cuppingElectron || global.tadawiElectron);
  }

  function toast(msg, type) {
    if (typeof CL.developerPanel?.devToast === 'function') CL.developerPanel.devToast(msg, type);
    else if (typeof global.notify === 'function') global.notify(msg, type);
  }

  async function loadSettings() {
    const api = cloudApi();
    if (!api?.getSettings) {
      return { enabled: false, clientId: '', projectId: '', scopes: [], redirectUri: 'http://127.0.0.1:42813/oauth/callback', source: 'unavailable' };
    }
    return api.getSettings();
  }

  function renderCloudProvidersSection() {
    return `
      <div class="lic-diag-section-title" style="margin-top:20px">☁️ Cloud Providers</div>
      <div id="lic-cloud-providers-panel" class="lic-cloud-panel" style="background:rgba(0,0,0,.15);border-radius:10px;padding:14px;border:1px solid rgba(255,255,255,.08)">
        <p style="font-size:12px;color:rgba(255,255,255,.6);margin:0 0 12px">إعدادات OAuth — طبقة فوق النظام الحالي. الافتراضي المدمج يُستخدم إن لم تُدخل override.</p>
        <div id="lic-cloud-providers-body"><span style="color:rgba(255,255,255,.5)">جاري التحميل…</span></div>
      </div>`;
  }

  async function refreshCloudProvidersPanel() {
    const body = document.getElementById('lic-cloud-providers-body');
    if (!body) return;
    if (!isDesktop()) {
      body.innerHTML = `<p style="color:#ffd56a;font-size:12px">☁️ Cloud Providers — Electron فقط</p>`;
      return;
    }
    const s = await loadSettings();
    const scopes = (s.scopes || []).join(', ') || 'https://www.googleapis.com/auth/drive.file';
    body.innerHTML = `
      <details open style="margin-bottom:10px">
        <summary style="cursor:pointer;font-weight:700;font-size:13px">Google Drive</summary>
        <div style="margin-top:12px;display:grid;gap:10px">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px">
            <input type="checkbox" id="lic-cloud-g-enabled" ${s.enabled !== false ? 'checked' : ''}> Enable Google Drive Integration
          </label>
          <div class="form-group" style="margin:0">
            <label class="form-label" style="font-size:11px">Client ID</label>
            <input class="form-control" id="lic-cloud-g-client-id" dir="ltr" value="${esc(s.clientId || '')}" placeholder="xxx.apps.googleusercontent.com">
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label" style="font-size:11px">Client Secret</label>
            <div style="display:flex;gap:6px">
              <input class="form-control" id="lic-cloud-g-client-secret" dir="ltr" type="password"
                value="${s.hasSecret ? (s.secretMasked || '••••••••') : ''}" placeholder="GOCSPX-...">
              <button type="button" class="btn btn-ghost btn-sm" onclick="licCloudToggleSecret()">👁</button>
            </div>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label" style="font-size:11px">Project ID</label>
            <input class="form-control" id="lic-cloud-g-project-id" dir="ltr" value="${esc(s.projectId || '')}">
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label" style="font-size:11px">OAuth Scope</label>
            <input class="form-control" id="lic-cloud-g-scopes" dir="ltr" value="${esc(scopes)}" readonly style="opacity:.85">
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label" style="font-size:11px">Redirect URI (Read Only)</label>
            <input class="form-control" dir="ltr" value="${esc(s.redirectUri || 'http://127.0.0.1:42813/oauth/callback')}" readonly style="opacity:.85">
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,.5)">المصدر الحالي: <strong>${esc(s.source || '—')}</strong>${s.hasDeveloperOverride ? ' · override مفعّل' : ' · افتراضي مدمج'}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
            <button type="button" class="btn btn-primary btn-sm" data-electron-only="true" onclick="licCloudSaveSettings()">💾 Save</button>
            <button type="button" class="btn btn-accent btn-sm" data-electron-only="true" onclick="licCloudTestConnection()">🔌 Test Connection</button>
            <button type="button" class="btn btn-ghost btn-sm" data-electron-only="true" onclick="licCloudRestoreDefault()">↩ Restore Default</button>
          </div>
        </div>
      </details>
      <details style="opacity:.5">
        <summary style="cursor:not-allowed;font-size:12px">OneDrive · Dropbox · AWS S3 · Azure · Nextcloud (قريباً)</summary>
      </details>`;
    if (typeof CL.developerPanel?.applyElectronOnlyButtons === 'function') {
      CL.developerPanel.applyElectronOnlyButtons(body);
    }
  }

  function esc(v) {
    return String(v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  global.licCloudToggleSecret = function () {
    const el = document.getElementById('lic-cloud-g-client-secret');
    if (!el) return;
    el.type = el.type === 'password' ? 'text' : 'password';
  };

  global.licCloudSaveSettings = async function () {
    const api = cloudApi();
    if (!api?.saveSettings) { toast('⚠️ Electron API غير متاح', 'warning'); return; }
    const secretVal = document.getElementById('lic-cloud-g-client-secret')?.value || '';
    const payload = {
      enabled: document.getElementById('lic-cloud-g-enabled')?.checked !== false,
      clientId: document.getElementById('lic-cloud-g-client-id')?.value?.trim(),
      projectId: document.getElementById('lic-cloud-g-project-id')?.value?.trim(),
      scopes: (document.getElementById('lic-cloud-g-scopes')?.value || '').split(',').map(s => s.trim()).filter(Boolean)
    };
    if (secretVal && !secretVal.startsWith('••')) payload.clientSecret = secretVal;
    const r = await api.saveSettings(payload);
    toast(r?.ok ? '✅ تم حفظ إعدادات Google Drive' : ('✗ ' + (r?.message || 'فشل')), r?.ok ? 'success' : 'danger');
    await refreshCloudProvidersPanel();
  };

  global.licCloudTestConnection = async function () {
    const api = cloudApi();
    if (!api?.testConnection) { toast('⚠️ Electron API غير متاح', 'warning'); return; }
    const r = await api.testConnection();
    toast(r?.ok ? (r.message || '✅ الاتصال سليم') : ('✗ ' + (r?.message || 'فشل')), r?.ok ? 'success' : 'danger');
  };

  global.licCloudRestoreDefault = async function () {
    if (!confirm('حذف Override والعودة للإعدادات المدمجة؟ (لن تُحذف Tokens أو النسخ الاحتياطية)')) return;
    const api = cloudApi();
    if (!api?.restoreDefaults) { toast('⚠️ Electron API غير متاح', 'warning'); return; }
    const r = await api.restoreDefaults();
    toast(r?.ok ? '✅ تمت استعادة الافتراضي' : ('✗ ' + (r?.message || 'فشل')), r?.ok ? 'success' : 'danger');
    await refreshCloudProvidersPanel();
  };

  CL.cloudProvidersPanel = {
    renderSection: renderCloudProvidersSection,
    refresh: refreshCloudProvidersPanel
  };

  global.licCloudProvidersRefresh = refreshCloudProvidersPanel;
})(typeof window !== 'undefined' ? window : global);
