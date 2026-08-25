'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright');

(async () => {
  const root = path.join(__dirname, '..', '..');
  const asarPath = process.argv[2] || path.join(root, 'dist', 'win-unpacked', 'resources', 'app.asar');
  if (!fs.existsSync(asarPath)) throw new Error(`packaged_asar_missing:${asarPath}`);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tadawi-asar-smoke-'));
  let app;
  try {
    app = await electron.launch({
      args: [asarPath, `--user-data-dir=${userData}`, '--no-sandbox'],
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
      timeout: 30000,
    });
    const window = await app.firstWindow({ timeout: 30000 });
    const consoleErrors = [];
    window.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await window.waitForLoadState('domcontentloaded', { timeout: 30000 });
    const bodyTextLength = await window.locator('body').innerText().then((text) => text.length);
    if (bodyTextLength < 20) throw new Error('packaged_ui_body_empty');
    if (consoleErrors.length) throw new Error(`packaged_ui_console_errors:${consoleErrors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, mode: 'linux_electron_asar_smoke', asarPath, url: window.url(), bodyTextLength, consoleErrors }, null, 2));
  } finally {
    if (app) await app.close().catch(() => {});
    fs.rmSync(userData, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
