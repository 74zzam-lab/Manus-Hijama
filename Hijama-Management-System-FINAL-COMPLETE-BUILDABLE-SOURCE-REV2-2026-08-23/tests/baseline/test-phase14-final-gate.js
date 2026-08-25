#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const fpv = fs.readFileSync(path.join(root, 'scripts', 'fpv-final-production-validation.mjs'), 'utf8');
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

check(fpv.includes('const NON_BLOCKING_FAIL_IDS = new Set(['), 'non-blocking fail set missing');
check(fpv.includes('function isBlockingFail(row)'), 'isBlockingFail helper missing');
check(fpv.includes("record('14 — Final', 'FN-03', 'Zero blocking FAIL across FPV'"), 'FN-03 final gate record missing');
check(fpv.includes('const blockingFailCount = results.filter(isBlockingFail).length;'), 'blocking fail count missing');
check(fpv.includes('process.exit(blockingFailCount > 0 ? 1 : 0);'), 'process exit should depend on blocking fails');

if (errors.length) {
  console.error('FAIL: phase14 final gate');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: phase14 final gate checks');
