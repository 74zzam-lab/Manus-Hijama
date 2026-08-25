#!/usr/bin/env node
'use strict';

/**
 * Phase-2 security posture snapshot (replaces Phase-1 sandbox:false expectation).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const mainSrc = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
const preloadSrc = fs.readFileSync(path.join(root, 'electron', 'preload.js'), 'utf8');
const policySrc = fs.readFileSync(path.join(root, 'electron', 'security', 'window-policy.js'), 'utf8');
const errors = [];

function mustInclude(src, needle, label) {
  if (!src.includes(needle)) errors.push(`missing ${label}: ${needle}`);
}

mustInclude(policySrc, 'contextIsolation: true', 'contextIsolation');
mustInclude(policySrc, 'nodeIntegration: false', 'nodeIntegration');
mustInclude(policySrc, 'sandbox: sandbox !== false', 'sandbox_default_true');
mustInclude(policySrc, 'webSecurity: true', 'webSecurity');
mustInclude(mainSrc, 'sandbox: true', 'sandbox_true_callsite');
mustInclude(preloadSrc, 'contextBridge.exposeInMainWorld', 'contextBridge');
mustInclude(preloadSrc, "exposeInMainWorld('cuppingElectron'", 'cuppingElectron_api');
mustInclude(preloadSrc, "exposeInMainWorld('tadawi'", 'tadawi_api');

if (/nodeIntegration:\s*true/.test(mainSrc) || /nodeIntegration:\s*true/.test(policySrc)) {
  errors.push('nodeIntegration_true_found');
}
if (/sandbox:\s*false/.test(mainSrc)) errors.push('sandbox_false_still_present');

if (/exposeInMainWorld\(['"]ipcRenderer/.test(preloadSrc)) {
  errors.push('raw_ipcRenderer_exposed');
}
if (preloadSrc.includes('invoke: (channel') || preloadSrc.includes('invoke:(channel')) {
  errors.push('generic_invoke_api');
}

if (errors.length) {
  console.error('FAIL: electron security baseline');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: electron security baseline snapshot');
console.log('  contextIsolation=true nodeIntegration=false sandbox=true webSecurity=true');
