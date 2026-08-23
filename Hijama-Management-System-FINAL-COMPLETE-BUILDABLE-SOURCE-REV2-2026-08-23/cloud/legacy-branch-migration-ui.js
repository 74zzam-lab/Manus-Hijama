/**
 * V2-5.10 — Mandatory Legacy Branch Migration wizard (reuses LegacyBranchMigration engine).
 */
(function (global) {
  'use strict';

  const MODAL_ID = 'legacy-branch-migration-modal';
  let _running = false;
  let _selectedBranch = null;
  let _lastReport = null;

  function branches() {
    const doc = global.LicenseCloud?.loadLocal?.();
    const list = (doc?.branches || []).filter((b) => b && b.active !== false && !b.pending);
    if (list.length) return list;
    return [{ id: 'BR-MAIN', name: 'الفرع الرئيسي', active: true }];
  }

  function branchLabel(id) {
    const b = branches().find((x) => x.id === id);
    return b?.name || id;
  }

  function ensureDOM() {
    if (document.getElementById(MODAL_ID)) return;
    const el = document.createElement('div');
    el.id = MODAL_ID;
    el.className = 'modal-overlay';
    el.innerHTML = `
<div class="modal modal-shell tdw-modal tdw-modal--wizard" role="dialog" aria-modal="true" aria-labelledby="lbm-title">
  <div class="modal-header">
    <div class="modal-title" id="lbm-title">🌿 ترحيل السجلات القديمة (branchId)</div>
    <button type="button" class="modal-close" id="lbm-close" aria-label="إغلاق">✕</button>
  </div>
  <div class="modal-body" id="lbm-body">
    <p id="lbm-intro" style="margin:0 0 12px;font-size:13px;color:var(--text-muted);line-height:1.7">
      <strong>معالج لمرة واحدة بعد الترقية</strong> — يفحص السجلات التشغيلية (عملاء، حالات، مواعيد، …) التي لا تحتوي على
      <code dir="ltr">branchId</code> ويعيّنها لفرع محدد. بدون هذا الترحيل قد تظهر البيانات في كل الفروع عند التبديل،
      أو تُرفض عمليات الحفظ والمزامنة. إذا اكتمل الترحيل سابقاً فلا حاجة لإعادته.
    </p>
    <div id="lbm-step-detect" class="lbm-step">
      <div class="card" style="padding:12px;margin-bottom:10px">
        <div style="font-weight:800;margin-bottom:8px">1) فحص السجلات</div>
        <div id="lbm-detect-summary" class="oh-muted">—</div>
        <table id="lbm-detect-table" style="width:100%;font-size:12px;margin-top:8px;border-collapse:collapse" hidden>
          <thead><tr><th>جدول</th><th>إجمالي</th><th>بلا فرع</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
    <div id="lbm-step-branch" class="lbm-step" hidden>
      <div class="card" style="padding:12px;margin-bottom:10px">
        <div style="font-weight:800;margin-bottom:8px">2) اختيار الفرع المستهدف</div>
        <label class="form-label" for="lbm-branch-select">كل السجلات القديمة تُنسب إلى:</label>
        <select id="lbm-branch-select" class="form-control" style="max-width:320px"></select>
        <p id="lbm-multi-hint" class="oh-muted" style="margin:8px 0 0;font-size:12px" hidden>
          مؤسسة متعددة الفروع — التعيين الصامت إلى BR-MAIN ممنوع.
        </p>
      </div>
    </div>
    <div id="lbm-step-confirm" class="lbm-step" hidden>
      <div class="card" style="padding:12px;border-color:var(--warning)">
        <div style="font-weight:800;margin-bottom:8px">3) تأكيد + نسخ احتياطي</div>
        <p id="lbm-confirm-text" style="margin:0;font-size:13px">—</p>
      </div>
    </div>
    <div id="lbm-status" class="bf-status" role="status" style="margin-top:10px"></div>
  </div>
  <div class="modal-footer">
    <button type="button" class="btn btn-ghost" id="lbm-btn-cancel">إلغاء</button>
    <button type="button" class="btn btn-secondary" id="lbm-btn-back" hidden>رجوع</button>
    <button type="button" class="btn btn-primary" id="lbm-btn-next">متابعة</button>
    <button type="button" class="btn btn-accent" id="lbm-btn-run" hidden>✅ تنفيذ الترحيل</button>
  </div>
</div>`;
    document.body.appendChild(el);
    el.querySelector('#lbm-close')?.addEventListener('click', () => close({ dismissed: true }));
    el.querySelector('#lbm-btn-cancel')?.addEventListener('click', () => close({ dismissed: true }));
    el.querySelector('#lbm-btn-back')?.addEventListener('click', () => showPhase('branch'));
    el.querySelector('#lbm-btn-next')?.addEventListener('click', () => onNext());
    el.querySelector('#lbm-btn-run')?.addEventListener('click', () => onRun());
    el.querySelector('#lbm-branch-select')?.addEventListener('change', (e) => {
      _selectedBranch = e.target.value;
    });
  }

  function setStatus(msg, kind) {
    const el = document.getElementById('lbm-status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = kind === 'danger' ? 'var(--danger)' : kind === 'success' ? 'var(--success)' : '';
  }

  function open() {
    const overlay = document.getElementById(MODAL_ID);
    if (overlay) overlay.classList.add('open');
  }

  function close(meta) {
    const overlay = document.getElementById(MODAL_ID);
    if (overlay) overlay.classList.remove('open');
    if (meta?.dismissed && global.LegacyBranchMigration?.needsMigration?.()) {
      global.notify?.('⚠️ الترحيل مطلوب لإكمال الحفظ والمزامنة', 'warning');
    }
  }

  function renderDetect(report) {
    _lastReport = report;
    const sum = document.getElementById('lbm-detect-summary');
    const table = document.getElementById('lbm-detect-table');
    const tbody = table?.querySelector('tbody');
    if (!sum) return;
    if (!report || report.legacyTotal === 0) {
      sum.textContent = 'لا توجد سجلات قديمة — لا حاجة للترحيل.';
      if (table) table.hidden = true;
      return;
    }
    sum.innerHTML = `وُجد <strong>${report.legacyTotal}</strong> سجل بلا فرع — `
      + (report.multiBranch ? 'مؤسسة متعددة الفروع' : 'فرع واحد')
      + ` — enrolled: ${report.enrolledBranches || 0}`;
    if (tbody && table) {
      table.hidden = false;
      tbody.innerHTML = Object.entries(report.byEntity || {}).map(([t, row]) => {
        if (!row?.legacyCount) return '';
        return `<tr><td dir="ltr">${t}</td><td>${row.total}</td><td><strong>${row.legacyCount}</strong></td></tr>`;
      }).join('');
    }
  }

  function populateBranchSelect() {
    const sel = document.getElementById('lbm-branch-select');
    if (!sel) return;
    const list = branches();
    const multi = global.LegacyBranchMigration?.isMultiBranch?.();
    const hist = _lastReport?.historicalDeviceBranch;
    sel.innerHTML = list.map((b) =>
      `<option value="${String(b.id).replace(/"/g, '&quot;')}">${b.name || b.id}</option>`
    ).join('');
    const defaultId = hist && list.some((b) => b.id === hist) ? hist : (list[0]?.id || 'BR-MAIN');
    sel.value = defaultId;
    _selectedBranch = sel.value;
    const hint = document.getElementById('lbm-multi-hint');
    if (hint) hint.hidden = !multi;
    if (multi && defaultId === 'BR-MAIN' && list.length > 1) {
      const alt = list.find((b) => b.id !== 'BR-MAIN');
      if (alt) {
        sel.value = alt.id;
        _selectedBranch = alt.id;
      }
    }
  }

  function showPhase(phase) {
    const detect = document.getElementById('lbm-step-branch');
    const confirm = document.getElementById('lbm-step-confirm');
    const btnNext = document.getElementById('lbm-btn-next');
    const btnBack = document.getElementById('lbm-btn-back');
    const btnRun = document.getElementById('lbm-btn-run');
    if (phase === 'detect') {
      if (detect) detect.hidden = true;
      if (confirm) confirm.hidden = true;
      if (btnNext) { btnNext.hidden = false; btnNext.textContent = 'متابعة'; }
      if (btnBack) btnBack.hidden = true;
      if (btnRun) btnRun.hidden = true;
    } else if (phase === 'branch') {
      populateBranchSelect();
      if (detect) detect.hidden = false;
      if (confirm) confirm.hidden = true;
      if (btnNext) { btnNext.hidden = false; btnNext.textContent = 'تأكيد الخطة'; }
      if (btnBack) btnBack.hidden = true;
      if (btnRun) btnRun.hidden = true;
    } else if (phase === 'confirm') {
      const txt = document.getElementById('lbm-confirm-text');
      if (txt) {
        txt.textContent = `سيتم نسخ احتياطي إلزامي ثم تعيين ${(_lastReport?.legacyTotal || 0)} سجل إلى فرع «${branchLabel(_selectedBranch)}» (${_selectedBranch}). لا يُحذف أي سجل.`;
      }
      if (detect) detect.hidden = false;
      if (confirm) confirm.hidden = false;
      if (btnNext) btnNext.hidden = true;
      if (btnBack) btnBack.hidden = false;
      if (btnRun) btnRun.hidden = false;
    }
  }

  function onNext() {
    const detectVisible = !document.getElementById('lbm-step-branch')?.hidden;
    if (!detectVisible) {
      showPhase('branch');
      return;
    }
    if (document.getElementById('lbm-step-confirm')?.hidden) {
      if (!_selectedBranch) {
        setStatus('اختر فرعاً مستهدفاً', 'danger');
        return;
      }
      showPhase('confirm');
      return;
    }
    showPhase('branch');
  }

  async function onRun() {
    if (_running) return;
    _running = true;
    setStatus('جاري النسخ الاحتياطي والترحيل…');
    const btnRun = document.getElementById('lbm-btn-run');
    if (btnRun) btnRun.disabled = true;
    try {
      const res = await global.LegacyBranchMigration?.runMigration?.({
        mapping: _selectedBranch || 'BR-MAIN',
      });
      if (!res?.ok) {
        setStatus(res?.message || res?.error || 'فشل الترحيل', 'danger');
        global.notify?.('⚠️ فشل ترحيل الفروع: ' + (res?.error || ''), 'danger');
        return;
      }
      setStatus('✅ اكتمل الترحيل — يمكنك الحفظ والمزامنة الآن', 'success');
      global.notify?.('✅ اكتمل ترحيل السجلات القديمة إلى ' + branchLabel(res.mappingBranch || _selectedBranch), 'success');
      if (typeof global.reloadClientStoreFromDb === 'function') global.reloadClientStoreFromDb();
      if (typeof global.renderCloudV2BackupStatus === 'function') global.renderCloudV2BackupStatus();
      setTimeout(() => close({ completed: true }), 800);
    } catch (e) {
      setStatus(String(e?.message || e), 'danger');
    } finally {
      _running = false;
      if (btnRun) btnRun.disabled = false;
    }
  }

  function openWizard(options) {
    options = options || {};
    ensureDOM();
    const mig = global.LegacyBranchMigration;
    if (!mig) {
      global.notify?.('⚠️ وحدة الترحيل غير متاحة', 'danger');
      return { ok: false, error: 'module_missing' };
    }
    const report = mig.detectLegacyRecords?.() || { legacyTotal: 0 };
    if (!options.force && !mig.needsMigration?.()) {
      return { ok: true, skipped: true, report };
    }
    renderDetect(report);
    setStatus('');
    showPhase('detect');
    open();
    if (report.legacyTotal > 0) {
      setTimeout(() => showPhase('branch'), 0);
    }
    return { ok: true, opened: true, report };
  }

  function maybePrompt() {
    if (!global.LegacyBranchMigration?.needsMigration?.()) return { ok: true, skipped: true };
    if (global.CloudDataDiscovery?.isRestoreLocked?.()) return { ok: false, skipped: true, reason: 'restore_locked' };
    if (global.BootFlowUI?.isWizardActive?.()) return { ok: false, skipped: true, reason: 'boot_active' };
    return openWizard({ force: true });
  }

  function onOperationalBlocked(errorCode, context) {
    if (errorCode !== 'legacy_branch_migration_required') return false;
    global.notify?.('⚠️ سجلات بلا فرع — افتح ترحيل Mapping', 'warning');
    openWizard({ force: true });
    return true;
  }

  global.LegacyBranchMigrationUI = {
    openWizard,
    maybePrompt,
    onOperationalBlocked,
    close,
  };
})(typeof window !== 'undefined' ? window : globalThis);
