#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { TextEncoder } = require('util');

const root = path.join(__dirname, '..');
const global = {
  TextEncoder,
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  settings: { vatRate: 15, vatCalc: { mode: 'inclusive' }, simplifiedTaxInvoice: { enabled: true }, invoiceSystem: { enabled: true } },
  fmtMoney: n => (Number(n) || 0).toFixed(2),
  fmtNum: (n, d) => Number(n).toFixed(d || 0),
  fmtDate: d => d,
  cases: [],
  buildReceiptHTML: () => '<div class="receipt"></div>',
  getServiceUnitPrice: () => 10,
  printFooterDiv: () => '',
  confirm: () => true,
  DB: { set: () => {} },
  SyncedWrite: {
    upsertRecord(table, record) {
      const list = global[table] || global.cases;
      const idx = list.findIndex(x => x && x.id === record.id);
      if (idx >= 0) list[idx] = record;
      return { ok: true };
    }
  }
};

vm.runInNewContext(fs.readFileSync(path.join(root, 'cupping-simplified-tax-invoice.js'), 'utf8'), global);

const errors = [];
const breakdown = global.calcVatInclusiveBreakdown(115, 15);
if (Math.abs(breakdown.preTax + breakdown.vat - 115) > 0.02) errors.push('totalMismatch');
if (Math.abs(breakdown.preTax - 100) > 0.02) errors.push('preTax=' + breakdown.preTax);
if (Math.abs(breakdown.vat - 15) > 0.02) errors.push('vat=' + breakdown.vat);

global.settings.vatCalc.mode = 'exclusive';
const ex = global.calcVatExclusiveBreakdown(170, 15);
if (Math.abs(ex.vat - 25.5) > 0.02) errors.push('exclusiveVat=' + ex.vat);
if (Math.abs(ex.total - 195.5) > 0.02) errors.push('exclusiveTotal=' + ex.total);

global.cases = [{ id: 'c1', invoice: 'INV-1', date: '2026-06-01', name: 'Test', total: 170, cups: 1, serviceType: 'حجامة', doctorName: 'Doc', cash: 170 }];
global.applyNormalCaseFinancials(global.cases[0], 170);
if (global.cases[0].vat !== 0 || global.cases[0].isTaxInvoice) errors.push('normalCaseHasTax');

global.cases.push({ id: 'cF', invoice: 'INV-F', date: '2026-06-02', name: 'Foreign', nationality: 'أجنبي', total: 170, cash: 170, card: 0, cups: 1, serviceType: 'حجامة', doctorName: 'Doc' });
global.markCaseAsTaxInvoice('cF', { confirm: false });
const foreignCase = global.cases.find(x => x.id === 'cF');
if (!foreignCase.isTaxInvoice) errors.push('foreignNotTax');
if (Math.abs((foreignCase.total || 0) - 195.5) > 0.05) errors.push('foreignTotal=' + foreignCase.total);
if (Math.abs((foreignCase.cash || 0) - 195.5) > 0.05) errors.push('foreignCash=' + foreignCase.cash);

global.markCaseAsTaxInvoice('c1', { confirm: false });
if (!global.isTaxInvoiceCase(global.cases[0])) errors.push('notMarkedTax');
if (!(global.cases[0].preTax > 0 && global.cases[0].vat > 0)) errors.push('taxFieldsMissing');

global.cases.push({ id: 'c2', invoice: 'INV-2', date: '2026-06-02', name: 'Test2', total: 100, isTaxInvoice: true, taxInvoiceIssued: true, taxInvoiceTotal: 100, preTax: 86.96, vat: 13.04 });
const agg = global.aggregateTaxInvoiceVat(global.cases);
const expectedAgg = (global.cases[0].taxInvoiceTotal || global.cases[0].total) + (foreignCase.taxInvoiceTotal || foreignCase.total) + 100;
if (Math.abs(agg.total - expectedAgg) > 0.05) errors.push('aggTotal=' + agg.total + ' expected=' + expectedAgg);

const c = global.cases[0];
const html = global.buildSimplifiedTaxInvoiceA4HTML(c);
if (!html.includes('tax-inv-table')) errors.push('missingTable');
if (!html.includes('قبل الضريبة')) errors.push('missingPreTaxCol');

if (errors.length) {
  console.error('FAIL:', errors.join('; '));
  process.exit(1);
}
console.log('OK: tax invoice verified');
console.log('  115 inclusive → preTax', breakdown.preTax.toFixed(2), 'vat', breakdown.vat.toFixed(2));
console.log('  170 exclusive → total', ex.total.toFixed(2), 'aggregate', agg.total.toFixed(2));
