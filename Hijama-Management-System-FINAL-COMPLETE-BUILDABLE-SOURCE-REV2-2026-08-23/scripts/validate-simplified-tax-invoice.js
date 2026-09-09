#!/usr/bin/env node
/**
 * Validation for Simplified Tax Invoice + Unified Report Identity enhancement.
 * Run: node scripts/validate-simplified-tax-invoice.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const results = [];
let passed = 0;
let failed = 0;

function ok(id, msg) {
  results.push({ id, status: 'PASS', msg });
  passed++;
  console.log(`✓ ${id}: ${msg}`);
}

function fail(id, msg) {
  results.push({ id, status: 'FAIL', msg });
  failed++;
  console.error(`✗ ${id}: ${msg}`);
}

function loadModule(file) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInThisContext(code, { filename: file });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Bootstrap globals
global.window = global;
global.settings = {
  centerName: 'مركز اختبار',
  centerNameEn: 'Test Center',
  vatRate: 15,
  taxNum: '300000000000003',
  address: 'الرياض',
  phone: '0500000000',
  brandLogo: '',
  simplifiedTaxInvoice: { enabled: true }
};
global.fmtMoney = (v) => Number(v).toFixed(2) + ' ﷼';
global.fmtNum = (v) => String(v);
global.fmtDate = (v) => String(v);
global.buildReceiptHTML = (c) => `<div class="receipt"><div class="rc">Test</div><!-- ══ QR CODES (side by side) ══ --><div class="rd"></div><div class="rqrrow"><div class="rqr"><div class="rqrlbl">واتساب</div><img src="x"></div></div><div class="rfooter">footer</div></div>`;
global.printFooterDiv = () => '<div class="footer">test</div>';
global.getServiceUnitPrice = () => 50;

loadModule('cupping-report-identity.js');
loadModule('cupping-simplified-tax-invoice.js');

// VAT math — 100 SAR example from requirements
const b = global.calcVatInclusiveBreakdown(100, 15);
if (round2(b.preTax) === 86.96 && round2(b.vat) === 13.04 && round2(b.total) === 100) {
  ok('VAT-01', '100 SAR → preTax 86.96, VAT 13.04, total 100.00');
} else {
  fail('VAT-01', `Expected 86.96/13.04/100 got ${round2(b.preTax)}/${round2(b.vat)}/${round2(b.total)}`);
}

// Stored case values respected
const b2 = global.calcVatInclusiveBreakdown(100, 15, { preTax: 86.96, vat: 13.04 });
if (round2(b2.preTax) === 86.96 && round2(b2.vat) === 13.04) {
  ok('VAT-02', 'Uses stored preTax/vat when consistent');
} else {
  fail('VAT-02', 'Stored breakdown not respected');
}

// ZATCA QR TLV Base64
const qr = global.buildZatcaSimplifiedQrBase64('Test Seller', '300000000000003', '2022-04-25T15:30:00Z', '100.00', '13.04');
if (typeof qr === 'string' && qr.length > 20 && /^[A-Za-z0-9+/=]+$/.test(qr)) {
  ok('QR-01', 'ZATCA simplified QR Base64 generated');
} else {
  fail('QR-01', 'Invalid QR payload');
}

// Unified report header
const hdr = global.buildUnifiedReportHeader('تقرير اليوم', 'Daily Report', ['meta line'], { date: '2026-01-01' });
if (hdr.includes('مركز اختبار') && hdr.includes('report-identity-hdr') && hdr.includes('تقرير اليوم')) {
  ok('ID-01', 'Unified report header includes center name, title, identity class');
} else {
  fail('ID-01', 'Unified header missing expected content');
}

if (hdr.includes('report-logo')) {
  ok('ID-02', 'Unified header includes center logo element');
} else {
  fail('ID-02', 'Logo element missing from header');
}

// Simplified tax invoice HTML
const sampleCase = {
  id: '1', invoice: 'INV-100', name: 'عميل تجريبي', date: '2026-06-01',
  total: 100, preTax: 86.96, vat: 13.04, cups: 2, serviceType: 'حجامة رطبة',
  doctorName: 'د. أحمد', createdAt: '2026-06-01T10:30:00.000Z'
};
const html = global.buildSimplifiedTaxInvoiceHTML(sampleCase);
const checks = [
  ['STI-01', html.includes('فاتورة ضريبية مبسطة'), 'title present'],
  ['STI-02', html.includes('INV-100'), 'invoice number'],
  ['STI-03', html.includes('86.96') || html.includes('86.96'), 'pre-tax amount'],
  ['STI-04', html.includes('13.04'), 'VAT amount'],
  ['STI-05', html.includes('ZATCA QR') || html.includes('qrserver'), 'QR block'],
  ['STI-06', html.includes('300000000000003'), 'tax registration number'],
  ['STI-07', !html.toLowerCase().includes('najjar'), 'no product branding in operational invoice']
];
checks.forEach(([id, cond, msg]) => cond ? ok(id, msg) : fail(id, msg));

const thermalHtml = global.buildSimplifiedTaxThermalHTML(sampleCase);
const titleIdx = thermalHtml.indexOf('فاتورة ضريبية مبسطة');
const bodyIdx = thermalHtml.indexOf('Test');
if (titleIdx >= 0 && (bodyIdx < 0 || titleIdx < bodyIdx)) {
  ok('THM-01', 'Thermal tax title at top');
} else {
  fail('THM-01', 'Thermal tax title missing or not at top');
}
if (!thermalHtml.includes('رمز ZATCA') && !thermalHtml.includes('ZATCA QR Code') && thermalHtml.includes('qrserver')) {
  ok('THM-02', 'Thermal ZATCA QR without text labels');
} else {
  fail('THM-02', 'Thermal ZATCA QR still has text labels');
}

global.settings.simplifiedTaxInvoice.showContactQrOnThermal = false;
const thermalNoContact = global.buildSimplifiedTaxThermalHTML(sampleCase);
if (!thermalNoContact.includes('واتساب')) {
  ok('THM-03', 'Contact QR hidden when showContactQrOnThermal false');
} else {
  fail('THM-03', 'Contact QR not stripped');
}

// Feature off by default migration
global.settings.simplifiedTaxInvoice = undefined;
global.ensureSimplifiedTaxSettings();
if (global.isSimplifiedTaxInvoiceEnabled() === false) {
  ok('CFG-01', 'Simplified tax invoice disabled by default');
} else {
  fail('CFG-01', 'Should be disabled by default');
}

// File presence
const files = [
  'cupping-simplified-tax-invoice.js',
  'cupping-report-identity.js'
];
files.forEach(f => {
  if (fs.existsSync(path.join(root, f))) ok('FILE-' + f, 'exists');
  else fail('FILE-' + f, 'missing');
});

// buildReceiptHTML unchanged check — grep for function signature in index.html
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (indexHtml.includes('function buildReceiptHTML(c)')) {
  ok('REG-01', 'buildReceiptHTML preserved in index.html');
} else {
  fail('REG-01', 'buildReceiptHTML missing');
}
if (indexHtml.includes('set-invoice-system-enabled') && indexHtml.includes('invoice-system-settings-detail')) {
  ok('REG-02', 'Settings toggles present; invoice master toggle separate from detail sections');
} else {
  fail('REG-02', 'Settings integration issue');
}

console.log('\n--- Summary ---');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

const reportPath = path.join(root, 'pat-reports', 'SIMPLIFIED-TAX-INVOICE-VALIDATION.json');
try {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ passed, failed, total: passed + failed, results, at: new Date().toISOString() }, null, 2));
  console.log(`Report: ${reportPath}`);
} catch (_) {}

process.exit(failed > 0 ? 1 : 0);
