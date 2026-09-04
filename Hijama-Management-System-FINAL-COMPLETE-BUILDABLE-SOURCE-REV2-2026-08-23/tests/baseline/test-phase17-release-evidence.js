#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const script = fs.readFileSync(path.join(root, 'scripts', 'release-evidence-bundle.mjs'), 'utf8');
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

check(script.includes('const REQUIRED_ARTIFACTS = ['), 'required artifact manifest missing');
check(script.includes("crypto.createHash('sha256')"), 'sha256 hashing missing');
check(script.includes("fs.writeFileSync(path.join(REPORT_DIR, 'release-evidence-bundle.json')"), 'bundle json output missing');
check(script.includes("fs.writeFileSync(path.join(REPORT_DIR, 'RELEASE-EVIDENCE-REPORT.md')"), 'bundle markdown output missing');
check(script.includes("finalDecision: allPresent && blockingFails.length === 0 ? 'EVIDENCE_READY' : 'EVIDENCE_INCOMPLETE'"), 'final decision policy missing');

if (errors.length) {
  console.error('FAIL: phase17 release evidence');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: phase17 release evidence checks');
