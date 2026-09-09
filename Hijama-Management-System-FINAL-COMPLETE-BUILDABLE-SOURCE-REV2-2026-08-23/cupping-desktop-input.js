/**
 * Windows-style input behavior: standard shortcuts + contextual right-click menu.
 */
(function (global) {
  'use strict';

  const READONLY_IDS = new Set([
    'f-invoice', 'f-file-no', 'oc-invoice', 'oc-file-no', 'ce-file-no',
    'set-printer-thermal', 'set-printer-a4', 'set-drawer-linked', 'set-cur-base'
  ]);
  let initialized = false;

  function isEditableField(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea') return !el.disabled && !el.readOnly;
    if (tag === 'input') {
      const type = (el.type || 'text').toLowerCase();
      if (['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'hidden', 'image'].includes(type)) return false;
      return !el.disabled && !el.readOnly;
    }
    return !!el.isContentEditable;
  }

  function isTextInput(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'textarea' || tag === 'input' || el.isContentEditable;
  }

  function execOnField(el, cmd) {
    if (!el) return false;
    try {
      if (el.isContentEditable) {
        el.focus();
        return document.execCommand(cmd);
      }
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.focus();
        return document.execCommand(cmd);
      }
    } catch { /* empty */ }
    return false;
  }

  function getFieldValue(el) {
    if (!el) return '';
    if (el.isContentEditable) return el.innerText || '';
    return el.value || '';
  }

  function setFieldValue(el, value) {
    if (!el) return;
    if (el.isContentEditable) {
      el.innerText = value;
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function copyText(text) {
    const t = String(text || '');
    if (!t) return Promise.resolve(false);
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(t).then(() => true).catch(() => fallbackCopy(t));
    }
    return Promise.resolve(fallbackCopy(t));
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* empty */ }
    ta.remove();
    return ok;
  }

  function readClipboard() {
    if (navigator.clipboard?.readText) {
      return navigator.clipboard.readText().catch(() => '');
    }
    return Promise.resolve('');
  }

  function hideMenu() {
    document.getElementById('tdw-input-context-menu')?.remove();
  }

  function showMenu(x, y, items) {
    hideMenu();
    const menu = document.createElement('div');
    menu.id = 'tdw-input-context-menu';
    menu.className = 'tdw-input-context-menu';
    menu.innerHTML = items.map(item => {
      if (item.sep) return '<div class="tdw-ctx-sep"></div>';
      const dis = item.disabled ? ' disabled' : '';
      return `<button type="button" class="tdw-ctx-item${dis}" data-action="${item.id}"${item.disabled ? ' disabled' : ''}>${item.label}</button>`;
    }).join('');
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
    menu.addEventListener('mousedown', e => e.preventDefault());
    menu.querySelectorAll('.tdw-ctx-item:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = items.find(i => i.id === btn.dataset.action);
        if (action?.run) action.run();
        hideMenu();
      });
    });
  }

  function buildInputMenu(el, e) {
    const editable = isEditableField(el);
    const hasSelection = () => {
      if (el.isContentEditable) {
        const sel = global.getSelection?.();
        return !!(sel && !sel.isCollapsed && el.contains(sel.anchorNode));
      }
      const start = el.selectionStart;
      const end = el.selectionEnd;
      return start != null && end != null && start !== end;
    };
    const items = [];
    if (editable) {
      items.push({ id: 'undo', label: '↩️ تراجع', run: () => execOnField(el, 'undo') });
      items.push({ id: 'redo', label: '↪️ إعادة', run: () => execOnField(el, 'redo') });
      items.push({ sep: true });
      items.push({
        id: 'cut', label: '✂️ قص', disabled: !hasSelection(), run: () => execOnField(el, 'cut')
      });
      items.push({
        id: 'copy', label: '📋 نسخ', disabled: !hasSelection(), run: () => execOnField(el, 'copy')
      });
      items.push({
        id: 'paste', label: '📥 لصق', run: async () => {
          const clip = await readClipboard();
          if (clip && document.queryCommandSupported?.('insertText')) {
            el.focus();
            document.execCommand('insertText', false, clip);
          } else {
            execOnField(el, 'paste');
          }
        }
      });
      items.push({
        id: 'delete', label: '🗑️ حذف', disabled: !hasSelection(), run: () => {
          if (el.isContentEditable) execOnField(el, 'delete');
          else if (el.selectionStart != null) {
            const v = el.value;
            el.value = v.slice(0, el.selectionStart) + v.slice(el.selectionEnd);
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      });
      items.push({ id: 'selectAll', label: '🔲 تحديد الكل', run: () => execOnField(el, 'selectAll') });
    } else if (isTextInput(el) || getFieldValue(el)) {
      items.push({
        id: 'copyText', label: '📋 نسخ النص', run: () => copyText(getFieldValue(el))
      });
    }
    if (!items.length) return;
    showMenu(e.clientX, e.clientY, items);
  }

  function buildLinkMenu(el, e) {
    const href = el.href || el.closest('a')?.href || '';
    if (!href) return false;
    showMenu(e.clientX, e.clientY, [
      { id: 'open', label: '🔗 فتح الرابط', run: () => global.open(href, '_blank', 'noopener') },
      { id: 'copyLink', label: '📋 نسخ الرابط', run: () => copyText(href) }
    ]);
    return true;
  }

  function selectedPageText() {
    const selection = global.getSelection?.();
    return selection && !selection.isCollapsed ? String(selection.toString() || '').trim() : '';
  }

  function buildSelectionMenu(e) {
    const text = selectedPageText();
    if (!text) return false;
    showMenu(e.clientX, e.clientY, [
      { id: 'copySelection', label: '📋 نسخ النص المحدد', run: () => copyText(text) }
    ]);
    return true;
  }

  function onContextMenu(e) {
    if (e.defaultPrevented) return;
    const target = e.target;
    const link = target.closest('a[href]');
    if (link && !isEditableField(target)) {
      e.preventDefault();
      buildLinkMenu(link, e);
      return;
    }
    const field = target.closest('input, textarea, [contenteditable="true"]');
    if (!field) {
      if (buildSelectionMenu(e)) e.preventDefault();
      return;
    }
    if (field.id && READONLY_IDS.has(field.id) && !field.isContentEditable) {
      e.preventDefault();
      const val = getFieldValue(field);
      if (val) showMenu(e.clientX, e.clientY, [{ id: 'copyText', label: '📋 نسخ النص', run: () => copyText(val) }]);
      return;
    }
    e.preventDefault();
    buildInputMenu(field, e);
  }

  function injectStyles() {
    if (document.getElementById('tdw-input-context-styles')) return;
    const s = document.createElement('style');
    s.id = 'tdw-input-context-styles';
    s.textContent = `
.tdw-input-context-menu{position:fixed;z-index:100050;min-width:180px;background:var(--card,#fff);border:1px solid var(--border,#ddd);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.18);padding:6px;display:flex;flex-direction:column;gap:2px}
.tdw-ctx-item{display:block;width:100%;text-align:right;border:none;background:transparent;padding:8px 12px;font-size:13px;font-weight:700;color:var(--text,#222);border-radius:7px;cursor:pointer}
.tdw-ctx-item:hover:not([disabled]){background:var(--surface,#f4f6f8)}
.tdw-ctx-item[disabled]{opacity:.45;cursor:not-allowed}
.tdw-ctx-sep{height:1px;background:var(--border,#e5e5e5);margin:4px 6px}`;
    document.head.appendChild(s);
  }

  // Native keyboard editing is intentionally not intercepted. Ctrl/⌘+C/V/X/A/Z/Y,
  // Enter, Escape, Tab, Delete and Backspace keep their browser/Electron semantics
  // inside editable controls; application shortcuts must opt in outside those controls.
  function init() {
    if (initialized) return;
    initialized = true;
    injectStyles();
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('click', hideMenu, true);
    document.addEventListener('scroll', hideMenu, true);
    window.addEventListener('resize', hideMenu);
  }

  function destroy() {
    if (!initialized) return;
    initialized = false;
    document.removeEventListener('contextmenu', onContextMenu, true);
    document.removeEventListener('click', hideMenu, true);
    document.removeEventListener('scroll', hideMenu, true);
    window.removeEventListener('resize', hideMenu);
    hideMenu();
  }

  global.DesktopInput = { init, destroy, hideMenu, isEditableField };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
