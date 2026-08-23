/* ═══════════════════════════════════════════════════════════
   Cupping Center — Saudi POS bank rate presets (manual fill only)
   النسب تُعبَّأ كمرجع — يمكن تعديلها وحفظها يدوياً
   ═══════════════════════════════════════════════════════════ */

const SAUDI_POS_BANKS = {
  rajhi: {
    label: 'مصرف الراجحي',
    activity: 'الأنشطة العامة',
    flatSuggest: { mada: 0.8, visa: 2.5, master: 2.5, amex: 2.5 },
    hints: {
      mada: '0.7% (≤100 ﷼) / 0.8% (>100 ﷼) — حد أقصى 160 ﷼',
      visa: 'ائتمان محلي: 2.5%',
      master: 'ائتمان محلي: 2.5%',
      amex: 'ائتمان دولي: 2.5% + 0.10 ﷼'
    }
  },
  snb: {
    label: 'البنك الأهلي السعودي (SNB)',
    activity: 'الأنشطة العامة',
    flatSuggest: { mada: 0.8, visa: 2.5, master: 2.5, amex: 2.75 },
    hints: {
      mada: '0.7% / 0.8% — حد أقصى 160 ﷼ (مرجع SNB)',
      visa: '2.5%', master: '2.5%', amex: '2.75% + 0.10 ﷼'
    }
  },
  riyad: {
    label: 'بنك الرياض',
    activity: 'الأنشطة العامة',
    flatSuggest: { mada: 0.8, visa: 2.5, master: 2.5, amex: 2.5 },
    hints: {
      mada: '0.7% / 0.8% — حد أقصى 160 ﷼ (مرجع بنك الرياض)',
      visa: '2.5%', master: '2.5%', amex: '2.5% + 0.10 ﷼'
    }
  },
  alinma: {
    label: 'مصرف الإنماء',
    activity: 'الأنشطة العامة',
    flatSuggest: { mada: 0.8, visa: 2.0, master: 2.0, amex: 2.5 },
    hints: {
      mada: '0.7% / 0.8% — حد أقصى 160 ﷼ (مرجع الإنماء)',
      visa: '2.0%', master: '2.0%', amex: '2.5% + 0.10 ﷼'
    }
  },
  sab: {
    label: 'البنك السعودي الأول (SAB)',
    activity: 'الأنشطة العامة',
    flatSuggest: { mada: 0.8, visa: 2.5, master: 2.5, amex: 2.5 },
    hints: {
      mada: '0.7% / 0.8% — حد أقصى 160 ﷼ (مرجع SAB)',
      visa: '2.5%', master: '2.5%', amex: '2.5% + 0.10 ﷼'
    }
  },
  bsf: {
    label: 'البنك السعودي الفرنسي',
    activity: 'الأنشطة العامة',
    flatSuggest: { mada: 0.8, visa: 2.5, master: 2.5, amex: 2.5 },
    hints: {
      mada: '0.7% / 0.8% — حد أقصى 160 ﷼ (مرجع BSF)',
      visa: '2.5%', master: '2.5%', amex: '2.5% + 0.10 ﷼'
    }
  },
  anb: {
    label: 'البنك العربي الوطني',
    activity: 'الأنشطة العامة',
    flatSuggest: { mada: 0.8, visa: 2.5, master: 2.5, amex: 2.5 },
    hints: {
      mada: '0.7% / 0.8% — حد أقصى 160 ﷼ (مرجع ANB)',
      visa: '2.5%', master: '2.5%', amex: '2.5% + 0.10 ﷼'
    }
  }
};

function getPosBank() {
  return settings.posBank || settings.bankProvider || 'rajhi';
}

function setPosBank(bankId) {
  settings.posBank = bankId;
  settings.bankProvider = bankId;
  DB.set('settings', settings);
}

function getBankSchedule(bankId) {
  return SAUDI_POS_BANKS[bankId] || SAUDI_POS_BANKS.rajhi;
}

function normalizeLegacyCardType(cardType) {
  const ct = (cardType || 'mada').toLowerCase();
  if (ct === 'mada') return 'mada';
  if (['visa', 'master', 'amex'].includes(ct)) return ct;
  if (ct === 'credit_local') return 'visa';
  if (ct === 'credit_intl') return 'amex';
  return 'visa';
}

function getBankRateHint(cardType, bankId) {
  const b = getBankSchedule(bankId || getPosBank());
  const ct = normalizeLegacyCardType(cardType);
  return `مرجع ${b.label}: ${b.hints[ct] || '—'}`;
}

function applyBankDefaultRates(bankId) {
  const id = bankId || document.getElementById('set-pos-bank')?.value || getPosBank();
  const bank = getBankSchedule(id);
  if (!settings.bankRates) settings.bankRates = {};
  Object.assign(settings.bankRates, { ...bank.flatSuggest });
  setPosBank(id);
  loadBankRates();
  if (typeof updateBankFee === 'function') updateBankFee();
  notify(`✅ تم تعبئة نسب مقترحة لـ ${bank.label} — يمكنك تعديلها وحفظها`);
}

function applyRajhiDefaultRates() { applyBankDefaultRates('rajhi'); }

function onPosBankChange() {
  const id = document.getElementById('set-pos-bank')?.value || 'rajhi';
  setPosBank(id);
  loadBankRates();
}

function renderPosBankInfo() {
  const info = document.getElementById('pos-bank-info');
  if (!info) return;
  const bank = getBankSchedule(getPosBank());
  info.innerHTML = `<strong>${bank.label}</strong> — ${bank.activity}. النسب <strong>يدوية</strong> للحساب الفعلي؛ اضغط «تعبئة النسب» لنسخ المرجع ثم عدّل وحفظ.`;
}

function loadBankRates() {
  const bankId = getPosBank();
  const sel = document.getElementById('set-pos-bank');
  if (sel) sel.value = bankId;
  const rates = settings.bankRates || {};
  const bank = getBankSchedule(bankId);
  ['mada', 'visa', 'master', 'amex'].forEach(t => {
    const el = document.getElementById(`set-bank-${t}`);
    if (el) el.value = rates[t] !== undefined ? rates[t] : bank.flatSuggest[t];
    const hint = document.getElementById(`set-bank-hint-${t}`);
    if (hint) hint.textContent = getBankRateHint(t, bankId);
  });
  renderPosBankInfo();
}

function populatePosBankSelect() {
  const sel = document.getElementById('set-pos-bank');
  if (!sel || sel.options.length) return;
  sel.innerHTML = Object.entries(SAUDI_POS_BANKS).map(([id, b]) =>
    `<option value="${id}">${b.label}</option>`
  ).join('');
}
