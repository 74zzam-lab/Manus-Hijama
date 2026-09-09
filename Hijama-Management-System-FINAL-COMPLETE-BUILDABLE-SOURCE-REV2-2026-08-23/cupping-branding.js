/**
 * Cupping Branding Engine — runtime UI binding for About and shared APP_META.
 * Config source: branding.config.json (single source of truth).
 */
(function (global) {
  'use strict';

  const DEFAULT_CONFIG = {
    company: { name: 'NajjarTech', tagline: 'Software Solutions', website: 'https://najjartech.com', websiteDisplay: 'www.najjartech.com', supportEmail: 'support@najjartech.com', copyright: '© 2026 NajjarTech. All rights reserved.' },
    product: { name: 'Hijama Management System', nameAr: 'نظام إدارة الحجامة', description: '', descriptionAr: '', dbSchemaVersion: 3 },
    assets: {
      companyLogo: 'assets/NajjarTech-Logo.png',
      centerLogo: 'branding/Center-Logo.png',
      logo: 'assets/NajjarTech-Logo.png',
      logoAlt: 'NajjarTech',
    },
    ui: { showPublicContact: false },
  };

  let _config = null;
  let _runtime = null;
  let _logoNatural = { width: 511, height: 682 };

  async function loadConfig() {
    try {
      const res = await fetch('branding.config.json', { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (_) {}
    return DEFAULT_CONFIG;
  }

  async function loadRuntime() {
    const base = {
      environment: 'Web',
      appVersion: '2.0.0',
      buildVersion: '2.0.0',
      electron: '—',
      chromium: '—',
      node: '—',
    };
    try {
      if (global.cuppingElectron?.app?.getRuntimeInfo) {
        return { ...base, ...(await global.cuppingElectron.app.getRuntimeInfo()) };
      }
    } catch (_) {}
    if (global.navigator?.userAgent) {
      const m = /Chrome\/([\d.]+)/.exec(global.navigator.userAgent);
      if (m) base.chromium = m[1];
    }
    return base;
  }

  function getCenterBrandLogo(settings) {
    const s = settings || global.settings || {};
    const custom = (s.brandLogo || '').trim();
    if (custom) return custom;
    const cfg = _config || DEFAULT_CONFIG;
    return (cfg.assets && cfg.assets.centerLogo) || 'branding/Center-Logo.png';
  }

  function buildAppMeta(config, runtime) {
    const c = config.company || {};
    const p = config.product || {};
    const r = runtime || {};
    const version = r.appVersion || '2.0.0';
    const companyLogo = (config.assets && (config.assets.companyLogo || config.assets.logo)) || 'assets/NajjarTech-Logo.png';
    const centerLogo = (config.assets && config.assets.centerLogo) || 'branding/Center-Logo.png';
    return {
      productName: p.name,
      productNameAr: p.nameAr,
      company: c.name,
      companyTagline: c.tagline,
      version,
      buildVersion: r.buildVersion || version,
      dbSchemaVersion: r.dbSchemaVersion ?? p.dbSchemaVersion ?? 3,
      copyright: c.copyright,
      supportEmail: c.supportEmail,
      website: c.website,
      websiteDisplay: c.websiteDisplay || c.website,
      showPublicContact: !!(config.ui && config.ui.showPublicContact),
      description: p.description,
      descriptionAr: p.descriptionAr,
      logo: companyLogo,
      centerLogo,
      logoAlt: (config.assets && config.assets.logoAlt) || c.name,
      logoMaxWidth: _logoNatural.width,
      logoMaxHeight: _logoNatural.height,
    };
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el && val != null) el.textContent = val;
  }

  function applyLogoElement(meta) {
    const img = document.getElementById('about-brand-logo');
    if (!img) return;
    img.src = meta.logo;
    img.alt = meta.logoAlt;
    if (_logoNatural.width) img.width = _logoNatural.width;
    if (_logoNatural.height) img.height = _logoNatural.height;
    img.style.maxWidth = _logoNatural.width ? `min(200px, ${_logoNatural.width}px)` : 'min(200px, 68vw)';
  }

  function applyAboutPanel(meta, runtime) {
    setText('about-company-name', meta.company);
    setText('about-company-tagline', meta.companyTagline);
    setText('about-product-name', meta.productName);
    setText('about-product-desc', meta.descriptionAr || meta.description);
    setText('about-app-name', meta.productName);
    setText('about-version', meta.version);
    setText('about-db-version', String(meta.dbSchemaVersion));
    setText('about-build-version', meta.buildVersion);
    setText('about-copyright', meta.copyright);
    setText('about-runtime-env', runtime.environment || '—');
    setText('about-runtime-electron', runtime.electron || '—');
    setText('about-runtime-chromium', runtime.chromium || '—');
    setText('about-runtime-node', runtime.node || '—');
    applyLogoElement(meta);

    const emailEl = document.getElementById('about-support-email');
    const webEl = document.getElementById('about-website-link');
    if (emailEl) {
      emailEl.href = 'mailto:' + meta.supportEmail;
      emailEl.textContent = meta.supportEmail;
    }
    if (webEl) {
      webEl.href = meta.website;
      webEl.textContent = meta.websiteDisplay || meta.website.replace(/^https?:\/\//, '');
    }
    document.querySelectorAll('.about-contact-row').forEach((el) => {
      el.style.display = meta.showPublicContact ? '' : 'none';
    });
  }

  function syncGlobalAppMeta(meta) {
    if (!global.APP_META) global.APP_META = {};
    Object.assign(global.APP_META, meta);
  }

  async function probeLogoNaturalSize(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 511, height: 682 });
      img.src = src;
    });
  }

  const BrandingEngine = {
    get config() { return _config; },
    get runtime() { return _runtime; },
    get meta() { return buildAppMeta(_config || DEFAULT_CONFIG, _runtime); },

    getCenterBrandLogo,

    async init() {
      _config = await loadConfig();
      _runtime = await loadRuntime();
      const meta = buildAppMeta(_config, _runtime);
      _logoNatural = await probeLogoNaturalSize(meta.logo);
      meta.logoMaxWidth = _logoNatural.width;
      meta.logoMaxHeight = _logoNatural.height;
      syncGlobalAppMeta(meta);
      applyAboutPanel(meta, _runtime);
      return meta;
    },

    applyAboutPanel() {
      applyAboutPanel(this.meta, _runtime || {});
    },

    refreshRuntime() {
      return loadRuntime().then((r) => {
        _runtime = r;
        syncGlobalAppMeta(buildAppMeta(_config || DEFAULT_CONFIG, _runtime));
        applyAboutPanel(this.meta, _runtime);
        return _runtime;
      });
    },
  };

  global.BrandingEngine = BrandingEngine;
  global.getCenterBrandLogo = getCenterBrandLogo;
  global.applyAboutPanel = () => BrandingEngine.applyAboutPanel();

  document.addEventListener('DOMContentLoaded', () => {
    BrandingEngine.init().catch(() => {
      syncGlobalAppMeta(buildAppMeta(DEFAULT_CONFIG, {}));
      applyAboutPanel(buildAppMeta(DEFAULT_CONFIG, {}), {});
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
