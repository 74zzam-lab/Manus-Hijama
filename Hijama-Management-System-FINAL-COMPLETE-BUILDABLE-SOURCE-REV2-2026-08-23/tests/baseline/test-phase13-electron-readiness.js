#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const main = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

// Main-process handlers that are key for Electron-only checklist items.
check(main.includes("handle('devices:printThermal'"), 'main missing devices:printThermal handler');
check(main.includes("handle('devices:printA4'"), 'main missing devices:printA4 handler');
check(main.includes("handle('devices:exportA4Pdf'"), 'main missing devices:exportA4Pdf handler');
check(main.includes("handle('backup:uploadDbBackup'"), 'main missing backup:uploadDbBackup handler');
check(main.includes("handle('backup:restoreDbBackup'"), 'main missing backup:restoreDbBackup handler');
check(main.includes("handle('app:getRuntimeInfo'"), 'main missing app:getRuntimeInfo handler');

// Preload allowlist + typed APIs.
check(preload.includes("'devices:printThermal'"), 'preload allowlist missing devices:printThermal');
check(preload.includes("'devices:printA4'"), 'preload allowlist missing devices:printA4');
check(preload.includes("'devices:exportA4Pdf'"), 'preload allowlist missing devices:exportA4Pdf');
check(preload.includes("'backup:uploadDbBackup'"), 'preload allowlist missing backup:uploadDbBackup');
check(preload.includes("'backup:restoreDbBackup'"), 'preload allowlist missing backup:restoreDbBackup');
check(preload.includes("getRuntimeInfo: () => invoke('app:getRuntimeInfo')"), 'preload app.getRuntimeInfo bridge missing');

// Renderer hooks used in manual Electron checks.
check(html.includes('async function printThermalDoc('), 'renderer missing printThermalDoc helper');
check(html.includes('HardwareBridge.printA4('), 'renderer missing A4 print path');
check(html.includes('MonthlyArchive.openModal()'), 'renderer missing monthly archive entrypoint');
check(html.includes('openLicenseScreen('), 'renderer missing license management entrypoint');

if (errors.length) {
  console.error('FAIL: phase13 electron readiness');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: phase13 electron readiness structural checks');
