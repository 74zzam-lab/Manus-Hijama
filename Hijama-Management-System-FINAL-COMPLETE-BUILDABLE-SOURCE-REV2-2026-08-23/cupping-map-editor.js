/**
 * مركز الحجامة — محرر خرائط الحجامة (رفع صور + نقاط يدوية + حفظ)
 */
(function (global) {
  'use strict';

  const MAP_IDS = ['head', 'back', 'front', 'limbs'];
  const MAP_TITLES = { head: 'الرأس', back: 'الظهر', front: 'الأمام', limbs: 'الأطراف' };

  let _editor = null;
  let _drag = null;
  let _searchTimer = null;
  let _dbSearchTimer = null;
  let _ptNumTimer = null;
  let _dbNumTimer = null;

  function uid() {
    return 'pt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function defaultTemplate() {
    if (typeof global.ensureFreeCuppingTemplate === 'function') {
      return global.ensureFreeCuppingTemplate(
        typeof global.getDefaultCuppingTemplate === 'function'
          ? global.getDefaultCuppingTemplate()
          : null
      );
    }
    return typeof global.getDefaultCuppingTemplate === 'function'
      ? global.getDefaultCuppingTemplate()
      : {
        mini: { mode: 'free', layers: global.DEFAULT_LAYERS_MINI || {}, visible: { head: true, back: true, front: true, limbs: true }, order: ['back', 'head', 'limbs', 'front'], slots: {} },
        full: { mode: 'free', layers: global.DEFAULT_LAYERS_FULL || {}, visible: { head: true, back: true, front: true, limbs: true }, order: ['back', 'head', 'limbs', 'front'], slots: {} }
      };
  }

  function cloneDefaultConfig() {
    const maps = typeof global.getDefaultAtlasMaps === 'function'
      ? global.getDefaultAtlasMaps()
      : MAP_IDS.reduce((acc, id) => {
          const m = global.CUPPING_MAPS?.[id];
          if (!m) return acc;
          acc[id] = { image: m.image, aspect: m.aspect || '1' };
          return acc;
        }, {});
    const points = [];
    MAP_IDS.forEach(id => {
      const m = global.CUPPING_MAPS?.[id];
      if (!m) return;
      (m.points || []).forEach(pt => {
        points.push({
          id: uid(),
          map: id,
          n: pt.n,
          xp: pt.xp,
          yp: pt.yp,
          color: pt.color || pt.g || 'o',
          side: pt.side || null,
          label: pt.label || (pt.side ? `${pt.n}/${pt.side}` : String(pt.n))
        });
      });
    });
    return { maps, points, pointMeta: {}, pointDb: {}, template: defaultTemplate() };
  }

  function loadEditorFromSettings() {
    let s = global.settings?.cuppingAtlas;
    if (typeof global.migrateCuppingAtlasConfig === 'function' && s) {
      const { cfg, changed } = global.migrateCuppingAtlasConfig(s);
      s = cfg;
      if (changed && global.settings) {
        global.settings.cuppingAtlas = cfg;
        if (global.DB) global.DB.set('settings', global.settings);
        if (typeof global.applyCuppingAtlasConfig === 'function') global.applyCuppingAtlasConfig(cfg);
      }
    }
    if (s && (s.points?.length || MAP_IDS.some(id => s.maps?.[id]?.image))) {
      const tpl = defaultTemplate();
      const merged = {
        maps: { ...s.maps },
        points: (s.points || []).map(p => ({ ...p, id: p.id || uid() })),
        pointMeta: { ...(s.pointMeta || {}) },
        pointDb: { ...(s.pointDb || {}) },
        template: {
          mini: { ...tpl.mini, ...s.template?.mini, layers: { ...tpl.mini.layers, ...(s.template?.mini?.layers || {}) } },
          full: { ...tpl.full, ...s.template?.full, layers: { ...tpl.full.layers, ...(s.template?.full?.layers || {}) } }
        }
      };
      if (typeof global.ensureFreeCuppingTemplate === 'function') {
        merged.template = global.ensureFreeCuppingTemplate(merged.template);
      }
      if (merged.pointMeta && Object.keys(merged.pointMeta).length) {
        Object.keys(merged.pointMeta).forEach(k => {
          if (!merged.pointDb[k]) merged.pointDb[k] = { n: parseInt(k, 10), ...merged.pointMeta[k] };
          else merged.pointDb[k] = { ...merged.pointDb[k], ...merged.pointMeta[k], n: parseInt(k, 10) };
        });
      }
      return merged;
    }
    return cloneDefaultConfig();
  }

  function getEditorState() {
    if (!_editor) _editor = loadEditorFromSettings();
    return _editor;
  }

  global.getMapEditorState = getEditorState;

  function normalizeColor(c) {
    return c === 'g' || c === 'green' ? 'g' : c === 'y' || c === 'yellow' ? 'y' : 'o';
  }

  function pointLabel(p) {
    if (p.label) return p.label;
    return p.side ? `${p.n}/${p.side}` : String(p.n);
  }

  function pointsForMap(mapId) {
    return getEditorState().points.filter(p => p.map === mapId);
  }

  function findPoint(id) {
    return getEditorState().points.find(p => p.id === id);
  }

  function buildAtlasConfigFromEditor() {
    const st = getEditorState();
    const sanitize = typeof global.sanitizeCuppingAtlasMaps === 'function'
      ? global.sanitizeCuppingAtlasMaps
      : (maps) => maps;
    const stripComposed = (tpl) => {
      if (!tpl) return tpl;
      ['mini', 'full'].forEach(key => { if (tpl[key]?.composedImage) delete tpl[key].composedImage; });
      return tpl;
    };
    return {
      maps: sanitize(MAP_IDS.reduce((acc, id) => {
        const raw = st.maps[id]?.image || global.CUPPING_MAPS?.[id]?.image || '';
        const img = typeof global.sanitizeMapImageSrc === 'function'
          ? global.sanitizeMapImageSrc(raw, id)
          : raw;
        acc[id] = {
          image: img,
          aspect: st.maps[id]?.aspect || global.CUPPING_MAPS?.[id]?.aspect || '1'
        };
        return acc;
      }, {})),
      points: st.points.map(p => ({
        id: p.id,
        map: p.map,
        n: parseInt(p.n, 10) || 0,
        xp: Math.round(p.xp * 100) / 100,
        yp: Math.round(p.yp * 100) / 100,
        color: normalizeColor(p.color),
        side: p.side || null,
        label: pointLabel(p)
      })),
      pointMeta: { ...st.pointMeta },
      pointDb: { ...st.pointDb },
      template: stripComposed(JSON.parse(JSON.stringify(st.template || defaultTemplate()))),
      atlasAssetVer: global.ATLAS_ASSET_VER || st.atlasAssetVer || null,
      updatedAt: new Date().toISOString()
    };
  }

  function saveCuppingAtlasEditor(opts) {
    if (!global.settings) return;
    const cfg = buildAtlasConfigFromEditor();
    global.settings.cuppingAtlas = cfg;
    if (global.DB) global.DB.set('settings', global.settings);
    if (typeof global.applyCuppingAtlasConfig === 'function') global.applyCuppingAtlasConfig(cfg);
    if (!opts?.silent && typeof global.notify === 'function') global.notify('✅ تم حفظ خرائط الحجامة والنقاط');
    if (typeof global.logAudit === 'function') global.logAudit('SETTINGS_CHANGED', 'حفظ خرائط الحجامة', { points: cfg.points.length });
  }

  function resetCuppingAtlasEditor() {
    if (!confirm('استعادة النقاط الافتراضية؟ سيتم فقدان تخصيصات النقاط غير المحفوظة.')) return;
    _editor = cloneDefaultConfig();
    renderMapEditor();
    if (typeof global.setMapEditorMode === 'function') global.setMapEditorMode('points');
    if (typeof global.renderLayoutComposer === 'function') global.renderLayoutComposer();
    saveCuppingAtlasEditor({ silent: true });
    if (typeof global.notify === 'function') global.notify('↩️ تم استعادة النقاط الافتراضية — الصور تبقى كما رفعتها');
  }

  function selectEditorPoint(id, opts) {
    opts = opts || {};
    getEditorState().selectedId = id;
    if (opts.light) {
      document.querySelectorAll('.me-pt').forEach(el => {
        el.classList.toggle('me-pt--sel', el.getAttribute('data-pt-id') === id);
      });
      document.querySelectorAll('#me-sidebar .me-list-item[data-pt-id]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-pt-id') === id);
      });
    } else {
      renderMapEditorCanvas();
      renderMapEditorSidebar();
    }
    const p = findPoint(id);
    if (p) {
      const el = document.getElementById('me-point-info');
      if (el && typeof global.formatPointInfoHtml === 'function') el.innerHTML = global.formatPointInfoHtml(p.n);
    }
  }

  function scheduleEditorSearch() {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      renderMapEditorCanvas();
      renderMapEditorSidebar();
    }, 320);
  }

  function scheduleDbSearch() {
    clearTimeout(_dbSearchTimer);
    _dbSearchTimer = setTimeout(() => renderMapEditorDatabase(), 320);
  }

  function applyDbEntryToPointForm(n) {
    const st = getEditorState();
    const entry = typeof global.getPointDbEntry === 'function' ? global.getPointDbEntry(n, st.pointDb) : null;
    if (!entry) return false;
    const zoneEl = document.getElementById('me-pt-zone');
    const condsEl = document.getElementById('me-pt-conds');
    const colorEl = document.getElementById('me-pt-color');
    if (zoneEl) zoneEl.value = entry.zone || '';
    if (condsEl) condsEl.value = (entry.conditions || []).join('\n');
    if (colorEl) colorEl.value = entry.color === 'g' ? 'g' : entry.color === 'y' ? 'y' : 'o';
    return true;
  }

  function schedulePointNumberLookup() {
    clearTimeout(_ptNumTimer);
    _ptNumTimer = setTimeout(() => {
      const n = parseInt(document.getElementById('me-pt-n')?.value, 10);
      if (!n) return;
      if (applyDbEntryToPointForm(n)) {
        global.notify?.(`📚 تم نسخ بيانات النقطة ${n} من قاعدة البيانات`, 'info');
      }
    }, 450);
  }

  function scheduleDbNumberLookup() {
    clearTimeout(_dbNumTimer);
    _dbNumTimer = setTimeout(() => {
      const n = parseInt(document.getElementById('me-db-n')?.value, 10);
      if (!n) return;
      const st = getEditorState();
      const entry = typeof global.getPointDbEntry === 'function' ? global.getPointDbEntry(n, st.pointDb) : null;
      if (!entry || st.dbSelectedN === n) return;
      const zoneEl = document.getElementById('me-db-zone');
      const condsEl = document.getElementById('me-db-conds');
      const typeEl = document.getElementById('me-db-type');
      const colorEl = document.getElementById('me-db-color');
      const mapEl = document.getElementById('me-db-map');
      if (zoneEl) zoneEl.value = entry.zone || '';
      if (condsEl) condsEl.value = (entry.conditions || []).join('\n');
      if (typeEl) typeEl.value = entry.type === 'prophetic' ? 'prophetic' : 'therapeutic';
      if (colorEl) colorEl.value = entry.color === 'g' ? 'g' : entry.color === 'y' ? 'y' : 'o';
      if (mapEl && entry.defaultMap) mapEl.value = entry.defaultMap;
      global.notify?.(`📚 تم نسخ بيانات النقطة ${n} — يمكنك تعديلها ثم الحفظ`, 'info');
    }, 450);
  }

  function placementsForNumber(n, mapId) {
    const num = parseInt(n, 10);
    return getEditorState().points.filter(p => p.n === num && (!mapId || p.map === mapId));
  }

  function isPointOnMap(n, mapId) {
    return placementsForNumber(n, mapId).length > 0;
  }

  function savePointToDb(n, data) {
    const st = getEditorState();
    const key = String(n);
    if (!st.pointDb) st.pointDb = {};
    st.pointDb[key] = { ...(st.pointDb[key] || {}), n: parseInt(n, 10), ...data, deleted: false };
    if (st.pointMeta?.[key]) delete st.pointMeta[key];
  }

  function deletePointFromDb(n) {
    const st = getEditorState();
    const num = parseInt(n, 10);
    const key = String(num);
    if (!st.pointDb) st.pointDb = {};
    if (global.CUPPING_POINT_INFO?.[num]) {
      st.pointDb[key] = { ...(st.pointDb[key] || {}), n: num, deleted: true };
    } else {
      delete st.pointDb[key];
    }
    st.points = st.points.filter(p => p.n !== num);
    if (st.selectedId) {
      const sel = findPoint(st.selectedId);
      if (sel && sel.n === num) st.selectedId = null;
    }
    if (st.dbSelectedN === num) st.dbSelectedN = null;
  }

  function removeSelectedFromMap() {
    const st = getEditorState();
    if (!st.selectedId) return;
    const p = findPoint(st.selectedId);
    st.points = st.points.filter(pt => pt.id !== st.selectedId);
    st.selectedId = null;
    renderMapEditor();
    const msg = p ? `تمت إزالة النقطة ${pointLabel(p)} من الخريطة — بياناتها محفوظة في قاعدة البيانات` : 'تمت الإزالة من الخريطة';
    global.notify?.('↩️ ' + msg);
  }

  function addPointFromDb(n, mapId, xp, yp, side) {
    const st = getEditorState();
    const entry = typeof global.getPointDbEntry === 'function' ? global.getPointDbEntry(n, st.pointDb) : null;
    if (!entry) {
      global.notify?.('⚠️ النقطة غير موجودة في قاعدة البيانات', 'danger');
      return null;
    }
    mapId = mapId || st.currentMap || entry.defaultMap || 'back';
    const color = typeof global.pointDbColor === 'function' ? global.pointDbColor(n, st.pointDb) : (entry.color || 'o');
    const p = {
      id: uid(),
      map: mapId,
      n: entry.n,
      xp: xp != null ? xp : 50,
      yp: yp != null ? yp : 50,
      color,
      side: side || null,
      label: side ? `${entry.n}/${side}` : String(entry.n)
    };
    st.points.push(p);
    st.selectedId = p.id;
    if (mapId !== st.currentMap) st.currentMap = mapId;
    renderMapEditor();
    return p;
  }

  function addPointAt(mapId, xp, yp) {
    const st = getEditorState();
    const q = (st.searchQ || '').trim();
    if (/^\d+$/.test(q)) {
      const qn = parseInt(q, 10);
      const entry = typeof global.getPointDbEntry === 'function' ? global.getPointDbEntry(qn, st.pointDb) : null;
      if (entry) {
        addPointFromDb(qn, mapId, xp, yp);
        return;
      }
    }
    const maxN = st.points.reduce((m, p) => Math.max(m, p.n || 0), 0);
    const n = maxN + 1;
    const p = {
      id: uid(),
      map: mapId,
      n,
      xp,
      yp,
      color: 'o',
      side: null,
      label: String(n)
    };
    savePointToDb(n, {
      zone: `موضع ${n}`,
      conditions: [],
      type: 'therapeutic',
      color: 'o',
      defaultMap: mapId
    });
    st.points.push(p);
    st.selectedId = p.id;
    renderMapEditor();
  }

  function renderMapEditorDatabase() {
    const root = document.getElementById('me-mode-database');
    if (!root) return;
    const st = getEditorState();
    const q = (st.dbSearchQ || '').trim().toLowerCase();
    const selN = st.dbSelectedN != null ? parseInt(st.dbSelectedN, 10) : null;
    const entries = typeof global.listPointDbEntries === 'function'
      ? global.listPointDbEntries(st.pointDb)
      : [];
    const filtered = entries.filter(e => {
      if (!q) return true;
      return String(e.n).includes(q) || (e.zone || '').toLowerCase().includes(q);
    });
    const sel = selN ? (typeof global.getPointDbEntry === 'function' ? global.getPointDbEntry(selN, st.pointDb) : null) : null;
    const onMaps = selN ? [...new Set(placementsForNumber(selN).map(p => MAP_TITLES[p.map] || p.map))] : [];

    root.innerHTML = `
      <div class="me-db-layout">
        <div class="me-db-list-col">
          <div class="me-side-block">
            <label class="form-label">🔍 بحث في قاعدة البيانات</label>
            <input class="form-control" id="me-db-search" placeholder="رقم أو وصف المنطقة" value="${st.dbSearchQ || ''}">
          </div>
          <div class="me-db-list">${filtered.length ? filtered.map(e => {
            const col = e.color === 'g' ? 'g' : e.color === 'y' ? 'y' : 'o';
            const placed = isPointOnMap(e.n);
            return `<button type="button" class="me-list-item${selN === e.n ? ' active' : ''}" data-db-n="${e.n}">
              <span class="me-list-dot me-pt--${col}"></span>
              <span class="me-db-item-main"><strong>${e.n}</strong> — ${e.zone || ''}</span>
              <span class="me-db-badge">${placed ? 'على الخريطة' : 'غير موضوعة'}</span>
            </button>`;
          }).join('') : '<div class="me-empty">لا نتائج</div>'}</div>
          <button type="button" class="btn btn-accent btn-sm" id="me-db-new" style="margin-top:8px">➕ نقطة جديدة في القاعدة</button>
        </div>
        <div class="me-db-form-col">
          ${sel ? `
          <div class="me-side-block">
            <div class="form-label" style="font-weight:800;color:var(--primary)">📚 نقطة ${sel.n} — قاعدة البيانات</div>
            ${onMaps.length ? `<div class="me-db-onmaps">موضوعة على: ${onMaps.join('، ')}</div>` : '<div class="me-db-onmaps me-db-onmaps--none">غير موضوعة على أي خريطة</div>'}
          </div>
          <div class="form-group"><label class="form-label">رقم النقطة</label>
            <input class="form-control" id="me-db-n" type="number" min="1" max="999" value="${sel.n}"></div>
          <div class="form-group"><label class="form-label">النوع</label>
            <select class="form-control" id="me-db-type">
              <option value="prophetic" ${sel.type === 'prophetic' ? 'selected' : ''}>🟢 نبوية</option>
              <option value="therapeutic" ${sel.type !== 'prophetic' ? 'selected' : ''}>🟠 علاجية</option>
            </select></div>
          <div class="form-group"><label class="form-label">لون العرض</label>
            <select class="form-control" id="me-db-color">
              <option value="g" ${sel.color === 'g' ? 'selected' : ''}>أخضر</option>
              <option value="o" ${sel.color === 'o' ? 'selected' : ''}>برتقالي</option>
              <option value="y" ${sel.color === 'y' ? 'selected' : ''}>أصفر</option>
            </select></div>
          <div class="form-group"><label class="form-label">الخريطة الافتراضية</label>
            <select class="form-control" id="me-db-map">
              ${MAP_IDS.map(id => `<option value="${id}" ${(sel.defaultMap || '') === id ? 'selected' : ''}>${MAP_TITLES[id]}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">وصف المنطقة</label>
            <input class="form-control" id="me-db-zone" value="${sel.zone || ''}"></div>
          <div class="form-group"><label class="form-label">الأمراض (سطر لكل مرض)</label>
            <textarea class="form-control" id="me-db-conds" rows="4">${(sel.conditions || []).join('\n')}</textarea></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="btn btn-primary btn-sm" id="me-db-save">💾 حفظ في القاعدة</button>
            <button type="button" class="btn btn-accent btn-sm" id="me-db-place">➕ إضافة للخريطة الحالية</button>
            <button type="button" class="btn btn-danger btn-sm" id="me-db-del">🗑️ حذف من القاعدة</button>
          </div>` : `
          <div class="me-empty" style="padding:24px">
            اختر نقطة من القائمة أو أنشئ نقطة جديدة.<br><br>
            <strong>ملاحظة:</strong> إزالة نقطة من الخريطة لا تحذفها من القاعدة — يمكن البحث برقمها وإعادتها.
          </div>`}
        </div>
      </div>`;

    root.querySelector('#me-db-search')?.addEventListener('input', (e) => {
      st.dbSearchQ = e.target.value;
      scheduleDbSearch();
    });
    root.querySelectorAll('[data-db-n]').forEach(btn => {
      btn.addEventListener('click', () => {
        st.dbSelectedN = parseInt(btn.getAttribute('data-db-n'), 10);
        renderMapEditorDatabase();
      });
    });
    root.querySelector('#me-db-new')?.addEventListener('click', () => {
      const maxN = entries.reduce((m, e) => Math.max(m, e.n), 0);
      const n = maxN + 1;
      savePointToDb(n, { zone: `موضع ${n}`, conditions: [], type: 'therapeutic', color: 'o', defaultMap: st.currentMap || 'back' });
      st.dbSelectedN = n;
      renderMapEditorDatabase();
    });
    root.querySelector('#me-db-n')?.addEventListener('input', scheduleDbNumberLookup);
    root.querySelector('#me-db-save')?.addEventListener('click', () => {
      const oldN = selN;
      const newN = parseInt(document.getElementById('me-db-n')?.value, 10) || oldN;
      const data = {
        zone: document.getElementById('me-db-zone')?.value.trim() || '',
        conditions: (document.getElementById('me-db-conds')?.value || '').split('\n').map(s => s.trim()).filter(Boolean),
        type: document.getElementById('me-db-type')?.value || 'therapeutic',
        color: document.getElementById('me-db-color')?.value || 'o',
        defaultMap: document.getElementById('me-db-map')?.value || 'back'
      };
      if (oldN !== newN) {
        if (typeof global.getPointDbEntry === 'function' && global.getPointDbEntry(newN, st.pointDb)) {
          global.notify?.('⚠️ الرقم مستخدم مسبقاً', 'danger');
          return;
        }
        if (global.CUPPING_POINT_INFO?.[oldN]) {
          if (!st.pointDb) st.pointDb = {};
          st.pointDb[String(oldN)] = { n: oldN, deleted: true };
        } else {
          delete st.pointDb[String(oldN)];
        }
        savePointToDb(newN, data);
        st.points.forEach(p => {
          if (p.n === oldN) {
            p.n = newN;
            p.label = p.side ? `${newN}/${p.side}` : String(newN);
          }
        });
        st.dbSelectedN = newN;
      } else {
        savePointToDb(newN, data);
      }
      renderMapEditorDatabase();
      global.notify?.('✅ تم حفظ النقطة في قاعدة البيانات');
    });
    root.querySelector('#me-db-place')?.addEventListener('click', () => {
      if (selN) addPointFromDb(selN, st.currentMap || 'head');
    });
    root.querySelector('#me-db-del')?.addEventListener('click', () => {
      if (!selN || !confirm(`حذف النقطة ${selN} من قاعدة البيانات نهائياً؟ ستُزال من كل الخرائط أيضاً.`)) return;
      deletePointFromDb(selN);
      renderMapEditorDatabase();
      renderMapEditor();
      global.notify?.('🗑️ تم حذف النقطة من قاعدة البيانات');
    });
  }

  function uploadMapImage(mapId, file, onDone) {
    if (!file) return;
    if (file.type !== 'image/png') {
      global.notify?.('⚠️ استخدم ملف PNG فقط — يُعرض كما هو بدون تعديل', 'danger');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const st = getEditorState();
      if (!st.maps[mapId]) st.maps[mapId] = {};
      st.maps[mapId].image = reader.result;
      const img = new Image();
      img.onload = () => {
        st.maps[mapId].aspect = (img.width / img.height).toFixed(2) + ' / 1';
        renderMapEditor();
        if (typeof onDone === 'function') onDone();
        else global.notify?.('✅ تم رفع صورة ' + MAP_TITLES[mapId]);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  global.uploadMapImageForEditor = (mapId, file, onDone) => uploadMapImage(mapId, file, onDone);

  function renderEditorPointHtml(p, selected) {
    const col = normalizeColor(p.color);
    const cls = ['me-pt', 'me-pt--' + col, selected ? 'me-pt--sel' : ''].join(' ');
    return `<div class="${cls}" data-pt-id="${p.id}" style="left:${p.xp}%;top:${p.yp}%">
      <span class="me-pt-lbl">${pointLabel(p)}</span>
    </div>`;
  }

  function renderMapEditorCanvas() {
    const host = document.getElementById('me-canvas');
    if (!host) return;
    const st = getEditorState();
    const mapId = st.currentMap || 'head';
    const imgSrc = st.maps[mapId]?.image || global.CUPPING_MAPS?.[mapId]?.image || '';
    const aspect = st.maps[mapId]?.aspect || global.CUPPING_MAPS?.[mapId]?.aspect || '1';
    const hasImg = !!imgSrc;
    const q = (st.searchQ || '').trim();
    const pts = pointsForMap(mapId).filter(p => pointMatchesQuery(p, q));

    host.innerHTML = `
      <div class="me-map" id="me-map-surface" data-map="${mapId}" style="aspect-ratio:${aspect}">
        ${hasImg ? `<img class="me-map-img" src="${imgSrc}" alt="${MAP_TITLES[mapId]}" decoding="async">` : ''}
        <div class="me-map-placeholder" id="me-map-placeholder" style="display:${hasImg ? 'none' : 'flex'}">📷 ارفع صورة PNG لـ ${MAP_TITLES[mapId]}</div>
        <div class="me-overlay" id="me-overlay">
          ${pts.map(p => renderEditorPointHtml(p, p.id === st.selectedId)).join('')}
        </div>
      </div>`;

    const imgEl = host.querySelector('.me-map-img');
    const phEl = host.querySelector('#me-map-placeholder');
    if (imgEl && phEl) {
      const showPh = () => { phEl.style.display = 'flex'; if (imgEl) imgEl.style.display = 'none'; };
      const hidePh = () => { phEl.style.display = 'none'; if (imgEl) imgEl.style.display = 'block'; };
      imgEl.addEventListener('load', () => { if (imgEl.naturalWidth > 0) hidePh(); else showPh(); });
      imgEl.addEventListener('error', showPh);
    }

    const surface = document.getElementById('me-map-surface');
    const overlay = document.getElementById('me-overlay');
    if (!surface || !overlay) return;

    overlay.querySelectorAll('.me-pt').forEach(el => {
      const id = el.getAttribute('data-pt-id');
      el.addEventListener('mousedown', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        selectEditorPoint(id, { light: true });
        const pt = findPoint(id);
        if (!pt) return;
        _drag = { id, moved: false };
        const onMove = (e) => {
          if (!_drag || _drag.id !== id) return;
          _drag.moved = true;
          const rect = surface.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          pt.xp = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
          pt.yp = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
          el.style.left = pt.xp + '%';
          el.style.top = pt.yp + '%';
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          const wasDrag = _drag?.moved;
          _drag = null;
          if (wasDrag) renderMapEditorSidebar();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });

    overlay.addEventListener('click', (ev) => {
      if (ev.target.closest('.me-pt')) return;
      const rect = surface.getBoundingClientRect();
      const xp = ((ev.clientX - rect.left) / rect.width) * 100;
      const yp = ((ev.clientY - rect.top) / rect.height) * 100;
      addPointAt(mapId, xp, yp);
    });
  }

  function pointMatchesQuery(p, q) {
    if (!q) return true;
    const ql = q.toLowerCase();
    const lbl = pointLabel(p).toLowerCase();
    return lbl.includes(ql) || String(p.n).includes(q);
  }

  function renderMapEditorSidebar() {
    const side = document.getElementById('me-sidebar');
    if (!side) return;
    const st = getEditorState();
    const p = st.selectedId ? findPoint(st.selectedId) : null;
    const info = p && typeof global.getPointInfo === 'function' ? global.getPointInfo(p.n) : null;
    const mapId = st.currentMap || 'head';
    const q = (st.searchQ || '').trim();

    const list = pointsForMap(mapId)
      .filter(pt => pointMatchesQuery(pt, q))
      .sort((a, b) => a.n - b.n)
      .map(pt => `<button type="button" class="me-list-item${pt.id === st.selectedId ? ' active' : ''}" data-pt-id="${pt.id}">
        <span class="me-list-dot me-pt--${normalizeColor(pt.color)}"></span>${pointLabel(pt)}
      </button>`).join('');

    let dbMatchHtml = '';
    if (q && /^\d+$/.test(q)) {
      const qn = parseInt(q, 10);
      const entry = typeof global.getPointDbEntry === 'function' ? global.getPointDbEntry(qn, st.pointDb) : null;
      if (entry && !isPointOnMap(qn, mapId)) {
        dbMatchHtml = `<div class="me-side-block me-db-pick">
          <div class="me-db-pick-title">📚 نقطة ${qn} في القاعدة — غير موضوعة على ${MAP_TITLES[mapId]}</div>
          <div class="me-db-pick-zone">${entry.zone || ''}</div>
          <button type="button" class="btn btn-accent btn-sm" id="me-add-from-db">➕ إضافة للخريطة</button>
        </div>`;
      } else if (!entry) {
        dbMatchHtml = `<div class="me-side-block me-empty">لا توجد نقطة رقم ${qn} في قاعدة البيانات — انقر الصورة لإنشائها</div>`;
      }
    }

    side.innerHTML = `
      ${dbMatchHtml}
      <div class="me-side-block me-pt-list">${list || '<div class="me-empty">لا نقاط على هذه الخريطة — ابحث برقم أو انقر الصورة</div>'}</div>
      ${p ? `
      <div class="me-side-block me-edit-form">
        <div class="form-label" style="font-weight:800;color:var(--primary)">تعديل موضع النقطة على الخريطة</div>
        <div class="form-group"><label class="form-label">رقم النقطة</label>
          <input class="form-control" id="me-pt-n" type="number" min="1" max="999" value="${p.n}"></div>
        <div class="form-group"><label class="form-label">لاحقة جانب (اختياري)</label>
          <input class="form-control" id="me-pt-side" placeholder="1 أو 2 للأطراف" value="${p.side || ''}"></div>
        <div class="form-group"><label class="form-label">اللون / النوع</label>
          <select class="form-control" id="me-pt-color">
            <option value="g" ${normalizeColor(p.color) === 'g' ? 'selected' : ''}>🟢 نبوية (أخضر)</option>
            <option value="o" ${normalizeColor(p.color) === 'o' ? 'selected' : ''}>🟠 علاجية (برتقالي)</option>
            <option value="y" ${normalizeColor(p.color) === 'y' ? 'selected' : ''}>🟡 علاجية (أصفر)</option>
          </select></div>
        <div class="form-group"><label class="form-label">وصف المنطقة (قاعدة البيانات)</label>
          <input class="form-control" id="me-pt-zone" value="${info?.zone || ''}"></div>
        <div class="form-group"><label class="form-label">الأمراض (سطر لكل مرض)</label>
          <textarea class="form-control" id="me-pt-conds" rows="3" placeholder="الصُداع&#10;آلام الظهر">${(info?.conditions || []).join('\n')}</textarea></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary btn-sm" id="me-apply-pt">حفظ</button>
          <button type="button" class="btn btn-ghost btn-sm" id="me-remove-pt">إزالة من الخريطة</button>
        </div>
      </div>` : '<div class="me-side-block me-empty">اختر نقطة أو ابحث برقم لإضافتها من القاعدة</div>'}`;

    side.querySelectorAll('.me-list-item').forEach(btn => {
      btn.addEventListener('click', () => selectEditorPoint(btn.getAttribute('data-pt-id')));
    });
    side.querySelector('#me-add-from-db')?.addEventListener('click', () => {
      const qn = parseInt(q, 10);
      if (qn) addPointFromDb(qn, mapId);
    });
    side.querySelector('#me-pt-n')?.addEventListener('input', schedulePointNumberLookup);
    side.querySelector('#me-apply-pt')?.addEventListener('click', () => {
      if (!p) return;
      const oldN = p.n;
      const newN = parseInt(document.getElementById('me-pt-n')?.value, 10) || p.n;
      p.n = newN;
      p.side = (document.getElementById('me-pt-side')?.value || '').trim() || null;
      p.color = document.getElementById('me-pt-color')?.value || 'o';
      p.label = p.side ? `${p.n}/${p.side}` : String(p.n);
      let zone = document.getElementById('me-pt-zone')?.value.trim() || '';
      let conds = (document.getElementById('me-pt-conds')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
      const existingEntry = typeof global.getPointDbEntry === 'function' ? global.getPointDbEntry(newN, st.pointDb) : null;
      if (existingEntry && newN !== oldN) {
        if (!zone) zone = existingEntry.zone || '';
        if (!conds.length && existingEntry.conditions?.length) conds = existingEntry.conditions.slice();
        p.color = existingEntry.color || p.color;
      }
      savePointToDb(p.n, {
        zone,
        conditions: conds,
        type: normalizeColor(p.color) === 'g' ? 'prophetic' : 'therapeutic',
        color: normalizeColor(p.color),
        defaultMap: p.map,
        region: existingEntry?.region || info?.region || null
      });
      renderMapEditor();
      global.notify?.('✅ تم حفظ النقطة في قاعدة البيانات والخريطة');
    });
    side.querySelector('#me-remove-pt')?.addEventListener('click', removeSelectedFromMap);
  }

  function renderMapEditor() {
    renderMapEditorCanvas();
    renderMapEditorSidebar();
    const info = document.getElementById('me-point-info');
    const st = getEditorState();
    const p = st.selectedId ? findPoint(st.selectedId) : null;
    if (info) info.innerHTML = p && typeof global.formatPointInfoHtml === 'function'
      ? global.formatPointInfoHtml(p.n)
      : '<span class="cup-info-hint">ابحث عن رقم نقطة لعرض بيانات الأمراض المحفوظة</span>';
  }

  function initMapEditor() {
    _editor = loadEditorFromSettings();
    if (!_editor.currentMap) _editor.currentMap = 'head';
    if (!_editor.editorMode) _editor.editorMode = 'points';
    if (!_editor.layoutWhich) _editor.layoutWhich = 'full';
    if (!_editor.layoutSelected) _editor.layoutSelected = 'back';
    if (typeof global.ensureFreeCuppingTemplate === 'function') {
      _editor.template = global.ensureFreeCuppingTemplate(_editor.template);
    }
    const root = document.getElementById('set-panel-cupping-maps');
    if (!root || root.dataset.mounted === '1') {
      if (typeof global.setMapEditorMode === 'function') global.setMapEditorMode(_editor.editorMode || 'points');
      else renderMapEditor();
      const searchInput = document.getElementById('me-search');
      if (searchInput) searchInput.value = _editor.searchQ || '';
      return;
    }
    root.dataset.mounted = '1';
    root.innerHTML = `
      <div class="card me-wrap">
        <div class="card-header" style="flex-wrap:wrap;gap:10px">
          <div>
            <div class="card-title">🗺️ محرر خرائط الحجامة</div>
            <p style="font-size:12px;color:var(--text-muted);margin:4px 0 0">ارفع PNG شفاف لكل جزء — يُعرض كما هو. النقاط لها قاعدة بيانات مستقلة عن موضعها على الخريطة</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-primary btn-sm" onclick="saveCuppingAtlasEditor()">💾 حفظ الخرائط</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="resetCuppingAtlasEditor()">↩️ افتراضي</button>
            <button type="button" class="btn btn-accent btn-sm" onclick="previewCuppingMapsPrint()">👁️ معاينة الملف</button>
          </div>
        </div>
        <div class="me-tabs" id="me-tabs"></div>
        <div id="me-mode-points">
        <div class="me-upload-row" id="me-upload-row"></div>
        <div class="me-layout">
          <div class="me-canvas-col">
            <div id="me-canvas"></div>
            <div class="me-hint">💡 انقر الصورة = نقطة جديدة · اسحب = تحريك · بحث برقم = إعادة إضافة من القاعدة · إزالة من الخريطة ≠ حذف من القاعدة</div>
          </div>
          <div class="me-side-col">
            <div class="me-side-block">
              <label class="form-label">🔍 بحث برقم النقطة</label>
              <input class="form-control" id="me-search" placeholder="مثال: 19 أو 32" autocomplete="off">
            </div>
            <div id="me-sidebar"></div>
          </div>
        </div>
        <div class="me-meta-panel" id="me-point-info"></div>
        </div>
        <div id="me-mode-database" style="display:none"></div>
        <div id="me-mode-layout" style="display:none">
          <div id="me-layout-composer"></div>
        </div>
      </div>`;

    const tabs = document.getElementById('me-tabs');
    MAP_IDS.forEach(id => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cup-map-tab me-tab-map' + (id === _editor.currentMap && _editor.editorMode !== 'layout' ? ' cup-map-tab--active' : '');
      btn.setAttribute('data-map-tab', id);
      btn.textContent = MAP_TITLES[id];
      btn.addEventListener('click', () => {
        _editor.currentMap = id;
        _editor.selectedId = null;
        if (typeof global.setMapEditorMode === 'function') global.setMapEditorMode('points');
        else _editor.editorMode = 'points';
        tabs.querySelectorAll('.me-tab-map').forEach(b => b.classList.remove('cup-map-tab--active'));
        btn.classList.add('cup-map-tab--active');
        renderMapEditorUploadRow();
        renderMapEditor();
      });
      tabs.appendChild(btn);
    });

    const layoutBtn = document.createElement('button');
    layoutBtn.type = 'button';
    layoutBtn.id = 'me-tab-layout';
    layoutBtn.className = 'cup-map-tab cup-map-tab--layout' + (_editor.editorMode === 'layout' ? ' cup-map-tab--active' : '');
    layoutBtn.textContent = '🧩 ترتيب الأحجية';
    layoutBtn.addEventListener('click', () => {
      tabs.querySelectorAll('.cup-map-tab').forEach(b => b.classList.remove('cup-map-tab--active'));
      layoutBtn.classList.add('cup-map-tab--active');
      if (typeof global.setMapEditorMode === 'function') global.setMapEditorMode('layout');
    });
    tabs.appendChild(layoutBtn);

    const dbBtn = document.createElement('button');
    dbBtn.type = 'button';
    dbBtn.id = 'me-tab-database';
    dbBtn.className = 'cup-map-tab cup-map-tab--db' + (_editor.editorMode === 'database' ? ' cup-map-tab--active' : '');
    dbBtn.textContent = '📚 قاعدة النقاط';
    dbBtn.addEventListener('click', () => {
      tabs.querySelectorAll('.cup-map-tab').forEach(b => b.classList.remove('cup-map-tab--active'));
      dbBtn.classList.add('cup-map-tab--active');
      if (typeof global.setMapEditorMode === 'function') global.setMapEditorMode('database');
    });
    tabs.appendChild(dbBtn);

    renderMapEditorUploadRow();
    const searchInput = document.getElementById('me-search');
    if (searchInput && !searchInput.dataset.wired) {
      searchInput.dataset.wired = '1';
      searchInput.value = _editor.searchQ || '';
      searchInput.addEventListener('input', (e) => {
        _editor.searchQ = e.target.value;
        scheduleEditorSearch();
      });
    }
    renderMapEditor();
    if (typeof global.setMapEditorMode === 'function') global.setMapEditorMode(_editor.editorMode || 'points');
  }

  function renderMapEditorUploadRow() {
    const row = document.getElementById('me-upload-row');
    if (!row) return;
    const mapId = getEditorState().currentMap || 'head';
    row.innerHTML = `
      <label class="btn btn-ghost btn-sm" style="cursor:pointer">
        📷 رفع صورة ${MAP_TITLES[mapId]} (PNG)
        <input type="file" accept="image/png" style="display:none" id="me-file-input">
      </label>
      <span style="font-size:12px;color:var(--text-muted)">PNG شفاف — يُعرض خاماً بدون أي تعديل على الخلفية أو الألوان</span>`;
    row.querySelector('#me-file-input')?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (f) uploadMapImage(mapId, f);
      e.target.value = '';
    });
  }

  function previewCuppingMapsPrint() {
    saveCuppingAtlasEditor();
    if (typeof global.printBlankClientFileSheet === 'function') global.printBlankClientFileSheet();
    else global.notify?.('معاينة غير متاحة', 'danger');
  }

  global.initMapEditor = initMapEditor;
  global.saveCuppingAtlasEditor = saveCuppingAtlasEditor;
  global.resetCuppingAtlasEditor = resetCuppingAtlasEditor;
  global.previewCuppingMapsPrint = previewCuppingMapsPrint;
  global.buildAtlasConfigFromEditor = buildAtlasConfigFromEditor;
  global.addPointFromCuppingDb = addPointFromDb;
  global.renderMapEditorDatabase = renderMapEditorDatabase;

})(typeof window !== 'undefined' ? window : globalThis);
