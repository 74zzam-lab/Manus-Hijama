/**
 * System-wide UX enhancements + factory reset (admin only, multi-confirm).
 */
(function (global) {
  'use strict';

  const RESET_PHRASE = 'مسح الكل';
  const DATA_KEYS = [
    'cases', 'doctors', 'otRecords', 'packages', 'services', 'clientsRegistry', 'clientFileCounter',
    'bookings', 'nextSessions', 'attendance', 'expenses', 'budget', 'invoiceCounter',
    'employeeLeaveRequests', 'employeeLedgerAccruals', 'employeeLedgerPayments', 'employeeLedgerEntries',
    'messageLog', 'importHistory', 'activityLog', 'hardwareLog', 'backupLog', 'backupRegistry',
    'backupUploadQueue', 'backupOpCounter', 'inventoryItems', 'inventorySuppliers', 'inventoryMovements',
    'systemLogs', 'cashDrawerSession', 'communicationWebhookLog', 'communicationQueue',
    'preImportBackup', 'luxQueue', 'logCounter', 'tablePageSize', 'logsPageSize'
  ];

  const PRESERVE_LS_PREFIXES = ['__tdw_lic', 'commercial_license_data_v2'];

  function notify(msg, type) {
    if (typeof global.notify === 'function') global.notify(msg, type);
  }

  function isAdmin() {
    return !!global.RolePolicy?.isManager?.(global.currentUser) || !!global.currentUser?.isDev;
  }

  function isManagerOnly() {
    return isAdmin();
  }

  // ── Global loading overlay ──
  function showGlobalLoading(msg) {
    let el = document.getElementById('globalLoadingOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'globalLoadingOverlay';
      el.className = 'global-loading-overlay';
      el.innerHTML = '<div class="global-loading-card"><div class="global-loading-spinner"></div><div class="global-loading-msg"></div></div>';
      document.body.appendChild(el);
    }
    el.querySelector('.global-loading-msg').textContent = msg || 'جارٍ التنفيذ...';
    el.classList.add('open');
  }

  function hideGlobalLoading() {
    document.getElementById('globalLoadingOverlay')?.classList.remove('open');
    releaseStaleUiLocks();
  }

  function releaseStaleUiLocks() {
    document.body.style.pointerEvents = '';
    document.getElementById('main-scroll')?.removeAttribute('inert');
    document.getElementById('app-shell')?.removeAttribute('inert');
    document.querySelectorAll('.modal-overlay.open').forEach(ov => {
      if (ov.id === 'globalLoadingOverlay') ov.classList.remove('open');
    });
    const active = document.querySelector('.page.active');
    if (active && typeof global.applyPageReadOnly === 'function') {
      const pageId = active.id.replace('page-', '');
      if (pageId) global.applyPageReadOnly(pageId);
    }
    document.querySelectorAll('#page-daily input, #page-daily select, #page-daily textarea').forEach(el => {
      if (el.closest('[data-feature-disabled]')) return;
      if (el.hasAttribute('readonly') || ['f-invoice', 'f-file-no'].includes(el.id)) return;
      if (el.closest('.feature-hidden')) return;
      el.disabled = false;
    });
  }

  async function runWithGlobalLoading(msg, fn) {
    showGlobalLoading(msg);
    try { return await fn(); }
    finally { hideGlobalLoading(); }
  }

  // ── Offline indicator ──
  function initOfflineIndicator() {
    if (global._offlineIndicatorInited) return;
    global._offlineIndicatorInited = true;
    let bar = document.getElementById('offlineStatusBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'offlineStatusBar';
      bar.className = 'offline-status-bar';
      bar.hidden = true;
      bar.textContent = '⚠️ لا يوجد اتصال بالإنترنت — يعمل النظام محلياً';
      document.getElementById('main')?.prepend(bar);
    }
    const sync = () => { bar.hidden = navigator.onLine; };
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    sync();
  }

  // ── Keyboard shortcuts ──
  function initKeyboardShortcuts() {
    if (global._kbShortcutsInited) return;
    global._kbShortcutsInited = true;
    document.addEventListener('keydown', e => {
      if (!global._appAuthed || !global.currentUser) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) {
        if (!((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K'))) return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
        if (global.currentUser.role === 'employee') return;
        e.preventDefault();
        if (typeof global.showPage === 'function') global.showPage('daily');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const input = document.getElementById('topbarSearch');
        if (input && !input.disabled) { input.focus(); input.select(); }
      }
    });
  }

  // ── Accessibility labels ──
  function initAccessibilityLabels() {
    const map = {
      'button[onclick="openThemePicker()"]': 'تغيير الثيم',
      '.lic-theme-btn': 'تغيير الثيم',
      'button[onclick="changePassword()"]': 'تغيير كلمة المرور',
      'button[onclick="doLogout()"]': 'تسجيل الخروج',
      '#menu-toggle': 'فتح القائمة'
    };
    Object.entries(map).forEach(([sel, label]) => {
      document.querySelectorAll(sel).forEach(el => {
        if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', label);
      });
    });
  }

  // ── Default landing page per role ──
  function getDefaultLandingPage() {
    const role = global.currentUser?.role;
    const candidates = role === 'reception'
      ? ['bookings', 'dashboard', 'daily']
      : role === 'accountant'
        ? ['reports', 'dashboard', 'expenses']
        : ['dashboard', 'daily', 'bookings'];
    for (const pageId of candidates) {
      if (typeof global.checkPageAccess === 'function' && global.checkPageAccess(pageId)) return pageId;
    }
    return 'dashboard';
  }

  // ── Unified search extensions ──
  function enhanceUnifiedSearchResults(q, results) {
    if (!q || global.currentUser?.role === 'employee') return results;
    const ql = q.toLowerCase().trim();
    const qt = q.trim();
    const out = [...(results || [])];

    (global.doctors || []).filter(d =>
      (d.name || '').toLowerCase().includes(ql) ||
      (d.phone || '').includes(qt) ||
      (d.empNum || '').includes(qt)
    ).slice(0, 3).forEach(d => out.push({
      type: 'employee', typeLabel: 'موظف', key: d.id, name: d.name || '—',
      subtitle: d.specialty || d.empNum || '', doctorId: d.id,
    }));

    if (global.hasPermission?.('expenses.view') || isAdmin()) {
      (global.expenses || []).filter(x =>
        (x.desc || x.description || '').toLowerCase().includes(ql) ||
        String(x.amount || '').includes(qt)
      ).slice(0, 3).forEach(x => out.push({
        type: 'expense', typeLabel: 'مصروف', key: x.id, name: x.desc || x.description || 'مصروف',
        subtitle: typeof global.fmtMoney === 'function' ? global.fmtMoney(x.amount) : String(x.amount || ''),
        expenseId: x.id,
      }));
    }

    return out.slice(0, 12);
  }

  function selectEnhancedSearchResult(btn) {
    const type = btn.dataset.type;
    if (type === 'employee') {
      if (typeof global.showPage === 'function') global.showPage('doctors');
      notify('👤 موظف: ' + (btn.dataset.name || ''), 'info');
      return true;
    }
    if (type === 'expense') {
      if (typeof global.showPage === 'function') global.showPage('expenses');
      notify('💸 مصروف: ' + (btn.dataset.name || ''), 'info');
      return true;
    }
    return false;
  }

  // ── Dashboard backup reminder ──
  function renderBackupReminder() {
    const host = document.getElementById('dash-backup-reminder');
    if (!host || !isAdmin()) { if (host) host.style.display = 'none'; return; }
    const log = global.backupLog || [];
    const last = log.find(e => e.status === 'success');
    const daysSince = last?.at
      ? Math.floor((Date.now() - new Date(last.at).getTime()) / 86400000)
      : null;
    if (daysSince != null && daysSince < 7) { host.style.display = 'none'; return; }
    host.style.display = '';
    host.className = 'dash-alert dash-alert-warning';
    host.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;width:100%">
        <span>⚠️ ${last ? `آخر نسخة احتياطية منذ ${daysSince} يوم` : 'لم يتم إنشاء نسخة احتياطية بعد'} — يُنصح بالنسخ أسبوعياً</span>
        <button type="button" class="btn btn-primary btn-sm" onclick="showPage('settings');switchSettingsTab('backup');runBackupNow('manual')">💾 نسخ الآن</button>
      </div>`;
  }

  // ── Booking reminders banner ──
  function renderBookingReminders() {
    const host = document.getElementById('dash-booking-reminders');
    if (!host) return;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const upcoming = (global.bookings || []).filter(b => {
      if (b.date !== today || !['pending', 'confirmed'].includes(b.status)) return false;
      if (!b.time) return true;
      const [h, m] = String(b.time).split(':').map(Number);
      const t = new Date(); t.setHours(h || 0, m || 0, 0, 0);
      const diffH = (t - now) / 3600000;
      return diffH >= 0 && diffH <= 24;
    });
    if (!upcoming.length) { host.style.display = 'none'; return; }
    host.style.display = '';
    host.className = 'dash-alert dash-alert-success';
    host.innerHTML = `📅 ${upcoming.length} حجز اليوم خلال 24 ساعة — <button type="button" class="btn btn-ghost btn-sm" onclick="showPage('bookings')">عرض الحجوزات</button>`;
  }

  function patchDashboardAlerts() {
    renderBackupReminder();
    renderBookingReminders();
  }

  // ── Employee dashboard extras ──
  function patchEmployeeDashboardExtras() {
    const page = document.getElementById('page-employee');
    if (!page || page.style.display === 'none') return;
    const grid = page.querySelector('.stats-grid');
    if (!grid || grid.querySelector('[data-emp-extra]')) return;
    const doc = global._empReportDoc;
    if (!doc) return;
    const leaveReqs = global.DB?.get('employeeLeaveRequests', []) || [];
    const pendingLeave = leaveReqs.filter(r => r.doctorId === doc.id && r.status === 'pending').length;
    const approvedLeave = leaveReqs.filter(r => {
      if (r.doctorId !== doc.id || r.status !== 'approved') return false;
      const d = new Date(r.from || r.startDate);
      return d.getMonth() + 1 === (global._empReportMonth || new Date().getMonth() + 1);
    }).length;
    const extra = document.createElement('div');
    extra.className = 'stats-grid';
    extra.style.cssText = 'grid-template-columns:repeat(2,1fr);margin-bottom:16px';
    extra.dataset.empExtra = '1';
    extra.innerHTML = `
      <div class="stat-card blue" data-emp-extra>
        <div class="stat-label">طلبات إجازة معلّقة</div>
        <div class="stat-value">${pendingLeave}</div>
        <div class="stat-sub">بانتظار الموافقة</div>
      </div>
      <div class="stat-card gold" data-emp-extra>
        <div class="stat-label">إجازات معتمدة هذا الشهر</div>
        <div class="stat-value">${approvedLeave}</div>
        <div class="stat-sub">من سجل الإجازات</div>
      </div>`;
    grid.parentNode.insertBefore(extra, grid);
  }

  // ── Duplicate clients merge ──
  function findDuplicateClientGroups() {
    const map = {};
    (global.clientsRegistry || []).forEach(c => {
      const phone = (c.phone || '').replace(/\D/g, '');
      if (phone.length < 8) return;
      if (!map[phone]) map[phone] = [];
      map[phone].push(c);
    });
    return Object.values(map).filter(g => g.length > 1);
  }

  async function mergeDuplicateClients() {
    if (!isAdmin()) { notify('⛔ المدير فقط', 'danger'); return; }
    const groups = findDuplicateClientGroups();
    if (!groups.length) { notify('ℹ️ لا توجد أرقام مكررة', 'info'); return; }
    const total = groups.reduce((a, g) => a + g.length - 1, 0);
    if (!confirm(`⚠️ دمج العملاء المكررين\n\n${groups.length} رقم مكرر — سيتم دمج ${total} سجل إضافي.\nهل تريد المتابعة؟`)) return;
    if (!confirm('تأكيد نهائي: سيتم الإبقاء على أقدم ملف لكل رقم ودمج البيانات.')) return;
    let merged = 0;
    groups.forEach(group => {
      group.sort((a, b) => {
        const fa = a.fileNo || '';
        const fb = b.fileNo || '';
        if (fa && fb) return fa.localeCompare(fb);
        if (fa) return -1;
        if (fb) return 1;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
      const primary = group[0];
      const dupIds = new Set(group.slice(1).map(c => c.id));
      group.slice(1).forEach(dup => {
        ['name', 'phone', 'patientId', 'nationality', 'fileNo', 'notes', 'email', 'address'].forEach(k => {
          if (!primary[k] && dup[k]) primary[k] = dup[k];
        });
        merged++;
      });
      primary.updatedAt = new Date().toISOString();
      global.clientsRegistry = (global.clientsRegistry || []).filter(c => !dupIds.has(c.id));
      (global.cases || []).forEach(cs => {
        group.slice(1).forEach(dup => {
          const phoneMatch = dup.phone && cs.phone && normalizePhone(cs.phone) === normalizePhone(dup.phone);
          if (cs.clientRegistryId === dup.id || phoneMatch) {
            cs.clientRegistryId = primary.id;
            if (primary.fileNo) cs.fileNo = primary.fileNo;
            if (primary.patientId && !cs.patientId) cs.patientId = primary.patientId;
            if (primary.nationality && !cs.nationality) cs.nationality = primary.nationality;
          }
        });
      });
      (global.nextSessions || []).forEach(ns => {
        group.slice(1).forEach(dup => {
          const dupKey = dup.fileNo || ('reg:' + dup.id);
          const primaryKey = primary.fileNo || ('reg:' + primary.id);
          if (ns.clientKey === dupKey || ns.clientKey === ('reg:' + dup.id)) ns.clientKey = primaryKey;
        });
      });
    });
    global.DB?.set('clientsRegistry', global.clientsRegistry);
    global.DB?.set('cases', global.cases);
    global.DB?.set('nextSessions', global.nextSessions);
    if (typeof global.refreshClientsView === 'function') global.refreshClientsView();
    if (typeof global.refreshCaseDerivedViews === 'function') global.refreshCaseDerivedViews();
    notify(`✅ تم دمج ${merged} عميل مكرر`, 'success');
  }

  function normalizePhone(p) {
    return String(p || '').replace(/\D/g, '');
  }

  // ── Emergency backup before reset ──
  async function downloadEmergencyBackup() {
    if (typeof global.buildFullBackupObject !== 'function') return false;
    try {
      const data = global.buildFullBackupObject();
      data._meta = { ...(data._meta || {}), emergency: true, reason: 'pre-factory-reset' };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `emergency-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      return true;
    } catch { return false; }
  }

  function shouldPreserveKey(key) {
    return PRESERVE_LS_PREFIXES.some(p => key.startsWith(p));
  }

  function clearAllBusinessData() {
    const wipe = (k) => {
      try {
        if (global.SyncedWrite?.wipeTable) global.SyncedWrite.wipeTable(k);
        else global.DB?.set?.(k, k.includes('Counter') ? 1 : []);
      } catch { /* empty */ }
    };
    DATA_KEYS.forEach(wipe);
  }

  function reseedDefaults() {
    const defaults = global.defaultSettings || { cupPrice: 50, vatRate: 15, centerName: 'مركز الحجامة' };
    const freshSettings = JSON.parse(JSON.stringify(defaults));
    freshSettings.firstRun = { completed: false, step: 0 };
    global.settings = freshSettings;
    global.DB?.set('settings', freshSettings);

    const freshUsers = JSON.parse(JSON.stringify(global.defaultUsers || []));
    global.users = freshUsers;
    global.DB?.set('users', freshUsers);

    global.cases = []; global.doctors = []; global.packages = []; global.services = [];
    global.clientsRegistry = []; global.bookings = []; global.expenses = [];
    global.activityLog = []; global.hardwareLog = []; global.messageLog = [];
    global.backupLog = []; global.backupRegistry = [];
    global.invoiceCounter = 1; global.clientFileCounter = 1;
    global.otRecords = [];

    DATA_KEYS.forEach(k => {
      if (k === 'users' || k === 'settings') return;
      const empty = k.includes('Counter') ? 1 : [];
      global.DB?.set(k, empty);
    });

    if (typeof global.ensureBackupSettings === 'function') global.ensureBackupSettings();
    if (typeof global.ensureDeviceSettings === 'function') global.ensureDeviceSettings();
    if (typeof global.ensureMessagingSettings === 'function') global.ensureMessagingSettings();
    if (typeof global.ensureLeavePolicySettings === 'function') global.ensureLeavePolicySettings();
    if (typeof global.ensureExtSettings === 'function') global.ensureExtSettings();
    if (typeof global.EmployeeLedger?.init === 'function') global.EmployeeLedger.init();
    if (typeof global.syncAppGlobals === 'function') global.syncAppGlobals();
  }

  const PARTIAL_RESET_MAP = {
    cases: { keys: ['cases', 'invoiceCounter'], globals: ['cases', 'invoiceCounter'] },
    clients: { keys: ['clientsRegistry', 'clientFileCounter', 'nextSessions'], globals: ['clientsRegistry', 'clientFileCounter', 'nextSessions'] },
    bookings: { keys: ['bookings'], globals: ['bookings'] },
    doctors: { keys: ['doctors', 'otRecords'], globals: ['doctors', 'otRecords'] },
    expenses: { keys: ['expenses', 'budget'], globals: ['expenses'] },
    attendance: { keys: ['attendance', 'employeeLeaveRequests'], globals: [] },
    inventory: { keys: ['inventoryItems', 'inventorySuppliers', 'inventoryMovements'], globals: [] },
    logs: { keys: ['activityLog', 'hardwareLog', 'messageLog', 'systemLogs', 'importHistory', 'backupLog'], globals: ['activityLog', 'hardwareLog', 'messageLog', 'backupLog'] }
  };

  function openPartialResetModal() {
    if (!isAdmin()) { notify('⛔ إعادة الضبط الجزئي للمدير فقط', 'danger'); return; }
    document.querySelectorAll('.partial-reset-chk').forEach(c => { c.checked = false; });
    const bk = document.getElementById('partial-reset-backup');
    if (bk) bk.checked = true;
    document.getElementById('partialResetModal')?.classList.add('open');
  }

  function closePartialResetModal() {
    document.getElementById('partialResetModal')?.classList.remove('open');
  }

  function applyPartialResetSections(sections) {
    if (!isManagerOnly()) { notify('⛔ إعادة الضبط الجزئي للمدير فقط', 'danger'); return; }
    const keysToClear = new Set();
    sections.forEach(id => {
      const def = PARTIAL_RESET_MAP[id];
      if (!def) return;
      def.keys.forEach(k => keysToClear.add(k));
    });

    global.SyncGuard?.pause?.('partial_reset', { sections: [...sections] });

    keysToClear.forEach(k => {
      const isCounter = k.includes('Counter');
      const val = isCounter ? 1 : [];
      if (global.SyncedWrite?.wipeTable) global.SyncedWrite.wipeTable(k, val);
      else global.DB?.set?.(k, val);
      if (k === 'cases') global.cases = [];
      else if (k === 'clientsRegistry') global.clientsRegistry = [];
      else if (k === 'bookings') global.bookings = [];
      else if (k === 'doctors') global.doctors = [];
      else if (k === 'otRecords') global.otRecords = [];
      else if (k === 'nextSessions') global.nextSessions = [];
      else if (k === 'expenses') global.expenses = [];
      else if (k === 'activityLog') global.activityLog = [];
      else if (k === 'hardwareLog') global.hardwareLog = [];
      else if (k === 'messageLog') global.messageLog = [];
      else if (k === 'backupLog') global.backupLog = [];
      else if (k === 'invoiceCounter') global.invoiceCounter = 1;
      else if (k === 'clientFileCounter') global.clientFileCounter = 1;
    });

    global.SyncGuard?.resume?.({ state: 'local_only' });

    if (typeof global.syncAppGlobals === 'function') global.syncAppGlobals();
    if (typeof global.refreshClientsView === 'function') global.refreshClientsView();
    if (typeof global.refreshDailyTable === 'function') global.refreshDailyTable();
    if (typeof global.refreshDashboard === 'function') global.refreshDashboard();
    if (typeof global.refreshBookingsTable === 'function') global.refreshBookingsTable();
    if (typeof global.refreshDoctorsTable === 'function') global.refreshDoctorsTable();
    if (typeof global.refreshExpenses === 'function') global.refreshExpenses();
    if (typeof global.refreshCaseDerivedViews === 'function') global.refreshCaseDerivedViews();
  }

  async function executePartialReset() {
    if (!isAdmin()) return;
    const sections = Array.from(document.querySelectorAll('.partial-reset-chk:checked')).map(c => c.value);
    if (!sections.length) { notify('⚠️ حدد جزءاً واحداً على الأقل', 'warning'); return; }
    const labels = sections.map(id => PARTIAL_RESET_MAP[id]?.keys?.[0] || id).join('، ');
    if (!confirm(`⚠️ سيتم مسح:\n${sections.join(' · ')}\n\nلا يمكن التراجع. هل تريد المتابعة؟`)) return;

    await runWithGlobalLoading('جاري إعادة الضبط الجزئي...', async () => {
      if (document.getElementById('partial-reset-backup')?.checked) {
        const ok = await downloadEmergencyBackup();
        if (!ok && !confirm('تعذّر تنزيل النسخة. هل تريد المتابعة بدون نسخة؟')) return;
      }
      try {
        if (typeof global.logAudit === 'function') {
          global.logAudit('PARTIAL_RESET', `إعادة ضبط جزئي: ${sections.join(', ')}`);
        }
      } catch {}
      applyPartialResetSections(sections);
      closePartialResetModal();
      notify('✅ تم إعادة الضبط الجزئي للأجزاء المحددة', 'success');
    });
  }

  // ── Factory reset modal ──
  let _frStep = 1;

  function openFactoryResetModal() {
    if (!isAdmin()) { notify('⛔ إعادة ضبط النظام للمدير فقط', 'danger'); return; }
    _frStep = 1;
    const modal = document.getElementById('factoryResetModal');
    if (!modal) return;
    ['fr-ack-danger', 'fr-ack-backup', 'fr-confirm-text', 'fr-admin-pass'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
      if (el?.type === 'checkbox') el.checked = false;
    });
    updateFactoryResetStep();
    modal.classList.add('open');
  }

  function closeFactoryResetModal() {
    document.getElementById('factoryResetModal')?.classList.remove('open');
  }

  function updateFactoryResetStep() {
    [1, 2, 3, 4].forEach(n => {
      const pane = document.getElementById('fr-step-' + n);
      if (pane) pane.style.display = n === _frStep ? '' : 'none';
    });
    const prev = document.getElementById('fr-btn-prev');
    const next = document.getElementById('fr-btn-next');
    const exec = document.getElementById('fr-btn-exec');
    if (prev) prev.style.display = _frStep > 1 ? '' : 'none';
    if (next) next.style.display = _frStep < 4 ? '' : 'none';
    if (exec) exec.style.display = _frStep === 4 ? '' : 'none';
    document.querySelectorAll('.fr-step-dot').forEach((d, i) => {
      d.classList.toggle('active', i + 1 === _frStep);
      d.classList.toggle('done', i + 1 < _frStep);
    });
  }

  function factoryResetNext() {
    if (_frStep === 1) {
      if (!document.getElementById('fr-ack-danger')?.checked) {
        notify('⚠️ يجب الإقرار بفهم خطورة العملية', 'warning'); return;
      }
    }
    if (_frStep === 2) {
      const txt = document.getElementById('fr-confirm-text')?.value?.trim();
      if (txt !== RESET_PHRASE) {
        notify(`⚠️ اكتب "${RESET_PHRASE}" للمتابعة`, 'warning'); return;
      }
    }
    if (_frStep === 3) {
      const pass = document.getElementById('fr-admin-pass')?.value || '';
      const admin = (global.users || []).find(u => u.username === global.currentUser?.username);
      if (!admin || typeof global.verifyPW !== 'function') {
        notify('⚠️ تعذّر التحقق من كلمة المرور', 'danger'); return;
      }
      global.verifyPW(pass, admin.password, admin.username).then(ok => {
        if (!ok) { notify('⛔ كلمة مرور المدير غير صحيحة', 'danger'); return; }
        _frStep = 4;
        updateFactoryResetStep();
      }).catch(() => notify('⚠️ تعذّر التحقق من كلمة المرور', 'danger'));
      return;
    }
    _frStep = Math.min(4, _frStep + 1);
    updateFactoryResetStep();
  }

  function factoryResetPrev() {
    _frStep = Math.max(1, _frStep - 1);
    updateFactoryResetStep();
  }

  async function executeFactoryReset() {
    if (!isAdmin()) return;
    if (!document.getElementById('fr-ack-final')?.checked) {
      notify('⚠️ يجب التأكيد النهائي', 'warning'); return;
    }
    if (!confirm('⚠️ تأكيد أخير: سيتم مسح جميع البيانات وإعادة النظام كأول استخدام.\n\nهل أنت متأكد تماماً؟')) return;
    if (!confirm('🚨 لا يمكن التراجع. هل تريد تنفيذ المسح الآن؟')) return;

    await runWithGlobalLoading('جارٍ إنشاء نسخة طوارئ ومسح البيانات...', async () => {
      if (document.getElementById('fr-ack-backup')?.checked) {
        const ok = await downloadEmergencyBackup();
        notify(ok ? '✅ تم تنزيل نسخة الطوارئ' : '⚠️ تعذّر النسخ — يمكنك الإلغاء إن أردت', ok ? 'success' : 'warning');
        if (!ok && !confirm('فشل تنزيل النسخة. هل تريد المتابعة بدون نسخة؟')) return;
      }
      try {
        if (typeof global.logAudit === 'function') {
          global.logAudit('FACTORY_RESET', 'إعادة ضبط المصنع — مسح كامل للبيانات');
        }
      } catch {}
      clearAllBusinessData();
      reseedDefaults();
      try { sessionStorage.clear(); } catch {}
      if (typeof global.clearUserSession === 'function') global.clearUserSession();
      notify('✅ تم مسح البيانات — إعادة تحميل النظام...', 'success');
      setTimeout(() => { global.location.reload(); }, 1200);
    });
  }

  function initClientTools() {
    const toolbar = document.querySelector('#page-clients .card-header div[style*="flex"]');
    if (!toolbar || document.getElementById('btn-merge-duplicates')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-merge-duplicates';
    btn.type = 'button';
    btn.className = 'btn btn-ghost btn-sm admin-only';
    btn.textContent = '🔗 دمج المكررين';
    btn.title = 'دمج العملاء بنفس رقم الهاتف';
    btn.onclick = () => mergeDuplicateClients();
    toolbar.appendChild(btn);
  }

  function wrapHooks() {
    if (typeof global.refreshDashboardAlerts === 'function' && !global._dashAlertsWrapped) {
      const orig = global.refreshDashboardAlerts;
      global.refreshDashboardAlerts = function () {
        orig.apply(this, arguments);
        patchDashboardAlerts();
      };
      global._dashAlertsWrapped = true;
    }
    if (typeof global.showEmployeeDashboard === 'function' && !global._empDashWrapped) {
      const origEmp = global.showEmployeeDashboard;
      global.showEmployeeDashboard = function () {
        origEmp.apply(this, arguments);
        setTimeout(patchEmployeeDashboardExtras, 50);
      };
      global._empDashWrapped = true;
    }
    const origSelect = global.selectUnifiedSearchResult;
    if (typeof origSelect === 'function' && !global._searchSelectWrapped) {
      global.selectUnifiedSearchResult = function (btn) {
        if (selectEnhancedSearchResult(btn)) return;
        origSelect(btn);
      };
      global._searchSelectWrapped = true;
    }
  }

  function init() {
    initOfflineIndicator();
    initKeyboardShortcuts();
    initAccessibilityLabels();
    initClientTools();
    wrapHooks();
    patchDashboardAlerts();
  }

  global.SysEnhance = {
    init, getDefaultLandingPage, enhanceUnifiedSearchResults, mergeDuplicateClients,
    openFactoryResetModal, closeFactoryResetModal, factoryResetNext, factoryResetPrev,
    executeFactoryReset, openPartialResetModal, closePartialResetModal, executePartialReset,
    showGlobalLoading, hideGlobalLoading, runWithGlobalLoading, releaseStaleUiLocks,
  };
  global.getDefaultLandingPage = getDefaultLandingPage;
  global.enhanceUnifiedSearchResults = enhanceUnifiedSearchResults;
  global.openFactoryResetModal = openFactoryResetModal;
  global.closeFactoryResetModal = closeFactoryResetModal;
  global.factoryResetNext = factoryResetNext;
  global.factoryResetPrev = factoryResetPrev;
  global.executeFactoryReset = executeFactoryReset;
  global.openPartialResetModal = openPartialResetModal;
  global.closePartialResetModal = closePartialResetModal;
  global.executePartialReset = executePartialReset;
  global.mergeDuplicateClients = mergeDuplicateClients;
  global.runWithGlobalLoading = runWithGlobalLoading;
  global.releaseStaleUiLocks = releaseStaleUiLocks;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : global);
