/**
 * Employee Leave Management — integrated with attendance, payroll, system log.
 * Supports balance tracking, overlap prevention, work-day counting, and future half-day/hourly leave.
 */
const LEAVE_TYPES = {
  annual_paid:    { label: 'إجازة سنوية مدفوعة', attType: 'annual', leavePaid: 'paid',   paid: true,  deductBalance: true },
  annual_unpaid:  { label: 'إجازة سنوية بدون أجر', attType: 'annual', leavePaid: 'unpaid', paid: false, deductBalance: false },
  sick:           { label: 'إجازة مرضية', attType: 'sick', leavePaid: 'paid', paid: true, deductBalance: false },
  emergency:      { label: 'إجازة اضطرارية', attType: 'leave', leavePaid: 'unpaid', paid: false, deductBalance: false },
  compensatory:   { label: 'إجازة تعويضية', attType: 'timeback', leavePaid: 'paid', paid: true, deductBalance: false },
  official:       { label: 'إجازة رسمية', attType: 'weekly', leavePaid: 'paid', paid: true, deductBalance: false },
};

const LEAVE_STATUS_LABELS = { pending: 'معلق', approved: 'معتمد', rejected: 'مرفوض' };
const LEAVE_STATUS_TAGS = { pending: 'tag-gold', approved: 'tag-green', rejected: 'tag-red' };

const DEFAULT_LEAVE_POLICY = {
  countWorkDaysOnly: false,
  allowOverBalance: false,
  maxAnnualLeaveDays: 30,
  carryOverEnabled: false,
  maxCarryOverDays: 5,
  weekendDays: [5],
};

let employeeLeaveRequests = DB.get('employeeLeaveRequests', []);

function ensureLeaveRequests() {
  employeeLeaveRequests = DB.get('employeeLeaveRequests', employeeLeaveRequests || []);
  return employeeLeaveRequests;
}

function saveLeaveRequests() {
  DB.set('employeeLeaveRequests', employeeLeaveRequests);
}

function getLeavePolicy() {
  const s = typeof settings !== 'undefined' ? settings : {};
  return { ...DEFAULT_LEAVE_POLICY, ...(s.leavePolicy || {}) };
}

function leaveDatesOverlap(aFrom, aTo, bFrom, bTo) {
  return aFrom <= bTo && bFrom <= aTo;
}

function eachLeaveDate(from, to, fn) {
  if (typeof eachDateInRange === 'function') eachDateInRange(from, to, fn);
  else {
    let cur = new Date(from + 'T12:00:00');
    const end = new Date(to + 'T12:00:00');
    while (cur <= end) {
      fn(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
  }
}

function countLeaveDays(from, to) {
  if (!from || !to) return 0;
  const policy = getLeavePolicy();
  if (!policy.countWorkDaysOnly) {
    if (typeof countDaysInRange === 'function') return countDaysInRange(from, to);
    const a = new Date(from + 'T12:00:00');
    const b = new Date(to + 'T12:00:00');
    return Math.max(0, Math.floor((b - a) / 86400000) + 1);
  }
  const weekends = policy.weekendDays || [5];
  let n = 0;
  eachLeaveDate(from, to, d => {
    const day = new Date(d + 'T12:00:00').getDay();
    if (!weekends.includes(day)) n++;
  });
  return n;
}

function getDoctorById(doctorId) {
  return (typeof doctors !== 'undefined' ? doctors : []).find(d => d.id === doctorId);
}

function isEmployeeTerminated(doctorId) {
  const doc = getDoctorById(doctorId);
  if (!doc) return true;
  return doc.active === false || doc.terminated === true || !!doc.terminatedAt;
}

function hasLeaveOverlap(doctorId, from, to, excludeId) {
  return ensureLeaveRequests().some(r =>
    r.doctorId === doctorId &&
    r.id !== excludeId &&
    r.status !== 'rejected' &&
    leaveDatesOverlap(from, to, r.dateFrom, r.dateTo)
  );
}

function getUsedAnnualDays(doctorId, year) {
  return ensureLeaveRequests()
    .filter(r =>
      r.doctorId === doctorId &&
      r.status === 'approved' &&
      r.deductBalance &&
      (r.dateFrom || '').startsWith(String(year))
    )
    .reduce((s, r) => s + (parseFloat(r.days) || 0), 0);
}

function ensureLeaveCarryOver(doctorId, year) {
  const policy = getLeavePolicy();
  if (!policy.carryOverEnabled) return 0;
  const doc = getDoctorById(doctorId);
  if (!doc) return 0;
  doc.leaveBalanceCarryOver = doc.leaveBalanceCarryOver || {};
  if (doc.leaveBalanceCarryOver[year] !== undefined) return doc.leaveBalanceCarryOver[year];
  const prevYear = year - 1;
  const annual = Math.min(doc.annualLeaveDays ?? 21, policy.maxAnnualLeaveDays || 99);
  const usedPrev = getUsedAnnualDays(doctorId, prevYear);
  const unused = Math.max(0, annual - usedPrev);
  const carried = Math.min(unused, policy.maxCarryOverDays || 0);
  doc.leaveBalanceCarryOver[year] = carried;
  if (typeof doctors !== 'undefined') DB.set('doctors', doctors);
  return carried;
}

function getEmployeeAnnualBalance(doctorId, year) {
  year = year || new Date().getFullYear();
  const doc = getDoctorById(doctorId);
  const policy = getLeavePolicy();
  const annual = Math.min(doc?.annualLeaveDays ?? 21, policy.maxAnnualLeaveDays || 99);
  const carried = ensureLeaveCarryOver(doctorId, year);
  const total = annual + carried;
  const used = getUsedAnnualDays(doctorId, year);
  return { total, annual, carried, used, remaining: Math.max(0, total - used) };
}

function validateLeaveRequest(entry, { onApprove } = {}) {
  if (!getDoctorById(entry.doctorId)) return 'الموظف غير موجود';
  if (isEmployeeTerminated(entry.doctorId)) {
    return 'لا يمكن ' + (onApprove ? 'اعتماد' : 'تقديم') + ' إجازة لموظف منتهية خدمته';
  }
  if (hasLeaveOverlap(entry.doctorId, entry.dateFrom, entry.dateTo, entry.id)) {
    return 'يوجد تداخل مع إجازة أخرى لنفس الموظف في هذه الفترة';
  }
  if (entry.deductBalance) {
    const bal = getEmployeeAnnualBalance(entry.doctorId);
    const policy = getLeavePolicy();
    if ((parseFloat(entry.days) || 0) > bal.remaining && !policy.allowOverBalance) {
      return `رصيد الإجازات السنوية غير كافٍ (متبقي ${bal.remaining} من ${bal.total} يوم)`;
    }
  }
  return null;
}

function openLeaveRequestModal(id) {
  const modal = document.getElementById('leaveRequestModal');
  if (!modal) return;
  const req = id ? ensureLeaveRequests().find(r => r.id === id) : null;
  document.getElementById('lr-id').value = req?.id || '';
  document.getElementById('lr-doctor').value = req?.doctorId || document.getElementById('att-doctor')?.value || '';
  document.getElementById('lr-type').value = req?.leaveType || 'annual_paid';
  document.getElementById('lr-from').value = req?.dateFrom || getTodayISO?.() || new Date().toISOString().slice(0, 10);
  document.getElementById('lr-to').value = req?.dateTo || document.getElementById('lr-from').value;
  document.getElementById('lr-reason').value = req?.reason || '';
  document.getElementById('lr-notes').value = req?.notes || '';
  const fracEl = document.getElementById('lr-day-fraction');
  if (fracEl) fracEl.value = req?.dayFraction != null ? String(req.dayFraction) : '1';
  updateLeaveDaysHint();
  modal.classList.add('open');
}

function closeLeaveRequestModal() {
  document.getElementById('leaveRequestModal')?.classList.remove('open');
}

function updateLeaveDaysHint() {
  const hint = document.getElementById('lr-days-hint');
  if (!hint) return;
  const from = document.getElementById('lr-from')?.value;
  const to = document.getElementById('lr-to')?.value || from;
  const rawDays = countLeaveDays(from, to);
  const fraction = parseFloat(document.getElementById('lr-day-fraction')?.value) || 1;
  const days = Math.round(rawDays * fraction * 100) / 100;
  const type = LEAVE_TYPES[document.getElementById('lr-type')?.value] || {};
  const docId = document.getElementById('lr-doctor')?.value;
  const bal = docId ? getEmployeeAnnualBalance(docId) : null;
  const policy = getLeavePolicy();
  const workHint = policy.countWorkDaysOnly ? ' (أيام عمل فقط)' : ' (تقويمية)';
  hint.innerHTML = `${days} يوم${workHint} · ${type.paid ? 'مدفوعة' : 'غير مدفوعة'}${
    bal && type.deductBalance ? ` · الرصيد: ${bal.used}/${bal.total} — متبقي ${bal.remaining}` : ''
  }${isEmployeeTerminated(docId) ? ' · <span style="color:var(--danger)">موظف منتهية خدمته</span>' : ''}`;
}

function saveLeaveRequest() {
  const id = document.getElementById('lr-id')?.value;
  const doctorId = document.getElementById('lr-doctor')?.value;
  const leaveType = document.getElementById('lr-type')?.value;
  const dateFrom = document.getElementById('lr-from')?.value;
  const dateTo = document.getElementById('lr-to')?.value || dateFrom;
  const reason = document.getElementById('lr-reason')?.value.trim();
  const notes = document.getElementById('lr-notes')?.value.trim();
  const dayFraction = parseFloat(document.getElementById('lr-day-fraction')?.value) || 1;
  if (!doctorId || !dateFrom) { notify('⚠️ اختر الموظف وتاريخ البداية', 'danger'); return; }
  const meta = LEAVE_TYPES[leaveType];
  if (!meta) { notify('⚠️ نوع إجازة غير صالح', 'danger'); return; }
  const rawDays = countLeaveDays(dateFrom, dateTo);
  const days = Math.round(rawDays * dayFraction * 100) / 100;
  if (days < 0.25) { notify('⚠️ تحقق من فترة الإجازة', 'danger'); return; }
  const doc = getDoctorById(doctorId);
  const existing = id ? ensureLeaveRequests().find(r => r.id === id) : null;
  const entry = {
    id: id || Date.now().toString(),
    doctorId,
    doctorName: doc?.name || '—',
    leaveType,
    leaveTypeLabel: meta.label,
    dateFrom,
    dateTo,
    days,
    dayFraction,
    hours: null,
    paid: meta.paid,
    deductBalance: meta.deductBalance,
    reason,
    notes,
    status: existing?.status || 'pending',
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    approvedBy: existing?.approvedBy || null,
    approvedAt: existing?.approvedAt || null,
  };
  const err = validateLeaveRequest(entry);
  if (err) { notify('⚠️ ' + err, 'danger'); return; }
  if (id) {
    const idx = employeeLeaveRequests.findIndex(r => r.id === id);
    if (idx !== -1) employeeLeaveRequests[idx] = { ...employeeLeaveRequests[idx], ...entry };
  } else {
    employeeLeaveRequests.unshift(entry);
  }
  saveLeaveRequests();
  if (typeof logAudit === 'function') {
    logAudit('LEAVE_REQUEST', `${id ? 'تعديل' : 'طلب'} إجازة: ${doc?.name} — ${meta.label} (${days} يوم)`, {
      doctorId, leaveType, from: dateFrom, to: dateTo, days, opType: 'LEAVE_REQUEST'
    });
  }
  notify(id ? '✅ تم تحديث طلب الإجازة' : '✅ تم تقديم طلب الإجازة');
  closeLeaveRequestModal();
  refreshLeaveRequestsUI();
}

function syncApprovedLeaveToAttendance(req) {
  if (!req || req.status !== 'approved') return;
  const meta = LEAVE_TYPES[req.leaveType];
  if (!meta || typeof attendance === 'undefined') return;
  const dates = [];
  const policy = getLeavePolicy();
  eachLeaveDate(req.dateFrom, req.dateTo, d => {
    if (policy.countWorkDaysOnly) {
      const day = new Date(d + 'T12:00:00').getDay();
      if ((policy.weekendDays || [5]).includes(day)) return;
    }
    dates.push(d);
  });
  attendance = attendance.filter(a =>
    !(a.leaveRequestId === req.id) &&
    !(a.doctorId === req.doctorId && dates.includes(a.date) && ['leave', 'sick', 'weekly', 'annual', 'timeback', 'absent'].includes(a.type))
  );
  const rangeGroupId = req.id;
  const fraction = req.dayFraction || 1;
  dates.forEach((d, i) => {
    attendance.push({
      id: 'lr_' + req.id + '_' + i,
      doctorId: req.doctorId,
      doctorName: req.doctorName,
      date: d,
      timeIn: '', timeOut: '',
      totalHours: fraction < 1 ? (getDoctorById(req.doctorId)?.workHoursPerDay || 8) * fraction : 0,
      otHours: 0, otValue: 0,
      type: meta.attType,
      notes: req.reason || req.notes || '',
      isSplit: false,
      leavePaid: meta.leavePaid || null,
      leaveRangeFrom: req.dateFrom,
      leaveRangeTo: req.dateTo,
      leaveRangeGroup: rangeGroupId,
      leaveRequestId: req.id,
      dayFraction: fraction,
    });
  });
  DB.set('attendance', attendance);
}

function setLeaveRequestStatus(id, status) {
  if (typeof requirePermission === 'function' && !requirePermission('users.manage', 'اعتماد الإجازات')) return;
  const req = ensureLeaveRequests().find(r => r.id === id);
  if (!req) return;
  if (req.status === status) return;
  if (status === 'approved') {
    const err = validateLeaveRequest(req, { onApprove: true });
    if (err) { notify('⚠️ ' + err, 'danger'); return; }
  }
  req.status = status;
  req.updatedAt = new Date().toISOString();
  req.approvedBy = status === 'approved' ? (typeof currentUser !== 'undefined' ? currentUser?.name : 'مدير') : null;
  req.approvedAt = status === 'approved' ? new Date().toISOString() : null;
  if (status === 'approved') syncApprovedLeaveToAttendance(req);
  else if (status === 'rejected') {
    attendance = (typeof attendance !== 'undefined' ? attendance : []).filter(a => a.leaveRequestId !== id);
    DB.set('attendance', attendance);
  }
  saveLeaveRequests();
  if (typeof logAudit === 'function') {
    logAudit(status === 'approved' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
      `${status === 'approved' ? 'اعتماد' : 'رفض'} إجازة: ${req.doctorName} — ${req.leaveTypeLabel}`,
      { doctorId: req.doctorId, leaveType: req.leaveType, days: req.days, opType: status === 'approved' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED' });
  }
  notify(status === 'approved' ? '✅ تم اعتماد الإجازة وتحديث الحضور' : '🚫 تم رفض الطلب');
  refreshLeaveRequestsUI();
  if (typeof refreshAllAttViews === 'function') refreshAllAttViews();
  if (typeof refreshDashboard === 'function') refreshDashboard();
}

function deleteLeaveRequest(id) {
  const req = ensureLeaveRequests().find(r => r.id === id);
  if (!req) return;
  if (req.status === 'approved') { notify('⚠️ لا يمكن حذف إجازة معتمدة — ارفضها أولاً', 'danger'); return; }
  if (!confirm('حذف طلب الإجازة؟')) return;
  employeeLeaveRequests = employeeLeaveRequests.filter(r => r.id !== id);
  saveLeaveRequests();
  refreshLeaveRequestsUI();
  notify('🗑️ تم حذف الطلب', 'danger');
}

function refreshLeaveRequestsUI() {
  const tbody = document.getElementById('leaveRequestsBody');
  if (!tbody) return;
  ensureLeaveRequests();
  const statusFilter = document.getElementById('lr-filter-status')?.value || '';
  const docFilter = document.getElementById('lr-filter-doctor')?.value || '';
  let rows = employeeLeaveRequests.slice();
  if (statusFilter) rows = rows.filter(r => r.status === statusFilter);
  if (docFilter) rows = rows.filter(r => r.doctorId === docFilter);
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-light)">لا توجد طلبات إجازة</td></tr>';
    return;
  }
  const isAdmin = typeof currentUser !== 'undefined' && (
    (typeof RolePolicy !== 'undefined' && RolePolicy.isManager(currentUser))
    || currentUser?.permissions?.includes?.('users.manage')
  );
  tbody.innerHTML = rows.map(r => {
    const bal = r.deductBalance ? getEmployeeAnnualBalance(r.doctorId) : null;
    const balHint = bal ? `<div style="font-size:10px;color:var(--text-muted)">رصيد: ${bal.remaining}/${bal.total}</div>` : '';
    const ab = typeof actionBtn === 'function' ? actionBtn : (icon, label, opts) => {
      opts = opts || {};
      const cls = opts.cls || 'btn-ghost';
      const onclick = opts.onclick ? ` onclick="${opts.onclick}"` : '';
      return `<button type="button" class="btn ${cls} btn-sm btn-action" title="${label}"${onclick}><span class="btn-ico">${icon}</span><span class="btn-lbl">${label}</span></button>`;
    };
    const abr = typeof actionBtnRow === 'function' ? actionBtnRow : (h) => `<div class="table-action-btns">${h}</div>`;
    let actionBtns = '';
    if (r.status === 'pending' && isAdmin) {
      actionBtns += ab('✓', 'اعتماد', { cls: 'btn-primary', onclick: `setLeaveRequestStatus('${r.id}','approved')` });
      actionBtns += ab('✕', 'رفض', { onclick: `setLeaveRequestStatus('${r.id}','rejected')` });
    } else if (r.status === 'pending') {
      actionBtns += ab('✏️', 'تعديل', { onclick: `openLeaveRequestModal('${r.id}')` });
    }
    if (r.status !== 'approved') actionBtns += ab('🗑️', 'حذف', { cls: 'btn-danger', onclick: `deleteLeaveRequest('${r.id}')` });
    const actionsCell = actionBtns ? abr(actionBtns) : '—';
    return `<tr>
      <td>${r.doctorName}${balHint}</td>
      <td>${r.leaveTypeLabel}</td>
      <td class="col-date">${r.dateFrom}</td>
      <td class="col-date">${r.dateTo}</td>
      <td class="num">${r.days}${r.dayFraction && r.dayFraction < 1 ? ' <span style="font-size:10px">(جزئي)</span>' : ''}</td>
      <td>${r.paid ? '<span class="tag tag-green">مدفوعة</span>' : '<span class="tag tag-red">غير مدفوعة</span>'}</td>
      <td><span class="tag ${LEAVE_STATUS_TAGS[r.status] || 'tag-gray'}">${LEAVE_STATUS_LABELS[r.status] || r.status}</span></td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;font-size:12px">${r.reason || '—'}</td>
      <td class="actions-col">${actionsCell}</td>
    </tr>`;
  }).join('');
}

function loadLeavePolicyUI() {
  const p = getLeavePolicy();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
  const setN = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
  set('lr-pol-workdays', p.countWorkDaysOnly);
  set('lr-pol-saturday', (p.weekendDays || [5]).includes(6));
  set('lr-pol-overbalance', p.allowOverBalance);
  set('lr-pol-carryover', p.carryOverEnabled);
  setN('lr-pol-max-annual', p.maxAnnualLeaveDays);
  setN('lr-pol-max-carry', p.maxCarryOverDays);
}

function saveLeavePolicySettings() {
  if (!settings.leavePolicy) settings.leavePolicy = { ...DEFAULT_LEAVE_POLICY };
  settings.leavePolicy.countWorkDaysOnly = !!document.getElementById('lr-pol-workdays')?.checked;
  settings.leavePolicy.allowOverBalance = !!document.getElementById('lr-pol-overbalance')?.checked;
  settings.leavePolicy.carryOverEnabled = !!document.getElementById('lr-pol-carryover')?.checked;
  settings.leavePolicy.maxAnnualLeaveDays = parseInt(document.getElementById('lr-pol-max-annual')?.value, 10) || 30;
  settings.leavePolicy.maxCarryOverDays = parseInt(document.getElementById('lr-pol-max-carry')?.value, 10) || 5;
  const weekendDays = [5];
  if (document.getElementById('lr-pol-saturday')?.checked) weekendDays.push(6);
  settings.leavePolicy.weekendDays = weekendDays;
  DB.set('settings', settings);
  if (typeof logAudit === 'function') logAudit('SETTINGS_CHANGED', 'حفظ سياسة الإجازات', { section: 'leavePolicy' });
  notify('✅ تم حفظ سياسة الإجازات');
}

function initLeaveManagementUI() {
  const sel = document.getElementById('lr-doctor');
  const filter = document.getElementById('lr-filter-doctor');
  if (sel && typeof doctors !== 'undefined') {
    const cur = sel.value;
    sel.innerHTML = '<option value="">-- اختر الموظف --</option>' +
      doctors.filter(d => d.active !== false).map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    if (cur) sel.value = cur;
  }
  if (filter && typeof doctors !== 'undefined') {
    const cur = filter.value;
    filter.innerHTML = '<option value="">كل الموظفين</option>' +
      doctors.map(d => `<option value="${d.id}">${d.name}${d.active === false ? ' (منتهي)' : ''}</option>`).join('');
    if (cur) filter.value = cur;
  }
  const typeSel = document.getElementById('lr-type');
  if (typeSel && !typeSel.dataset.inited) {
    typeSel.dataset.inited = '1';
    typeSel.innerHTML = Object.entries(LEAVE_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  }
  loadLeavePolicyUI();
  refreshLeaveRequestsUI();
}

function extRestoreLeaveData(data) {
  if (data.employeeLeaveRequests) {
    employeeLeaveRequests = data.employeeLeaveRequests;
    DB.set('employeeLeaveRequests', employeeLeaveRequests);
  }
}
