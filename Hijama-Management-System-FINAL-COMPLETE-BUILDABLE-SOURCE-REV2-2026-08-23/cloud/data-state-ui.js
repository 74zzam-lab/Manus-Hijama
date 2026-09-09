/**
 * Data State UI — simple, non-technical screen for data comparison.
 */
(function (global) {
  'use strict';

  let _lastAnalysis = null;
  let _lastPresented = null;

  function injectStyles() {
    if (document.getElementById('data-state-ui-styles')) return;
    const s = document.createElement('style');
    s.id = 'data-state-ui-styles';
    s.textContent = `
.ds-overlay{position:fixed;inset:0;z-index:100040;background:rgba(15,25,35,.72);display:none;align-items:center;justify-content:center;padding:16px}
.ds-overlay.open{display:flex}
.ds-card{max-width:520px;width:100%;background:var(--card,#fff);border-radius:18px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.ds-card h2{margin:0 0 8px;font-size:20px;font-weight:900;color:var(--primary,#3D5A80);text-align:center}
.ds-lead{margin:0 0 18px;font-size:13px;color:var(--text-muted,#666);text-align:center;line-height:1.7}
.ds-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
.ds-stat{padding:12px;border-radius:12px;background:var(--surface,#f5f7fa);border:1px solid var(--border,#e5e7eb);text-align:center}
.ds-stat b{display:block;font-size:22px;font-weight:900;color:var(--primary)}
.ds-stat span{font-size:11px;color:var(--text-muted)}
.ds-times{display:grid;gap:8px;margin-bottom:16px;font-size:12px;color:var(--text-muted)}
.ds-status{padding:14px;border-radius:12px;font-size:14px;font-weight:800;text-align:center;margin-bottom:16px}
.ds-status.ok{background:rgba(46,160,100,.12);color:#1a7a4a}
.ds-status.warn{background:rgba(255,160,90,.15);color:#b35a00}
.ds-status.danger{background:rgba(220,60,60,.12);color:#a02020}
.ds-actions{display:grid;gap:8px}
.ds-actions .btn{width:100%}
`;
    document.head.appendChild(s);
  }

  function ensureDOM() {
    injectStyles();
    if (document.getElementById('dataStateOverlay')) return;
    const el = document.createElement('div');
    el.id = 'dataStateOverlay';
    el.className = 'ds-overlay';
    el.innerHTML = `
      <div class="ds-card" role="dialog" aria-labelledby="ds-title">
        <h2 id="ds-title">حالة البيانات</h2>
        <p class="ds-lead" id="ds-headline"></p>
        <div class="ds-stats" id="ds-stats"></div>
        <div class="ds-times" id="ds-times"></div>
        <div class="ds-status" id="ds-status"></div>
        <div class="ds-actions" id="ds-actions"></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) close(); });
  }

  function statusClass(state, blocked) {
    if (state === 'identical' || state === 'offline') return 'ok';
    if (state === 'conflict' || blocked) return 'danger';
    return 'warn';
  }

  function render(presented, analysis) {
    document.getElementById('ds-headline').textContent = presented.headline;
    document.getElementById('ds-stats').innerHTML = `
      <div class="ds-stat"><b>${presented.counts.clients}</b><span>عميل</span></div>
      <div class="ds-stat"><b>${presented.counts.invoices}</b><span>فاتورة</span></div>
      <div class="ds-stat"><b>${presented.counts.bookings}</b><span>حجز</span></div>
      <div class="ds-stat"><b>${presented.counts.sessions}</b><span>جلسة</span></div>`;
    document.getElementById('ds-times').innerHTML = `
      <div>📱 آخر تعديل محلي: <strong>${presented.lastLocalEditLabel}</strong></div>
      <div>☁️ آخر تعديل على السحابة: <strong>${presented.lastCloudEditLabel}</strong></div>`;
    const st = document.getElementById('ds-status');
    st.textContent = presented.stateLabel;
    st.className = 'ds-status ' + statusClass(presented.state, presented.blocked);

    const actions = document.getElementById('ds-actions');
    actions.innerHTML = '';

    if (presented.canAutoProceed) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary';
      btn.textContent = '✅ متابعة المزامنة الآمنة';
      btn.onclick = async () => {
        btn.disabled = true;
        const res = await global.DataStateAnalyzer?.executeSafeAuto?.(analysis);
        if (res?.ok) {
          close();
          global.notify?.('✅ تمت المزامنة بنجاح', 'success');
          if (typeof global.reloadClientStoreFromDb === 'function') global.reloadClientStoreFromDb();
          if (typeof global.refreshCaseDerivedViews === 'function') global.refreshCaseDerivedViews();
          if (typeof global.refreshActivePageAfterCloudSync === 'function') global.refreshActivePageAfterCloudSync();
        }
        else global.notify?.('⚠️ تعذرت المزامنة التلقائية', 'danger');
        btn.disabled = false;
      };
      actions.appendChild(btn);
    }

    if (presented.requiresManager && global.RolePolicy?.isManager?.()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary';
      btn.textContent = '⚖️ مراجعة التعارضات';
      btn.onclick = () => { close(); global.ConflictManagerUI?.open?.(); };
      actions.appendChild(btn);
    } else if (presented.blocked && !global.RolePolicy?.isManager?.()) {
      const p = document.createElement('p');
      p.style.cssText = 'font-size:12px;text-align:center;color:var(--text-muted)';
      p.textContent = 'يرجى التواصل مع المدير لحل اختلاف البيانات';
      actions.appendChild(p);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-ghost';
    closeBtn.textContent = 'إغلاق';
    closeBtn.onclick = close;
    actions.appendChild(closeBtn);
  }

  async function analyzeAndShow(options) {
    options = options || {};
    ensureDOM();
    const analysis = await global.DataStateAnalyzer?.analyze?.({ dryRun: false, ...options });
    if (!analysis) return { ok: false };
    _lastAnalysis = analysis;
    _lastPresented = global.DataStatePresenter?.present?.(analysis, options);
    render(_lastPresented, analysis);
    document.getElementById('dataStateOverlay')?.classList.add('open');
    global.AuditLogger?.logSyncEvent?.('DATA_ANALYSIS', {
      summary: `تحليل البيانات: ${_lastPresented?.stateLabel || analysis.state}`,
      state: analysis.state,
      blocked: analysis.blocked
    });
    return { ok: true, analysis, presented: _lastPresented };
  }

  function open(analysis) {
    ensureDOM();
    if (analysis) {
      _lastAnalysis = analysis;
      _lastPresented = global.DataStatePresenter?.present?.(analysis);
      render(_lastPresented, analysis);
    }
    document.getElementById('dataStateOverlay')?.classList.add('open');
  }

  function close() {
    document.getElementById('dataStateOverlay')?.classList.remove('open');
  }

  function getLastAnalysis() {
    return _lastAnalysis;
  }

  global.DataStateUI = {
    analyzeAndShow,
    open,
    close,
    getLastAnalysis
  };
})(typeof window !== 'undefined' ? window : globalThis);
