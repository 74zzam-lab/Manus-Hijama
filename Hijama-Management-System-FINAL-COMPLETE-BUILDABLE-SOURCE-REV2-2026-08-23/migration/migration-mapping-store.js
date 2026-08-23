/**
 * Saved column mapping presets (localStorage).
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = '__tdw_import_mapping_presets__';

  function loadPresets() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function savePresets(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 50)));
    } catch {}
  }

  function headerFingerprint(headers) {
    return (headers || []).map(h => String(h || '').trim().toLowerCase()).join('|').slice(0, 500);
  }

  function saveMappingPreset(name, mapping, headers) {
    const presets = loadPresets().filter(p => p.name !== name);
    presets.unshift({
      name: String(name || '').trim() || 'افتراضي',
      mapping: Object.assign({}, mapping),
      headersFp: headerFingerprint(headers),
      savedAt: new Date().toISOString()
    });
    savePresets(presets);
    return presets;
  }

  function deleteMappingPreset(name) {
    const presets = loadPresets().filter(p => p.name !== name);
    savePresets(presets);
    return presets;
  }

  function findBestPreset(headers) {
    const fp = headerFingerprint(headers);
    const presets = loadPresets();
    return presets.find(p => p.headersFp === fp) || presets[0] || null;
  }

  function injectMappingPresetUI(wrapEl, w, onChange) {
    if (!wrapEl || !w) return;
    const presets = loadPresets();
    const id = 'import-mapping-preset-bar';
    let bar = document.getElementById(id);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = id;
      bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px';
      wrapEl.parentNode.insertBefore(bar, wrapEl);
    }
    const opts = presets.map(p => `<option value="${p.name.replace(/"/g, '&quot;')}">${p.name}</option>`).join('');
    bar.innerHTML = `
      <select class="form-control" id="import-preset-select" style="max-width:180px">
        <option value="">— قالب Mapping —</option>${opts}
      </select>
      <input class="form-control" id="import-preset-name" placeholder="اسم القالب" style="max-width:140px">
      <button type="button" class="btn btn-ghost btn-sm" id="import-preset-save">💾 حفظ</button>
      <button type="button" class="btn btn-ghost btn-sm" id="import-preset-load">📂 تحميل</button>`;
    bar.querySelector('#import-preset-save')?.addEventListener('click', () => {
      const name = bar.querySelector('#import-preset-name')?.value.trim() || 'قالب ' + new Date().toLocaleDateString('ar-SA');
      saveMappingPreset(name, w.mapping, w.headers);
      if (typeof global.notify === 'function') global.notify('✅ تم حفظ قالب الربط', 'success');
      injectMappingPresetUI(wrapEl, w, onChange);
    });
    bar.querySelector('#import-preset-load')?.addEventListener('click', () => {
      const name = bar.querySelector('#import-preset-select')?.value;
      const preset = loadPresets().find(p => p.name === name);
      if (!preset) {
        if (typeof global.notify === 'function') global.notify('⚠️ اختر قالباً', 'warning');
        return;
      }
      w.mapping = Object.assign({}, preset.mapping);
      if (typeof onChange === 'function') onChange();
      if (typeof global.notify === 'function') global.notify('✅ تم تحميل القالب', 'success');
    });
  }

  global.MigrationMappingStore = {
    loadPresets, saveMappingPreset, deleteMappingPreset, findBestPreset, injectMappingPresetUI, headerFingerprint
  };
})(typeof window !== 'undefined' ? window : globalThis);
