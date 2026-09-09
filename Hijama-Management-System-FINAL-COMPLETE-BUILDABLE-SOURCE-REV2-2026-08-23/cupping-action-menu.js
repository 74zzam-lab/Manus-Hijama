/**
 * Unified table action buttons — primary row + expandable secondary row (⋮ مزيد).
 */
(function (global) {
  'use strict';

  let _seq = 0;

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function renderActionBtn(a, ab, closeOnClick) {
    const oc = a.onclick
      ? (closeOnClick ? `${a.onclick};typeof closeActionMoreMenus==='function'&&closeActionMoreMenus()` : a.onclick)
      : '';
    return ab(a.icon, a.short != null ? a.short : a.label, {
      cls: a.cls,
      title: a.title || a.label,
      onclick: oc,
      feature: a.feature,
      extraClass: a.extraClass,
      attrs: a.attrs
    });
  }

  function actionMoreRow(menuId, items, ab) {
    const vis = (items || []).filter(it => !it.hidden);
    if (!vis.length) return '';
    const inner = vis.map(it => renderActionBtn(it, ab, true)).join('');
    return `<div class="table-action-more-row" id="${esc(menuId)}" role="menu" hidden>${inner}</div>`;
  }

  function actionMoreToggle(menuId) {
    return `<button type="button" class="btn btn-ghost btn-sm btn-action btn-action-more" onclick="toggleActionMoreMenu(event,'${esc(menuId)}')" title="المزيد" aria-haspopup="true" aria-expanded="false"><span class="btn-ico">⋮</span><span class="btn-lbl">مزيد</span></button>`;
  }

  function actionBtnRowUnified(primary, more, opts) {
    opts = opts || {};
    const max = opts.maxPrimary != null ? opts.maxPrimary : 4;
    const ab = global.actionBtn || (() => '');
    const vis = (primary || []).filter(a => !a.hidden);
    const extra = [...(more || []).filter(a => !a.hidden)];
    const show = vis.slice(0, max);
    const overflow = [...vis.slice(max), ...extra];
    let primaryHtml = '';
    show.forEach(a => { primaryHtml += renderActionBtn(a, ab, false); });
    const mid = opts.menuId || ('am-' + (++_seq) + '-' + Date.now().toString(36).slice(2, 7));
    if (overflow.length) primaryHtml += actionMoreToggle(mid);
    const moreRow = overflow.length ? actionMoreRow(mid, overflow, ab) : '';
    return `<div class="table-action-cell"><div class="table-action-btns table-action-btns-primary">${primaryHtml}</div>${moreRow}</div>`;
  }

  function toggleActionMoreMenu(ev, id) {
    ev.stopPropagation();
    const row = document.getElementById(id);
    if (!row) return;
    const open = row.classList.contains('open');
    closeActionMoreMenus();
    if (!open) {
      row.classList.add('open');
      row.hidden = false;
      const btn = ev.currentTarget;
      if (btn) btn.setAttribute('aria-expanded', 'true');
    }
  }

  function closeActionMoreMenus() {
    document.querySelectorAll('.table-action-more-row.open').forEach(r => {
      r.classList.remove('open');
      r.hidden = true;
    });
    document.querySelectorAll('.btn-action-more[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      if (e.target.closest('.table-action-cell')) return;
      closeActionMoreMenus();
    });
  }

  global.actionBtnRowUnified = actionBtnRowUnified;
  global.toggleActionMoreMenu = toggleActionMoreMenu;
  global.closeActionMoreMenus = closeActionMoreMenus;
})(typeof window !== 'undefined' ? window : globalThis);
