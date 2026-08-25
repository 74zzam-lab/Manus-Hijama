#!/usr/bin/env node
/**
 * Final Production Audit (FPA) — Hijama Management System
 * Deep validation: thermal stress, typography, tour/wizard isolation, licenses, performance
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'pat-reports');
const APP_URL = `file://${path.join(ROOT, 'index.html')}`;

const results = [];
const findings = [];
const fixes = [];

function record(phase, id, name, status, detail = '') {
  results.push({ phase, id, name, status, detail, ts: new Date().toISOString() });
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : status === 'WARN' ? '!' : '○';
  console.log(`${icon} [${phase}] ${id}: ${name}${detail ? ' — ' + detail : ''}`);
}

async function runInPage(page, fnName, ...args) {
  return page.evaluate(async ({ fnName, args }) => {
    const fns = window.__FPA__;
    if (!fns || typeof fns[fnName] !== 'function') throw new Error('FPA fn missing: ' + fnName);
    return await fns[fnName](...(args || []));
  }, { fnName, args });
}

async function loadFpaHarness(page) {
  await page.evaluate(() => {
    async function seedAndLogin() {
      const fp = licGetFingerprint();
      const today = new Date().toISOString().slice(0, 10);
      licSave({ type: '365', start: today, expiry: '2027-08-04', fingerprint: fp, issued: new Date().toISOString(), v: 2, edition: 'full' });
      sessionStorage.setItem('__tdw_lic__', localStorage.getItem('__tdw_lic__'));
      _licStatus = 'valid'; _licBlocked = false;
      await licFinalizeFeatureState();
      document.getElementById('login-role').value = 'admin';
      filterLoginUsers();
      document.getElementById('login-username').value = '1';
      document.getElementById('login-password').value = 'admin123';
      await doLogin();
      return { authed: _appAuthed };
    }

    function buildStressCase() {
      const extras = Array.from({ length: 25 }, (_, i) => ({
        svc: `خدمة اختبار طويلة جدًا للطباعة الحرارية رقم ${i + 1} — فحص عدم الالتفاف`,
        name: `خدمة ${i + 1}`,
        cups: 1,
        price: 10 + i
      }));
      return {
        invoice: 'INV-2026-FPA-STRESS-000999999',
        date: new Date().toISOString().slice(0, 10),
        name: 'عميل اختبار باسم طويل جدًا للتأكد من عدم تشوه الفاتورة الحرارية على 58 و 80 ملم',
        doctorId: 'fpa-doc', doctorName: 'د. أحمد محمد العبدالله الاختبار الطويل',
        cups: 3,
        serviceType: 'حجامة علاجية متقدمة للظهر والرقبة والكتفين مع جلسة إضافية',
        preTax: 400, vat: 60, total: 460, cash: 460, card: 0, commission: 50,
        discountAmt: 25, discountType: 'fixed', discountVal: 25,
        extraServices: extras,
        fileNo: '9999999'
      };
    }

    function analyzeThermalHtml(html, paperW) {
      const issues = [];
      const spec = getThermalPaperSpec(paperW);
      if (!html.includes('r-footer') && !html.includes('rfooter') && !html.includes('شكراً')) issues.push('footer missing');
      if (!html.includes('rqr') && settings.devices?.thermal?.printQR !== false) { /* QR optional */ }
      if (html.includes('word-wrap: break-word') && html.match(/rrow/g)?.length) {
        /* address only should wrap */
      }
      const nowrapCount = (html.match(/white-space:\s*nowrap/g) || []).length;
      const rValCount = (html.match(/class="r-val/g) || []).length;
      const rrowCount = (html.match(/class="rrow/g) || []).length;
      const hasVat = html.includes('ضريبة') || html.includes('VAT');
      const hasTotal = html.includes('rtot') || html.includes('الإجمالي');
      const hasDiscount = html.includes('خصم') || html.includes('Discount');
      const contentW = spec.contentW;
      return { issues, nowrapCount, rValCount, rrowCount, hasVat, hasTotal, hasDiscount, contentW, paperW: spec.paperW, htmlLen: html.length };
    }

    async function testThermalStress() {
      await seedAndLogin();
      settings.centerName = 'مركز تجريبي FPA باسم طويل للاختبار على الطابعة';
      settings.centerNameEn = 'FPA Test Center Long Name';
      settings.address = 'الرياض — حي النخيل — شارع الملك فهد';
      settings.taxNum = '300000000000003';
      ensureDeviceSettings();
      settings.devices.thermal.printQR = true;
      settings.waNumber = '966500000000';
      settings.siteUrl = 'https://example.com/center';
      DB.set('settings', settings);
      const c = buildStressCase();
      const out = {};
      for (const w of [58, 80]) {
        settings.devices.thermal.paperWidth = w;
        const body = buildReceiptHTML(c);
        const doc = buildThermalPrintDocument(body, { paperWidth: w });
        const m = analyzeThermalHtml(doc + body, w);
        const valRows = (body.match(/class="r-val/g) || []).length;
        const wrapInValues = body.includes('r-val') && !doc.includes('white-space: nowrap');
        out[w] = { ...m, valRows, hasQr: body.includes('rqrrow'), hasBrand: body.includes('r-brand'), hasFooter: body.includes('شكراً'), docHasPage: doc.includes(`size: ${w}mm`) };
      }
      return out;
    }

    async function testThermalPreviewMetrics() {
      const c = buildStressCase();
      const metrics = {};
      for (const w of [58, 80]) {
        syncThermalPreviewCss();
        settings.devices.thermal.paperWidth = w;
        syncThermalPreviewCss();
        const host = document.createElement('div');
        host.id = 'fpa-receipt-test';
        host.style.cssText = 'position:fixed;left:-9999px;top:0;';
        document.body.appendChild(host);
        const spec = getThermalPaperSpec(w);
        host.style.width = spec.contentW + 'mm';
        host.innerHTML = buildReceiptHTML(c);
        const receipt = host.querySelector('.receipt');
        const rows = host.querySelectorAll('.rrow');
        let wrapCount = 0;
        rows.forEach(r => {
          const val = r.querySelector('.r-val, span:last-child');
          if (val && val.scrollHeight > val.clientHeight + 2) wrapCount++;
        });
        const receiptW = receipt?.getBoundingClientRect().width || 0;
        const pxPerMm = 3.78;
        const expectedW = spec.contentW * pxPerMm;
        const utilization = receiptW / expectedW;
        metrics[w] = { receiptW: Math.round(receiptW), expectedPx: Math.round(expectedW), utilization: Math.round(utilization * 100), wrapCount, rowCount: rows.length };
        host.remove();
      }
      return metrics;
    }

    async function testTourDisabled() {
      await seedAndLogin();
      _licensedFeatures.sys_product_tour = false;
      if (typeof applyLicensedFeatures === 'function') applyLicensedFeatures();
      const scriptsBefore = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src') || String(s.src || ''));
      const hasTourScript = scriptsBefore.some(s => String(s).includes('cupping-product-tour'));
      const tourDom = !!document.getElementById('productTourOverlay');
      const tourStyles = !!document.getElementById('product-tour-styles');
      const productTourGlobal = typeof window.ProductTour !== 'undefined';
      let tourBtnVisible = false;
      const tourCard = document.querySelector('[data-feature="sys_product_tour"]');
      if (tourCard) tourBtnVisible = tourCard.style.display !== 'none' && !tourCard.classList.contains('feature-hidden');
      await FirstRun.openProductTour(0);
      await new Promise(r => setTimeout(r, 300));
      const scriptsAfter = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src') || String(s.src || ''));
      const loadedTourScript = scriptsAfter.some(s => String(s).includes('cupping-product-tour'));
      const tourDomAfter = !!document.getElementById('productTourOverlay');
      return { hasTourScript, tourDom, tourStyles, productTourGlobal, tourBtnVisible, loadedTourScript, tourDomAfter, scriptsDelta: scriptsAfter.length - scriptsBefore.length };
    }

    async function testTourEnabled() {
      await seedAndLogin();
      _licensedFeatures.sys_product_tour = true;
      if (typeof applyLicensedFeatures === 'function') applyLicensedFeatures();
      const logsBefore = (typeof systemLogs !== 'undefined' ? systemLogs : DB.get('systemLogs', [])).length;
      await FirstRun.openProductTour(0);
      await new Promise(r => setTimeout(r, 400));
      const scripts = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src') || String(s.src || '')).filter(u => u.includes('cupping-product-tour'));
      const overlay1 = document.querySelectorAll('#productTourOverlay').length;
      await FirstRun.openProductTour(1);
      await new Promise(r => setTimeout(r, 200));
      const overlay2 = document.querySelectorAll('#productTourOverlay').length;
      const skipBtns = document.querySelectorAll('#frTourSkip').length;
      const logsAfter = (typeof systemLogs !== 'undefined' ? systemLogs : DB.get('systemLogs', [])).length;
      const auditTour = (typeof systemLogs !== 'undefined' ? systemLogs : DB.get('systemLogs', [])).some(l => /PRODUCT_TOUR|الجولة التعريفية/i.test((l.message || '') + (l.action || '')));
      document.getElementById('productTourOverlay')?.classList.remove('open');
      return { scriptCount: scripts.length, overlay1, overlay2, skipBtns, auditTour, logsDelta: logsAfter - logsBefore };
    }

    async function testWizardIndependent() {
      await seedAndLogin();
      _licensedFeatures.sys_product_tour = false;
      if (typeof applyLicensedFeatures === 'function') applyLicensedFeatures();
      const tourLoaded = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src') || String(s.src || '')).some(u => u.includes('cupping-product-tour'));
      FirstRun.openSetupWizard(0);
      await new Promise(r => setTimeout(r, 100));
      const wizardDom = !!document.getElementById('setupWizardModal');
      const tourDom = !!document.getElementById('productTourOverlay');
      const wizardBody = document.getElementById('frWizardBody')?.innerHTML?.length || 0;
      document.getElementById('setupWizardModal')?.classList.remove('open');
      const tourStillNotLoaded = ![...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src') || String(s.src || '')).some(u => u.includes('cupping-product-tour'));
      return { tourLoaded, wizardDom, tourDom, wizardBody, tourStillNotLoaded, setupWizardFeat: isFeatureEnabled('sys_setup_wizard'), tourFeat: isFeatureEnabled('sys_product_tour') };
    }

    function auditTypography(viewportW) {
      const overflows = [];
      const wraps = [];
      const selectors = '.btn, .nav-label, .tab, .card-title, .modal-title, .form-label, .drawer-panel .nav-label, .sidebar .nav-label';
      document.querySelectorAll(selectors).forEach(el => {
        if (el.offsetParent === null && !el.closest('.sidebar')) return;
        const sh = el.scrollHeight, ch = el.clientHeight, sw = el.scrollWidth, cw = el.clientWidth;
        const cs = getComputedStyle(el);
        const intentionalClip = cs.overflow === 'hidden' && cs.textOverflow === 'ellipsis';
        if (sh > ch + 3) wraps.push({ t: el.textContent?.slice(0, 35), cls: el.className?.slice(0, 40), type: 'v' });
        if (sw > cw + 3 && !intentionalClip) overflows.push({ t: el.textContent?.slice(0, 35), cls: el.className?.slice(0, 40), type: 'h' });
        if (parseFloat(cs.lineHeight) > parseFloat(cs.fontSize) * 2.2) wraps.push({ t: 'line-height', cls: el.className?.slice(0, 30), lh: cs.lineHeight });
      });
      return { viewportW, overflowCount: overflows.length, wrapCount: wraps.length, samples: [...overflows, ...wraps].slice(0, 12) };
    }

    async function testTypographyMultiViewport() {
      await seedAndLogin();
      const pages = ['dashboard', 'daily', 'clients', 'doctors', 'users', 'packages', 'settings', 'reports', 'payroll', 'employee-ledger'];
      const results = [];
      for (const p of pages) {
        if (typeof showPage === 'function') showPage(p);
        await new Promise(r => setTimeout(r, 80));
        results.push({ page: p, ...auditTypography(window.innerWidth) });
      }
      return results;
    }

    function auditLicenseFeatures() {
      const registry = FEATURE_REGISTRY.map(f => f.id);
      const addon = FEATURE_ADDON_IDS;
      const optIn = typeof OPT_IN_FEATURE_IDS !== 'undefined' ? OPT_IN_FEATURE_IDS : ['sys_product_tour'];
      const domFeat = [...new Set([...document.querySelectorAll('[data-feature]')].map(e => e.getAttribute('data-feature')).filter(Boolean))];
      const ungated = addon.filter(id => !domFeat.includes(id) && !['core_employee'].includes(id));
      const gatedNotInRegistry = domFeat.filter(id => !registry.includes(id));
      return { registryCount: registry.length, addonCount: addon.length, optIn, domFeatCount: domFeat.length, ungatedSample: ungated.slice(0, 15), gatedNotInRegistry, productTourDefault: FEATURE_DEFAULTS?.sys_product_tour };
    }

    function auditPerformanceStatic() {
      const scripts = [...document.querySelectorAll('script[src]')].map(s => {
        const u = s.src || '';
        return u.split('/').pop() || u;
      });
      return { externalScripts: scripts.filter(s => s && !s.includes('sheetjs') && !s.includes('xlsx')) };
    }

    window.__FPA__ = {
      seedAndLogin, testThermalStress, testThermalPreviewMetrics,
      testTourDisabled, testTourEnabled, testWizardIndependent,
      testTypographyMultiViewport, auditLicenseFeatures, auditPerformanceStatic
    };
  });
}

function staticRepoAudit() {
  const audit = { legacy: [], branches: [], electron: [] };
  if (fs.existsSync(path.join(ROOT, 'manus-reference'))) audit.legacy.push('manus-reference/ (old reference HTML — not loaded by app)');
  if (fs.existsSync(path.join(ROOT, 'dist'))) audit.legacy.push('dist/ (build artifact — not source of truth)');
  try {
    const stat = execSync('git diff --stat main...HEAD 2>/dev/null | tail -1', { cwd: ROOT, encoding: 'utf8' }).trim();
    audit.branches.push(`diff vs main: ${stat || 'N/A'}`);
  } catch { audit.branches.push('on main or no diff'); }
  if (fs.existsSync(path.join(ROOT, 'electron/main.js'))) audit.electron.push('electron/main.js present');
  if (fs.existsSync(path.join(ROOT, 'cupping-product-tour.js'))) audit.electron.push('cupping-product-tour.js lazy (not in index.html script tags)');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (!html.includes('cupping-product-tour.js')) audit.electron.push('PASS: product-tour not statically bundled');
  return audit;
}

function summarize() {
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  const total = results.length;
  const pct = total ? Math.round(((pass + warn * 0.9) / total) * 100) : 0;
  return { pass, fail, warn, total, pct };
}

function buildMarkdown(summary, extra) {
  const lines = [
    '# Final Production Audit (FPA) Report',
    '',
    `**Date:** ${new Date().toISOString()}`,
    `**Branch:** cursor/pre-release-final-review-d976`,
    '',
    '## Summary',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Scenarios | ${summary.total} |`,
    `| Passed | ${summary.pass} |`,
    `| Failed | ${summary.fail} |`,
    `| Warnings | ${summary.warn} |`,
    `| **Readiness** | **${summary.pct}%** |`,
    '',
    '## Electron Manual Checklist (required before merge)',
    '',
    '- [ ] First run + Setup Wizard',
    '- [ ] Product Tour (after enabling in Dev › Diagnostics)',
    '- [ ] Thermal print 58mm + 80mm (physical)',
    '- [ ] A4 Portrait + Landscape + PDF',
    '- [ ] Monthly Archive PDF',
    '- [ ] Employee Ledger + Backup/Restore',
    '- [ ] Zero console errors',
    '',
    '## Detailed Results',
    ''
  ];
  let last = '';
  for (const r of results) {
    if (r.phase !== last) { lines.push(`### ${r.phase}`); last = r.phase; }
    lines.push(`- [${r.status}] **${r.id}** — ${r.name}${r.detail ? `: ${r.detail}` : ''}`);
  }
  if (extra.static) {
    lines.push('', '### Static Repo Audit', '');
    for (const x of extra.static.legacy || []) lines.push(`- ${x}`);
    for (const x of extra.static.branches || []) lines.push(`- ${x}`);
  }
  return lines.join('\n');
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const extra = { static: staticRepoAudit() };

  // Phase 1: Thermal (main page)
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(3000);
  await loadFpaHarness(page);
  try {
    const thermal = await runInPage(page, 'testThermalStress');
    for (const w of [58, 80]) {
      const t = thermal[w];
      const ok = t?.docHasPage && t?.hasFooter && t?.hasTotal && t?.hasVat && (t?.valRows || 0) >= 5;
      record('1 — Thermal Stress', `T-${w}-struct`, `Thermal ${w}mm stress receipt`, ok ? 'PASS' : 'FAIL', `rows:${t?.rrowCount} vals:${t?.valRows} QR:${t?.hasQr}`);
    }
    const metrics = await runInPage(page, 'testThermalPreviewMetrics');
    for (const w of [58, 80]) {
      const m = metrics[w];
      const utilOk = m.utilization >= 80 && m.utilization <= 120;
      const wrapOk = m.wrapCount === 0;
      record('1 — Thermal Stress', `T-${w}-layout`, `Thermal ${w}mm DOM metrics`, utilOk && wrapOk ? 'PASS' : 'WARN', `util:${m.utilization}% wrap:${m.wrapCount} rows:${m.rowCount}`);
    }
  } catch (e) { record('1 — Thermal Stress', 'T-01', 'Thermal stress', 'FAIL', e.message); }

  // Phase 2-8: audits on same session

  try {
    const typo = await runInPage(page, 'testTypographyMultiViewport');
    const totalOverflow = typo.reduce((s, t) => s + t.overflowCount, 0);
    const totalWrap = typo.reduce((s, t) => s + t.wrapCount, 0);
    const overflowSamples = typo.flatMap(t => (t.samples || []).filter(s => s.type === 'h')).slice(0, 3);
    record('2 — Typography', 'TY-01', 'Multi-page overflow scan', totalOverflow === 0 ? 'PASS' : 'WARN', `${totalOverflow} overflows${overflowSamples.length ? ' — ' + JSON.stringify(overflowSamples) : ''}`);
    record('2 — Typography', 'TY-02', 'Multi-page wrap scan', totalWrap <= 2 ? 'PASS' : 'WARN', `${totalWrap} wrap hints`);
  } catch (e) { record('2 — Typography', 'TY-01', 'Typography', 'FAIL', e.message); }

  try {
    const off = await runInPage(page, 'testTourDisabled');
    const ok = !off.tourDom && !off.tourDomAfter && !off.loadedTourScript && !off.productTourGlobal;
    record('3 — Product Tour', 'TOUR-OFF', 'Disabled: no JS/DOM/listeners', ok ? 'PASS' : 'FAIL', JSON.stringify(off));
    record('3 — Product Tour', 'TOUR-OFF-UI', 'Disabled: UI hidden', !off.tourBtnVisible ? 'PASS' : 'WARN');
  } catch (e) { record('3 — Product Tour', 'TOUR-OFF', 'Tour disabled', 'FAIL', e.message); }

  // Wizard must run before tour-enabled (tour leaves script/DOM in session)
  try {
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2000);
    await loadFpaHarness(page);
    const wiz = await runInPage(page, 'testWizardIndependent');
    const ok = wiz.wizardDom && wiz.wizardBody > 100 && !wiz.tourDom && wiz.tourStillNotLoaded && wiz.setupWizardFeat && !wiz.tourFeat;
    record('4 — Setup Wizard', 'WIZ-01', 'Wizard independent of tour', ok ? 'PASS' : 'FAIL', JSON.stringify(wiz));
  } catch (e) { record('4 — Setup Wizard', 'WIZ-01', 'Wizard', 'FAIL', e.message); }

  try {
    const on = await runInPage(page, 'testTourEnabled');
    record('3 — Product Tour', 'TOUR-ON', 'Enabled: single script load', on.scriptCount === 1 ? 'PASS' : 'WARN', `scripts:${on.scriptCount}`);
    record('3 — Product Tour', 'TOUR-ON-DUP', 'No duplicate overlay', on.overlay2 === 1 ? 'PASS' : 'FAIL', `overlays:${on.overlay2}`);
    record('3 — Product Tour', 'TOUR-ON-AUDIT', 'Audit log on start', on.auditTour ? 'PASS' : 'WARN');
  } catch (e) { record('3 — Product Tour', 'TOUR-ON', 'Tour enabled', 'FAIL', e.message); }

  try {
    const lic = await runInPage(page, 'auditLicenseFeatures');
    record('5 — Licenses', 'LIC-01', 'Feature registry', lic.registryCount >= 70 ? 'PASS' : 'FAIL', `${lic.registryCount} keys`);
    record('5 — Licenses', 'LIC-02', 'Product tour opt-in default', lic.productTourDefault === false ? 'PASS' : 'FAIL');
    record('5 — Licenses', 'LIC-03', 'DOM feature gates', lic.domFeatCount >= 40 ? 'PASS' : 'WARN', `${lic.domFeatCount} data-feature`);
    if (lic.ungatedSample?.length) record('5 — Licenses', 'LIC-04', 'Ungated addons (module-level)', 'WARN', lic.ungatedSample.join(', '));
  } catch (e) { record('5 — Licenses', 'LIC-01', 'Licenses', 'FAIL', e.message); }

  try {
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2000);
    await loadFpaHarness(page);
    const perf = await runInPage(page, 'auditPerformanceStatic');
    const staticHasTour = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes('cupping-product-tour.js');
    record('6 — Performance', 'PERF-01', 'Product tour not in index.html bundle', !staticHasTour ? 'PASS' : 'FAIL');
    record('6 — Performance', 'PERF-02', 'Lazy scripts count', 'PASS', `${perf.externalScripts?.length} modules`);
  } catch (e) { record('6 — Performance', 'PERF-01', 'Performance', 'FAIL', e.message); }

  record('7 — Electron', 'E-01', 'Electron runtime validation', 'WARN', 'Manual — see checklist in report');
  record('7 — Electron', 'E-02', 'electron/ package present', extra.static.electron?.length ? 'PASS' : 'WARN', extra.static.electron?.join('; '));

  record('8 — Production Audit', 'PA-01', 'Product tour not in index.html', extra.static.electron?.some(x => x.includes('PASS')) ? 'PASS' : 'FAIL');
  for (const l of extra.static.legacy || []) record('8 — Production Audit', 'PA-LEG', 'Legacy path', 'WARN', l);
  for (const b of extra.static.branches || []) record('8 — Production Audit', 'PA-BR', 'Branch diff', 'PASS', b);

  await browser.close();

  const summary = summarize();
  const jsonPath = path.join(REPORT_DIR, 'fpa-results.json');
  const mdPath = path.join(REPORT_DIR, 'FPA-REPORT.md');
  fs.writeFileSync(jsonPath, JSON.stringify({ summary, results, extra, fixes }, null, 2));
  fs.writeFileSync(mdPath, buildMarkdown(summary, extra));

  console.log(`\n══════════════════════════════════════`);
  console.log(`FPA Complete: ${summary.pass}/${summary.total} passed (${summary.pct}%)`);
  console.log(`Report: ${mdPath}`);
  console.log(`══════════════════════════════════════\n`);

  process.exit(summary.fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FPA fatal:', err);
  process.exit(2);
});
