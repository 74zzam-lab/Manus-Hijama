'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function loadQrGlobals() {
  const ctx = { console };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const gen = fs.readFileSync(path.join(ROOT, 'assets/vendor/qrcode-generator.js'), 'utf8');
  const utf8 = fs.readFileSync(path.join(ROOT, 'assets/vendor/qrcode-generator-utf8.js'), 'utf8');
  const helper = fs.readFileSync(path.join(ROOT, 'cupping-qr-local.js'), 'utf8');
  vm.runInContext(gen, ctx);
  vm.runInContext('this.qrcode = qrcode;', ctx);
  vm.runInContext(utf8, ctx);
  vm.runInContext(helper, ctx);
  return ctx;
}

describe('Local QR generation', () => {
  test('vendor files exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'assets/vendor/qrcode-generator.js'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'assets/vendor/qrcode-generator-utf8.js'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'cupping-qr-local.js'))).toBe(true);
  });

  test('no api.qrserver.com in runtime sources', () => {
    const files = [
      'index.html',
      'cupping-simplified-tax-invoice.js',
      'cupping-client-file.js',
      'cupping-qr-local.js',
    ];
    files.forEach((rel) => {
      const txt = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(txt).not.toContain('api.qrserver.com');
    });
  });

  test('CuppingQr produces CSP-safe data URL', () => {
    const ctx = loadQrGlobals();
    expect(ctx.CuppingQr.isAvailable()).toBe(true);
    const url = ctx.CuppingQr.makeDataUrl('https://wa.me/966500000000', { size: 108, ecc: 'M' });
    expect(url.startsWith('data:image/')).toBe(true);
    expect(url).not.toContain('https://');
    expect(url.length).toBeGreaterThan(200);
  });

  test('ZATCA-like base64 payload encodes', () => {
    const ctx = loadQrGlobals();
    const payload = Buffer.from('TLV-TEST-PAYLOAD').toString('base64');
    const url = ctx.CuppingQr.makeDataUrl(payload, { size: 192, ecc: 'M' });
    expect(url.startsWith('data:image/')).toBe(true);
  });

  test('index loads local QR scripts before tax invoice module', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const iVendor = html.indexOf('assets/vendor/qrcode-generator.js');
    const iHelper = html.indexOf('cupping-qr-local.js');
    const iTax = html.indexOf('cupping-simplified-tax-invoice.js');
    expect(iVendor).toBeGreaterThan(-1);
    expect(iHelper).toBeGreaterThan(iVendor);
    expect(iTax).toBeGreaterThan(iHelper);
  });

  test('thermalQrImageUrl uses CuppingQr', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(html).toContain('function thermalQrImageUrl');
    expect(html).toContain('CuppingQr.makeDataUrl');
  });

  test('CSP still allows data images only (no qrserver host)', () => {
    const csp = fs.readFileSync(path.join(ROOT, 'electron/security/window-policy.js'), 'utf8');
    expect(csp).toMatch(/img-src\s+'self'\s+data:\s+blob:/);
    expect(csp).not.toContain('api.qrserver.com');
  });
});
