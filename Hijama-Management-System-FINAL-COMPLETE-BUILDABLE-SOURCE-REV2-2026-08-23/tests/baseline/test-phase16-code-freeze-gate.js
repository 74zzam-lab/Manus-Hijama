#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const gate = fs.readFileSync(path.join(root, 'scripts', 'code-freeze-gate.mjs'), 'utf8');
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

check(gate.includes("const ELECTRON_MANUAL_ITEMS = ["), 'manual checklist inventory missing');
check(gate.includes("rcDecision: decision,"), 'rc decision propagation missing');
check(gate.includes("finalDecision: rcReady ? 'READY_PENDING_MANUAL_ELECTRON' : 'BLOCKED'"), 'final decision policy missing');
check(gate.includes("fs.writeFileSync(path.join(REPORT_DIR, 'code-freeze-results.json')"), 'freeze json output missing');
check(gate.includes('if (rcExit !== 0 || !result.rcReady) {'), 'exit policy should block when rc not ready');

if (errors.length) {
  console.error('FAIL: phase16 code freeze gate');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: phase16 code freeze gate checks');
