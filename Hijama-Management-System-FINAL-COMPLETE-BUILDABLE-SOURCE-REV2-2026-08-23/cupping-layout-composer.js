/**
 * مركز الحجامة — محرر القالب المرئي (سحب حر · أحجية · تصدير صورة)
 */
(function (global) {
  'use strict';

  const MAP_IDS = ['head', 'back', 'front', 'limbs'];
  const MAP_TITLES = { head: 'الرأس', back: 'الظهر', front: 'الأمام', limbs: 'الأطراف' };
  const MIN_LAYER = 4;
  const POS_MIN = -120;
  const POS_MAX = 220;
  const SIZE_MAX = 240;

  const DEFAULT_LAYERS_FULL = {
    front: { visible: true, x: 1, y: 10, w: 48, h: 86, z: 1, fit: 'contain', scale: 100 },
    back: { visible: true, x: 51, y: 10, w: 48, h: 86, z: 2, fit: 'contain', scale: 100 },
    head: { visible: true, x: 28, y: 1, w: 44, h: 34, z: 4, fit: 'contain', scale: 100 },
    limbs: { visible: true, x: 15, y: 55, w: 70, h: 42, z: 3, fit: 'contain', scale: 100 }
  };

  const DEFAULT_LAYERS_MINI = {
    back: { visible: true, x: 51, y: 1, w: 48, h: 48, z: 1, fit: 'contain', scale: 100 },
    head: { visible: true, x: 1, y: 1, w: 48, h: 48, z: 2, fit: 'contain', scale: 100 },
    limbs: { visible: true, x: 51, y: 51, w: 48, h: 48, z: 3, fit: 'contain', scale: 100 },
    front: { visible: true, x: 1, y: 51, w: 48, h: 48, z: 4, fit: 'contain', scale: 100 }
  };

  let _lcDrag = null;
  const _imgCache = {};

  function cloneLayers(src) {
    return JSON.parse(JSON.stringify(src));
  }

  function getDefaultLayers(which) {
    return cloneLayers(which === 'mini' ? DEFAULT_LAYERS_MINI : DEFAULT_LAYERS_FULL);
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function clampFree(n, min, max) {
    return round1(Math.max(min, Math.min(max, n)));
  }

  function ensureFreeTemplate(template) {
    template = template || {};
    ['mini', 'full'].forEach(key => {
      if (!template[key]) template[key] = {};
      const sec = template[key];
      if (!sec.layers || !Object.keys(sec.layers).length) {
        sec.mode = 'free';
        sec.layers = getDefaultLayers(key);
      } else {
        sec.mode = sec.mode || 'free';
        MAP_IDS.forEach(id => {
          if (!sec.layers[id]) sec.layers[id] = { ...getDefaultLayers(key)[id] };
          const L = sec.layers[id];
          if (L.visible == null) L.visible = true;
          if (L.fit == null) L.fit = 'contain';
          if (L.scale == null) L.scale = 100;
          if (L.z == null) L.z = MAP_IDS.indexOf(id) + 1;
        });
      }
      if (sec.puzzle == null) sec.puzzle = true;
    });
    return template;
  }

  function getEditorState() {
    return typeof global.getMapEditorState === 'function' ? global.getMapEditorState() : null;
  }

  function mapImageSrc(st, id) {
    const raw = st?.maps?.[id]?.image || global.CUPPING_MAPS?.[id]?.image || '';
    return typeof global.resolveAssetUrl === 'function' ? global.resolveAssetUrl(raw) : raw;
  }

  function layerStyle(L) {
    const sc = (L.scale || 100) / 100;
    const fit = L.fit === 'cover' ? 'cover' : 'contain';
    return `left:${L.x}%;top:${L.y}%;width:${L.w}%;height:${L.h}%;z-index:${L.z || 1};--lc-scale:${sc};--lc-fit:${fit}`;
  }

  function maxLayerZ(layers) {
    return MAP_IDS.reduce((m, id) => Math.max(m, layers[id]?.z || 0), 0);
  }

  function bringLayerToFront(sec, id) {
    const L = sec.layers[id];
    if (!L) return;
    L.z = maxLayerZ(sec.layers) + 1;
  }

  function renderLayerHtml(st, id, L, selected, interactive) {
    const src = mapImageSrc(st, id);
    const sel = selected ? ' lc-layer--sel' : '';
    const hid = L.visible === false ? ' lc-layer--hidden' : '';
    const handles = interactive ? `
      <span class="lc-handle lc-handle-nw" data-h="nw"></span>
      <span class="lc-handle lc-handle-ne" data-h="ne"></span>
      <span class="lc-handle lc-handle-sw" data-h="sw"></span>
      <span class="lc-handle lc-handle-se" data-h="se"></span>
      <span class="lc-handle lc-handle-n" data-h="n"></span>
      <span class="lc-handle lc-handle-s" data-h="s"></span>
      <span class="lc-handle lc-handle-e" data-h="e"></span>
      <span class="lc-handle lc-handle-w" data-h="w"></span>` : '';
    return `<div class="lc-layer${sel}${hid}" data-layer-id="${id}" style="${layerStyle(L)}">
      <div class="lc-layer-lbl">${MAP_TITLES[id]}</div>
      <div class="lc-layer-imgwrap">
        <img class="lc-layer-img" src="${src}" alt="${MAP_TITLES[id]}" draggable="false">
      </div>
      ${handles}
    </div>`;
  }

  function sortedLayerIds(layers) {
    return MAP_IDS.slice().sort((a, b) => (layers[a]?.z || 0) - (layers[b]?.z || 0));
  }

  function getStageZoom(st) {
    const z = st?.layoutZoom;
    return (typeof z === 'number' && z > 0) ? z : 1;
  }

  function renderLayoutComposer() {
    const host = document.getElementById('me-layout-composer');
    if (!host) return;
    const st = getEditorState();
    if (!st) return;
    if (!st.template) st.template = ensureFreeTemplate({});
    else st.template = ensureFreeTemplate(st.template);
    if (st.layoutZoom == null) st.layoutZoom = 1;

    const which = st.layoutWhich || 'full';
    const sec = st.template[which];
    const selId = st.layoutSelected || 'back';
    const L = sec.layers[selId];
    const zoom = getStageZoom(st);

    host.innerHTML = `
      <div class="lc-head">
        <div>
          <div class="form-label" style="font-weight:800;margin:0">🧩 محرر القالب الحر (أحجية)</div>
          <p class="lc-hint">اسحب أي صورة لأي مكان · تداخل وترتيب حر · عجلة الماوس = تكبير اللوحة · ثم احفظ الترتيب أو صدّر PNG</p>
        </div>
        <div class="lc-head-actions">
          <div class="lc-head-tabs">
            <button type="button" class="cup-map-tab${which === 'mini' ? ' cup-map-tab--active' : ''}" data-lc-which="mini">مصغّر (شريط القص)</button>
            <button type="button" class="cup-map-tab${which === 'full' ? ' cup-map-tab--active' : ''}" data-lc-which="full">كبير (الوجه الثاني)</button>
          </div>
          <div class="lc-head-btns">
            <button type="button" class="btn btn-ghost btn-sm" id="lc-zoom-out" title="تصغير اللوحة">🔍−</button>
            <span class="lc-zoom-lbl" id="lc-zoom-lbl">${Math.round(zoom * 100)}%</span>
            <button type="button" class="btn btn-ghost btn-sm" id="lc-zoom-in" title="تكبير اللوحة">🔍+</button>
            <button type="button" class="btn btn-accent btn-sm" id="lc-export-png">📥 تصدير PNG</button>
            <button type="button" class="btn btn-primary btn-sm" id="lc-save-layout">💾 حفظ الترتيب والصورة</button>
          </div>
        </div>
      </div>
      <div class="lc-body">
        <aside class="lc-aside" id="lc-aside"></aside>
        <div class="lc-main">
          <div class="lc-toolbar" id="lc-toolbar"></div>
          <div class="lc-stage-scroll" id="lc-stage-scroll">
            <div class="lc-stage${which === 'mini' ? ' lc-stage--mini' : ''}" id="lc-stage" style="transform:scale(${zoom});transform-origin:top center">
              <div class="lc-print-zone" title="منطقة الطباعة المرجعية"></div>
              <div class="lc-layers-root" id="lc-layers-root">
                ${sortedLayerIds(sec.layers).map(id => renderLayerHtml(st, id, sec.layers[id], id === selId, true)).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>`;

    renderLayerAside(sec, selId);
    renderLayerToolbar(sec, selId, L);
    mountStageInteractions(sec, which);
    mountStageZoom(st);

    host.querySelectorAll('[data-lc-which]').forEach(btn => {
      btn.addEventListener('click', () => {
        st.layoutWhich = btn.getAttribute('data-lc-which');
        renderLayoutComposer();
      });
    });

    host.querySelector('#lc-export-png')?.addEventListener('click', () => {
      exportLayoutComposerImage(which, false);
    });
    host.querySelector('#lc-save-layout')?.addEventListener('click', () => {
      saveLayoutComposer(which);
    });
  }

  function mountStageZoom(st) {
    const scroll = document.getElementById('lc-stage-scroll');
    if (!scroll) return;
    scroll.addEventListener('wheel', (ev) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      const delta = ev.deltaY > 0 ? -0.08 : 0.08;
      st.layoutZoom = clampFree(getStageZoom(st) + delta, 0.4, 2.5);
      const lbl = document.getElementById('lc-zoom-lbl');
      const stage = document.getElementById('lc-stage');
      if (lbl) lbl.textContent = Math.round(st.layoutZoom * 100) + '%';
      if (stage) stage.style.transform = `scale(${st.layoutZoom})`;
    }, { passive: false });

    document.getElementById('lc-zoom-in')?.addEventListener('click', () => {
      st.layoutZoom = clampFree(getStageZoom(st) + 0.1, 0.4, 2.5);
      renderLayoutComposer();
    });
    document.getElementById('lc-zoom-out')?.addEventListener('click', () => {
      st.layoutZoom = clampFree(getStageZoom(st) - 0.1, 0.4, 2.5);
      renderLayoutComposer();
    });
  }

  function renderLayerAside(sec, selId) {
    const aside = document.getElementById('lc-aside');
    if (!aside) return;
    aside.innerHTML = `
      <div class="lc-aside-title">القطع (اسحب بحرية)</div>
      ${MAP_IDS.map(id => {
        const L = sec.layers[id];
        const on = L.visible !== false;
        return `<div class="lc-layer-btn${id === selId ? ' active' : ''}${on ? '' : ' off'}" data-lc-pick="${id}">
          <button type="button" class="lc-eye-btn" data-lc-vis="${id}" title="إظهار/إخفاء">${on ? '👁' : '🚫'}</button>
          <span class="lc-layer-name">${MAP_TITLES[id]}</span>
        </div>`;
      }).join('')}
      <button type="button" class="btn btn-ghost btn-sm" id="lc-fit-print" style="margin-top:8px;width:100%">📐 ملاءمة منطقة الطباعة</button>
      <label class="btn btn-ghost btn-sm" style="margin-top:4px;cursor:pointer;width:100%;text-align:center">
        📷 استبدال صورة القطعة
        <input type="file" accept="image/png,image/webp,image/jpeg" style="display:none" id="lc-upload">
      </label>`;

    aside.querySelectorAll('[data-lc-pick]').forEach(row => {
      row.addEventListener('click', (ev) => {
        if (ev.target.closest('.lc-eye-btn')) return;
        const st = getEditorState();
        const id = row.getAttribute('data-lc-pick');
        if (st) st.layoutSelected = id;
        renderLayoutComposer();
      });
    });
    aside.querySelectorAll('[data-lc-vis]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.getAttribute('data-lc-vis');
        const L = sec.layers[id];
        L.visible = L.visible === false;
        renderLayoutComposer();
      });
    });
    aside.querySelector('#lc-fit-print')?.addEventListener('click', () => {
      fitLayersToPrintZone(sec);
      renderLayoutComposer();
    });
    aside.querySelector('#lc-upload')?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      const st = getEditorState();
      if (f && st && typeof global.uploadMapImageForEditor === 'function') {
        global.uploadMapImageForEditor(st.layoutSelected || selId, f, () => renderLayoutComposer());
      }
      e.target.value = '';
    });
  }

  function fitLayersToPrintZone(sec) {
    MAP_IDS.forEach(id => {
      const L = sec.layers[id];
      if (!L || L.visible === false) return;
      L.x = clampFree(L.x, 0, 100 - L.w);
      L.y = clampFree(L.y, 0, 100 - L.h);
    });
  }

  function renderLayerToolbar(sec, selId, L) {
    const bar = document.getElementById('lc-toolbar');
    if (!bar || !L) return;
    bar.innerHTML = `
      <span class="lc-tb-title">${MAP_TITLES[selId]}</span>
      <label class="lc-tb-chk"><input type="checkbox" id="lc-vis" ${L.visible !== false ? 'checked' : ''}> إظهار</label>
      <label class="lc-tb-lbl">تكبير الصورة
        <input type="range" id="lc-scale" min="20" max="300" value="${L.scale || 100}">
        <span id="lc-scale-val">${L.scale || 100}%</span>
      </label>
      <select class="form-control lc-tb-fit" id="lc-fit">
        <option value="contain" ${L.fit !== 'cover' ? 'selected' : ''}>ملائمة (Contain)</option>
        <option value="cover" ${L.fit === 'cover' ? 'selected' : ''}>قص/ملء (Cover)</option>
      </select>
      <button type="button" class="btn btn-ghost btn-sm" id="lc-z-up" title="للأمام">⬆ للأمام</button>
      <button type="button" class="btn btn-ghost btn-sm" id="lc-z-down" title="للخلف">⬇ للخلف</button>
      <button type="button" class="btn btn-ghost btn-sm" id="lc-reset">↩ موضع افتراضي</button>`;

    bar.querySelector('#lc-vis')?.addEventListener('change', (e) => {
      L.visible = e.target.checked;
      renderLayoutComposer();
    });
    bar.querySelector('#lc-scale')?.addEventListener('input', (e) => {
      L.scale = parseInt(e.target.value, 10) || 100;
      const v = document.getElementById('lc-scale-val');
      if (v) v.textContent = L.scale + '%';
      const el = document.querySelector(`.lc-layer[data-layer-id="${selId}"]`);
      if (el) el.style.setProperty('--lc-scale', L.scale / 100);
    });
    bar.querySelector('#lc-fit')?.addEventListener('change', (e) => {
      L.fit = e.target.value;
      renderLayoutComposer();
    });
    bar.querySelector('#lc-z-up')?.addEventListener('click', () => {
      bringLayerToFront(sec, selId);
      renderLayoutComposer();
    });
    bar.querySelector('#lc-z-down')?.addEventListener('click', () => {
      L.z = Math.max(1, (L.z || 1) - 1);
      renderLayoutComposer();
    });
    bar.querySelector('#lc-reset')?.addEventListener('click', () => {
      const which = getEditorState()?.layoutWhich || 'full';
      const def = getDefaultLayers(which)[selId];
      Object.assign(L, def);
      renderLayoutComposer();
    });
  }

  function mountStageInteractions(sec, which) {
    const stage = document.getElementById('lc-stage');
    if (!stage) return;
    const st = getEditorState();

    stage.querySelectorAll('.lc-layer').forEach(layerEl => {
      const id = layerEl.getAttribute('data-layer-id');
      const L = sec.layers[id];

      layerEl.addEventListener('mousedown', (ev) => {
        if (ev.target.closest('.lc-handle')) return;
        ev.preventDefault();
        if (st) {
          st.layoutSelected = id;
          bringLayerToFront(sec, id);
        }
        stage.querySelectorAll('.lc-layer').forEach(el => el.classList.toggle('lc-layer--sel', el === layerEl));
        renderLayerToolbar(sec, id, L);
        const rect = stage.getBoundingClientRect();
        const zoom = getStageZoom(st);
        _lcDrag = { type: 'move', id, startX: ev.clientX, startY: ev.clientY, ox: L.x, oy: L.y, rect, zoom };
        const onMove = onDragMove(sec, stage);
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          _lcDrag = null;
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      layerEl.querySelectorAll('.lc-handle').forEach(h => {
        h.addEventListener('mousedown', (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          if (st) {
            st.layoutSelected = id;
            bringLayerToFront(sec, id);
          }
          const rect = stage.getBoundingClientRect();
          const zoom = getStageZoom(st);
          _lcDrag = {
            type: 'resize', id, handle: h.getAttribute('data-h'),
            startX: ev.clientX, startY: ev.clientY,
            ox: L.x, oy: L.y, ow: L.w, oh: L.h, rect, zoom
          };
          const onMove = onDragMove(sec, stage);
          const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            _lcDrag = null;
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      });
    });
  }

  function onDragMove(sec, stage) {
    return (ev) => {
      if (!_lcDrag) return;
      const L = sec.layers[_lcDrag.id];
      if (!L) return;
      const zoom = _lcDrag.zoom || 1;
      const dx = ((ev.clientX - _lcDrag.startX) / (_lcDrag.rect.width / zoom)) * 100;
      const dy = ((ev.clientY - _lcDrag.startY) / (_lcDrag.rect.height / zoom)) * 100;

      if (_lcDrag.type === 'move') {
        L.x = clampFree(_lcDrag.ox + dx, POS_MIN, POS_MAX);
        L.y = clampFree(_lcDrag.oy + dy, POS_MIN, POS_MAX);
      } else {
        const h = _lcDrag.handle;
        let x = _lcDrag.ox, y = _lcDrag.oy, w = _lcDrag.ow, hgt = _lcDrag.oh;
        if (h.includes('e')) w = Math.max(MIN_LAYER, _lcDrag.ow + dx);
        if (h.includes('w')) { w = Math.max(MIN_LAYER, _lcDrag.ow - dx); x = _lcDrag.ox + dx; }
        if (h.includes('s')) hgt = Math.max(MIN_LAYER, _lcDrag.oh + dy);
        if (h.includes('n')) { hgt = Math.max(MIN_LAYER, _lcDrag.oh - dy); y = _lcDrag.oy + dy; }
        L.x = clampFree(x, POS_MIN, POS_MAX);
        L.y = clampFree(y, POS_MIN, POS_MAX);
        L.w = clampFree(w, MIN_LAYER, SIZE_MAX);
        L.h = clampFree(hgt, MIN_LAYER, SIZE_MAX);
      }
      const el = stage.querySelector(`.lc-layer[data-layer-id="${_lcDrag.id}"]`);
      if (el) {
        const parts = layerStyle(L).split(';').filter(Boolean);
        el.style.cssText = parts.join(';');
      }
    };
  }

  function loadImage(src) {
    if (!src) return Promise.reject(new Error('no src'));
    if (_imgCache[src]) return Promise.resolve(_imgCache[src]);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { _imgCache[src] = img; resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  function drawLayerOnCanvas(ctx, img, L, boxW, boxH, includeLabel) {
    const x = (L.x / 100) * boxW;
    const y = (L.y / 100) * boxH;
    const lw = (L.w / 100) * boxW;
    const lh = (L.h / 100) * boxH;
    const sc = (L.scale || 100) / 100;
    const fit = L.fit === 'cover' ? 'cover' : 'contain';

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, lw, lh);
    ctx.clip();

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    let dw, dh, dx, dy;
    const boxRatio = lw / lh;
    const imgRatio = iw / ih;

    if (fit === 'cover') {
      if (imgRatio > boxRatio) {
        dh = lh * sc;
        dw = dh * imgRatio;
      } else {
        dw = lw * sc;
        dh = dw / imgRatio;
      }
    } else {
      if (imgRatio > boxRatio) {
        dw = lw * sc;
        dh = dw / imgRatio;
      } else {
        dh = lh * sc;
        dw = dh * imgRatio;
      }
    }
    dx = x + (lw - dw) / 2;
    dy = y + (lh - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);

    if (includeLabel) {
      const lbl = MAP_TITLES[L._mapId] || '';
      ctx.fillStyle = 'rgba(26,74,58,.88)';
      ctx.fillRect(x, y, lw, Math.min(14, lh * 0.12));
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px Arial,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(lbl, x + lw / 2, y + 10);
    }
    ctx.restore();
  }

  async function composeLayoutToCanvas(which, opts) {
    opts = opts || {};
    const st = getEditorState();
    if (!st?.template?.[which]) throw new Error('no template');
    const sec = st.template[which];
    const layers = sec.layers || getDefaultLayers(which);
    const exportW = opts.width || 1600;
    const exportH = opts.height || (which === 'mini' ? 420 : 1100);
    const canvas = document.createElement('canvas');
    canvas.width = exportW;
    canvas.height = exportH;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, exportW, exportH);

    for (const id of sortedLayerIds(layers)) {
      const L = layers[id];
      if (L.visible === false) continue;
      const src = mapImageSrc(st, id);
      try {
        const img = await loadImage(src);
        const layer = { ...L, _mapId: id };
        drawLayerOnCanvas(ctx, img, layer, exportW, exportH, opts.labels !== false);
      } catch (e) {
        console.warn('layer skip', id, e);
      }
    }
    return canvas;
  }

  function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }

  async function exportLayoutComposerImage(which, saveOnly) {
    const st = getEditorState();
    if (!st) return null;
    try {
      const canvas = await composeLayoutToCanvas(which, { labels: true });
      const dataUrl = canvas.toDataURL('image/png');
      if (!saveOnly) {
        downloadDataUrl(dataUrl, `cupping-layout-${which}-${Date.now()}.png`);
        global.notify?.('📥 تم تصدير صورة القالب', 'success');
      }
      return dataUrl;
    } catch (e) {
      console.error(e);
      global.notify?.('تعذّر تصدير الصورة', 'danger');
      return null;
    }
  }

  async function saveLayoutComposer(which) {
    const st = getEditorState();
    if (!st) return;
    which = which || st.layoutWhich || 'full';
    const sec = st.template[which];
    sec.mode = 'free';
    sec.puzzle = true;
    sec.updatedAt = new Date().toISOString();

    global.notify?.('⏳ جاري حفظ ترتيب الأحجية…', 'info');
    if (sec.composedImage) delete sec.composedImage;

    if (typeof global.saveCuppingAtlasEditor === 'function') {
      global.saveCuppingAtlasEditor({ silent: true });
    } else if (global.settings) {
      global.settings.cuppingAtlas = global.buildAtlasConfigFromEditor?.() || { template: st.template };
      global.DB?.set('settings', global.settings);
    }
    global.notify?.('✅ تم حفظ ترتيب الأحجية — الطباعة تستخدم الخرائط الأربع فقط', 'success');
  }

  function renderFreeformPrintHtml(which, mini, st, printOpts) {
    printOpts = printOpts || {};
    const hideLabels = !!printOpts.hideLabels;
    const sec = typeof global.getCuppingTemplateLayout === 'function'
      ? global.getCuppingTemplateLayout()[which]
      : { layers: getDefaultLayers(which), mode: 'free' };
    const layers = sec.layers || getDefaultLayers(which);
    const wrapCls = mini ? 'cf-mini-maps cf-map-freeform' : 'cf-full-maps cf-map-freeform';
    const bg = 'background:transparent';

    const lblCls = mini ? 'cf-mini-lbl' : 'cf-map-lbl';
    const cells = sortedLayerIds(layers)
      .filter(id => layers[id]?.visible !== false)
      .map(id => {
        const L = layers[id];
        const t = global.CUPPING_MAPS?.[id]?.title || MAP_TITLES[id];
        const fit = L.fit === 'cover' ? 'cover' : 'contain';
        const sc = (L.scale || 100) / 100;
        const mapFn = global.renderImageMap;
        const mapHtml = typeof mapFn === 'function'
          ? mapFn(id, {
            mini,
            legend: false,
            showLabels: printOpts.interactive ? true : (!hideLabels && !printOpts.pointDots),
            quiet: false,
            pointDots: !!printOpts.pointDots,
            sessionPoints: printOpts.sessionPoints,
            savedPoints: printOpts.savedPoints,
            interactive: !!printOpts.interactive,
            selected: printOpts.selected,
            outlineSelection: !!printOpts.outlineSelection
          })
          : '';
        const lbl = hideLabels ? '' : `<div class="${lblCls}">${t}</div>`;
        return `<div class="cf-free-map" style="left:${L.x}%;top:${L.y}%;width:${L.w}%;height:${L.h}%;z-index:${L.z || 1}">
          ${lbl}
          <div class="cf-free-map-inner" style="transform:scale(${sc});transform-origin:center center">
            <div class="cf-free-fit cf-free-fit--${fit}">${mapHtml}</div>
          </div>
        </div>`;
      }).join('');
    return `<div class="${wrapCls}" style="${bg}">${cells}</div>`;
  }

  function setMapEditorMode(mode) {
    const st = getEditorState();
    if (st) st.editorMode = mode;
    const pts = document.getElementById('me-mode-points');
    const lay = document.getElementById('me-mode-layout');
    const db = document.getElementById('me-mode-database');
    if (pts) pts.style.display = (mode === 'layout' || mode === 'database') ? 'none' : '';
    if (lay) lay.style.display = mode === 'layout' ? '' : 'none';
    if (db) db.style.display = mode === 'database' ? '' : 'none';
    document.querySelectorAll('#me-tabs .me-tab-map').forEach(b => {
      b.classList.toggle('cup-map-tab--active', mode === 'points' && b.getAttribute('data-map-tab') === st?.currentMap);
    });
    const layoutBtn = document.getElementById('me-tab-layout');
    if (layoutBtn) layoutBtn.classList.toggle('cup-map-tab--active', mode === 'layout');
    const dbBtn = document.getElementById('me-tab-database');
    if (dbBtn) dbBtn.classList.toggle('cup-map-tab--active', mode === 'database');
    if (mode === 'layout') renderLayoutComposer();
    if (mode === 'database' && typeof global.renderMapEditorDatabase === 'function') global.renderMapEditorDatabase();
  }

  global.ensureFreeCuppingTemplate = ensureFreeTemplate;
  global.getDefaultLayoutLayers = getDefaultLayers;
  global.renderLayoutComposer = renderLayoutComposer;
  global.renderFreeformPrintHtml = renderFreeformPrintHtml;
  global.setMapEditorMode = setMapEditorMode;
  global.exportLayoutComposerImage = exportLayoutComposerImage;
  global.saveLayoutComposer = saveLayoutComposer;
  global.DEFAULT_LAYERS_FULL = DEFAULT_LAYERS_FULL;
  global.DEFAULT_LAYERS_MINI = DEFAULT_LAYERS_MINI;

})(typeof window !== 'undefined' ? window : globalThis);
