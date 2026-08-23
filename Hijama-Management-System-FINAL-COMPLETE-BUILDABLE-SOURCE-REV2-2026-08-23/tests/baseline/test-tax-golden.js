#!/usr/bin/env node
'use strict';

/**
 * Baseline: tax/VAT formulas via the real cupping-simplified-tax-invoice.js module.
 * Golden expectations must match tests/baseline/golden/financial-golden.json.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { TextEncoder } = require('util');

const root = path.join(__dirname, '..', '..');
const golden = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'golden', 'financial-golden.json'), 'utf8')
);

const sandbox = {
  TextEncoder,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  settings: {
    vatRate: 15,
    vatCalc: { mode: 'inclusive' },
    simplifiedTaxInvoice: { enabled: true },
    invoiceSystem: { enabled: true },
  },
  fmtMoney: (n) => (Number(n) || 0).toFixed(2),
  fmtNum: (n, d) => Number(n).toFixed(d || 0),
  fmtDate: (d) => d,
  cases: [],
  buildReceiptHTML: () => '<div class="receipt"></div>',
  getServiceUnitPrice: () => 10,
  printFooterDiv: () => '',
  confirm: () => true,
  DB: { set: () => {} },
  SyncedWrite: {
    upsertRecord(table, record) {
      const list = sandbox[table] || sandbox.cases;
      const idx = list.findIndex((x) => x && x.id === record.id);
      if (idx >= 0) list[idx] = record;
      return { ok: true };
    },
  },
};

vm.runInNewContext(
  fs.readFileSync(path.join(root, 'cupping-simplified-tax-invoice.js'), 'utf8'),
  sandbox
);

const errors = [];
const inc = sandbox.calcVatInclusiveBreakdown(115, 15);
const ex = (() => {
  sandbox.settings.vatCalc.mode = 'exclusive';
  return sandbox.calcVatExclusiveBreakdown(170, 15);
})();

function near(a, b) {
  return Math.abs(a - b) <= 0.02;
}

const gInc = golden.expectations.vat_inclusive_115;
const gEx = golden.expectations.vat_exclusive_170;
if (!near(inc.preTax, gInc.preTax) || !near(inc.vat, gInc.vat)) {
  errors.push(`inclusive mismatch ${JSON.stringify(inc)}`);
}
if (!near(ex.preTax, gEx.preTax) || !near(ex.vat, gEx.vat) || !near(ex.total, gEx.total)) {
  errors.push(`exclusive mismatch ${JSON.stringify(ex)}`);
}

if (errors.length) {
  console.error('FAIL:', errors.join('; '));
  process.exit(1);
}
console.log('OK: baseline tax/VAT golden');
console.log(`  inclusive 115 → preTax ${inc.preTax.toFixed(2)} vat ${inc.vat.toFixed(2)}`);
console.log(`  exclusive 170 → total ${ex.total.toFixed(2)}`);
