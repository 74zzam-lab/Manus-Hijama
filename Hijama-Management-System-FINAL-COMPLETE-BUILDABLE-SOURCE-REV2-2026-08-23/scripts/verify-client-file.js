#!/usr/bin/env node
/**
 * Verifies client file data binding and map HTML contains images + selective points.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const global = {
  location: { href: 'file:///workspace/index.html' },
  settings: {
    centerName: 'مركز تجريبي',
    centerNameEn: 'TEST CENTER',
    address: 'الرياض',
    phone: '0500000000',
    cupPrice: 50,
    brandLogo: 'branding/Center-Logo.png',
    cuppingAtlas: { template: { full: { mode: 'free', layers: {} }, mini: { mode: 'free', layers: {} } } }
  },
  DB: {
    get(key, fb) {
      if (key === 'settings') return global.settings;
      if (key === 'clientsRegistry') return global.clientsRegistry;
      if (key === 'cases') return global.cases;
      return fb;
    }
  },
  clientsRegistry: [{
    key: 'ph:0501111111',
    name: 'أحمد محمد',
    phone: '0501111111',
    fileNo: 'F-100',
    nationality: 'سعودي',
    fileProfile: {
      gender: 'ذكر', age: '35', address: 'حي النخيل',
      bloodPressure: '120/80', bloodSugar: '95', purpose: 'وقائية',
      usedPoints: ['1', '4']
    }
  }],
  cases: [],
  fmtMoney: (n) => n.toFixed(2) + ' ر.س',
  findClientInRegistry: (k) => global.clientsRegistry.find(c => c.key === k),
  findClientByFileNo: (f) => global.clientsRegistry.find(c => c.fileNo === f),
  getClientLookupKey: (p, n) => (p ? 'ph:' + p : 'nm:' + n),
};

['cupping-cupping-atlas.js', 'cupping-layout-composer.js', 'cupping-client-file.js'].forEach(f => {
  vm.runInNewContext(fs.readFileSync(path.join(root, f), 'utf8'), global);
});

const data = global.getClientFileData('ph:0501111111', {
  name: 'أحمد محمد',
  phone: '0501111111',
  cups: 8,
  sessionTotal: 400,
  doctorName: 'د. خالد',
  profile: { usedPoints: ['1', '4', '5'], gender: 'ذكر', age: '35' },
  currentSession: { date: '2026-06-18', specialist: 'د. خالد', attendance: '' }
});

const errors = [];
if (!data.name) errors.push('name empty');
if (data.cups !== 8) errors.push('cups=' + data.cups);
if (data.totalPrice !== 400) errors.push('totalPrice=' + data.totalPrice);
if (!data.address && data.age !== '35') errors.push('profile fields missing');
if (!data.doctorName) errors.push('doctorName empty');
if (!data.nationality) errors.push('nationality empty');

const html = global.buildClientFileSheetHtml(data);
if (!html.includes('filled">8<')) errors.push('cups not in HTML');
if (!html.includes('أحمد محمد')) errors.push('name not in HTML');
if (!html.includes('cup-img-base')) errors.push('map images missing from HTML');
if (!html.includes('cup-img-pt-dot') && !html.includes('cup-img-pt--session')) errors.push('session points missing');
if (html.includes('showAllPoints')) errors.push('showAllPoints leaked');
if (html.includes('جلسة حالية') || html.includes('مواضع سابقة') || html.includes('نقاط أطلس')) errors.push('map legend text should be removed');
if (html.includes('نموذج جلسة حجامة طبية')) errors.push('ar-sub subtitle should be removed');
if (!html.includes('أقر بأني أتيت لعمل الحجامة')) errors.push('consent text missing');
if (!html.includes('رقم الهوية') && !html.includes('ID No')) errors.push('patientId label missing');
if (!html.includes('Infectious Diseases')) errors.push('infectious diseases block missing');
if (!html.includes('Hepatitis B (HBV)')) errors.push('HBV missing');
if (!html.includes('infectious-grid')) errors.push('infectious grid missing');
if (html.includes('كبد وبائي')) errors.push('old hepatitis label should be removed');

const outlineMap = global.renderClientFileMapHtml('full', {
  interactive: true,
  outlineSelection: true,
  selected: new Set(['1']),
  sessionPoints: new Set(),
  savedPoints: new Set()
});
if (!outlineMap.includes('cup-img-pt-outline')) errors.push('outline selection missing from interactive map');
if (!outlineMap.includes('cup-img-pt-lbl')) errors.push('all point labels should show on interactive map');

const mapHtml = global.renderClientFileMapHtml('full', {
  pointDots: true,
  sessionPoints: new Set(['1']),
  savedPoints: new Set(['4'])
});
if (!mapHtml.includes('cf-free-map')) errors.push('puzzle layout missing');
if (!mapHtml.includes('cup-img-base')) errors.push('map render missing images');
if (!mapHtml.includes('file://') && !mapHtml.includes('assets/cupping-maps')) {
  errors.push('map image src not resolved');
}

const resolved = global.resolveAssetUrl('assets/cupping-maps/back.png');
if (!resolved.includes('cupping-maps/back.png')) errors.push('resolveAssetUrl failed: ' + resolved);

if (errors.length) {
  console.error('FAIL:', errors.join('; '));
  process.exit(1);
}
console.log('OK: client file data + maps verified');
console.log('  name:', data.name, '| cups:', data.cups, '| price:', data.totalPrice);
console.log('  map session pts:', data.mapPoints.session.size, '| saved:', data.mapPoints.saved.size);
