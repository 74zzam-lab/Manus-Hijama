#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const firstRun = fs.readFileSync(path.join(root, 'cupping-first-run.js'), 'utf8');
const tour = fs.readFileSync(path.join(root, 'cupping-product-tour.js'), 'utf8');
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

check(firstRun.includes("logAudit('SETUP_WIZARD_PAUSE'"), 'wizard pause audit log missing');
check(firstRun.includes("logAudit('SETUP_WIZARD_SKIPPED'"), 'wizard skip audit log missing');
check(firstRun.includes("logAudit('SETUP_WIZARD_RESTART'"), 'wizard restart audit log missing');
check(firstRun.includes("notify('⚠️ اسم المستخدم مستخدم بالفعل'"), 'wizard duplicate username guard missing');

check(tour.includes("action: 'skip'"), 'tour skip action audit metadata missing');
check(tour.includes("action: 'complete'"), 'tour complete action audit metadata missing');
check(tour.includes("action: 'restart'"), 'tour restart action audit metadata missing');
check(tour.includes('tourStep: TOUR_STEPS.length - 1'), 'tour completion should persist final step');

if (errors.length) {
  console.error('FAIL: phase10 wizard-tour');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: phase10 wizard-tour hardening checks');
