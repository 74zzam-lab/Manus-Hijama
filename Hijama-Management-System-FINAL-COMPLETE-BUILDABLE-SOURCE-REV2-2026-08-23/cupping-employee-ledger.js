/**
 * Employee Financial Ledger — Single Source of Truth for HR accruals & payments
 */
(function (global) {
  'use strict';

  const MONTH_NAMES = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const PAGE_SIZE = 50;

  const ENTRY_TYPE_LABELS = {
    accrual: 'استحقاق',
    payment: 'صرف',
    carryover: 'مرحّل',
    adjustment: 'تسوية',
    reversal: 'عكس قيد'
  };
  const REF_TYPE_LABELS = {
    payroll_sync: 'رواتب',
    payment: 'سند صرف',
    case: 'خدمة',
    attendance: 'حضور',
    leave: 'إجازة',
    carryover: 'ترحيل',
    adjustment: 'تسوية',
    overtime: 'أوفر تايم'
  };
  const PAYMENT_KIND_LABELS = { full: 'صرف راتب', partial: 'صرف جزئي', items: 'صرف بنود', advance: 'سلفة' };
  const PAYROLL_COMPONENT_SOURCES = new Set(['payroll_sync', 'attendance', 'leave', 'overtime', 'case']);
  const SALARY_EARNING_TYPES = new Set([
    'base_salary', 'housing', 'transport', 'commission', 'commission_bonus',
    'overtime', 'bonus', 'incentive', 'allowance', 'compensation'
  ]);
  const DEDUCTION_TYPES = new Set([
    'absence_deduction', 'unpaid_leave', 'late_deduction', 'short_deduction', 'insurance'
  ]);
  const PAYROLL_BREAKDOWN_ORDER = [
    ['base_salary', 'الراتب الأساسي'],
    ['housing', 'بدل السكن'],
    ['transport', 'بدل المواصلات'],
    ['commission', 'العمولات'],
    ['commission_bonus', 'مكافأة عمولة'],
    ['overtime', 'الأوفر تايم'],
    ['bonus', 'بونص'],
    ['incentive', 'حوافز'],
    ['allowance', 'بدلات أخرى'],
    ['compensation', 'تعويضات'],
    ['insurance', 'خصم التأمينات'],
    ['absence_deduction', 'خصومات الغياب'],
    ['unpaid_leave', 'خصم إجازة غير مدفوعة'],
    ['late_deduction', 'خصومات التأخير'],
    ['short_deduction', 'خصم نقص دوام']
  ];

  const DEFAULT_ACCRUAL_TYPES = [
    { id: 'base_salary', label: 'الراتب الأساسي', priority: 10, category: 'earning' },
    { id: 'housing', label: 'بدل السكن', priority: 20, category: 'earning' },
    { id: 'transport', label: 'بدل النقل', priority: 30, category: 'earning' },
    { id: 'commission', label: 'عمولات الخدمات', priority: 40, category: 'earning' },
    { id: 'commission_bonus', label: 'مكافأة / بونص عمولة', priority: 50, category: 'earning' },
    { id: 'overtime', label: 'أوفر تايم', priority: 60, category: 'earning' },
    { id: 'bonus', label: 'بونص', priority: 70, category: 'earning' },
    { id: 'incentive', label: 'حوافز', priority: 80, category: 'earning' },
    { id: 'allowance', label: 'بدلات أخرى', priority: 90, category: 'earning' },
    { id: 'compensation', label: 'تعويضات', priority: 100, category: 'earning' },
    { id: 'refund', label: 'مرتجعات', priority: 110, category: 'earning' },
    { id: 'absence_deduction', label: 'خصم غياب', priority: 200, category: 'deduction' },
    { id: 'unpaid_leave', label: 'خصم إجازة غير مدفوعة', priority: 210, category: 'deduction' },
    { id: 'late_deduction', label: 'خصم تأخير', priority: 220, category: 'deduction' },
    { id: 'short_deduction', label: 'خصم نقص دوام', priority: 230, category: 'deduction' },
    { id: 'insurance', label: 'تأمينات', priority: 240, category: 'deduction' },
    { id: 'manual_adjustment', label: 'تسوية يدوية', priority: 900, category: 'adjustment' }
  ];

  let accruals = [];
  let payments = [];
  let entries = [];
  let _syncTimer = null;
  let _listPage = 1;
  let _renderTimer = null;

  function notify(msg, type) { if (typeof global.notify === 'function') global.notify(msg, type); }
  function fmtMoney(v) { return typeof global.fmtMoney === 'function' ? global.fmtMoney(v) : String(v); }
  function fmtDate(d) { return typeof global.fmtDate === 'function' ? global.fmtDate(d) : d; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function periodKey(y, m) { return `${y}-${m}`; }
  function user() { return global.getActiveUser?.() || global.currentUser; }

  function resolveLedgerBranchId() {
    if (global.BranchAuthority?.operationalWriteBranchId) {
      return global.BranchAuthority.operationalWriteBranchId(user());
    }
    return global.BranchContexts?.getOperationalWriteBranch?.()
      || global.BranchScope?.getViewBranchFilter?.()
      || null;
  }

  function isLedgerAggregateView() {
    return !!(global.BranchScope?.isAggregateBranchView?.()
      || global.BranchAuthority?.isOwnerAggregateMode?.(user()));
  }

  function filterLedgerRecords(records) {
    if (!Array.isArray(records)) return [];
    if (isLedgerAggregateView()) return records.slice();
    const bid = resolveLedgerBranchId();
    if (!bid) {
      if (typeof global.BranchScope === 'undefined' && typeof global.BranchAuthority === 'undefined') {
        return records.slice();
      }
      return [];
    }
    if (global.BranchScope?.filterByBranch) {
      return global.BranchScope.filterByBranch(records, bid);
    }
    return records.filter((r) => {
      if (!r || typeof r !== 'object') return false;
      if (!r.branchId) return bid === (global.BranchScope?.DEFAULT_BRANCH_ID || 'BR-MAIN');
      return r.branchId === bid;
    });
  }

  function stampLedgerBranch(record) {
    if (!record || typeof record !== 'object') return record;
    const bid = resolveLedgerBranchId();
    if (bid && !record.branchId) record.branchId = bid;
    return record;
  }

  function invalidateBranchCache() {
    accruals = [];
    payments = [];
    entries = [];
  }

  if (global.BranchSwitchCache?.registerInvalidator) {
    global.BranchSwitchCache.registerInvalidator(invalidateBranchCache);
  }

  const AR_ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const AR_TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const AR_HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  function arUnder100(n) {
    if (n < 20) return AR_ONES[n];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o ? `${AR_ONES[o]} و${AR_TENS[t]}` : AR_TENS[t];
  }

  function arUnder1000(n) {
    if (n < 100) return arUnder100(n);
    const h = Math.floor(n / 100);
    const r = n % 100;
    return r ? `${AR_HUNDREDS[h]} و${arUnder100(r)}` : AR_HUNDREDS[h];
  }

  function arIntegerWords(n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (!n) return 'صفر';
    const parts = [];
    let rem = n;
    const millions = Math.floor(rem / 1e6); rem %= 1e6;
    const thousands = Math.floor(rem / 1000); rem %= 1000;
    if (millions) parts.push(`${arUnder1000(millions)} ${millions === 1 ? 'مليون' : 'مليون'}`);
    if (thousands) parts.push(`${arUnder1000(thousands)} ${thousands === 1 ? 'ألف' : 'ألف'}`);
    if (rem) parts.push(arUnder1000(rem));
    return parts.join(' و');
  }

  function amountToArabicWords(amount) {
    const val = round2(Math.abs(Number(amount) || 0));
    const riyals = Math.floor(val);
    const halalas = Math.round((val - riyals) * 100);
    let text = arIntegerWords(riyals) + ' ريال';
    if (halalas) text += ` و${arIntegerWords(halalas)} هللة`;
    return text + ' سعودي فقط لا غير';
  }

  function formatHijriDate(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ar-SA-u-ca-islamic', { day: 'numeric', month: 'long', year: 'numeric' }) + ' هـ';
  }

  function formatGregorianDate(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ar-SA-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function getDoctorNationalId(doctorId) {
    const doc = (global.doctors || []).find(d => d.id === doctorId);
    return doc?.nationalId || doc?.idNumber || '—';
  }

  function entryTypeLabel(t) { return ENTRY_TYPE_LABELS[t] || t; }
  function refTypeLabel(t) { return REF_TYPE_LABELS[t] || t; }
  function formatRefDisplay(e) {
    const ref = e.refNo || e.refId;
    return ref ? `مرجع: ${ref}` : '—';
  }

  function accrualForEntry(e) {
    return e.accrualId ? accruals.find(a => a.id === e.accrualId) : null;
  }

  function isPayrollMonthAccrualEntry(e) {
    const a = accrualForEntry(e);
    if (!a || a.isCarryover || e.entryType !== 'accrual') return false;
    return PAYROLL_COMPONENT_SOURCES.has(a.sourceType || e.refType);
  }

  function payrollPeriodKey(e) {
    return `${e.doctorId}|${e.periodYear}|${e.periodMonth}`;
  }

  function buildPayrollBreakdownText(group) {
    const byType = {};
    group.forEach(g => {
      const a = accrualForEntry(g);
      if (!a || !(g.credit || g.debit)) return;
      byType[a.type] = a.typeLabel;
    });
    const parts = [];
    PAYROLL_BREAKDOWN_ORDER.forEach(([type, label]) => {
      if (byType[type]) parts.push(label);
    });
    Object.keys(byType).forEach(type => {
      if (!PAYROLL_BREAKDOWN_ORDER.some(([t]) => t === type)) parts.push(byType[type]);
    });
    return parts.join(' + ');
  }

  function buildPayrollBreakdownDetail(group) {
    return group.map(g => {
      const a = accrualForEntry(g);
      if (!a) return '';
      const amt = g.credit || g.debit;
      return amt ? `${a.typeLabel}: ${fmtMoney(amt)}` : '';
    }).filter(Boolean).join(' · ');
  }

  function payStatusForPeriod(doctorId, month, year) {
    const s = getSummary(doctorId, month, year);
    if (s.due <= 0.001) return { code: 'none', label: '—', cls: 'tag-gray' };
    if (s.remaining <= 0.001) return { code: 'paid', label: 'تم الصرف', cls: 'tag-green' };
    if (s.paid > 0.001) return { code: 'partial', label: 'صرف جزئي', cls: 'tag-gold' };
    return { code: 'unpaid', label: 'لم يُصرف بعد', cls: 'tag-red' };
  }

  function payStatusBadgeHtml(st) {
    if (!st?.label || st.label === '—') return '—';
    return `<span class="tag ${st.cls || 'tag-gray'}">${st.label}</span>`;
  }

  function consolidateStatementRows(raw) {
    const sorted = [...raw].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
    const used = new Set();
    const out = [];
    const payrollGroups = new Map();

    sorted.forEach(e => {
      if (isPayrollMonthAccrualEntry(e)) {
        const key = payrollPeriodKey(e);
        if (!payrollGroups.has(key)) payrollGroups.set(key, []);
        payrollGroups.get(key).push(e);
      }
    });

    payrollGroups.forEach((group, key) => {
      group.forEach(g => used.add(g.id));
      const anchor = group[group.length - 1];
      const totalCredit = round2(group.reduce((s, g) => s + (g.credit || 0), 0));
      const totalDebit = round2(group.reduce((s, g) => s + (g.debit || 0), 0));
      const breakdown = buildPayrollBreakdownText(group);
      const st = payStatusForPeriod(anchor.doctorId, anchor.periodMonth, anchor.periodYear);
      out.push({
        ...anchor,
        entryTypeLabel: 'الراتب المستحق الإجمالي',
        refDisplay: formatRefDisplay(anchor),
        description: breakdown ? `(تفصيل البنود: ${breakdown})` : anchor.description,
        credit: totalCredit,
        debit: totalDebit,
        _detail: buildPayrollBreakdownDetail(group),
        _payrollGroup: true,
        payStatus: st
      });
    });

    for (const e of sorted) {
      if (used.has(e.id)) continue;
      if (e.entryType === 'payment') {
        const p = payments.find(x => x.id === e.paymentId);
        const kind = PAYMENT_KIND_LABELS[p?.paymentKind] || PAYMENT_KIND_LABELS[p?.settlementStatus === 'partial' ? 'partial' : 'full'] || entryTypeLabel('payment');
        let desc = e.description;
        if (p?.allocations?.length) {
          const detail = p.allocations.map(a => a.typeLabel).join(' + ');
          desc = `الإجمالي: ${fmtMoney(p.totalAmount)} (${detail})`;
          if (p.notes) desc += ` — ${p.notes}`;
        }
        const methodNote = p?.paymentMethod === 'transfer' ? ' · تحويل بنكي' : '';
        out.push({
          ...e,
          entryTypeLabel: kind,
          refDisplay: p?.voucherNo ? `سند: ${p.voucherNo}` : formatRefDisplay(e),
          description: desc + methodNote,
          payStatus: { code: 'paid', label: 'تم الصرف', cls: 'tag-green' },
          _paymentId: p?.id
        });
        used.add(e.id);
        continue;
      }
      const a = accrualForEntry(e);
      let desc = e.description;
      if (a && DEDUCTION_TYPES.has(a.type) && e.entryType !== 'carryover') {
        desc = `${a.typeLabel}${desc && desc !== a.typeLabel ? ' — ' + desc : ''}`;
      }
      const st = e.entryType === 'carryover'
        ? payStatusForPeriod(e.doctorId, e.periodMonth, e.periodYear)
        : (a ? payStatusForPeriod(e.doctorId, e.periodMonth, e.periodYear) : null);
      out.push({
        ...e,
        entryTypeLabel: e.entryType === 'carryover' ? 'مرحّل — مستحق سابق' : entryTypeLabel(e.entryType),
        refDisplay: formatRefDisplay(e),
        description: desc,
        payStatus: st
      });
      used.add(e.id);
    }

    out.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));

    const remainderKeys = new Set();
    out.forEach(row => {
      const key = payrollPeriodKey(row);
      if (remainderKeys.has(key)) return;
      const s = getSummary(row.doctorId, row.periodMonth, row.periodYear);
      if (s.paid > 0.001 && s.remaining > 0.001) {
        remainderKeys.add(key);
        const lastBal = row.balanceAfter != null ? row.balanceAfter : lastBalance(row.doctorId);
        out.push({
          id: `remainder-${key}`,
          synthetic: true,
          doctorId: row.doctorId,
          doctorName: row.doctorName,
          date: row.date,
          periodMonth: row.periodMonth,
          periodYear: row.periodYear,
          entryTypeLabel: 'باقي مستحق',
          refDisplay: '—',
          description: `باقي مستحقات راتب ${MONTH_NAMES[row.periodMonth]} ${row.periodYear}`,
          debit: 0,
          credit: 0,
          balanceAfter: round2(s.remaining),
          payStatus: { code: 'unpaid', label: 'لم يُصرف بعد', cls: 'tag-red' },
          _detail: `المتبقي: ${fmtMoney(s.remaining)}`
        });
      }
    });

    return out.sort((a, b) => {
      if ((a.date || '') !== (b.date || '')) return (a.date || '').localeCompare(b.date || '');
      if (a.synthetic && !b.synthetic) return 1;
      if (!a.synthetic && b.synthetic) return -1;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  }

  /** Group consolidated rows under each employee for easier reading (all-staff view). */
  function groupStatementRowsByDoctor(rows, month, year) {
    if (!rows.length) return [];
    const byDoctor = new Map();
    rows.forEach(r => {
      if (r._groupHeader) return;
      const key = r.doctorId || r.doctorName || '_';
      if (!byDoctor.has(key)) byDoctor.set(key, []);
      byDoctor.get(key).push(r);
    });
    const out = [];
    [...byDoctor.entries()]
      .sort((a, b) => (a[1][0]?.doctorName || '').localeCompare(b[1][0]?.doctorName || '', 'ar'))
      .forEach(([key, docRows]) => {
        const anchor = docRows[0];
        const s = getSummary(anchor.doctorId, month, year);
        out.push({
          id: `group-${key}`,
          _groupHeader: true,
          doctorId: anchor.doctorId,
          doctorName: anchor.doctorName,
          _summary: s
        });
        docRows.forEach(r => out.push(r));
      });
    return out;
  }

  function renderStatementTableRow(e, opts) {
    const o = opts || {};
    if (e._groupHeader) {
      const s = e._summary || {};
      const colspan = o.colspan || 12;
      return `<tr class="ledger-doctor-group-header">
        <td colspan="${colspan}">
          <div class="ledger-doctor-group-inner">
            <strong>${e.doctorName || '—'}</strong>
            <span class="ledger-doctor-group-meta">
              <span>المستحق: <span dir="ltr">${fmtMoney(s.due || 0)}</span></span>
              <span>المصروف: <span dir="ltr">${fmtMoney(s.paid || 0)}</span></span>
              <span>المتبقي: <span dir="ltr">${fmtMoney(s.remaining || 0)}</span></span>
              ${s.statusLabel ? `<span class="tag ${paymentStatusBadge(s.status)}">${s.statusLabel}</span>` : ''}
            </span>
          </div>
        </td>
      </tr>`;
    }
    const showDoctorCol = o.showDoctorCol !== false;
    const doctorCell = showDoctorCol ? `<td>${e._inDoctorGroup ? '' : `<strong>${e.doctorName || '—'}</strong>`}</td>` : '';
    const actionsCell = o.includeActions === false ? '' : `<td class="actions-col">${renderEntryActions(e)}</td>`;
    return `<tr class="${e._inDoctorGroup ? 'ledger-doctor-group-row' : ''}${e.synthetic ? ' ledger-synthetic-row' : ''}">
      ${doctorCell}
      <td dir="ltr">${fmtDate(e.date)}</td>
      <td>${e.entryTypeLabel || entryTypeLabel(e.entryType)}</td>
      <td dir="ltr">${e.refDisplay || formatRefDisplay(e)}</td>
      <td>${MONTH_NAMES[e.periodMonth]} ${e.periodYear}</td>
      <td title="${e._detail || ''}">${e.description}</td>
      <td class="ledger-pay-status">${payStatusBadgeHtml(e.payStatus)}</td>
      <td class="money" dir="ltr">${e.debit ? fmtMoney(e.debit) : '—'}</td>
      <td class="money" dir="ltr">${e.credit ? fmtMoney(e.credit) : '—'}</td>
      <td class="money" dir="ltr"><strong>${fmtMoney(e.balanceAfter)}</strong></td>
      <td>${e.userName || '—'}</td>
      ${actionsCell}
    </tr>`;
  }

  function hasPerm(k) {
    if (typeof global.hasPermission !== 'function') return true;
    if (global.hasPermission('_all')) return true;
    return global.hasPermission(k);
  }

  /** Admin toggle + license feature — when false, payroll is unaffected. */
  function isModuleEnabled() {
    ensureLedgerSettings();
    if (global.settings.employeeLedger.enabled === false) return false;
    if (typeof global.isFeatureEnabled === 'function' && !global.isFeatureEnabled('hr_ledger')) return false;
    return true;
  }

  function ensureLedgerSettings() {
    if (!global.settings) return;
    if (!global.settings.employeeLedger) {
      global.settings.employeeLedger = {
        enabled: true,
        voucherCounter: 1000,
        autoSyncOnPayroll: true,
        autoCarryOver: true,
        autoPrintVoucher: false,
        accrualTypes: DEFAULT_ACCRUAL_TYPES.map(t => ({ ...t })),
        closings: {},
        savedFilters: null
      };
    }
    const s = global.settings.employeeLedger;
    if (s.enabled == null) s.enabled = true;
    if (s.autoPrintVoucher == null) s.autoPrintVoucher = false;
    s.accrualTypes = s.accrualTypes || DEFAULT_ACCRUAL_TYPES.map(t => ({ ...t }));
    s.closings = s.closings || {};
    DEFAULT_ACCRUAL_TYPES.forEach(def => {
      if (!s.accrualTypes.some(t => t.id === def.id)) s.accrualTypes.push({ ...def });
    });
    s.voucherCounter = s.voucherCounter || 1000;
  }

  function loadStore() {
    accruals = filterLedgerRecords(global.DB?.get('employeeLedgerAccruals', []) || []);
    payments = filterLedgerRecords(global.DB?.get('employeeLedgerPayments', []) || []);
    entries = filterLedgerRecords(global.DB?.get('employeeLedgerEntries', []) || []);
    ensureLedgerSettings();
    if (!entries.length && (accruals.length || payments.length)) rebuildEntriesFromLegacy();
  }

  function saveStore() {
    const bridge = global.SqliteBridge;
    const outerBundle = bridge?.isPrimary?.() && bridge?.beginBundle && !bridge?.isBundleActive?.();
    if (outerBundle) bridge.beginBundle();
    global.DB?.set('employeeLedgerAccruals', accruals);
    global.DB?.set('employeeLedgerPayments', payments);
    global.DB?.set('employeeLedgerEntries', entries);
    global.DB?.set('settings', global.settings);
    if (typeof global.syncAppGlobals === 'function') global.syncAppGlobals();
    if (outerBundle) {
      void bridge.commitBundle().then((res) => {
        if (!res?.ok && !res?.skipped) {
          global.notify?.('⚠️ فشل حفظ المستحقات — ' + (res?.error || 'bundle_commit_failed'), 'danger');
        }
      });
    }
  }

  function getTypeDef(typeId) {
    ensureLedgerSettings();
    return global.settings.employeeLedger.accrualTypes.find(t => t.id === typeId)
      || DEFAULT_ACCRUAL_TYPES.find(t => t.id === typeId)
      || { id: typeId, label: typeId, priority: 500, category: 'earning' };
  }

  function registerAccrualType(def) {
    if (!def?.id || !def?.label) return false;
    ensureLedgerSettings();
    if (global.settings.employeeLedger.accrualTypes.some(t => t.id === def.id)) return false;
    global.settings.employeeLedger.accrualTypes.push({
      id: def.id, label: def.label, priority: def.priority || 500, category: def.category || 'earning'
    });
    saveStore();
    return true;
  }

  function remaining(a) { return Math.max(0, round2((a.amount || 0) - (a.paidAmount || 0))); }
  function syncKey(doctorId, year, month, type, sourceId) {
    return `${doctorId}|${year}|${month}|${type}|${sourceId || ''}`;
  }
  function prevMonth(month, year) {
    return month <= 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
  }

  /** True when the employee has attendance, cases, or OT in the period (not salary config alone). */
  function doctorHasPeriodData(d, month, year) {
    if (typeof global.buildPayrollDoctorBlock === 'function') {
      const b = global.buildPayrollDoctorBlock(d, month, year);
      if ((b.docAtt?.length || 0) > 0 || (b.monthCases?.length || 0) > 0) return true;
    }
    const otRecords = global.otRecords || global.DB?.get('otRecords', []) || [];
    return otRecords.some(r => {
      if (r.doctorId !== d.id) return false;
      const dt = new Date(r.date);
      return !isNaN(dt.getTime()) && dt.getMonth() + 1 === month && dt.getFullYear() === year;
    });
  }

  function monthHasAnyPayrollData(month, year) {
    return visibleDoctors().some(d => doctorHasPeriodData(d, month, year));
  }

  function voidAccrualWithEntries(row, reason) {
    if (!row || row.status === 'void') return;
    entries.filter(e => e.accrualId === row.id && e.status === 'posted').forEach(orig => {
      orig.status = 'reversed';
      postEntry({
        doctorId: row.doctorId, doctorName: row.doctorName,
        entryType: 'reversal', refType: row.sourceType || 'carryover', refId: row.sourceId || row.id,
        periodMonth: row.periodMonth, periodYear: row.periodYear,
        description: `${reason || 'إلغاء'}: ${row.description || row.typeLabel || ''}`,
        credit: orig.debit, debit: orig.credit,
        reversesEntryId: orig.id, accrualId: row.id
      });
    });
    row.status = 'void';
    row.updatedAt = new Date().toISOString();
  }

  function adjustCarryoverAmount(child, newAmount, prevAmount) {
    const diff = round2(newAmount - prevAmount);
    if (Math.abs(diff) <= 0.001) return;
    child.amount = round2(newAmount);
    child.updatedAt = new Date().toISOString();
    child.status = remaining(child) <= 0.001 ? 'paid' : (child.paidAmount > 0 ? 'partial' : 'open');
    const isDed = child.category === 'deduction';
    postEntry({
      doctorId: child.doctorId, doctorName: child.doctorName,
      entryType: 'adjustment', refType: 'carryover', refId: child.id,
      periodMonth: child.periodMonth, periodYear: child.periodYear,
      description: `تعديل ترحيل: ${child.typeLabel}`,
      credit: isDed ? (diff < 0 ? round2(-diff) : 0) : (diff > 0 ? diff : 0),
      debit: isDed ? (diff > 0 ? diff : 0) : (diff < 0 ? round2(-diff) : 0),
      accrualId: child.id
    });
  }

  function reconcileCarryoverChild(src, child) {
    if (!child || child.status === 'void' || !child.isCarryover) return false;
    const rem = remaining(src);
    if (rem <= 0.001) {
      voidAccrualWithEntries(child, 'تم سداد المستحق في الشهر الأصلي');
      return true;
    }
    if (child.paidAmount > 0.001) return false;
    if (Math.abs(child.amount - rem) > 0.01) {
      adjustCarryoverAmount(child, rem, child.amount);
      return true;
    }
    return false;
  }

  function reconcileCarryoversForTargetMonth(month, year) {
    let count = 0;
    accruals.filter(a =>
      a.isCarryover && a.periodMonth === month && a.periodYear === year &&
      a.status !== 'void' && a.carriedFromId
    ).forEach(child => {
      const src = accruals.find(a => a.id === child.carriedFromId);
      if (!src || src.status === 'void') {
        voidAccrualWithEntries(child, 'المصدر غير موجود');
        count++;
        return;
      }
      if (reconcileCarryoverChild(src, child)) count++;
    });
    return count;
  }

  function reconcileCarryoversAfterPayment(allocations) {
    (allocations || [])
      .map(al => accruals.find(a => a.id === al.accrualId))
      .filter(Boolean)
      .forEach(src => {
        accruals.filter(c => c.carriedFromId === src.id && c.status !== 'void' && c.isCarryover)
          .forEach(child => reconcileCarryoverChild(src, child));
      });
  }

  function isFuturePeriod(month, year) {
    const now = new Date();
    const curM = now.getMonth() + 1;
    const curY = now.getFullYear();
    if (year > curY) return true;
    if (year === curY && month > curM) return true;
    return false;
  }

  /* ── Monthly closing ── */
  function isMonthClosed(month, year) {
    ensureLedgerSettings();
    const c = global.settings.employeeLedger.closings[periodKey(year, month)];
    return !!(c && c.closedAt && !c.reopenedAt);
  }

  function canEditPeriod(month, year) {
    if (!isMonthClosed(month, year)) return true;
    return hasPerm('ledger.reopen') || (typeof RolePolicy !== 'undefined' && RolePolicy.isManager(user())) || user()?.isDev;
  }

  function closeMonth(month, year) {
    if (!hasPerm('ledger.close') && !hasPerm('payroll.edit')) {
      notify('⛔ لا صلاحية لإقفال الشهر', 'danger'); return false;
    }
    loadStore();
    const stats = getDashboardStats(month, year);
    if (isMonthClosed(month, year)) {
      notify('⚠️ الشهر مقفول مسبقاً', 'danger'); return false;
    }
    const openItems = accruals.filter(a => a.periodMonth === month && a.periodYear === year && a.status !== 'void' && remaining(a) > 0.001);
    const warnMsg = openItems.length
      ? `يوجد ${openItems.length} بنداً بمتبقي ${fmtMoney(stats.totalRemaining)} — سيتم ترحيل غير المسدد للشهر التالي.\n\nمتابعة إقفال ${MONTH_NAMES[month]} ${year}؟`
      : `إقفال ${MONTH_NAMES[month]} ${year}؟ لن يُسمح بالتعديل حتى إعادة الفتح.`;
    if (typeof global.confirm === 'function' && !global.confirm(warnMsg)) return false;
    const next = month >= 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
    const carried = carryOverToMonth(next.month, next.year);
    ensureLedgerSettings();
    const key = periodKey(year, month);
    const u = user();
    global.settings.employeeLedger.closings[key] = {
      closedAt: new Date().toISOString(),
      closedBy: u?.fullName || u?.username || '—',
      closedById: u?.id || ''
    };
    saveStore();
    global.logAudit?.('LEDGER_MONTH_CLOSE', `إقفال مستحقات ${MONTH_NAMES[month]} ${year}${carried ? ` — ترحيل ${carried} بند` : ''}`, { month, year, carried });
    notify(`🔒 تم إقفال ${MONTH_NAMES[month]} ${year}`, 'success');
    return true;
  }

  function reopenMonth(month, year) {
    if (!hasPerm('ledger.reopen') && !(typeof RolePolicy !== 'undefined' && RolePolicy.isManager(user())) && !user()?.isDev) {
      notify('⛔ إعادة فتح الشهر لمدير النظام فقط', 'danger'); return false;
    }
    ensureLedgerSettings();
    const key = periodKey(year, month);
    const c = global.settings.employeeLedger.closings[key];
    if (!c?.closedAt || c.reopenedAt) { notify('⚠️ الشهر غير مقفول أو مفتوح بالفعل', 'danger'); return false; }
    const msg = `إعادة فتح ${MONTH_NAMES[month]} ${year}؟\nسيتمكن المدير من المزامنة والتصحيح ثم الإقفال مجدداً.`;
    if (typeof global.confirm === 'function' && !global.confirm(msg)) return false;
    const u = user();
    c.reopenedAt = new Date().toISOString();
    c.reopenedBy = u?.fullName || u?.username || '—';
    saveStore();
    global.logAudit?.('LEDGER_MONTH_REOPEN', `إعادة فتح مستحقات ${MONTH_NAMES[month]} ${year}`, { month, year });
    notify(`🔓 تم إعادة فتح ${MONTH_NAMES[month]} ${year}`, 'success');
    return true;
  }

  /* ── Bank-style ledger entries ── */
  function lastBalance(doctorId, beforeId) {
    const sorted = entries.filter(e => e.doctorId === doctorId && e.status !== 'void')
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || (a.id || '').localeCompare(b.id || ''));
    let bal = 0;
    sorted.forEach(e => {
      if (beforeId && e.id === beforeId) return;
      bal = round2(bal + (e.credit || 0) - (e.debit || 0));
    });
    return bal;
  }

  function postEntry(payload) {
    const u = user();
    const credit = round2(payload.credit || 0);
    const debit = round2(payload.debit || 0);
    const prev = lastBalance(payload.doctorId);
    const balanceAfter = round2(prev + credit - debit);
    const row = stampLedgerBranch({
      id: uid(),
      doctorId: payload.doctorId,
      doctorName: payload.doctorName,
      date: (payload.date || new Date().toISOString()).slice(0, 10),
      entryType: payload.entryType || 'accrual',
      refType: payload.refType || 'payroll_sync',
      refId: payload.refId || null,
      refNo: payload.refNo || '',
      periodMonth: payload.periodMonth,
      periodYear: payload.periodYear,
      description: payload.description || '',
      debit, credit, balanceAfter,
      userId: u?.id || '',
      userName: u?.fullName || u?.username || 'system',
      accrualId: payload.accrualId || null,
      paymentId: payload.paymentId || null,
      reversesEntryId: payload.reversesEntryId || null,
      status: 'posted',
      createdAt: new Date().toISOString()
    });
    entries.push(row);
    return row;
  }

  function rebuildEntriesFromLegacy() {
    entries = [];
    const sortedAcc = accruals.filter(a => a.status !== 'void').sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    sortedAcc.forEach(a => {
      const isDed = a.category === 'deduction';
      postEntry({
        doctorId: a.doctorId, doctorName: a.doctorName, date: a.createdAt,
        entryType: a.isCarryover ? 'carryover' : 'accrual', refType: a.sourceType, refId: a.sourceId,
        periodMonth: a.periodMonth, periodYear: a.periodYear,
        description: a.description || a.typeLabel,
        credit: isDed ? 0 : a.amount, debit: isDed ? a.amount : 0, accrualId: a.id
      });
    });
    payments.slice().sort((a, b) => (a.paidAt || '').localeCompare(b.paidAt || '')).forEach(p => {
      postEntry({
        doctorId: p.doctorId, doctorName: p.doctorName, date: p.paidAt,
        entryType: 'payment', refType: 'payment', refId: p.id, refNo: p.voucherNo,
        periodMonth: p.periodMonth, periodYear: p.periodYear,
        description: `سند صرف ${p.voucherNo}`, debit: p.totalAmount, credit: 0, paymentId: p.id
      });
    });
    saveStore();
  }

  function reverseEntry(entryId, reason) {
    if (!hasPerm('ledger.adjust')) { notify('⛔ لا صلاحية للتصحيح', 'danger'); return null; }
    const orig = entries.find(e => e.id === entryId && e.status === 'posted');
    if (!orig) { notify('⚠️ الحركة غير موجودة', 'danger'); return null; }
    if (isMonthClosed(orig.periodMonth, orig.periodYear) && !canEditPeriod(orig.periodMonth, orig.periodYear)) {
      notify('🔒 الشهر مقفول — لا يمكن العكس', 'danger'); return null;
    }
    orig.status = 'reversed';
    const rev = postEntry({
      doctorId: orig.doctorId, doctorName: orig.doctorName,
      entryType: 'reversal', refType: orig.refType, refId: orig.refId, refNo: orig.refNo,
      periodMonth: orig.periodMonth, periodYear: orig.periodYear,
      description: `عكس: ${orig.description}${reason ? ' — ' + reason : ''}`,
      credit: orig.debit, debit: orig.credit, reversesEntryId: orig.id,
      accrualId: orig.accrualId, paymentId: orig.paymentId
    });
    if (orig.accrualId) {
      const a = accruals.find(x => x.id === orig.accrualId);
      if (a) { a.status = 'void'; a.updatedAt = new Date().toISOString(); }
    }
    saveStore();
    global.logAudit?.('LEDGER_REVERSE', `عكس حركة ${orig.refNo || orig.id}`, { entryId, reason });
    notify('✅ تم إنشاء حركة عكسية', 'success');
    return rev;
  }

  function createAdjustment(doctorId, type, amount, reason, month, year) {
    if (!hasPerm('ledger.adjust')) { notify('⛔ لا صلاحية للتسوية', 'danger'); return null; }
    if (!canEditPeriod(month, year)) { notify('🔒 الشهر مقفول', 'danger'); return null; }
    const doc = (global.doctors || []).find(d => d.id === doctorId);
    if (!doc) return null;
    const typeDef = getTypeDef(type || 'manual_adjustment');
    const amt = round2(Math.abs(amount));
    const isDed = typeDef.category === 'deduction' || amount < 0;
    const acc = upsertAccrual({
      doctorId, doctorName: doc.name, type: type || 'manual_adjustment', amount: amt,
      periodMonth: month, periodYear: year, sourceType: 'adjustment',
      description: reason || 'تسوية يدوية',
      syncKey: `adj|${doctorId}|${year}|${month}|${Date.now()}`
    });
    postEntry({
      doctorId, doctorName: doc.name, entryType: 'adjustment', refType: 'adjustment', refId: acc.id,
      periodMonth: month, periodYear: year, description: reason || acc.description,
      credit: isDed ? 0 : amt, debit: isDed ? amt : 0, accrualId: acc.id
    });
    saveStore();
    global.logAudit?.('LEDGER_ADJUSTMENT', `تسوية ${doc.name}: ${fmtMoney(amt)}`, { doctorId, type, month, year });
    notify('✅ تم تسجيل التسوية', 'success');
    return acc;
  }

  /* ── Payroll breakdown (SSOT sync) ── */
  function computeBreakdown(d, month, year) {
    if (typeof global.buildPayrollDoctorBlock !== 'function') return [];
    const b = global.buildPayrollDoctorBlock(d, month, year);
    const docAtt = b.docAtt || [];
    const dayVal = d.dayValue || 0;
    const items = [
      { type: 'base_salary', amount: d.salary || 0, category: 'earning', sourceType: 'payroll_sync' },
      { type: 'housing', amount: d.housing || 0, category: 'earning', sourceType: 'payroll_sync' },
      { type: 'transport', amount: d.transport || 0, category: 'earning', sourceType: 'payroll_sync' },
      { type: 'commission', amount: b.commission || 0, category: 'earning', sourceType: 'case' },
      { type: 'commission_bonus', amount: b.monthlyCommBonus || 0, category: 'earning', sourceType: 'payroll_sync' },
      { type: 'overtime', amount: b.otValue || 0, category: 'earning', sourceType: 'overtime' }
    ];
    const absDays = docAtt.filter(a => a.type === 'absent').length;
    if (absDays * dayVal > 0) items.push({ type: 'absence_deduction', amount: absDays * dayVal, category: 'deduction', sourceType: 'attendance' });
    if (typeof global.calcUnpaidLeaveDeduction === 'function') {
      const ul = global.calcUnpaidLeaveDeduction(docAtt, dayVal);
      if (ul.deduct > 0) items.push({ type: 'unpaid_leave', amount: ul.deduct, category: 'deduction', sourceType: 'leave' });
    }
    if (typeof global.calcAttendancePolicyDeductions === 'function') {
      const ap = global.calcAttendancePolicyDeductions(docAtt, d);
      if (ap.lateDeduct > 0) items.push({ type: 'late_deduction', amount: ap.lateDeduct, category: 'deduction', sourceType: 'attendance' });
      if (ap.shortDeduct > 0) items.push({ type: 'short_deduction', amount: ap.shortDeduct, category: 'deduction', sourceType: 'attendance' });
    }
    const ins = typeof global.calcInsuranceDeduction === 'function' ? global.calcInsuranceDeduction(d) : 0;
    if (ins > 0) items.push({ type: 'insurance', amount: ins, category: 'deduction', sourceType: 'payroll_sync' });
    return items.filter(i => Math.abs(i.amount) > 0.001);
  }

  function upsertAccrual(payload) {
    const key = payload.syncKey || syncKey(payload.doctorId, payload.periodYear, payload.periodMonth, payload.type, payload.sourceId);
    let row = accruals.find(a => a.syncKey === key && a.status !== 'void');
    const typeDef = getTypeDef(payload.type);
    const now = new Date().toISOString();
    const u = user();
    const prevAmount = row?.amount;
    if (!row) {
      row = stampLedgerBranch({
        id: uid(), doctorId: payload.doctorId, doctorName: payload.doctorName,
        type: payload.type, typeLabel: typeDef.label, category: typeDef.category, priority: typeDef.priority,
        amount: round2(payload.amount), paidAmount: 0,
        periodMonth: payload.periodMonth, periodYear: payload.periodYear,
        originMonth: payload.originMonth || payload.periodMonth, originYear: payload.originYear || payload.periodYear,
        carriedFromId: payload.carriedFromId || null, isCarryover: !!payload.isCarryover,
        sourceType: payload.sourceType || 'payroll_sync', sourceId: payload.sourceId || null,
        description: payload.description || typeDef.label, syncKey: key, status: 'open',
        createdAt: now, createdBy: u?.fullName || u?.username || 'system', updatedAt: now
      });
      accruals.push(row);
      const isDed = row.category === 'deduction';
      postEntry({
        doctorId: row.doctorId, doctorName: row.doctorName, entryType: row.isCarryover ? 'carryover' : 'accrual',
        refType: row.sourceType, refId: row.sourceId, periodMonth: row.periodMonth, periodYear: row.periodYear,
        description: row.description, credit: isDed ? 0 : row.amount, debit: isDed ? row.amount : 0, accrualId: row.id
      });
    } else if (row.paidAmount > 0 && Math.abs(row.amount - payload.amount) > 0.01) {
      notify(`⚠️ ${row.typeLabel}: لا يمكن تعديل بند مدفوع جزئياً — استخدم تسوية`, 'danger');
    } else if (!row.paidAmount && Math.abs((prevAmount || 0) - payload.amount) > 0.01) {
      row.amount = round2(payload.amount);
      row.description = payload.description || row.description;
      row.updatedAt = now;
      const isDed = row.category === 'deduction';
      postEntry({
        doctorId: row.doctorId, doctorName: row.doctorName, entryType: 'adjustment', refType: 'payroll_sync',
        refId: row.id, periodMonth: row.periodMonth, periodYear: row.periodYear,
        description: `تحديث: ${row.typeLabel}`, credit: isDed ? 0 : row.amount - (prevAmount || 0), debit: isDed ? row.amount - (prevAmount || 0) : 0,
        accrualId: row.id
      });
    }
    row.status = remaining(row) <= 0.001 ? 'paid' : (row.paidAmount > 0 ? 'partial' : 'open');
    return row;
  }

  function syncDoctorMonth(doctor, month, year, options) {
    if (!canEditPeriod(month, year)) return 0;
    if (!options?.force && !doctorHasPeriodData(doctor, month, year)) return 0;
    computeBreakdown(doctor, month, year).forEach(item => {
      upsertAccrual({
        doctorId: doctor.id, doctorName: doctor.name, type: item.type, amount: item.amount,
        periodMonth: month, periodYear: year, sourceType: item.sourceType,
        description: `${getTypeDef(item.type).label} — ${MONTH_NAMES[month]} ${year}`
      });
    });
    return 1;
  }

  function carryOverToMonth(month, year) {
    ensureLedgerSettings();
    if (isFuturePeriod(month, year)) return 0;
    if (!global.settings.employeeLedger.autoCarryOver) return 0;
    reconcileCarryoversForTargetMonth(month, year);
    const prev = prevMonth(month, year);
    let count = 0;
    accruals.filter(a =>
      a.periodMonth === prev.month && a.periodYear === prev.year &&
      a.status !== 'void' && a.category !== 'deduction' && !a.isCarryover &&
      remaining(a) > 0.001
    ).forEach(src => {
      const rem = remaining(src);
      const existing = accruals.find(x =>
        x.carriedFromId === src.id && x.periodMonth === month && x.periodYear === year && x.status !== 'void'
      );
      if (rem <= 0.001) {
        if (existing) voidAccrualWithEntries(existing, 'تم سداد المستحق في الشهر الأصلي');
        return;
      }
      if (existing) {
        if (existing.paidAmount <= 0.001 && Math.abs(existing.amount - rem) > 0.01) {
          adjustCarryoverAmount(existing, rem, existing.amount);
        }
        return;
      }
      upsertAccrual({
        doctorId: src.doctorId, doctorName: src.doctorName, type: src.type, amount: rem,
        periodMonth: month, periodYear: year,
        originMonth: src.originMonth || src.periodMonth, originYear: src.originYear || src.periodYear,
        carriedFromId: src.id, isCarryover: true, sourceType: 'carryover', sourceId: src.id,
        description: `مرحّل من ${MONTH_NAMES[src.originMonth || src.periodMonth]} ${src.originYear || src.periodYear} — ${src.typeLabel}`,
        syncKey: `carry|${src.id}|${year}|${month}`
      });
      count++;
    });
    return count;
  }

  function syncMonth(month, year, options) {
    if (!isModuleEnabled()) return 0;
    if (isFuturePeriod(month, year)) {
      notify('⚠️ لا يمكن مزامنة شهر لم يبدأ بعد', 'danger'); return 0;
    }
    if (isMonthClosed(month, year) && !options?.force) {
      notify('🔒 الشهر مقفول — استخدم إعادة الفتح للمزامنة', 'danger'); return 0;
    }
    loadStore();
    const carried = options?.carryOver !== false ? carryOverToMonth(month, year) : reconcileCarryoversForTargetMonth(month, year);
    const docs = visibleDoctors();
    const toSync = options?.force
      ? docs
      : docs.filter(d => doctorHasPeriodData(d, month, year));
    toSync.forEach(d => syncDoctorMonth(d, month, year, options));
    saveStore();
    if (!toSync.length && !carried && !options?.force && !monthHasAnyPayrollData(month, year)) {
      notify('⚠️ لا توجد بيانات حضور أو خدمات لهذا الشهر — لم تُنشأ مستحقات جديدة', 'warning');
    }
    global.logAudit?.('LEDGER_SYNC', `مزامنة مستحقات ${MONTH_NAMES[month]} ${year}`, { month, year, count: toSync.length, carried });
    if (typeof global.touchReadinessUI === 'function') global.touchReadinessUI();
    return toSync.length;
  }

  function queueSyncForDate(doctorId, dateStr) {
    if (!isModuleEnabled()) return;
    if (!doctorId || !dateStr) return;
    const d = new Date(dateStr);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    if (isFuturePeriod(month, year)) return;
    if (isMonthClosed(month, year)) return;
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => {
      const doc = (global.doctors || []).find(x => x.id === doctorId);
      if (doc) { loadStore(); syncDoctorMonth(doc, month, year); saveStore(); }
    }, 800);
  }

  function onSourceChange(sourceType, meta) {
    if (!isModuleEnabled()) return true;
    if (!meta?.doctorId) return;
    const month = meta.month || (meta.date ? new Date(meta.date).getMonth() + 1 : null);
    const year = meta.year || (meta.date ? new Date(meta.date).getFullYear() : null);
    if (!month || !year) return;
    if (isMonthClosed(month, year)) {
      if (sourceType !== 'view') notify('🔒 الشهر المالي مقفول', 'danger');
      return false;
    }
    queueSyncForDate(meta.doctorId, meta.date || `${year}-${String(month).padStart(2, '0')}-01`);
    return true;
  }

  function visibleDoctors() {
    const docs = (global.doctors || []).filter(d => d.active !== false);
    if (hasPerm('ledger.view_all') || (typeof RolePolicy !== 'undefined' && RolePolicy.isManager(user())) || user()?.isDev) return docs;
    const linked = user()?.doctorId;
    if (linked) return docs.filter(d => d.id === linked);
    return docs;
  }

  function getDoctorAccruals(doctorId, month, year) {
    loadStore();
    return accruals.filter(a => {
      if (a.status === 'void') return false;
      if (doctorId && a.doctorId !== doctorId) return false;
      if (month && year) return a.periodMonth === month && a.periodYear === year;
      return true;
    }).sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }

  function getSummary(doctorId, month, year) {
    const rows = getDoctorAccruals(doctorId, month, year);
    let earned = 0, deducted = 0, paid = 0;
    rows.forEach(r => {
      if (r.category === 'deduction') deducted += r.amount;
      else { earned += r.amount; paid += r.paidAmount || 0; }
    });
    const due = round2(earned - deducted);
    const remainingTotal = round2(Math.max(0, due - paid));
    const lastPay = payments.filter(p => p.doctorId === doctorId).sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''))[0];
    let status = 'unpaid';
    if (remainingTotal <= 0.001) status = due <= 0 ? 'none' : 'paid';
    else if (paid > 0) status = 'partial';
    return {
      earned, deducted, due, paid, remaining: remainingTotal,
      carriedAmount: round2(rows.filter(r => r.isCarryover).reduce((s, r) => s + remaining(r), 0)),
      status, statusLabel: { paid: 'مدفوع بالكامل', partial: 'مدفوع جزئياً', unpaid: 'غير مدفوع', none: 'لا مستحقات' }[status],
      lastPaymentAt: lastPay?.paidAt || null, rows
    };
  }

  function getDashboardStats(month, year) {
    const docs = visibleDoctors();
    let totalDue = 0, totalPaid = 0, totalRem = 0, totalCarried = 0, withBalance = 0;
    const ranking = [];
    docs.forEach(d => {
      const s = getSummary(d.id, month, year);
      totalDue += s.due; totalPaid += s.paid; totalRem += s.remaining; totalCarried += s.carriedAmount;
      if (s.remaining > 0) { withBalance++; ranking.push({ name: d.name, id: d.id, remaining: s.remaining }); }
    });
    ranking.sort((a, b) => b.remaining - a.remaining);
    return {
      totalDue: round2(totalDue), totalPaid: round2(totalPaid), totalRemaining: round2(totalRem),
      totalCarried: round2(totalCarried),
      employeesWithBalance: withBalance, topFive: ranking.slice(0, 5),
      entryCount: entries.filter(e => e.status !== 'void' && e.periodMonth === month && e.periodYear === year).length,
      voucherCount: payments.filter(p => p.periodMonth === month && p.periodYear === year).length,
      monthClosed: isMonthClosed(month, year)
    };
  }

  function renderDashboardCard() {
    const el = document.getElementById('dash-ledger-card');
    const row = document.getElementById('dash-ledger-row');
    if (!el || !isModuleEnabled()) {
      if (el) el.style.display = 'none';
      if (row) row.style.display = 'none';
      return;
    }
    if (row) row.style.display = '';
    if (!hasPerm('ledger.view') && !hasPerm('payroll.view')) { el.style.display = 'none'; return; }
    const now = new Date();
    const m = parseInt(document.getElementById('payrollMonth')?.value, 10) || (now.getMonth() + 1);
    const y = parseInt(document.getElementById('payrollYear')?.value, 10) || now.getFullYear();
    const s = getDashboardStats(m, y);
    el.style.display = '';
    el.innerHTML = `
      <div class="card dash-panel ledger-dash-card" role="button" tabindex="0" onclick="showPage('employee-ledger')" onkeydown="if(event.key==='Enter')showPage('employee-ledger')">
        <div class="card-header"><div class="card-title">📒 مستحقات الموظفين</div>${s.monthClosed ? '<span class="tag tag-gold">مقفول</span>' : ''}</div>
        <div class="ledger-dash-grid">
          <div><span class="lbl">المستحقات</span><span class="val" dir="ltr">${fmtMoney(s.totalDue)}</span></div>
          <div><span class="lbl">تم صرفه</span><span class="val success" dir="ltr">${fmtMoney(s.totalPaid)}</span></div>
          <div><span class="lbl">المتبقي</span><span class="val danger" dir="ltr">${fmtMoney(s.totalRemaining)}</span></div>
          <div><span class="lbl">موظفون بمستحقات</span><span class="val">${s.employeesWithBalance}</span></div>
        </div>
        ${s.topFive.length ? `<div class="ledger-dash-top"><div class="lbl">أعلى أرصدة</div>${s.topFive.map((r, i) => `<div class="top-row"><span>${i + 1}. ${r.name}</span><span dir="ltr">${fmtMoney(r.remaining)}</span></div>`).join('')}</div>` : ''}
      </div>`;
  }

  function nextVoucherNo() {
    ensureLedgerSettings();
    return `PV-${global.settings.employeeLedger.voucherCounter++}`;
  }

  function autoAllocate(doctorId, amount, month, year, typeFilter) {
    let left = round2(amount);
    const pool = getDoctorAccruals(doctorId, month, year)
      .filter(a => a.category !== 'deduction' && remaining(a) > 0.001)
      .filter(a => !typeFilter?.length || typeFilter.includes(a.type))
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));
    const allocations = [];
    pool.forEach(a => {
      if (left <= 0) return;
      const take = Math.min(remaining(a), left);
      allocations.push({ accrualId: a.id, type: a.type, typeLabel: a.typeLabel, periodMonth: a.periodMonth, periodYear: a.periodYear, amount: take });
      left = round2(left - take);
    });
    return { allocations, unallocated: left };
  }

  function allocateByAccrualIds(doctorId, month, year, accrualIds) {
    const ids = new Set((accrualIds || []).filter(Boolean));
    const allocations = getDoctorAccruals(doctorId, month, year)
      .filter(a => ids.has(a.id) && a.category !== 'deduction' && remaining(a) > 0.001)
      .sort((a, b) => (a.priority || 0) - (b.priority || 0))
      .map(a => ({
        accrualId: a.id, type: a.type, typeLabel: a.typeLabel,
        periodMonth: a.periodMonth, periodYear: a.periodYear, amount: remaining(a)
      }));
    const total = round2(allocations.reduce((s, a) => s + a.amount, 0));
    return { allocations, total };
  }

  function getOpenPayableAccruals(doctorId, month, year) {
    return getDoctorAccruals(doctorId, month, year)
      .filter(a => a.category !== 'deduction' && remaining(a) > 0.001)
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }

  function recordPayment(opts) {
    if (global._ledgerPaymentBusy) return null;
    global._ledgerPaymentBusy = true;
    try {
    if (!isModuleEnabled()) { notify('ℹ️ نظام المستحقات معطّل', 'warning'); return null; }
    if (!hasPerm('ledger.pay') && !hasPerm('payroll.edit')) { notify('⛔ لا صلاحية للصرف', 'danger'); return null; }
    if (!canEditPeriod(opts.month, opts.year)) { notify('🔒 الشهر مقفول', 'danger'); return null; }
    loadStore();
    const doctor = (global.doctors || []).find(d => d.id === opts.doctorId);
    if (!doctor) { notify('⚠️ الموظف غير موجود', 'danger'); return null; }
    const amount = round2(parseFloat(opts.amount) || 0);
    if (amount <= 0) { notify('⚠️ أدخل مبلغاً صحيحاً', 'danger'); return null; }
    let allocations = opts.allocations || [];
    if (!allocations.length) {
      const auto = autoAllocate(opts.doctorId, amount, opts.month, opts.year, opts.typeFilter);
      allocations = auto.allocations;
      if (auto.unallocated > 0.01 && !hasPerm('ledger.partial_pay')) notify(`⚠️ لم يُخصص ${fmtMoney(auto.unallocated)}`, 'danger');
    }
    const allocTotal = round2(allocations.reduce((s, a) => s + a.amount, 0));
    if (allocTotal <= 0) { notify('⚠️ لا توجد بنود قابلة للصرف', 'danger'); return null; }
    const u = user();
    const payment = stampLedgerBranch({
      id: uid(), voucherNo: nextVoucherNo(), doctorId: doctor.id, doctorName: doctor.name,
      totalAmount: allocTotal, paymentMethod: opts.paymentMethod || 'cash', notes: opts.notes || '',
      paymentKind: opts.paymentKind || (allocTotal >= amount - 0.01 ? 'full' : 'partial'),
      paidAt: new Date().toISOString(), paidBy: u?.id || '', paidByName: u?.fullName || u?.username || '—',
      allocations, periodMonth: opts.month, periodYear: opts.year,
      settlementStatus: allocTotal >= amount - 0.01 ? 'full' : 'partial'
    });
    payments.push(payment);
    allocations.forEach(al => {
      const row = accruals.find(a => a.id === al.accrualId);
      if (!row) return;
      row.paidAmount = round2((row.paidAmount || 0) + al.amount);
      row.status = remaining(row) <= 0.001 ? 'paid' : 'partial';
    });
    reconcileCarryoversAfterPayment(allocations);
    const allocDetail = allocations.map(a => a.typeLabel).join(' + ');
    const kindLabel = PAYMENT_KIND_LABELS[payment.paymentKind] || 'صرف';
    postEntry({
      doctorId: doctor.id, doctorName: doctor.name, entryType: 'payment', refType: 'payment',
      refId: payment.id, refNo: payment.voucherNo, periodMonth: opts.month, periodYear: opts.year,
      description: `${kindLabel} — الإجمالي: ${fmtMoney(allocTotal)}${allocDetail ? ` (${allocDetail})` : ''}`,
      debit: allocTotal, credit: 0, paymentId: payment.id, date: payment.paidAt
    });
    saveStore();
    const remAfter = getSummary(doctor.id, opts.month, opts.year).remaining;
    global.logAudit?.('LEDGER_PAYMENT', `صرف ${fmtMoney(allocTotal)} — ${doctor.name} (${payment.voucherNo})`, { paymentId: payment.id });
    notify(`✅ تم تسجيل سند الصرف ${payment.voucherNo} — المتبقي: ${fmtMoney(remAfter)}`, 'success');
    return payment;
    } finally {
      global._ledgerPaymentBusy = false;
    }
  }

  function getFilters() {
    return {
      month: parseInt(document.getElementById('ledger-month')?.value, 10) || new Date().getMonth() + 1,
      year: parseInt(document.getElementById('ledger-year')?.value, 10) || new Date().getFullYear(),
      doctorId: document.getElementById('ledger-doctor')?.value || '',
      type: document.getElementById('ledger-type')?.value || '',
      status: document.getElementById('ledger-status')?.value || '',
      method: document.getElementById('ledger-pay-method')?.value || '',
      voucher: (document.getElementById('ledger-voucher')?.value || '').trim(),
      userQ: (document.getElementById('ledger-user')?.value || '').trim().toLowerCase(),
      search: (document.getElementById('ledger-search')?.value || '').trim().toLowerCase(),
      dateFrom: document.getElementById('ledger-from')?.value || '',
      dateTo: document.getElementById('ledger-to')?.value || ''
    };
  }

  function filterEntries(f) {
    return entries.filter(e => {
      if (e.status === 'void') return false;
      if (f.doctorId && e.doctorId !== f.doctorId) return false;
      if (f.month && f.year) {
        const inPeriod = e.periodMonth === f.month && e.periodYear === f.year;
        const inRange = f.dateFrom || f.dateTo;
        if (!inRange && !inPeriod) return false;
      }
      if (f.type && e.refType !== f.type && e.entryType !== f.type) return false;
      if (f.voucher && !(e.refNo || '').includes(f.voucher)) return false;
      if (f.userQ && !(e.userName || '').toLowerCase().includes(f.userQ)) return false;
      if (f.dateFrom && e.date < f.dateFrom) return false;
      if (f.dateTo && e.date > f.dateTo) return false;
      if (f.search && !(e.doctorName || '').toLowerCase().includes(f.search) && !(e.description || '').includes(f.search)) return false;
      if (f.status) {
        const acc = e.accrualId ? accruals.find(a => a.id === e.accrualId) : null;
        if (e.entryType === 'payment') {
          if (f.status !== 'paid' && f.status !== 'partial') return false;
        } else if (acc && acc.status !== f.status) return false;
      }
      if (f.method) {
        if (e.entryType !== 'payment') return false;
        const p = payments.find(x => x.id === e.paymentId);
        if (!p || p.paymentMethod !== f.method) return false;
      }
      return true;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function saveFilters() {
    ensureLedgerSettings();
    global.settings.employeeLedger.savedFilters = getFilters();
    saveStore();
    notify('💾 تم حفظ الفلاتر', 'success');
  }

  function applySavedFilters() {
    const f = global.settings?.employeeLedger?.savedFilters;
    if (!f) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    set('ledger-month', f.month); set('ledger-year', f.year); set('ledger-doctor', f.doctorId);
    set('ledger-type', f.type); set('ledger-status', f.status); set('ledger-pay-method', f.method);
    set('ledger-voucher', f.voucher); set('ledger-user', f.userQ); set('ledger-search', f.search);
    set('ledger-from', f.dateFrom); set('ledger-to', f.dateTo);
  }

  function paymentStatusBadge(status) {
    return { paid: 'tag-green', partial: 'tag-gold', unpaid: 'tag-red', none: 'tag-gray' }[status] || 'tag-gray';
  }

  function buildVoucherHtml(payment, thermal) {
    const cn = global.settings?.centerName || 'مركز الحجامة';
    const logoSrc = global.resolvePrintAssetUrl?.(global.getCenterBrandLogo?.() || global.settings?.brandLogo || 'branding/Center-Logo.png') || 'branding/Center-Logo.png';
    const crNum = global.settings?.crNum || '';
    const dt = new Date(payment.paidAt || Date.now());
    const gregDate = formatGregorianDate(dt);
    const hijriDate = formatHijriDate(dt);
    const methodL = { cash: 'كاش', transfer: 'تحويل بنكي', check: 'شيك', other: 'أخرى' };
    const periodLabel = payment.periodMonth ? `${MONTH_NAMES[payment.periodMonth]} ${payment.periodYear}` : '';
    const nationalId = getDoctorNationalId(payment.doctorId);
    const itemNames = (payment.allocations || []).map(a => a.typeLabel).join(' و') || 'مستحقات';
    const amountWords = amountToArabicWords(payment.totalAmount);
    const rows = (payment.allocations || []).map((a, i) =>
      `<tr><td class="center">${i + 1}</td><td>${a.typeLabel}</td><td class="money">${fmtMoney(a.amount)}</td></tr>`
    ).join('');
    const itemsTable = rows ? `<table style="width:100%;margin-top:14px;border-collapse:collapse"><thead><tr><th>#</th><th>البند</th><th>المبلغ</th></tr></thead><tbody>${rows}</tbody></table>` : '';

    if (thermal) {
      return `<div class="thermal-receipt" style="text-align:center;font-family:Cairo,sans-serif">
        <div style="font-weight:900">${cn}</div><div style="font-size:11px">إقرار استلام — ${payment.voucherNo}</div>
        <div>${payment.doctorName}</div>${periodLabel ? `<div style="font-size:10px">${periodLabel}</div>` : ''}
        <div dir="ltr" style="font-weight:900">${fmtMoney(payment.totalAmount)}</div>
        <div style="font-size:9px">${gregDate}</div></div>`;
    }

    return `<div style="font-family:Cairo,sans-serif;max-width:780px;margin:0 auto;padding:24px;color:#222;line-height:1.7">
      <div style="text-align:center;margin-bottom:18px">
        <img src="${logoSrc}" alt="" style="max-height:80px;max-width:180px;object-fit:contain;margin-bottom:8px">
        <h1 style="margin:0;font-size:20px;color:#1a4a3a">${cn}</h1>
        ${crNum ? `<div style="font-size:12px;color:#666">السجل التجاري: <span dir="ltr">${crNum}</span></div>` : ''}
        <div style="font-size:12px;color:#666;margin-top:4px">التاريخ الميلادي: ${gregDate} · التاريخ الهجري: ${hijriDate}</div>
        <div style="font-size:13px;font-weight:800;margin-top:8px">إقرار استلام مستحقات — ${payment.voucherNo || ''}</div>
      </div>
      <p style="font-size:14px;text-align:justify;margin:18px 0">
        أقر أنا الموقع أدناه / <strong>${payment.doctorName}</strong>، رقم الهوية / الإقامة <strong dir="ltr">${nationalId}</strong>،
        بأنني قد استلمت من <strong>${cn}</strong> مبلغاً وقدره <strong dir="ltr">${fmtMoney(payment.totalAmount)}</strong>
        و (<strong>${amountWords}</strong>)، وذلك مقابل <strong>${itemNames}</strong>
        ${periodLabel ? ` عن شهر <strong>${periodLabel}</strong>` : ''}.
      </p>
      ${itemsTable}
      ${payment.notes ? `<p style="font-size:12px;color:#666"><strong>ملاحظات:</strong> ${payment.notes}</p>` : ''}
      <p style="font-size:11px;color:#666">طريقة الدفع: ${methodL[payment.paymentMethod] || payment.paymentMethod || '—'} · أُعد بواسطة: ${payment.paidByName || '—'}</p>
      <div style="margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:32px">
        <div>
          <div style="border-top:1px solid #333;padding-top:10px;font-size:12px;line-height:1.8">
            <div><strong>اسم الموظف:</strong> ${payment.doctorName}</div>
            <div><strong>رقم الهوية / الإقامة:</strong> <span dir="ltr">${nationalId}</span></div>
            <div style="margin-top:24px">توقيع الموظف: _______________</div>
            <div style="margin-top:8px">التاريخ: _______________</div>
          </div>
        </div>
        <div>
          <div style="border-top:1px solid #333;padding-top:10px;font-size:12px;line-height:1.8">
            <div style="margin-top:24px">ختم المركز / توقيع المدير الإداري: _______________</div>
            <div style="margin-top:24px">توقيع المحاسب: _______________</div>
          </div>
        </div>
      </div>
      ${global.printFooterDiv?.() || ''}
    </div>`;
  }

  function buildPayslipHtml(doctorId, month, year) {
    const doc = (global.doctors || []).find(d => d.id === doctorId);
    if (!doc) return '';
    const cn = global.settings?.centerName || 'مركز الحجامة';
    const logoSrc = global.resolvePrintAssetUrl?.(global.getCenterBrandLogo?.() || global.settings?.brandLogo || 'branding/Center-Logo.png') || 'branding/Center-Logo.png';
    const crNum = global.settings?.crNum || '';
    const now = new Date();
    const gregDate = formatGregorianDate(now);
    const hijriDate = formatHijriDate(now);
    const nationalId = getDoctorNationalId(doctorId);
    const periodLabel = `${MONTH_NAMES[month]} ${year}`;
    const rows = getDoctorAccruals(doctorId, month, year);
    const earningRows = [];
    const deductRows = [];
    let totalEarn = 0;
    let totalDed = 0;
    rows.forEach(r => {
      if (r.status === 'void') return;
      const amt = r.amount || 0;
      if (r.category === 'deduction') {
        deductRows.push({ label: r.typeLabel, amount: amt });
        totalDed += amt;
      } else {
        earningRows.push({ label: r.typeLabel, amount: amt, carry: r.isCarryover });
        totalEarn += amt;
      }
    });
    const net = round2(totalEarn - totalDed);
    const renderRows = (list, color) => list.map((r, i) =>
      `<tr><td class="center">${i + 1}</td><td>${r.label}${r.carry ? ' (مرحّل)' : ''}</td><td class="money" style="color:${color}">${fmtMoney(r.amount)}</td></tr>`
    ).join('');
    return `<div style="font-family:Cairo,sans-serif;max-width:780px;margin:0 auto;padding:24px;color:#222">
      <div style="text-align:center;margin-bottom:16px">
        <img src="${logoSrc}" alt="" style="max-height:72px;max-width:160px;object-fit:contain">
        <h1 style="margin:6px 0;font-size:18px;color:#1a4a3a">${cn}</h1>
        ${crNum ? `<div style="font-size:12px;color:#666">السجل التجاري: <span dir="ltr">${crNum}</span></div>` : ''}
        <div style="font-size:12px;color:#666">مفردات مرتب — ${periodLabel}</div>
        <div style="font-size:11px;color:#666">${gregDate} · ${hijriDate}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;font-size:13px">
        <div><strong>الموظف:</strong> ${doc.name}</div>
        <div><strong>رقم الهوية / الإقامة:</strong> <span dir="ltr">${nationalId}</span></div>
      </div>
      <h3 style="font-size:14px;margin:12px 0 6px">المستحقات</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px"><thead><tr><th>#</th><th>البند</th><th>المبلغ</th></tr></thead><tbody>${renderRows(earningRows, '#1a4a3a') || '<tr><td colspan="3" style="text-align:center">—</td></tr>'}</tbody></table>
      <h3 style="font-size:14px;margin:12px 0 6px">الخصومات والاستقطاعات</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px"><thead><tr><th>#</th><th>البند</th><th>المبلغ</th></tr></thead><tbody>${renderRows(deductRows, '#c0392b') || '<tr><td colspan="3" style="text-align:center">—</td></tr>'}</tbody></table>
      <div style="border-top:2px solid #1a4a3a;padding-top:10px;display:flex;justify-content:space-between;font-size:15px;font-weight:900">
        <span>صافي المستحق</span><span dir="ltr">${fmtMoney(net)}</span>
      </div>
      ${global.printFooterDiv?.() || ''}
    </div>`;
  }

  function printPayslip(doctorId, month, year) {
    if (!hasPerm('ledger.print') && !hasPerm('reports.print')) { notify('⛔ لا صلاحية للطباعة', 'danger'); return; }
    const html = buildPayslipHtml(doctorId, month, year);
    if (!html) { notify('⚠️ لا توجد بيانات', 'danger'); return; }
    global.printHTML?.(html, false, { documentTitle: `مفردات مرتب — ${MONTH_NAMES[month]} ${year}` });
  }

  function findLatestPaymentForPeriod(doctorId, month, year, paymentId) {
    loadStore();
    if (paymentId) return payments.find(x => x.id === paymentId) || null;
    return payments
      .filter(p => p.doctorId === doctorId && p.periodMonth === month && p.periodYear === year)
      .sort((a, b) => String(b.paidAt || b.createdAt || '').localeCompare(String(a.paidAt || a.createdAt || '')))[0] || null;
  }

  function printVoucher(paymentId, thermal) {
    if (!hasPerm('ledger.print') && !hasPerm('reports.print')) { notify('⛔ لا صلاحية للطباعة', 'danger'); return; }
    loadStore();
    const p = payments.find(x => x.id === paymentId);
    if (!p) { notify('⚠️ السند غير موجود', 'warning'); return; }
    const html = buildVoucherHtml(p, thermal);
    if (thermal && global.printThermalDoc) global.printThermalDoc(html);
    else if (global.printHTML) global.printHTML(html, false, { documentTitle: `سند إقرار استلام — ${p.voucherNo}` });
  }

  /** Print receipt acknowledgment voucher (سند إقرار استلام) — NOT account statement or payslip */
  function printPeriodVoucher(doctorId, month, year, paymentId) {
    const p = findLatestPaymentForPeriod(doctorId, month, year, paymentId);
    if (!p) {
      notify('⚠️ لا يوجد سند صرف لهذا الشهر — سجّل صرفاً أولاً ثم اطبع «سند إقرار استلام»', 'warning');
      return;
    }
    printVoucher(p.id);
  }

  function openSourceDocument(entryId) {
    const e = entries.find(x => x.id === entryId);
    if (!e) return;
    if (e.paymentId) {
      const p = payments.find(x => x.id === e.paymentId);
      notify(`📄 ${p?.voucherNo || 'سند'} — ${p?.doctorName || ''} · ${fmtMoney(p?.totalAmount || 0)}`, 'success');
      return;
    }
    if (e.refType === 'case' && global.showPage) notify('افتح السجل اليومي للفاتورة المرتبطة', 'success');
    else if (e.accrualId) notify(`البند: ${e.description}`, 'success');
    else notify(e.description || '—', 'success');
  }

  function buildDoctorPeriodPrintActions(doctorId, month, year, opts = {}) {
    const primary = [];
    const more = [];
    const remaining = opts.remaining ?? 0;
    if (opts.includePay && hasPerm('ledger.pay') && remaining > 0) {
      primary.push({ icon: '💵', label: 'صرف', short: 'صرف', onclick: `EmployeeLedger.openPaymentModal('${doctorId}',${month},${year})`, title: 'تسجيل صرف' });
    }
    const pid = findLatestPaymentForPeriod(doctorId, month, year)?.id;
    if (pid) {
      primary.push({ icon: '🖨️', label: 'سند', short: 'سند', onclick: `EmployeeLedger.printVoucher('${pid}')`, title: 'طباعة سند إقرار استلام' });
    } else {
      primary.push({ icon: '🖨️', label: 'سند', short: 'سند', onclick: `EmployeeLedger.printPeriodVoucher('${doctorId}',${month},${year})`, title: 'طباعة سند إقرار استلام (بعد تسجيل الصرف)' });
    }
    primary.push({ icon: '📒', label: 'كشف', short: 'كشف', onclick: `EmployeeLedger.printStatement('${doctorId}',${month},${year})`, title: 'طباعة كشف حساب' });
    primary.push({ icon: '📄', label: 'مفردات', short: 'مفردات', onclick: `EmployeeLedger.printPayslip('${doctorId}',${month},${year})`, title: 'طباعة مفردات المرتب' });
    primary.push({ icon: '📋', label: 'تفصيل', short: 'تفصيل', onclick: `EmployeeLedger.previewStatement('${doctorId}',${month},${year})`, title: 'معاينة تفصيل المستحقات' });
    more.push({ icon: '📂', label: 'فتح', short: 'فتح', onclick: `EmployeeLedger.openLedgerForDoctor('${doctorId}',${month},${year})`, title: 'فتح صفحة مستحقات الموظف' });
    return { primary, more };
  }

  function renderEntryActions(e) {
    const primary = [];
    const more = [];
    if (!e.synthetic && e.doctorId && e.periodMonth && e.periodYear) {
      if (hasPerm('ledger.pay') && e.payStatus?.code !== 'paid' && e.payStatus?.code !== 'none') {
        primary.push({ icon: '💵', label: 'صرف', short: 'صرف', onclick: `EmployeeLedger.openPaymentModal('${e.doctorId}',${e.periodMonth},${e.periodYear})`, title: 'تسجيل صرف' });
      }
      if (e._paymentId || e.paymentId) {
        const pid = e._paymentId || e.paymentId;
        primary.push({ icon: '🖨️', label: 'سند', short: 'سند', onclick: `EmployeeLedger.printVoucher('${pid}')`, title: 'طباعة سند إقرار استلام' });
      } else if (e.entryType === 'payment' || e.credit > 0) {
        primary.push({ icon: '🖨️', label: 'سند', short: 'سند', onclick: `EmployeeLedger.printPeriodVoucher('${e.doctorId}',${e.periodMonth},${e.periodYear})`, title: 'طباعة سند إقرار استلام' });
      }
      primary.push({ icon: '📒', label: 'كشف', short: 'كشف', onclick: `EmployeeLedger.printStatement('${e.doctorId}',${e.periodMonth},${e.periodYear})`, title: 'طباعة كشف حساب' });
      primary.push({ icon: '📄', label: 'مفردات', short: 'مفردات', onclick: `EmployeeLedger.printPayslip('${e.doctorId}',${e.periodMonth},${e.periodYear})`, title: 'طباعة مفردات المرتب' });
      primary.push({ icon: '📋', label: 'تفصيل', short: 'تفصيل', onclick: `EmployeeLedger.previewStatement('${e.doctorId}',${e.periodMonth},${e.periodYear})`, title: 'معاينة تفصيل المستحقات' });
    }
    if (!e.synthetic) {
      more.push({ icon: '📂', label: 'فتح', short: 'فتح', onclick: `EmployeeLedger.openLedgerForDoctor('${e.doctorId}',${e.periodMonth},${e.periodYear})`, title: 'فتح صفحة المستحقات' });
      more.push({ icon: '📄', label: 'مصدر', short: 'مصدر', onclick: `EmployeeLedger.openSourceDocument('${e.id}')`, title: 'عرض المصدر' });
    }
    if (typeof global.actionBtnRowUnified === 'function') {
      return global.actionBtnRowUnified(primary, more);
    }
    return primary.map(a => actionBtn(a.icon, a.label, { onclick: a.onclick, title: a.title || a.label })).join('');
  }

  function saveAutoPrintSetting(enabled) {
    ensureLedgerSettings();
    global.settings.employeeLedger.autoPrintVoucher = !!enabled;
    saveStore();
    notify(enabled ? '✅ تفعيل الطباعة التلقائية للسند بعد الصرف' : 'ℹ️ الطباعة اليدوية — استخدم زر 🖨️ طباعة سند', 'success');
  }

  function loadAutoPrintUI() {
    ensureLedgerSettings();
    const el = document.getElementById('ledger-auto-print-voucher');
    if (el) el.checked = !!global.settings.employeeLedger.autoPrintVoucher;
  }

  function renderPayrollLedgerStrip(d, month, year) {
    const s = getSummary(d.id, month, year);
    if (s.due <= 0 && !s.carriedAmount) return '';
    const closed = isMonthClosed(month, year) ? '<span class="tag tag-gold">مقفول</span>' : '';
    return `<div class="ledger-payroll-strip"><div class="ledger-strip-grid">
      <div><span class="lbl">المستحق</span><span class="val" dir="ltr">${fmtMoney(s.due)}</span></div>
      <div><span class="lbl">مرحّل</span><span class="val" dir="ltr">${fmtMoney(s.carriedAmount)}</span></div>
      <div><span class="lbl">مدفوع</span><span class="val success" dir="ltr">${fmtMoney(s.paid)}</span></div>
      <div><span class="lbl">متبقي</span><span class="val danger" dir="ltr">${fmtMoney(s.remaining)}</span></div>
      <div><span class="lbl">الحالة</span><span class="tag ${paymentStatusBadge(s.status)}">${s.statusLabel}</span> ${closed}</div>
    </div><div class="ledger-strip-actions table-action-btns">
      ${(() => {
        const acts = buildDoctorPeriodPrintActions(d.id, month, year, { includePay: true, remaining: s.remaining });
        return typeof global.actionBtnRowUnified === 'function'
          ? global.actionBtnRowUnified(acts.primary, acts.more)
          : acts.primary.map(a => actionBtn(a.icon, a.label, { onclick: a.onclick, title: a.title || a.label })).join('');
      })()}
    </div></div>`;
  }

  function actionBtn(icon, label, opts) {
    return global.actionBtn ? global.actionBtn(icon, label, opts) : `<button class="btn btn-ghost btn-sm" onclick="${opts.onclick}">${icon}</button>`;
  }

  function enhancePayrollCards(month, year) {
    if (!isModuleEnabled()) {
      document.querySelectorAll('.ledger-payroll-strip').forEach(el => el.remove());
      return;
    }
    document.querySelectorAll('.payroll-card').forEach((card, idx) => {
      const d = (global.doctors || [])[idx];
      if (!d) return;
      card.querySelector('.ledger-payroll-strip')?.remove();
      const strip = renderPayrollLedgerStrip(d, month, year);
      if (strip) card.insertAdjacentHTML('beforeend', strip);
    });
  }

  function injectStyles() {
    if (document.getElementById('employee-ledger-styles')) return;
    const s = document.createElement('style');
    s.id = 'employee-ledger-styles';
    s.textContent = `
.ledger-payroll-strip{border-top:2px dashed var(--border);padding:12px 16px;background:var(--surface)}
.ledger-strip-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;margin-bottom:8px}
.ledger-strip-grid .lbl{font-size:11px;color:var(--text-muted);display:block}
.ledger-strip-grid .val{font-size:14px;font-weight:800}
.ledger-strip-actions{display:flex;gap:4px;flex-wrap:wrap}
#page-employee-ledger .ledger-kpi-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:16px}
#page-employee-ledger .ledger-kpi{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;min-height:84px}
#page-employee-ledger .ledger-kpi .lbl{font-size:12px;color:var(--text-muted)}
#page-employee-ledger .ledger-kpi .val{font-size:20px;font-weight:900;margin-top:4px}
.ledger-carry-badge{font-size:10px;background:#fff8e1;color:#8d6e00;padding:2px 6px;border-radius:99px}
.ledger-dash-card{cursor:pointer;transition:box-shadow .2s}.ledger-dash-card:hover{box-shadow:var(--shadow-md)}
.ledger-dash-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:8px}
.ledger-dash-grid .lbl{font-size:11px;color:var(--text-muted);display:block}
.ledger-dash-grid .val{font-size:18px;font-weight:900}
.ledger-dash-top{margin-top:12px;font-size:12px}.ledger-dash-top .top-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed var(--border)}
.ledger-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:flex-end}
.ledger-drawer-menu{display:flex;flex-direction:column;gap:12px;padding:14px 16px}
.ledger-drawer-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.ledger-drawer-filters-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:8px;align-items:end}
.ledger-drawer-filters-grid .form-control,.ledger-drawer-filters-grid select,.ledger-drawer-filters-grid input{width:100%!important;min-height:40px;box-sizing:border-box}
.ledger-drawer-search .form-control{width:100%;min-height:40px;box-sizing:border-box}
#page-employee-ledger .ledger-drawer-actions .btn{min-height:40px}
#page-employee-ledger .ledger-drawer-actions select.form-control{min-height:40px}
.ledger-pagination{display:flex;gap:8px;align-items:center;justify-content:center;margin-top:12px}
.ledger-pay-status{white-space:nowrap}
.ledger-item-row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed var(--border)}
.ledger-item-row label{flex:1;font-size:13px;cursor:pointer}
.ledger-item-row input[type=checkbox]{width:18px;height:18px}
#lp-items-wrap{max-height:220px;overflow:auto;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--surface)}
.ledger-doctor-group-header td{background:var(--surface);border-top:2px solid var(--accent);padding:10px 12px}
.ledger-doctor-group-inner{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.ledger-doctor-group-meta{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--text-muted);font-weight:600}
.ledger-doctor-group-row td:first-child{border-right:3px solid var(--accent-soft,rgba(61,90,128,0.25))}
@media(max-width:900px){.ledger-dash-grid{grid-template-columns:repeat(2,1fr)}}
`;
    document.head.appendChild(s);
  }

  function renderLedgerPage() {
    if (!isModuleEnabled()) return;
    injectStyles();
    loadStore();
    const f = getFilters();
    const stats = getDashboardStats(f.month, f.year);
    const kpiEl = document.getElementById('ledger-kpi-row');
    if (kpiEl) {
      kpiEl.innerHTML = `
        <div class="ledger-kpi"><div class="lbl">إجمالي المستحقات</div><div class="val" dir="ltr">${fmtMoney(stats.totalDue)}</div></div>
        <div class="ledger-kpi"><div class="lbl">تم صرفه</div><div class="val success" dir="ltr">${fmtMoney(stats.totalPaid)}</div></div>
        <div class="ledger-kpi"><div class="lbl">المتبقي</div><div class="val danger" dir="ltr">${fmtMoney(stats.totalRemaining)}</div></div>
        <div class="ledger-kpi"><div class="lbl">مرحّل</div><div class="val" dir="ltr">${fmtMoney(stats.totalCarried)}</div></div>
        <div class="ledger-kpi"><div class="lbl">سندات الصرف</div><div class="val">${stats.voucherCount}</div></div>
        <div class="ledger-kpi"><div class="lbl">الحركات</div><div class="val">${stats.entryCount}</div></div>
        <div class="ledger-kpi"><div class="lbl">موظفون بمستحقات</div><div class="val">${stats.employeesWithBalance}</div></div>`;
    }
    const closedEl = document.getElementById('ledger-close-status');
    if (closedEl) closedEl.innerHTML = stats.monthClosed
      ? `<span class="tag tag-gold">🔒 ${MONTH_NAMES[f.month]} ${f.year} مقفول</span>`
      : `<span class="tag tag-green">مفتوح</span>`;

    const filtered = filterEntries(f);
    let displayRows = consolidateStatementRows(filtered);
    const groupByDoctor = !f.doctorId;
    if (groupByDoctor) {
      displayRows = groupStatementRowsByDoctor(displayRows, f.month, f.year);
    } else {
      displayRows = displayRows.map(r => ({ ...r }));
    }
    const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
    if (_listPage > totalPages) _listPage = totalPages;
    const pageRows = displayRows.slice((_listPage - 1) * PAGE_SIZE, _listPage * PAGE_SIZE);

    const body = document.getElementById('ledger-main-body');
    if (!body) return;

    const stmtRows = pageRows.map(e => renderStatementTableRow(e, { showDoctorCol: !groupByDoctor, colspan: 12 })).join('')
      || `<tr><td colspan="12" style="text-align:center;padding:24px">لا حركات — اضغط مزامنة المستحقات</td></tr>`;

    const docs = visibleDoctors().filter(d => !f.doctorId || d.id === f.doctorId);
    const cards = f.doctorId ? '' : docs.slice(0, 12).map(d => {
      const s = getSummary(d.id, f.month, f.year);
      const cardActs = buildDoctorPeriodPrintActions(d.id, f.month, f.year, { includePay: true, remaining: s.remaining });
      const cardActions = typeof global.actionBtnRowUnified === 'function'
        ? global.actionBtnRowUnified(cardActs.primary, cardActs.more)
        : cardActs.primary.map(a => actionBtn(a.icon, a.label, { onclick: a.onclick, title: a.title || a.label })).join('');
      return `<div class="card" style="margin-bottom:10px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div><strong>${d.name}</strong> <span class="tag ${paymentStatusBadge(s.status)}">${s.statusLabel}</span></div>
        <div dir="ltr" style="font-weight:900">${fmtMoney(s.remaining)}</div>
        <div class="actions-col">${cardActions}</div>
      </div>`;
    }).join('');

    body.innerHTML = `
      ${cards}
      <div class="card"><div class="card-header"><div class="card-title">📑 كشف الحساب — الحركات المالية</div>
        <button class="btn btn-ghost btn-sm" onclick="EmployeeLedger.previewStatement(document.getElementById('ledger-doctor').value||'',${f.month},${f.year})" title="معاينة كشف الحساب قبل الطباعة">👁️ معاينة الكشف</button>
      </div>
      <div class="table-wrap table-wrap-fit"><table class="table-compact table-reports">
        <thead><tr>${groupByDoctor ? '' : '<th>الموظف</th>'}<th>التاريخ</th><th>النوع</th><th>المرجع</th><th>الشهر</th><th>البيان</th><th>حالة الصرف</th><th>مدين</th><th>دائن</th><th>الرصيد</th><th>المستخدم</th><th></th></tr></thead>
        <tbody>${stmtRows}</tbody></table></div>
      <div class="ledger-pagination">
        <button class="btn btn-ghost btn-sm" onclick="EmployeeLedger.prevPage()" ${_listPage <= 1 ? 'disabled' : ''}>السابق</button>
        <span>صفحة ${_listPage} / ${totalPages} (${displayRows.length} حركة)</span>
        <button class="btn btn-ghost btn-sm" onclick="EmployeeLedger.nextPage(${totalPages})" ${_listPage >= totalPages ? 'disabled' : ''}>التالي</button>
      </div></div>`;
  }

  function prevPage() { if (_listPage > 1) { _listPage--; renderLedgerPage(); } }
  function nextPage(max) { if (_listPage < max) { _listPage++; renderLedgerPage(); } }

  function debouncedRender() {
    clearTimeout(_renderTimer);
    _renderTimer = setTimeout(() => renderLedgerPage(), 300);
  }

  function populateLedgerFilters() {
    const mEl = document.getElementById('ledger-month');
    const yEl = document.getElementById('ledger-year');
    const dEl = document.getElementById('ledger-doctor');
    const tEl = document.getElementById('ledger-type');
    if (mEl && !mEl.options.length) {
      MONTH_NAMES.slice(1).forEach((n, i) => { mEl.innerHTML += `<option value="${i + 1}">${n}</option>`; });
      const y = new Date().getFullYear();
      for (let yr = y - 5; yr <= y + 1; yr++) yEl.innerHTML += `<option value="${yr}">${yr}</option>`;
      mEl.value = document.getElementById('payrollMonth')?.value || String(new Date().getMonth() + 1);
      yEl.value = document.getElementById('payrollYear')?.value || String(y);
    }
    if (dEl) dEl.innerHTML = '<option value="">كل الموظفين</option>' + visibleDoctors().map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    if (tEl && !tEl.options.length) {
      tEl.innerHTML = '<option value="">كل الأنواع</option>'
        + Object.entries(ENTRY_TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    }
    applySavedFilters();
  }

  function openLedgerForDoctor(doctorId, month, year) {
    global.showPage?.('employee-ledger');
    setTimeout(() => {
      populateLedgerFilters();
      document.getElementById('ledger-doctor').value = doctorId || '';
      document.getElementById('ledger-month').value = String(month);
      document.getElementById('ledger-year').value = String(year);
      _listPage = 1;
      renderLedgerPage();
    }, 80);
  }

  function ensurePaymentModal() {
    if (document.getElementById('ledgerPaymentModal')) return;
    const el = document.createElement('div');
    el.id = 'ledgerPaymentModal';
    el.className = 'modal-overlay';
    el.onclick = e => { if (e.target === el) el.classList.remove('open'); };
    el.innerHTML = `<div class="modal" style="max-width:min(560px,96vw)">
      <div class="modal-header"><div class="modal-title">💵 تسجيل صرف</div>
        <button type="button" class="modal-close" onclick="document.getElementById('ledgerPaymentModal').classList.remove('open')">✕</button></div>
      <input type="hidden" id="lp-doctor-id"><input type="hidden" id="lp-month"><input type="hidden" id="lp-year">
      <div id="lp-employee-name" style="font-weight:900;margin-bottom:8px"></div>
      <div id="lp-balance-hint" style="font-size:13px;color:var(--text-muted);margin-bottom:12px;padding:10px;border-radius:8px;background:var(--bg-muted)"></div>
      <div class="form-group"><label class="form-label">نوع الصرف</label>
        <select class="form-control" id="lp-kind" onchange="EmployeeLedger.onPaymentKindChange()">
          <option value="full">صرف راتب كامل</option>
          <option value="partial">صرف مبلغ معيّن</option>
          <option value="items">صرف بنود محددة</option>
          <option value="advance">سلفة</option>
        </select></div>
      <div class="form-group" id="lp-amount-wrap"><label class="form-label">المبلغ</label><input class="form-control" id="lp-amount" type="number" min="0" step="0.01"></div>
      <div class="form-group" id="lp-items-wrap" style="display:none">
        <label class="form-label">اختر البنود المراد صرفها</label>
        <div id="lp-items-list"></div>
      </div>
      <div class="form-group"><label class="form-label">طريقة الدفع</label>
        <select class="form-control" id="lp-method"><option value="cash">كاش</option><option value="transfer">تحويل بنكي</option><option value="check">شيك</option><option value="other">أخرى</option></select></div>
      <div class="form-group"><label class="form-label">ملاحظات</label><input class="form-control" id="lp-notes"></div>
      <div id="lp-alloc-preview" style="font-size:12px;color:var(--text-muted);margin:12px 0"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="document.getElementById('ledgerPaymentModal').classList.remove('open')">إلغاء</button>
        <button class="btn btn-primary" onclick="EmployeeLedger.submitPayment()" title="تسجيل الصرف وإنشاء سند — يُحدّث أرصدة البنود تلقائياً">✅ تسجيل الصرف</button>
      </div>
      <p style="font-size:11px;color:var(--text-muted);margin-top:10px;text-align:right">بعد التسجيل: اطبع <strong>سند إقرار استلام</strong> من زر <strong>🖨️ سند</strong> — و<strong>كشف حساب</strong> من زر <strong>📒 كشف</strong> — و<strong>مفردات المرتب</strong> من زر <strong>📄 مفردات</strong>. أو فعّل الطباعة التلقائية للسند من شريط الأدوات.</p>
      </div>`;
    document.body.appendChild(el);
    document.getElementById('lp-amount')?.addEventListener('input', updatePaymentPreview);
    document.getElementById('lp-items-list')?.addEventListener('change', updatePaymentPreview);
  }

  function renderPaymentItemsList(doctorId, month, year) {
    const list = document.getElementById('lp-items-list');
    if (!list) return;
    const items = getOpenPayableAccruals(doctorId, month, year);
    if (!items.length) {
      list.innerHTML = '<p style="font-size:12px;color:var(--text-muted)">لا توجد بنود مفتوحة للصرف</p>';
      return;
    }
    list.innerHTML = items.map(a => `<div class="ledger-item-row">
      <input type="checkbox" class="lp-item-cb" id="lp-item-${a.id}" value="${a.id}" data-amount="${remaining(a)}">
      <label for="lp-item-${a.id}">${a.typeLabel} <span dir="ltr" style="font-weight:800">${fmtMoney(remaining(a))}</span></label>
    </div>`).join('');
  }

  function getSelectedPaymentItemIds() {
    return Array.from(document.querySelectorAll('#lp-items-list .lp-item-cb:checked')).map(cb => cb.value);
  }

  function onPaymentKindChange() {
    const kind = document.getElementById('lp-kind')?.value || 'partial';
    const amountWrap = document.getElementById('lp-amount-wrap');
    const itemsWrap = document.getElementById('lp-items-wrap');
    if (amountWrap) amountWrap.style.display = kind === 'items' ? 'none' : '';
    if (itemsWrap) itemsWrap.style.display = kind === 'items' ? '' : 'none';
    updatePaymentPreview();
  }

  function updatePaymentPreview() {
    const doctorId = document.getElementById('lp-doctor-id')?.value;
    const month = parseInt(document.getElementById('lp-month')?.value, 10);
    const year = parseInt(document.getElementById('lp-year')?.value, 10);
    const kind = document.getElementById('lp-kind')?.value || 'partial';
    const amountEl = document.getElementById('lp-amount');
    const s = doctorId ? getSummary(doctorId, month, year) : null;
    if (s && kind === 'full' && amountEl) amountEl.value = s.remaining > 0 ? s.remaining : '';
    const el = document.getElementById('lp-alloc-preview');
    if (!el || !doctorId) { if (el) el.textContent = ''; return; }

    let allocations = [];
    let amount = 0;
    if (kind === 'items') {
      const picked = allocateByAccrualIds(doctorId, month, year, getSelectedPaymentItemIds());
      allocations = picked.allocations;
      amount = picked.total;
    } else {
      amount = parseFloat(amountEl?.value) || 0;
      if (amount > 0) allocations = autoAllocate(doctorId, amount, month, year).allocations;
    }
    const rem = s ? Math.max(0, round2(s.remaining - amount)) : 0;
    if (!amount && !allocations.length) { el.textContent = ''; return; }
    el.innerHTML = (allocations.map(a => `${a.typeLabel}: ${fmtMoney(a.amount)}`).join(' · ') || 'لا بنود مفتوحة')
      + (amount > 0 ? `<br><strong>إجمالي الصرف:</strong> <span dir="ltr">${fmtMoney(amount)}</span>` : '')
      + (amount > 0 ? `<br><strong>المتبقي بعد الصرف:</strong> <span dir="ltr">${fmtMoney(rem)}</span>` : '');
    if (rem > 0.001 && amount > 0) {
      el.innerHTML += `<br><span style="color:var(--warning)">سيظهر المتبقي في صف: باقي مستحقات راتب ${MONTH_NAMES[month]} ${year}</span>`;
    }
  }

  function openPaymentModal(doctorId, month, year) {
    ensurePaymentModal();
    const d = (global.doctors || []).find(x => x.id === doctorId);
    document.getElementById('lp-doctor-id').value = doctorId;
    document.getElementById('lp-month').value = month;
    document.getElementById('lp-year').value = year;
    document.getElementById('lp-employee-name').textContent = d?.name || '—';
    const s = getSummary(doctorId, month, year);
    const hint = document.getElementById('lp-balance-hint');
    if (hint) hint.innerHTML = `<strong>المتبقي:</strong> <span dir="ltr">${fmtMoney(s.remaining)}</span> · <strong>المستحق:</strong> <span dir="ltr">${fmtMoney(s.due)}</span> · <strong>المدفوع:</strong> <span dir="ltr">${fmtMoney(s.paid)}</span>`;
    document.getElementById('lp-kind').value = 'full';
    document.getElementById('lp-amount').value = s.remaining > 0 ? s.remaining : '';
    renderPaymentItemsList(doctorId, month, year);
    onPaymentKindChange();
    document.getElementById('ledgerPaymentModal').classList.add('open');
  }

  function submitPayment() {
    const doctorId = document.getElementById('lp-doctor-id').value;
    const month = parseInt(document.getElementById('lp-month').value, 10);
    const year = parseInt(document.getElementById('lp-year').value, 10);
    const kind = document.getElementById('lp-kind')?.value || 'partial';
    const s = getSummary(doctorId, month, year);
    let amount = parseFloat(document.getElementById('lp-amount').value) || 0;
    let allocations = null;
    if (kind === 'items') {
      const picked = allocateByAccrualIds(doctorId, month, year, getSelectedPaymentItemIds());
      allocations = picked.allocations;
      amount = picked.total;
      if (!allocations.length) { notify('⚠️ اختر بنداً واحداً على الأقل', 'danger'); return; }
    }
    if (amount <= 0) { notify('⚠️ أدخل مبلغاً أكبر من صفر', 'danger'); return; }
    if (amount > s.remaining + 0.01) { notify(`⚠️ المبلغ يتجاوز المتبقي (${fmtMoney(s.remaining)})`, 'danger'); return; }
    const method = document.getElementById('lp-method').value;
    const p = recordPayment({
      doctorId,
      month,
      year,
      amount,
      allocations: allocations || undefined,
      paymentKind: kind,
      paymentMethod: method,
      notes: document.getElementById('lp-notes').value
    });
    if (p) {
      document.getElementById('ledgerPaymentModal').classList.remove('open');
      _listPage = 1;
      renderLedgerPage();
      renderDashboardCard();
      global.generatePayroll?.();
      notify(`✅ تم تسجيل ${p.voucherNo} — ${fmtMoney(p.totalAmount)}`, 'success');
      const autoPrint = global.settings?.employeeLedger?.autoPrintVoucher;
      const printBank = method === 'transfer' || autoPrint;
      if (printBank) {
        setTimeout(() => printVoucher(p.id), 400);
      }
    }
  }

  function buildStatementHtml(doctorId, month, year) {
    loadStore();
    const d = (global.doctors || []).find(x => x.id === doctorId);
    const raw = entries.filter(e => {
      if (e.status === 'void') return false;
      if (doctorId && e.doctorId !== doctorId) return false;
      if (month && year) return e.periodMonth === month && e.periodYear === year;
      return true;
    });
    let lines = consolidateStatementRows(raw);
    const groupAll = !doctorId;
    if (groupAll) lines = groupStatementRowsByDoctor(lines, month, year);
    const rows = lines.map(e => {
      if (e._groupHeader) {
        const s = e._summary || {};
        return `<tr style="background:#f4f7fb"><td colspan="7"><strong>${e.doctorName}</strong> — المستحق: ${fmtMoney(s.due || 0)} · المصروف: ${fmtMoney(s.paid || 0)} · المتبقي: ${fmtMoney(s.remaining || 0)}</td></tr>`;
      }
      return `<tr>
      <td>${fmtDate(e.date)}</td>
      <td>${e.entryTypeLabel || entryTypeLabel(e.entryType)}</td>
      <td>${e.description}</td>
      <td>${e.payStatus?.label && e.payStatus.label !== '—' ? e.payStatus.label : '—'}</td>
      <td class="money">${e.debit ? fmtMoney(e.debit) : '—'}</td>
      <td class="money">${e.credit ? fmtMoney(e.credit) : '—'}</td>
      <td class="money">${fmtMoney(e.balanceAfter)}</td>
    </tr>`;
    }).join('');
    const s = doctorId ? getSummary(doctorId, month, year) : null;
    const periodLabel = month && year ? `${MONTH_NAMES[month]} ${year}` : 'كل الفترات';
    const summaryBoxes = s ? `${global.mbox?.('Due', 'المستحق', fmtMoney(s.due)) || ''}${global.mbox?.('Paid', 'المدفوع', fmtMoney(s.paid)) || ''}${global.mbox?.('Bal', 'المتبقي', fmtMoney(s.remaining)) || ''}${global.mbox?.('Status', 'الحالة', s.statusLabel) || ''}` : '';
    return {
      title: `كشف حساب — ${d?.name || 'الكل'} — ${periodLabel}`,
      html: `<div class="hdr"><h1>${global.settings?.centerName || ''}</h1><p class="meta">كشف حساب — ${d?.name || 'الكل'}</p><p class="meta">${periodLabel}</p></div>
      <div class="boxes">${summaryBoxes}</div>
      <table><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>حالة الصرف</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody>${rows || '<tr><td colspan="7" style="text-align:center">لا حركات</td></tr>'}</tbody></table>${global.printFooterDiv?.() || ''}`
    };
  }

  function previewStatement(doctorId, month, year) {
    if (!hasPerm('ledger.print') && !hasPerm('reports.print') && !hasPerm('ledger.view')) return;
    const built = buildStatementHtml(doctorId, month, year);
    if (typeof global.openReportPreview === 'function') global.openReportPreview(built.html, built.title);
    else global.printHTML?.(built.html, false);
  }

  function printStatement(doctorId, month, year) {
    if (!hasPerm('ledger.print') && !hasPerm('reports.print')) return;
    const built = buildStatementHtml(doctorId, month, year);
    global.printHTML?.(built.html, false, { documentTitle: built.title });
  }

  function buildReportHtml(reportId) {
    loadStore();
    const f = getFilters();
    let title = 'تقرير المستحقات', rows = '';
    const reports = {
      unpaid: () => {
        title = 'أرصدة الموظفين الحالية / المتأخرات';
        visibleDoctors().forEach(d => {
          const s = getSummary(d.id, f.month, f.year);
          if (s.remaining > 0) rows += `<tr><td>${d.name}</td><td class="money">${fmtMoney(s.remaining)}</td><td>${s.statusLabel}</td></tr>`;
        });
      },
      carried: () => {
        title = 'المستحقات المرحّلة';
        getDoctorAccruals(null, f.month, f.year).filter(a => a.isCarryover && remaining(a) > 0)
          .forEach(a => { rows += `<tr><td>${a.doctorName}</td><td>${a.typeLabel}</td><td class="money">${fmtMoney(remaining(a))}</td><td>${MONTH_NAMES[a.originMonth]} ${a.originYear}</td></tr>`; });
      },
      payments: () => {
        title = 'تقرير المدفوعات / المصروف فعلياً';
        payments.filter(p => p.periodMonth === f.month && p.periodYear === f.year)
          .forEach(p => { rows += `<tr><td>${p.voucherNo}</td><td>${p.doctorName}</td><td class="money">${fmtMoney(p.totalAmount)}</td><td>${fmtDate(p.paidAt.slice(0, 10))}</td></tr>`; });
      },
      bytype: () => {
        title = 'تقرير البنود حسب النوع';
        const map = {};
        getDoctorAccruals(null, f.month, f.year).forEach(a => { map[a.typeLabel] = (map[a.typeLabel] || 0) + a.amount; });
        Object.entries(map).forEach(([k, v]) => { rows += `<tr><td>${k}</td><td class="money">${fmtMoney(v)}</td></tr>`; });
      },
      adjustments: () => {
        title = 'تقرير التسويات';
        entries.filter(e => e.entryType === 'adjustment' || e.entryType === 'reversal')
          .forEach(e => { rows += `<tr><td>${e.doctorName}</td><td>${e.description}</td><td class="money">${fmtMoney(e.debit || e.credit)}</td></tr>`; });
      },
      vouchers: () => {
        title = 'تقرير سندات الصرف';
        payments.forEach(p => { rows += `<tr><td>${p.voucherNo}</td><td>${p.doctorName}</td><td class="money">${fmtMoney(p.totalAmount)}</td><td>${p.paymentMethod}</td></tr>`; });
      },
      movements: () => {
        title = 'تقرير الحركات المالية';
        filterEntries(f).slice(0, 500).forEach(e => {
          rows += `<tr><td>${e.doctorName}</td><td>${fmtDate(e.date)}</td><td>${e.description}</td><td class="money">${fmtMoney(e.balanceAfter)}</td></tr>`;
        });
      }
    };
    (reports[reportId] || reports.unpaid)();
    if (!rows) rows = '<tr><td colspan="4" style="text-align:center">لا بيانات</td></tr>';
    return {
      title,
      html: `<div class="hdr"><h1>${global.settings?.centerName || ''}</h1><p class="meta">${title}</p><p class="meta">${MONTH_NAMES[f.month]} ${f.year}</p></div>
      <table><thead><tr><th>الموظف / البند</th><th>التفاصيل</th><th>المبلغ</th><th>ملاحظة</th></tr></thead><tbody>${rows}</tbody></table>${global.printFooterDiv?.() || ''}`
    };
  }

  function previewReport(reportId) {
    if (!hasPerm('ledger.export') && !hasPerm('reports.print')) { notify('⛔ لا صلاحية', 'danger'); return; }
    const built = buildReportHtml(reportId);
    if (typeof global.openReportPreview === 'function') {
      global.openReportPreview(built.html, built.title);
    } else if (global.printHTML) {
      global.printHTML(built.html, false);
    }
  }

  function printReport(reportId) {
    if (!hasPerm('ledger.export') && !hasPerm('reports.print')) { notify('⛔ لا صلاحية', 'danger'); return; }
    const built = buildReportHtml(reportId);
    global.printHTML?.(built.html, false);
  }

  function verifyIntegrity(data) {
    const issues = [], warnings = [];
    const acc = data?.employeeLedgerAccruals || accruals;
    const pay = data?.employeeLedgerPayments || payments;
    const ent = data?.employeeLedgerEntries || entries;
    pay.forEach(p => {
      (p.allocations || []).forEach(al => {
        if (!acc.some(a => a.id === al.accrualId)) warnings.push(`سند ${p.voucherNo}: بند مفقود`);
      });
    });
    if (acc.length && !ent.length) warnings.push('مستحقات بدون حركات دفتر — شغّل مزامنة');
    return { issues, warnings };
  }

  function extBackupData(data) {
    loadStore();
    data.employeeLedgerAccruals = accruals;
    data.employeeLedgerPayments = payments;
    data.employeeLedgerEntries = entries;
  }

  function extRestoreData(data) {
    if (data.employeeLedgerAccruals) { accruals = data.employeeLedgerAccruals; global.DB?.set('employeeLedgerAccruals', accruals); }
    if (data.employeeLedgerPayments) { payments = data.employeeLedgerPayments; global.DB?.set('employeeLedgerPayments', payments); }
    if (data.employeeLedgerEntries) { entries = data.employeeLedgerEntries; global.DB?.set('employeeLedgerEntries', entries); }
    loadStore();
  }

  function onPayrollGenerated(month, year) {
    if (!isModuleEnabled()) return;
    ensureLedgerSettings();
    if (global.settings.employeeLedger.autoSyncOnPayroll) syncMonth(month, year, { carryOver: true });
    enhancePayrollCards(month, year);
    renderDashboardCard();
  }

  function extInit() {
    injectStyles();
    loadStore();
    ensurePaymentModal();
    loadAutoPrintUI();
  }

  global.EmployeeLedger = {
    init: extInit, isModuleEnabled, syncMonth, carryOverToMonth, getSummary, getDashboardStats, recordPayment,
    doctorHasPeriodData, monthHasAnyPayrollData, reconcileCarryoversForTargetMonth,
    openPaymentModal, submitPayment, updatePaymentPreview, onPaymentKindChange, openLedgerForDoctor, renderLedgerPage, renderDashboardCard,
    populateLedgerFilters, enhancePayrollCards, onPayrollGenerated, onSourceChange, queueSyncForDate,
    printVoucher, printPeriodVoucher, printPayslip, printStatement, previewStatement, previewReport, printReport, registerAccrualType, reverseEntry, createAdjustment,
    closeMonth, reopenMonth, isMonthClosed, canEditPeriod, openSourceDocument, saveFilters,
    saveAutoPrintSetting, loadAutoPrintUI,
    prevPage, nextPage, debouncedRender, verifyIntegrity,
    getAccruals: () => { loadStore(); return accruals.slice(); },
    getPayments: () => { loadStore(); return payments.slice(); },
    getEntries: () => { loadStore(); return entries.slice(); },
    reloadBranchStore: loadStore,
    invalidateBranchCache,
    extBackupData, extRestoreData
  };
  global.extBackupLedgerData = extBackupData;
  global.extRestoreLedgerData = extRestoreData;
  global.isEmployeeLedgerModuleEnabled = isModuleEnabled;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', extInit);
  else extInit();

})(typeof window !== 'undefined' ? window : globalThis);
