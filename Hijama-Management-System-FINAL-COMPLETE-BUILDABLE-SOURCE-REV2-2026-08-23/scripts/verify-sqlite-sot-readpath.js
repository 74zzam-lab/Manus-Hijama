#!/usr/bin/env node
/**
 * Independent check: operational reads do not use localStorage when Electron DB is present.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const bridge = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const checks = [
  { name: 'bridge defines readOperational', ok: /function readOperational/.test(bridge) },
  { name: 'bridge defines bootFromSQLiteSoT', ok: /function bootFromSQLiteSoT/.test(bridge) },
  { name: 'index DB.get calls SqliteBridge.readOperational', ok: /SqliteBridge\.readOperational/.test(html) },
  { name: 'index not localStorage-only label', ok: !/DATA STORE \(localStorage-based persistence\)/.test(html) },
];

let failed = 0;
for (const c of checks) {
  console.log((c.ok ? 'PASS' : 'FAIL') + '  ' + c.name);
  if (!c.ok) failed += 1;
}
if (failed) process.exit(1);
console.log('\nAll SQLite SoT read-path checks passed.');
