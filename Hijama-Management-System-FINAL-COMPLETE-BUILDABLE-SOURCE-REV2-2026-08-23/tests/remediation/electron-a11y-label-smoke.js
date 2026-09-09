'use strict';

const fs = require('fs');
const path = require('path');
const { _electron: electron } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const reportPath = path.join(root, 'audit-output', 'remediation-execution', 'electron-a11y-label-smoke.json');
const home = '/tmp/hijama-a11y-label-smoke';

function missingNamedControls() {
  const visible = (el) => {
    const style = getComputedStyle(el);
    return !!(el.offsetParent || style.position === 'fixed') && style.display !== 'none' && style.visibility !== 'hidden';
  };
  return [...document.querySelectorAll('input:not([type="hidden"]),select,textarea')]
    .filter((el) => visible(el) && !el.disabled)
    .filter((el) => !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.getAttribute('title'))
    .map((el) => ({ id: el.id || null, type: el.type || el.tagName.toLowerCase(), page: el.closest('.page')?.id || 'outside-page' }));
}

(async () => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.mkdirSync(home, { recursive: true });
  const app = await electron.launch({
    args: ['.'], cwd: root,
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local', 'share') },
  });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(2500);
    const initial = await page.evaluate(() => {
      const collectMissing = () => {
        const visible = (el) => {
          const style = getComputedStyle(el);
          return !!(el.offsetParent || style.position === 'fixed') && style.display !== 'none' && style.visibility !== 'hidden';
        };
        return [...document.querySelectorAll('input:not([type="hidden"]),select,textarea')]
          .filter((el) => visible(el) && !el.disabled)
          .filter((el) => !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.getAttribute('title'))
          .map((el) => ({ id: el.id || null, type: el.type || el.tagName.toLowerCase(), page: el.closest('.page')?.id || 'outside-page' }));
      };
      return { bound: window.UxA11y?.bindUnboundLabels?.(document) || 0, missing: collectMissing() };
    });
    const pages = ['page-daily', 'page-bookings', 'page-settings', 'page-reports'];
    const pageResults = {};
    for (const pageId of pages) {
      pageResults[pageId] = await page.evaluate((id) => {
        const current = document.querySelector('.page.active');
        current?.classList.remove('active');
        const target = document.getElementById(id);
        target?.classList.add('active');
        const bound = window.UxA11y?.bindUnboundLabels?.(target) || 0;
        const visible = (el) => {
          const style = getComputedStyle(el);
          return !!(el.offsetParent || style.position === 'fixed') && style.display !== 'none' && style.visibility !== 'hidden';
        };
        const missing = [...document.querySelectorAll('input:not([type="hidden"]),select,textarea')]
          .filter((el) => visible(el) && !el.disabled)
          .filter((el) => !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.getAttribute('title'))
          .map((el) => ({ id: el.id || null, type: el.type || el.tagName.toLowerCase(), page: el.closest('.page')?.id || 'outside-page' }))
          .filter((row) => row.page === id);
        return { bound, missing };
      }, pageId);
    }
    const report = { initial, pageResults };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (initial.missing.length) process.exit(1);
  } finally { await app.close(); }
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
