/**
 * Shared feature picker — same UX as «إصدار كامل — تفعيل كل الإضافية» in license screen.
 */
(function (global) {
  'use strict';

  const CL = global.CommercialLicense || {};

  function reg() { return global.FEATURE_REGISTRY || []; }
  function groups() { return global.FEATURE_PANEL_GROUPS || []; }
  function addonIds() { return global.FEATURE_ADDON_IDS || []; }
  function optInIds() { return global.OPT_IN_FEATURE_IDS || []; }
  function capMeta() { return global.FEATURE_CAPABILITY_META || {}; }

  function pid(prefix, id) { return (prefix || 'fp-') + id; }

  function coreIds() {
    return reg().filter(f => f.tier === 'core').map(f => f.id);
  }

  function mount(container, options) {
    options = options || {};
    if (!container) return null;
    const prefix = options.prefix || 'fp-';
    const fullDefault = options.fullEdition !== false;
    const searchId = pid(prefix, 'search');
    const countId = pid(prefix, 'count');
    const fullId = pid(prefix, 'full');
    const panelId = pid(prefix, 'panel');

    container.innerHTML = `
      <div class="lic-feat-toolbar lic-v2-feat-toolbar">
        <input type="search" class="lic-v2-search" id="${searchId}" placeholder="🔍 بحث في الخصائص...">
        <span id="${countId}" class="lic-feat-count-badge"></span>
      </div>
      <label class="lic-feat-full-row">
        <span style="font-weight:800;color:#e8c96a">إصدار كامل — تفعيل كل الإضافية</span>
        <input type="checkbox" id="${fullId}" ${fullDefault ? 'checked' : ''}>
      </label>
      <div id="${panelId}" class="lic-feat-panel${fullDefault ? ' lic-feat-panel--locked' : ''}"></div>`;

    container.dataset.fpAutoFullLock = fullDefault ? '1' : '0';

    renderPanel(container, prefix, options.initialFeatureIds);
    bindEvents(container, prefix, options.onChange);

    const fullCb = container.querySelector('#' + fullId);
    if (fullCb) toggleFullEdition(container, prefix, fullCb.checked);

    return { prefix, container };
  }

  function renderAddonItem(f, prefix) {
    const star = f.unique ? ' <span class="lic-feat-star" title="ميزة نادرة">⭐</span>' : '';
    const tag = f.tagline ? `<div class="lic-feat-item-tag">${f.tagline}</div>` : '';
    const defaultOn = !optInIds().includes(f.id);
    const optInNote = optInIds().includes(f.id)
      ? ' <span class="lic-feat-optin" title="معطّلة افتراضيًا — تفعيل صريح">🔒</span>' : '';
    const fid = pid(prefix, 'feat-' + f.id);
    return `<label class="lic-feat-item" data-feat-label="${f.label} ${f.tagline || ''}">` +
      `<input type="checkbox" id="${fid}" ${defaultOn ? 'checked' : ''}>` +
      `<div class="lic-feat-item-text"><div class="lic-feat-item-label">${f.label}${star}${optInNote}</div>${tag}</div></label>`;
  }

  function renderPanel(root, prefix, initialFeatureIds) {
    const panel = root.querySelector('#' + pid(prefix, 'panel'));
    if (!panel) return;
    const initialSet = new Set(initialFeatureIds || []);
    let html = '';
    groups().forEach(g => {
      const items = reg()
        .filter(f => f.group === g.id && f.tier === g.tier)
        .sort((a, b) => (a.sort || 0) - (b.sort || 0));
      if (!items.length) return;
      const isCore = g.tier === 'core';
      html += `<div class="lic-feat-card${isCore ? ' lic-feat-card--core' : ' lic-feat-card--collapsed'}" data-feat-group="${g.id}">`;
      html += `<div class="lic-feat-card-head" data-fp-toggle="${g.id}">`;
      html += `<span class="lic-feat-card-chevron" aria-hidden="true">▾</span>`;
      html += `<span class="lic-feat-card-meta" id="${pid(prefix, 'meta-' + g.id)}"></span>`;
      if (!isCore) {
        html += `<div class="lic-feat-card-actions" onclick="event.stopPropagation()">`;
        html += `<button type="button" class="lic-feat-mini-btn" data-fp-group-all="${g.id}">الكل</button>`;
        html += `<button type="button" class="lic-feat-mini-btn" data-fp-group-none="${g.id}">لا شيء</button>`;
        html += `</div>`;
      }
      html += `<span class="lic-feat-card-title">${g.icon} ${g.title}</span></div>`;
      html += `<div class="lic-feat-card-body">`;
      if (isCore) {
        items.forEach(f => {
          const star = f.unique ? ' <span class="lic-feat-star">⭐</span>' : '';
          const tag = f.tagline ? `<div class="lic-feat-item-tag">${f.tagline}</div>` : '';
          html += `<label class="lic-feat-item lic-feat-item--core" data-feat-label="${f.label}">`;
          html += `<input type="checkbox" checked disabled><div class="lic-feat-item-text"><div class="lic-feat-item-label">${f.label}${star}</div>${tag}</div></label>`;
        });
      } else {
        const capOrder = [];
        const byCap = {};
        items.forEach(f => {
          const cap = f.cap || ('_solo_' + f.id);
          if (!byCap[cap]) { byCap[cap] = []; capOrder.push(cap); }
          byCap[cap].push(f);
        });
        capOrder.forEach(cap => {
          const capItems = byCap[cap];
          if (capItems.length === 1 && cap.startsWith('_solo_')) {
            html += renderAddonItem(capItems[0], prefix);
            return;
          }
          const capMetaEntry = capMeta()[cap];
          const capLabel = capMetaEntry?.label || capItems[0].label;
          html += `<div class="lic-feat-cap-block" data-feat-cap="${cap}">`;
          html += `<div class="lic-feat-cap-head"><span class="lic-feat-cap-title">${capLabel}</span>`;
          html += `<div class="lic-feat-card-actions">`;
          html += `<button type="button" class="lic-feat-mini-btn" data-fp-cap-all="${cap}">الكل</button>`;
          html += `<button type="button" class="lic-feat-mini-btn" data-fp-cap-none="${cap}">لا</button>`;
          html += `</div></div><div class="lic-feat-cap-items">`;
          capItems.forEach(f => { html += renderAddonItem(f, prefix); });
          html += `</div></div>`;
        });
      }
      html += `</div></div>`;
    });
    panel.innerHTML = html;

    if (initialFeatureIds?.length) {
      addonIds().forEach(id => {
        const el = panel.querySelector('#' + pid(prefix, 'feat-' + id));
        if (!el) return;
        if (optInIds().includes(id)) el.checked = initialSet.has(id);
        else el.checked = initialSet.has(id) || initialSet.size === 0;
      });
    }
    updateCounts(root, prefix);
  }

  function bindEvents(root, prefix, onChange) {
    const fire = () => { updateCounts(root, prefix); if (typeof onChange === 'function') onChange(collectFeatureIds(root, prefix)); };

    root.querySelector('#' + pid(prefix, 'full'))?.addEventListener('change', e => {
      root.dataset.fpAutoFullLock = e.target.checked ? '1' : '0';
      toggleFullEdition(root, prefix, e.target.checked);
      fire();
    });

    root.querySelector('#' + pid(prefix, 'search'))?.addEventListener('input', e => {
      filterPanel(root, prefix, e.target.value);
    });

    root.querySelectorAll('[data-fp-toggle]').forEach(head => {
      head.addEventListener('click', () => toggleGroupCard(root, head.dataset.fpToggle));
    });

    root.querySelectorAll('[data-fp-group-all]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        setGroupFeatures(root, prefix, btn.dataset.fpGroupAll, true);
        syncFullCheckbox(root, prefix);
        fire();
      });
    });
    root.querySelectorAll('[data-fp-group-none]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        setGroupFeatures(root, prefix, btn.dataset.fpGroupNone, false);
        syncFullCheckbox(root, prefix);
        fire();
      });
    });
    root.querySelectorAll('[data-fp-cap-all]').forEach(btn => {
      btn.addEventListener('click', () => {
        setCapFeatures(root, prefix, btn.dataset.fpCapAll, true);
        syncFullCheckbox(root, prefix);
        fire();
      });
    });
    root.querySelectorAll('[data-fp-cap-none]').forEach(btn => {
      btn.addEventListener('click', () => {
        setCapFeatures(root, prefix, btn.dataset.fpCapNone, false);
        syncFullCheckbox(root, prefix);
        fire();
      });
    });

    root.querySelectorAll('input[type=checkbox][id^="' + prefix + 'feat-"]').forEach(inp => {
      inp.addEventListener('change', () => { syncFullCheckbox(root, prefix); fire(); });
    });
  }

  function toggleFullEdition(root, prefix, isFull) {
    const panel = root.querySelector('#' + pid(prefix, 'panel'));
    if (panel) panel.classList.toggle('lic-feat-panel--locked', !!isFull);
    if (isFull) {
      addonIds().forEach(id => {
        if (optInIds().includes(id)) return;
        const el = root.querySelector('#' + pid(prefix, 'feat-' + id));
        if (el) el.checked = true;
      });
    }
    updateCounts(root, prefix);
  }

  function syncFullCheckbox(root, prefix) {
    const fullCb = root.querySelector('#' + pid(prefix, 'full'));
    if (!fullCb) return;
    const autoLock = root.dataset.fpAutoFullLock === '1';
    const allOn = addonIds().filter(id => !optInIds().includes(id))
      .every(id => root.querySelector('#' + pid(prefix, 'feat-' + id))?.checked !== false);
    if (autoLock) {
      fullCb.checked = allOn;
      const panel = root.querySelector('#' + pid(prefix, 'panel'));
      if (panel) panel.classList.toggle('lic-feat-panel--locked', allOn);
    }
  }

  function toggleGroupCard(root, groupId) {
    const card = root.querySelector(`.lic-feat-card[data-feat-group="${groupId}"]`);
    if (!card) return;
    const willExpand = card.classList.contains('lic-feat-card--collapsed');
    if (willExpand && groupId !== 'core') {
      root.querySelectorAll('.lic-feat-card[data-feat-group]:not([data-feat-group="core"])').forEach(c => {
        if (c !== card) c.classList.add('lic-feat-card--collapsed');
      });
    }
    card.classList.toggle('lic-feat-card--collapsed');
  }

  function setGroupFeatures(root, prefix, groupId, on) {
    reg().filter(f => f.group === groupId && f.tier === 'addon').forEach(f => {
      const el = root.querySelector('#' + pid(prefix, 'feat-' + f.id));
      if (el) el.checked = on;
    });
  }

  function setCapFeatures(root, prefix, capId, on) {
    reg().filter(f => f.cap === capId && f.tier === 'addon').forEach(f => {
      const el = root.querySelector('#' + pid(prefix, 'feat-' + f.id));
      if (el) el.checked = on;
    });
  }

  function filterPanel(root, prefix, query) {
    const q = (query || '').trim().toLowerCase();
    const panel = root.querySelector('#' + pid(prefix, 'panel'));
    if (!panel) return;
    panel.querySelectorAll('.lic-feat-item').forEach(el => {
      const label = (el.getAttribute('data-feat-label') || '').toLowerCase();
      el.classList.toggle('lic-feat-item--hidden', q && !label.includes(q));
    });
    panel.querySelectorAll('.lic-feat-cap-block').forEach(block => {
      const any = block.querySelector('.lic-feat-item:not(.lic-feat-item--hidden)');
      block.style.display = any ? '' : 'none';
    });
    panel.querySelectorAll('.lic-feat-card').forEach(card => {
      const any = card.querySelector('.lic-feat-item:not(.lic-feat-item--hidden)');
      card.style.display = any ? '' : 'none';
      if (any && q) card.classList.remove('lic-feat-card--collapsed');
    });
  }

  function updateCounts(root, prefix) {
    const countEl = root.querySelector('#' + pid(prefix, 'count'));
    if (countEl) {
      const on = addonIds().filter(id =>
        root.querySelector('#' + pid(prefix, 'feat-' + id))?.checked !== false
      ).length;
      countEl.textContent = `${on} / ${addonIds().length} إضافية`;
    }
    groups().filter(g => g.tier === 'addon').forEach(g => {
      const meta = root.querySelector('#' + pid(prefix, 'meta-' + g.id));
      if (!meta) return;
      const ids = reg().filter(f => f.group === g.id && f.tier === 'addon').map(f => f.id);
      const gOn = ids.filter(id => root.querySelector('#' + pid(prefix, 'feat-' + id))?.checked !== false).length;
      meta.textContent = `${gOn}/${ids.length}`;
    });
  }

  function isFullEdition(root, prefix) {
    const fullCb = root.querySelector('#' + pid(prefix, 'full'));
    return fullCb ? fullCb.checked !== false : true;
  }

  function collectFeatureIds(root, prefix) {
    prefix = prefix || 'fp-';
    const ids = [...coreIds()];
    if (isFullEdition(root, prefix)) {
      addonIds().forEach(id => {
        if (optInIds().includes(id)) {
          const el = root.querySelector('#' + pid(prefix, 'feat-' + id));
          if (el?.checked) ids.push(id);
        } else {
          ids.push(id);
        }
      });
    } else {
      addonIds().forEach(id => {
        const el = root.querySelector('#' + pid(prefix, 'feat-' + id));
        if (el?.checked) ids.push(id);
        else if (!optInIds().includes(id) && el?.checked !== false) ids.push(id);
      });
    }
    return [...new Set(ids.filter(Boolean))];
  }

  CL.featurePicker = { mount, collectFeatureIds, isFullEdition, coreIds };
  global.CommercialLicense = CL;
})(typeof window !== 'undefined' ? window : global);
