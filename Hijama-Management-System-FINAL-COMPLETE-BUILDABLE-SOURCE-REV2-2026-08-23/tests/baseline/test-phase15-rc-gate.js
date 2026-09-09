#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const rc = fs.readFileSync(path.join(root, 'scripts', 'rc-validation.mjs'), 'utf8');
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

check(rc.includes('const NON_BLOCKING_FAIL_IDS = new Set(['), 'non-blocking fail set missing');
check(rc.includes('function isBlockingFail(row)'), 'isBlockingFail helper missing');
check(rc.includes('const ready = blocking.length === 0;'), 'ready decision must use blocking fails');
check(rc.includes("rcDecision: (fpv?.results || []).some(isBlockingFail) ? 'BLOCKED' : 'READY_FOR_CODE_FREEZE'"), 'rc decision should use blocking fails only');
check(rc.includes('blockingFails: (fpv?.results || []).filter(isBlockingFail).map((r) => r.id),'), 'blocking fail ids must be exported');

if (errors.length) {
  console.error('FAIL: phase15 rc gate');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: phase15 rc gate checks');
