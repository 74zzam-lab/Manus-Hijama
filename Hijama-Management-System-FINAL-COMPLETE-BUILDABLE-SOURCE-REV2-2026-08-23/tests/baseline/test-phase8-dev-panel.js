#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'license', 'ui', 'developer-panel.js'), 'utf8');
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

check(src.includes('function buildDiagnosticsSnapshot()'), 'buildDiagnosticsSnapshot missing');
check(src.includes("id: 'snapshot'"), 'snapshot tool missing');
check(src.includes('function showDiagnosticsSnapshot()'), 'showDiagnosticsSnapshot missing');
check(src.includes('global.licDevDiagnosticsSnapshot = showDiagnosticsSnapshot;'), 'snapshot API export missing');
check(src.includes('integrityIssues') && src.includes('integrityWarnings'), 'integrity counters missing in diagnostics');

if (errors.length) {
  console.error('FAIL: phase8 dev panel');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: phase8 dev panel diagnostics snapshot checks');
