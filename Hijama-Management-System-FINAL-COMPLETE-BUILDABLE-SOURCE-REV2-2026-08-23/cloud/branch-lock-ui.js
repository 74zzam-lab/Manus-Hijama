/**
 * Branch Lock UI — device activation selects an authorized branch only.
 * Branch create is Owner Hub exclusive (source:'owner_hub').
 */
(function (global) {
  'use strict';

  const ERR_AR = {
    branch_name_required: 'أدخل اسم الفرع',
    branch_limit_reached: 'تم بلوغ الحد الأقصى للفروع في الترخيص',
    branch_not_licensed: 'الفرع غير مسجّل — اختر فرعاً مصرّحاً من القائمة',
    no_authorized_branches: 'لا توجد فروع مصرّح بها — أنشئ الفرع الأول من Owner Hub (المالك فقط)',
    owner_hub_required: 'إنشاء الفروع متاح للمالك فقط من Owner Hub'
  };

  function getBranches() {
    const doc = global.LicenseCloud?.loadLocal?.();
    // Prefer membership-filtered list when available; fall back to license enrolled branches.
    const authorized = global.BranchScope?.listAuthorizedBranches?.(global.currentUser, doc);
    if (Array.isArray(authorized) && authorized.length) {
      return authorized.filter(b => b && b.active !== false);
    }
    const enrolled = global.BranchEnrollment?.getEnrolledBranches?.(doc) || doc?.branches || [];
    if (enrolled.length) return enrolled.filter(b => b && b.active !== false);
    return [];
  }

  function enrollmentHint(doc) {
    doc = doc || global.LicenseCloud?.loadLocal?.() || {};
    const max = global.LicenseLimits?.getMaxBranches?.(doc) || 1;
    const count = getBranches().length;
    if (!count) {
      return 'لا فروع بعد — إنشاء الفروع للمالك فقط من Owner Hub، ثم عُد هنا لربط الجهاز.';
    }
    return `اختر فرعاً مصرّحاً لربط هذا الجهاز (${count}/${max}). الإنشاء محظور هنا — Owner Hub فقط.`;
  }

  function injectStyles() {
    if (document.getElementById('branch-lock-styles')) return;
    const s = document.createElement('style');
    s.id = 'branch-lock-styles';
    s.textContent = `
.bl-overlay{position:fixed;inset:0;z-index:100020;background:rgba(8,18,14,.6);display:none;align-items:center;justify-content:center;padding:16px}
.bl-overlay.open{display:flex}
.bl-modal{max-width:460px;width:100%;background:var(--card);border-radius:14px;padding:22px;border:1px solid var(--border);box-shadow:0 20px 48px rgba(0,0,0,.25)}
.bl-modal h2{margin:0 0 8px;font-size:18px;font-weight:900;color:var(--primary)}
.bl-modal p{margin:0 0 16px;font-size:13px;color:var(--text-muted);line-height:1.7}
.bl-empty{padding:12px;border-radius:10px;border:1px dashed var(--border);background:var(--surface);font-size:13px;line-height:1.7;color:var(--text-muted);margin-bottom:12px}
`;
    document.head.appendChild(s);
  }

  function ensureDOM() {
    injectStyles();
    if (document.getElementById('branchLockModal')) return;
    const el = document.createElement('div');
    el.id = 'branchLockModal';
    el.className = 'bl-overlay';
    el.innerHTML = `
      <div class="bl-modal" role="dialog" aria-labelledby="bl-title">
        <h2 id="bl-title">🏥 ربط الجهاز بالفرع</h2>
        <p id="bl-branch-hint"></p>
        <div id="bl-panel-empty" class="bl-empty" style="display:none"></div>
        <div id="bl-panel-existing" class="bl-panel">
          <div class="form-group"><label class="form-label">الفرع المصرّح</label>
            <select class="form-control" id="bl-branch-id"></select></div>
        </div>
        <div class="form-group"><label class="form-label">اسم الجهاز</label>
          <input class="form-control" id="bl-device-name" placeholder="Reception-PC"></div>
        <button type="button" class="btn btn-primary" style="width:100%;margin-top:8px" id="bl-confirm">✅ تأكيد وربط الجهاز</button>
        <button type="button" class="btn btn-ghost" style="width:100%;margin-top:8px;display:none" id="bl-open-owner-hub">فتح Owner Hub</button>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#bl-confirm').onclick = () => confirmBranchLock();
    el.querySelector('#bl-open-owner-hub').onclick = () => {
      closeBranchLockModal();
      if (typeof global.showPage === 'function') global.showPage('owner-hub');
      else global.CenterSetupUI?.open?.('manage');
    };
  }

  function refreshBranchLockUI() {
    const doc = global.LicenseCloud?.loadLocal?.() || {};
    const branches = getBranches();
    const hint = document.getElementById('bl-branch-hint');
    if (hint) hint.textContent = enrollmentHint(doc);

    const panelEmpty = document.getElementById('bl-panel-empty');
    const panelExisting = document.getElementById('bl-panel-existing');
    const confirmBtn = document.getElementById('bl-confirm');
    const hubBtn = document.getElementById('bl-open-owner-hub');

    if (!branches.length) {
      if (panelEmpty) {
        panelEmpty.style.display = 'block';
        panelEmpty.textContent = ERR_AR.no_authorized_branches;
      }
      panelExisting && (panelExisting.style.display = 'none');
      if (confirmBtn) confirmBtn.disabled = true;
      if (hubBtn) hubBtn.style.display = '';
      return;
    }

    if (panelEmpty) panelEmpty.style.display = 'none';
    panelExisting && (panelExisting.style.display = '');
    if (confirmBtn) confirmBtn.disabled = false;
    if (hubBtn) hubBtn.style.display = 'none';

    const sel = document.getElementById('bl-branch-id');
    if (sel) {
      sel.innerHTML = branches.map(b =>
        `<option value="${String(b.id).replace(/"/g, '&quot;')}">${b.name || b.id}</option>`
      ).join('');
    }
  }

  function shouldShow() {
    if (global.DeviceConfig?.needsBranchSelection?.() !== true) return false;
    if (global.LicenseCloud?.loadLocal?.()?.centerId) return true;
    if (typeof global.licLoad === 'function' && global.licLoad()) return true;
    return false;
  }

  async function openBranchLockModal() {
    await global.CenterSetup?.prepareForBranchSetup?.();
    ensureDOM();
    refreshBranchLockUI();
    const cfg = global.DeviceConfig?.load?.() || {};
    const nameEl = document.getElementById('bl-device-name');
    if (nameEl && !nameEl.value) {
      nameEl.value = cfg.deviceName || (global.settings?.backup?.deviceName) || ('PC-' + (cfg.deviceUuid || '').slice(0, 6));
    }
    document.getElementById('branchLockModal')?.classList.add('open');
  }

  function closeBranchLockModal() {
    document.getElementById('branchLockModal')?.classList.remove('open');
  }

  async function confirmBranchLock() {
    const name = document.getElementById('bl-device-name')?.value?.trim();
    if (!name) {
      global.notify?.('⚠️ أدخل اسم الجهاز', 'danger');
      return;
    }

    const doc = global.LicenseCloud?.loadLocal?.() || {};
    const branches = getBranches();
    if (!branches.length) {
      global.notify?.('⛔ ' + ERR_AR.no_authorized_branches, 'danger');
      return;
    }

    const branchId = document.getElementById('bl-branch-id')?.value;
    if (!branchId) {
      global.notify?.('⚠️ اختر الفرع', 'danger');
      return;
    }
    if (!branches.some(b => b.id === branchId)) {
      global.notify?.('⛔ ' + ERR_AR.branch_not_licensed, 'danger');
      return;
    }

    const lockResult = global.DeviceConfig?.trySetBranchLock?.(branchId, true, name, { activation: true })
      || { ok: true, cfg: global.DeviceConfig?.setBranchLock?.(branchId, true, name, { activation: true }) };
    if (lockResult.ok === false) {
      global.notify?.('⛔ تغيير ربط الفرع للمالك فقط', 'danger');
      return;
    }
    global.DeviceConfig?.ensureDeviceConfig?.({ deviceName: name, centerId: doc.centerId });
    const reg = await global.DeviceRegistry?.registerDevice?.({ deviceName: name, branchId });
    if (reg && !reg.ok && reg.error === 'branch_not_licensed') {
      global.notify?.('⛔ ' + ERR_AR.branch_not_licensed, 'danger');
      return;
    }
    global.BranchScope?.setActiveBranchId?.(branchId);
    closeBranchLockModal();
    const bName = branches.find(b => b.id === branchId)?.name || branchId;
    global.notify?.('✅ تم ربط الجهاز بفرع ' + bName, 'success');
    if (typeof global.logAudit === 'function') {
      global.logAudit('DEVICE_BRANCH_LOCKED', `Branch lock: ${branchId} — ${name}`);
    } else {
      global.AuditLogger?.logSyncEvent?.('DEVICE_BRANCH_LOCKED', {
        entity: 'device',
        entityId: global.DeviceConfig?.load?.()?.deviceUuid || '',
        summary: `Branch lock UI: ${branchId} — ${name}`,
        meta: { branchId, deviceName: name, source: 'branch_lock_ui' }
      });
    }
    global.CloudV2?.maybeAutoEnableCloudV2?.();
    if (global.CloudMeta?.isCloudV2Enabled?.() && global.CloudBootstrap?.runNewDeviceBootstrap) {
      global.notify?.('⏳ جاري تحميل بيانات الفرع من السحابة...', 'info');
      try {
        const boot = await global.CloudBootstrap.runNewDeviceBootstrap({ branchId, startSync: true });
        if (boot?.ok) {
          global.notify?.('✅ تم تحميل بيانات الفرع — المزامنة نشطة', 'success');
          global.OwnerHub?.applyNavVisibility?.();
          if (typeof global.reloadClientStoreFromDb === 'function') global.reloadClientStoreFromDb();
          if (typeof global.refreshCaseDerivedViews === 'function') global.refreshCaseDerivedViews();
          if (typeof global.refreshActivePageAfterCloudSync === 'function') global.refreshActivePageAfterCloudSync();
        } else if (boot?.offline) {
          global.notify?.('⚠️ لا اتصال بالسحابة — سيتم التحميل عند الاتصال', 'warning');
        }
      } catch { /* empty */ }
    }
  }

  function maybePromptBranchLock() {
    if (!shouldShow()) return;
    // V2-5.10: prefer BootFlow for incomplete activation; keep branch-lock modal as fallback.
    if (typeof global.BootFlow !== 'undefined' && global.BootFlow.needsBootScreen?.()) {
      setTimeout(() => {
        global.BootFlow.ensureLoginAccessible?.();
        if (global.BootFlow.forceOpen) global.BootFlow.forceOpen();
        else if (global.BootFlow.open) global.BootFlow.open();
      }, 500);
      return;
    }
    setTimeout(openBranchLockModal, 400);
  }

  global.BranchLockUI = {
    shouldShow,
    openBranchLockModal,
    closeBranchLockModal,
    confirmBranchLock,
    maybePromptBranchLock,
    refreshBranchLockUI,
    ERR_AR
  };
})(typeof window !== 'undefined' ? window : globalThis);
