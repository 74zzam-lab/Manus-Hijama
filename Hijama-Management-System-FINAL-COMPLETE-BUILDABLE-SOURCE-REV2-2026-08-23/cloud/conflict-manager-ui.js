/**
 * Conflict Manager UI — manager-only, simple conflict resolution.
 */
(function (global) {
  'use strict';

  function injectStyles() {
    if (document.getElementById('conflict-ui-styles')) return;
    const s = document.createElement('style');
    s.id = 'conflict-ui-styles';
    s.textContent = `
.cf-overlay{position:fixed;inset:0;z-index:100050;background:rgba(15,25,35,.75);display:none;align-items:center;justify-content:center;padding:12px}
.cf-overlay.open{display:flex}
.cf-card.modal-shell{max-width:min(560px,calc(100vw - 24px));width:100%;max-height:min(92vh,calc(100dvh - 24px));overflow:hidden;background:var(--card,#fff);border-radius:18px;padding:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto}
.cf-card .modal-header{padding:16px 20px;border-bottom:1px solid var(--border)}
.cf-card .modal-header h2{margin:0;font-size:18px;font-weight:900;color:var(--primary)}
.cf-card .modal-body{padding:16px 20px;overflow:auto;min-height:0}
.cf-card .modal-footer{padding:12px 20px;border-top:1px solid var(--border)}
.cf-item{border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px;background:var(--surface,#f8f9fa)}
.cf-item p{margin:0 0 10px;font-size:13px;line-height:1.65}
.cf-diff{font-size:11px;background:#fff;border-radius:8px;padding:8px;margin:8px 0;max-height:120px;overflow:auto}
.cf-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cf-actions .btn{font-size:12px;padding:8px;min-height:44px}
@media (max-width:480px){.cf-actions{grid-template-columns:1fr}}
`;
    document.head.appendChild(s);
  }

  function ensureDOM() {
    injectStyles();
    if (document.getElementById('conflictManagerOverlay')) return;
    const el = document.createElement('div');
    el.id = 'conflictManagerOverlay';
    el.className = 'cf-overlay';
    el.innerHTML = `
      <div class="cf-card modal modal-shell modal-shell--sm" role="dialog" aria-modal="true" aria-labelledby="cf-title">
        <div class="modal-header">
          <h2 id="cf-title">⚖️ تعارضات تحتاج مراجعة</h2>
          <button type="button" class="modal-close" id="cf-close" aria-label="إغلاق">✕</button>
        </div>
        <div class="modal-body" id="cf-list"></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" id="cf-close-footer">إغلاق</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#cf-close').onclick = close;
    el.querySelector('#cf-close-footer').onclick = close;
    el.addEventListener('click', e => { if (e.target === el) close(); });
  }

  function renderDiff(item) {
    const diff = global.ConflictQueue?.getFieldDiff?.(item) || [];
    if (!diff.length) return '';
    return `<div class="cf-diff">${diff.map(d =>
      `<div><b>${d.field}</b>: محلي=${JSON.stringify(d.local)} | سحابة=${JSON.stringify(d.remote)}</div>`
    ).join('')}</div>`;
  }

  function renderList() {
    const host = document.getElementById('cf-list');
    if (!host) return;
    const pending = global.ConflictQueue?.listMerged?.({ status: 'pending' })
      || global.ConflictQueue?.list?.({ status: 'pending' })
      || [];
    if (!pending.length) {
      host.innerHTML = '<p style="text-align:center;color:var(--text-muted)">لا توجد تعارضات معلقة ✅</p>';
      return;
    }
    host.innerHTML = pending.map(item => `
      <div class="cf-item" data-id="${item.id}">
        <p>${item.summary || global.ConflictQueue?.friendlySummary?.(item)}</p>
        ${renderDiff(item)}
        <div class="cf-actions">
          <button type="button" class="btn btn-primary cf-use-local" data-id="${item.id}">استخدام النسخة المحلية</button>
          <button type="button" class="btn btn-secondary cf-use-cloud" data-id="${item.id}">استخدام نسخة السحابة</button>
          <button type="button" class="btn btn-ghost cf-compare" data-id="${item.id}">مقارنة الفروقات</button>
          <button type="button" class="btn btn-ghost cf-manual" data-id="${item.id}">دمج يدوي</button>
        </div>
      </div>`).join('');

    host.querySelectorAll('.cf-use-local').forEach(btn => {
      btn.onclick = () => resolveItem(btn.dataset.id, 'local');
    });
    host.querySelectorAll('.cf-use-cloud').forEach(btn => {
      btn.onclick = () => resolveItem(btn.dataset.id, 'cloud');
    });
    host.querySelectorAll('.cf-compare').forEach(btn => {
      btn.onclick = () => {
        const item = pending.find(x => x.id === btn.dataset.id);
        if (item) alert(`الفروقات:\n${(item.fields || []).join(', ')}\n\nمحلي: ${JSON.stringify(item.local, null, 1).slice(0, 500)}\n\nسحابة: ${JSON.stringify(item.remote, null, 1).slice(0, 500)}`);
      };
    });
    host.querySelectorAll('.cf-manual').forEach(btn => {
      btn.onclick = () => manualMerge(btn.dataset.id);
    });
  }

  function resolveItem(id, choice) {
    const res = global.ConflictQueue?.resolve?.(id, { choice });
    if (res?.ok) {
      global.notify?.('✅ تم حل التعارض', 'success');
      if (typeof global.reloadClientStoreFromDb === 'function') global.reloadClientStoreFromDb();
      if (typeof global.refreshCaseDerivedViews === 'function') global.refreshCaseDerivedViews();
      renderList();
    } else if (res?.error === 'manager_only') {
      global.notify?.('⛔ هذه الشاشة للمدير فقط', 'danger');
    } else {
      global.notify?.('⚠️ تعذر حل التعارض', 'danger');
    }
  }

  function manualMerge(id) {
    const item = (global.ConflictQueue?.listMerged?.({ status: 'pending' })
      || global.ConflictQueue?.list?.({ status: 'pending' })
      || []).find(x => x.id === id);
    if (!item) return;
    const merged = { ...item.remote, ...item.local, id: item.recordId };
    const res = global.ConflictQueue?.resolve?.(id, { choice: 'merge', record: merged });
    if (res?.ok) {
      global.notify?.('✅ تم الدمج اليدوي', 'success');
      if (typeof global.reloadClientStoreFromDb === 'function') global.reloadClientStoreFromDb();
      if (typeof global.refreshCaseDerivedViews === 'function') global.refreshCaseDerivedViews();
      renderList();
    }
  }

  function open() {
    if (!global.OperationalRbacGuard?.canResolveConflicts?.()
      && !global.RolePolicy?.canResolveConflicts?.()) {
      global.notify?.('⛔ شاشة التعارضات للمدير فقط', 'danger');
      return false;
    }
    ensureDOM();
    renderList();
    document.getElementById('conflictManagerOverlay')?.classList.add('open');
    return true;
  }

  function close() {
    document.getElementById('conflictManagerOverlay')?.classList.remove('open');
  }

  function notifyPending() {
    if (!global.RolePolicy?.isManager?.()) return;
    const n = global.ConflictQueue?.countPending?.() || 0;
    if (n > 0) global.notify?.(`⚠️ ${n} تعارض يحتاج مراجعة المدير`, 'warning');
  }

  global.ConflictManagerUI = {
    open,
    close,
    notifyPending,
    renderList
  };
})(typeof window !== 'undefined' ? window : globalThis);
