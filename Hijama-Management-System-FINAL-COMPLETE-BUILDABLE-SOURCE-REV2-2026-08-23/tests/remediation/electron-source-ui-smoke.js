'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright');

(async () => {
  const projectRoot = path.join(__dirname, '..', '..');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-ui-smoke-'));
  const pageErrors = [];
  const consoleErrors = [];
  let app;
  try {
    app = await electron.launch({
      executablePath: require('electron'),
      args: [projectRoot],
      env: {
        ...process.env,
        HOME: profile,
        XDG_CONFIG_HOME: path.join(profile, 'config'),
        ELECTRON_ENABLE_LOGGING: '1',
      },
      timeout: 30000,
    });
    const page = await app.firstWindow({ timeout: 30000 });
    page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    await page.waitForTimeout(3000);
    const url = page.url();
    const bodyText = await page.locator('body').innerText({ timeout: 10000 });
    assert.ok(url.startsWith('file:'), `application must load local UI, got ${url}`);
    assert.ok(bodyText.length > 100, 'application window body must render meaningful content');
    assert.strictEqual(pageErrors.length, 0, `renderer page errors: ${pageErrors.join('\n')}`);
    console.log(JSON.stringify({ ok: true, url, bodyTextLength: bodyText.length, consoleErrors }, null, 2));
  } finally {
    try { await app?.close(); } catch { /* best effort */ }
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
