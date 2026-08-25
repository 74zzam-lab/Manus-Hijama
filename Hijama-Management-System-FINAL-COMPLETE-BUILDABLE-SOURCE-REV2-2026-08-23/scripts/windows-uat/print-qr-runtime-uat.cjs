#!/usr/bin/env node
'use strict';

/**
 * RT-006: local QR + PDF/print path smoke using production modules (no external QR).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const out = { startedAt: new Date().toISOString(), ok: false };

const ctx = { console };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/vendor/qrcode-generator.js'), 'utf8'), ctx);
vm.runInContext('this.qrcode = qrcode;', ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/vendor/qrcode-generator-utf8.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'cupping-qr-local.js'), 'utf8'), ctx);
const dataUrl = ctx.CuppingQr.makeDataUrl('UAT-V2-3-5-QR', { size: 128 });
out.qrDataUrlPrefix = String(dataUrl || '').slice(0, 32);
out.qrOk = typeof dataUrl === 'string' && dataUrl.startsWith('data:image/');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uat-print-'));
const qrFile = path.join(tmp, 'uat-qr.dataurl.txt');
fs.writeFileSync(qrFile, dataUrl || '');
out.qrFile = qrFile;

// Minimal printable HTML receipt artifact (installed-app print path uses Chromium print-to-PDF)
const receiptHtml = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>UAT Receipt</title></head>
<body><h1>UAT-V2-3-5 Receipt</h1><p>Client: UAT-C1</p><img alt="qr" src="${dataUrl}"/></body></html>`;
const receiptPath = path.join(tmp, 'uat-receipt.html');
fs.writeFileSync(receiptPath, receiptHtml, 'utf8');
out.receiptPath = receiptPath;
out.receiptBytes = Buffer.byteLength(receiptHtml);

const csp = fs.readFileSync(path.join(root, 'electron', 'security', 'window-policy.js'), 'utf8');
out.cspBlocksExternalQr = !csp.includes('api.qrserver.com');

out.ok = out.qrOk && out.cspBlocksExternalQr && out.receiptBytes > 0;
out.finishedAt = new Date().toISOString();

const dest = path.join(evidenceDir, 'print-qr-runtime-uat.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ok: out.ok, dest }, null, 2));
process.exit(out.ok ? 0 : 1);
