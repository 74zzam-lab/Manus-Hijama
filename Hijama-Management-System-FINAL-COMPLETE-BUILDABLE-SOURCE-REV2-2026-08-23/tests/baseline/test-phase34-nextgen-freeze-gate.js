#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..', '..');
const gate = path.join(root, 'scripts', 'verify-nextgen-gate.js');
const r = spawnSync(process.execPath, [gate], { cwd: root, encoding: 'utf8', env: process.env });

if (r.status !== 0) {
  console.error('FAIL: phase34 nextgen freeze gate');
  const out = (r.stderr || r.stdout || '').trim();
  if (out) console.error(out);
  process.exit(1);
}

console.log('OK: phase34 nextgen freeze gate checks');
