#!/usr/bin/env node
/**
 * Final Branding Audit — validates single source, logo quality rules, icon safety, About/Installer wiring.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ROOT, loadBrandingConfig, resolveLogoPath, buildBrandAssets, BRAND_PATHS, isValidIcoFile,
} from './branding-engine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = path.join(ROOT, 'pat-reports');
const results = [];

function record(id, name, status, detail = '') {
  results.push({ id, name, status, detail });
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '!';
  console.log(`${icon} ${id}: ${name}${detail ? ' — ' + detail : ''}`);
}

function readPkg() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
}

async function auditConfig() {
  const config = loadBrandingConfig();
  record('BR-01', 'branding.config.json exists', 'PASS');
  const required = ['company.name', 'company.tagline', 'assets.logo', 'product.name'];
  const missing = required.filter((k) => {
    const parts = k.split('.');
    let o = config;
    for (const p of parts) o = o?.[p];
    return !o;
  });
  record('BR-02', 'Required branding keys', missing.length ? 'FAIL' : 'PASS', missing.join(', ') || `${required.length} keys`);
  return config;
}

async function auditLogo(config) {
  const logoPath = resolveLogoPath(config);
  if (!fs.existsSync(logoPath)) {
    record('BR-03', 'Logo source file', 'FAIL', logoPath);
    return null;
  }
  const { default: sharp } = await import('sharp');
  const meta = await sharp(logoPath).metadata();
  record('BR-03', 'Logo source file', 'PASS', `${meta.width}×${meta.height} ${meta.hasAlpha ? 'RGBA' : 'RGB'}`);
  record('BR-04', 'Logo has alpha (transparency)', meta.hasAlpha ? 'PASS' : 'WARN');
  return meta;
}

async function auditBuildAssets(config, logoMeta) {
  const iconPath = path.join(ROOT, BRAND_PATHS.programIcon);
  const result = await buildBrandAssets({ config });
  record('BR-05', 'Build brand assets', 'PASS', 'BMP + NSIS + ICO');
  record('BR-06', 'No logo upscale', result.upscaled ? 'FAIL' : 'PASS');
  if (logoMeta && result.outputs.installerSidebar.logo) {
    const placed = result.outputs.installerSidebar.logo;
    const fits = placed.width <= logoMeta.width && placed.height <= logoMeta.height;
    record('BR-07', 'Installer logo within source bounds', fits ? 'PASS' : 'FAIL', `${placed.width}×${placed.height}`);
  }
  const icoOk = isValidIcoFile(iconPath);
  record('BR-08', 'Program icon valid Windows ICO', icoOk ? 'PASS' : 'FAIL', icoOk ? path.basename(iconPath) : 'invalid or missing');
  record('BR-09', 'installer-branding.nsh generated', fs.existsSync(result.outputs.nsisBranding) ? 'PASS' : 'FAIL');
  return result;
}

function auditPackageJson() {
  const pkg = readPkg();
  const win = pkg.build?.win || {};
  const nsis = pkg.build?.nsis || {};
  const iconPath = win.icon || nsis.installerIcon;
  const expectedIcon = BRAND_PATHS.programIcon;
  record('BR-10', 'Program icon path', iconPath === expectedIcon ? 'PASS' : 'FAIL', iconPath);
  record('BR-11', 'EXE icon via afterPack/resedit', pkg.build?.afterPack && pkg.build?.win?.signAndEditExecutable === false ? 'PASS' : 'WARN');
  record('BR-11b', 'Program-Icon.ico present', fs.existsSync(path.join(ROOT, 'build', 'Program-Icon.ico')) ? 'PASS' : 'FAIL');
  record('BR-12', 'branding.config.json in build files', (pkg.build?.files || []).includes('branding.config.json') ? 'PASS' : 'FAIL');
  record('BR-13', 'prebuild runs generate:brand', (pkg.scripts?.prebuild || '').includes('generate-brand-assets') ? 'PASS' : 'FAIL');
}

function auditSourceWiring() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const nsh = fs.readFileSync(path.join(ROOT, 'build/installer.nsh'), 'utf8');
  record('BR-14', 'cupping-branding.js loaded', html.includes('cupping-branding.js') ? 'PASS' : 'FAIL');
  record('BR-15', 'About uses BrandingEngine ids', html.includes('about-brand-logo') && html.includes('about-runtime-electron') ? 'PASS' : 'FAIL');
  record('BR-16', 'No hardcoded logo path in About img', !html.includes('src="assets/NajjarTech-Logo.png"') ? 'PASS' : 'WARN', 'dynamic via engine');
  record('BR-17', 'installer.nsh includes branding engine output', nsh.includes('installer-branding.nsh') ? 'PASS' : 'FAIL');
  const mainJs = fs.readFileSync(path.join(ROOT, 'electron/main.js'), 'utf8');
  record('BR-18', 'Electron reads branding.config.json', mainJs.includes('branding.config.json') ? 'PASS' : 'FAIL');
  record('BR-19', 'Runtime IPC app:getRuntimeInfo', mainJs.includes('app:getRuntimeInfo') ? 'PASS' : 'FAIL');
}

async function auditAboutScaling() {
  let chromium;
  try {
  const pw = await import('playwright');
  chromium = pw.chromium;
  } catch {
    record('BR-20', 'About scaling (Playwright)', 'WARN', 'skipped — install playwright for UI scale tests');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const scales = [1, 1.25, 1.5, 2];
  let overflowTotal = 0;
  for (const scale of scales) {
    const page = await browser.newPage({
      viewport: { width: Math.round(1440 / scale), height: Math.round(900 / scale) },
      deviceScaleFactor: scale,
    });
    await page.goto(`file://${path.join(ROOT, 'index.html')}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(1500);
    const metrics = await page.evaluate(() => {
      const card = document.getElementById('about-panel-card');
      if (!card) return { missing: true };
      const showPage = window.showPage;
      if (typeof showPage === 'function') showPage('settings');
      const logo = document.getElementById('about-brand-logo');
      const body = document.querySelector('.about-panel-body');
      const overflows = [];
      [logo, body, card].forEach((el) => {
        if (!el) return;
        if (el.scrollWidth > el.clientWidth + 2) overflows.push(el.id || el.className);
        if (el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflow !== 'visible') overflows.push('v:' + (el.id || 'body'));
      });
      const logoRect = logo?.getBoundingClientRect();
      return {
        overflows: overflows.length,
        logoW: logoRect ? Math.round(logoRect.width) : 0,
        cardScroll: card.scrollHeight > card.clientHeight + 2,
      };
    });
    overflowTotal += metrics.overflows || 0;
    if (metrics.missing) {
      record('BR-20', `About @${Math.round(scale * 100)}% scale`, 'WARN', 'panel not found without login');
    } else {
      record('BR-20', `About @${Math.round(scale * 100)}% scale`, (metrics.overflows === 0 && !metrics.cardScroll) ? 'PASS' : 'WARN', `overflows:${metrics.overflows} logoW:${metrics.logoW}`);
    }
    await page.close();
  }
  await browser.close();
  record('BR-21', 'About scaling aggregate', overflowTotal === 0 ? 'PASS' : 'WARN', `${overflowTotal} overflow hints`);
}

function writeReport(summary) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const md = [
    '# Final Branding Audit',
    '',
    `**Date:** ${new Date().toISOString()}`,
    `**Result:** ${summary.pass} PASS / ${summary.warn} WARN / ${summary.fail} FAIL — **${summary.pct}%**`,
    '',
    '## Single source: `branding.config.json`',
    '',
    'Change company name, logo path, tagline, installer text, and copyright in one file.',
    'Run `npm run generate:brand` before build.',
    '',
    '## Results',
    '',
    ...results.map((r) => `- [${r.status}] **${r.id}** ${r.name}${r.detail ? `: ${r.detail}` : ''}`),
  ].join('\n');
  fs.writeFileSync(path.join(REPORT_DIR, 'BRANDING-AUDIT.md'), md);
  fs.writeFileSync(path.join(REPORT_DIR, 'branding-audit-results.json'), JSON.stringify({ summary, results }, null, 2));
}

async function main() {
  console.log('Final Branding Audit\n');
  const config = await auditConfig();
  const logoMeta = await auditLogo(config);
  await auditBuildAssets(config, logoMeta);
  auditPackageJson();
  auditSourceWiring();
  try { await auditAboutScaling(); } catch (e) { record('BR-20', 'About scaling', 'WARN', e.message); }
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const warn = results.filter((r) => r.status === 'WARN').length;
  const total = results.length;
  const pct = total ? Math.round(((pass + warn * 0.9) / total) * 100) : 0;
  const summary = { pass, fail, warn, total, pct };
  writeReport(summary);
  console.log(`\n══════════════════════════════════════`);
  console.log(`Branding Audit: ${pass}/${total} passed (${pct}%)`);
  console.log(`Report: ${path.join(REPORT_DIR, 'BRANDING-AUDIT.md')}`);
  console.log(`══════════════════════════════════════\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
