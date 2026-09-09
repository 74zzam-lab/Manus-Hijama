/**
 * Electron-safe dialogs — window.prompt/confirm are unsupported in Chromium Embedded.
 * Prefer await tdwAskText / tdwConfirm / tdwAskPassword.
 * Sync polyfills: confirm → native Electron MessageBox (sendSync); prompt → async modal only.
 */
(function (global) {
  'use strict';

  const STYLE_ID = 'tdw-dialogs-styles';
  const HOST_ID = 'tdwDialogHost';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
#tdwDialogHost.modal-overlay{z-index:100080}
#tdwDialogHost .modal{max-width:min(440px,100%);width:100%}
#tdwDialogHost .tdw-dlg-msg{font-size:13px;color:var(--text-muted,#64748b);margin:0 0 12px;line-height:1.7}
#tdwDialogHost .tdw-dlg-label{display:block;font-size:12px;font-weight:800;margin-bottom:6px;color:var(--text,#334155)}
#tdwDialogHost .tdw-dlg-hint{font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.5}
`;
    document.head.appendChild(s);
  }

  function ensureHost() {
    injectStyles();
    let el = document.getElementById(HOST_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = HOST_ID;
    el.className = 'modal-overlay';
    el.setAttribute('role', 'presentation');
    el.innerHTML = `
      <div class="modal modal-shell modal-shell--sm" role="dialog" aria-modal="true" aria-labelledby="tdw-dlg-title">
        <header class="modal-header">
          <div class="modal-title" id="tdw-dlg-title">إدخال</div>
          <button type="button" class="modal-close" id="tdw-dlg-close" aria-label="إغلاق">✕</button>
        </header>
        <section class="modal-body">
          <p class="tdw-dlg-msg" id="tdw-dlg-msg"></p>
          <label class="tdw-dlg-label" id="tdw-dlg-label" for="tdw-dlg-input">القيمة</label>
          <input class="form-control" id="tdw-dlg-input" autocomplete="off">
          <p class="tdw-dlg-hint" id="tdw-dlg-hint" hidden></p>
        </section>
        <footer class="modal-footer modal-actions">
          <button type="button" class="btn btn-ghost" id="tdw-dlg-cancel">إلغاء</button>
          <button type="button" class="btn btn-primary" id="tdw-dlg-ok">تأكيد</button>
        </footer>
      </div>`;
    document.body.appendChild(el);
    return el;
  }

  let _resolver = null;

  function close(result) {
    const host = document.getElementById(HOST_ID);
    host?.classList.remove('open');
    const r = _resolver;
    _resolver = null;
    if (r) r(result);
  }

  /**
   * @param {{ title?: string, message?: string, label?: string, defaultValue?: string, type?: string, hint?: string, okText?: string, cancelText?: string, required?: boolean }} opts
   * @returns {Promise<string|null>} null if cancelled
   */
  function tdwAskText(opts) {
    opts = opts || {};
    const host = ensureHost();
    if (_resolver) close(null);

    return new Promise((resolve) => {
      _resolver = resolve;
      const title = host.querySelector('#tdw-dlg-title');
      const msg = host.querySelector('#tdw-dlg-msg');
      const label = host.querySelector('#tdw-dlg-label');
      const input = host.querySelector('#tdw-dlg-input');
      const hint = host.querySelector('#tdw-dlg-hint');
      const ok = host.querySelector('#tdw-dlg-ok');
      const cancel = host.querySelector('#tdw-dlg-cancel');
      const x = host.querySelector('#tdw-dlg-close');

      if (title) title.textContent = opts.title || 'إدخال';
      if (msg) {
        msg.textContent = opts.message || '';
        msg.style.display = opts.message ? '' : 'none';
      }
      if (label) {
        label.textContent = opts.label || 'القيمة';
        label.style.display = opts.type === 'confirm' ? 'none' : '';
      }
      if (input) {
        input.type = opts.type === 'password' ? 'password' : 'text';
        input.value = opts.defaultValue != null ? String(opts.defaultValue) : '';
        input.placeholder = opts.placeholder || '';
        input.style.display = opts.type === 'confirm' ? 'none' : '';
      }
      if (hint) {
        hint.textContent = opts.hint || '';
        hint.hidden = !opts.hint;
      }
      if (ok) ok.textContent = opts.okText || (opts.type === 'confirm' ? 'نعم' : 'تأكيد');
      if (cancel) cancel.textContent = opts.cancelText || (opts.type === 'confirm' ? 'لا' : 'إلغاء');

      const finishOk = () => {
        if (opts.type === 'confirm') {
          close(true);
          return;
        }
        const v = String(input?.value || '').trim();
        if (opts.required !== false && !v) {
          global.notify?.('⚠️ أدخل قيمة', 'warning');
          input?.focus();
          return;
        }
        close(v);
      };

      ok.onclick = finishOk;
      cancel.onclick = () => close(opts.type === 'confirm' ? false : null);
      x.onclick = () => close(opts.type === 'confirm' ? false : null);
      host.onclick = (e) => { if (e.target === host) close(opts.type === 'confirm' ? false : null); };
      input.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finishOk(); }
        if (e.key === 'Escape') { e.preventDefault(); close(opts.type === 'confirm' ? false : null); }
      };

      host.classList.add('open');
      setTimeout(() => {
        if (opts.type === 'confirm') ok?.focus();
        else input?.focus();
      }, 30);
    });
  }

  function tdwAskPassword(opts) {
    return tdwAskText(Object.assign({}, opts, { type: 'password' }));
  }

  function tdwConfirm(opts) {
    if (typeof opts === 'string') opts = { message: opts };
    return tdwAskText(Object.assign({}, opts, {
      type: 'confirm',
      title: (opts && opts.title) || 'تأكيد',
      message: (opts && opts.message) || 'هل أنت متأكد؟',
      okText: (opts && opts.okText) || 'نعم',
      cancelText: (opts && opts.cancelText) || 'لا'
    })).then((v) => v === true);
  }

  function electronConfirmSync(message) {
    try {
      const api = global.cuppingElectron || global.tadawi;
      if (api?.dialogs?.confirmSync) {
        return !!api.dialogs.confirmSync(String(message || 'هل أنت متأكد؟'));
      }
    } catch { /* empty */ }
    return null;
  }

  /** Sync confirm: Electron MessageBox when available; else native confirm; never fake-false. */
  function confirmPolyfill(message) {
    const nativeResult = electronConfirmSync(message);
    if (typeof nativeResult === 'boolean') return nativeResult;
    try {
      if (typeof confirmPolyfill._native === 'function') {
        return !!confirmPolyfill._native(String(message || 'هل أنت متأكد؟'));
      }
    } catch { /* empty */ }
    // Last resort: async UI cannot answer sync callers — default cancel without toast spam.
    console.warn('[tdw-dialogs] confirm unavailable; treating as cancel', message);
    return false;
  }

  /** Sync prompt cannot collect text in Electron — use await tdwAskText(). */
  function promptPolyfill(message, defaultValue) {
    console.warn('[tdw-dialogs] window.prompt is not supported in Electron. Use await tdwAskText().', message);
    // Open async modal for accidental callers (best-effort); sync return is always null.
    try {
      tdwAskText({ title: 'إدخال', message: String(message || ''), defaultValue: defaultValue || '' });
    } catch { /* empty */ }
    return null;
  }

  try {
    if (typeof global.confirm === 'function' && !global.confirm.__tdw) {
      confirmPolyfill._native = global.confirm.bind(global);
    }
    confirmPolyfill.__tdw = true;
    promptPolyfill.__tdw = true;
    global.prompt = promptPolyfill;
    global.confirm = confirmPolyfill;
    if (typeof window !== 'undefined') {
      window.prompt = promptPolyfill;
      window.confirm = confirmPolyfill;
    }
  } catch { /* empty */ }

  global.tdwAskText = tdwAskText;
  global.tdwAskPassword = tdwAskPassword;
  global.tdwConfirm = tdwConfirm;
  global.TdwDialogs = { ask: tdwAskText, askPassword: tdwAskPassword, confirm: tdwConfirm };
})(typeof window !== 'undefined' ? window : globalThis);
