#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'cloud', 'boot-flow-ui.js'), 'utf8');
const form = fs.readFileSync(path.join(root, 'cloud', 'owner-create-form.js'), 'utf8');
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

check(src.includes('function ownerSetupRequirementMet()'), 'ownerSetupRequirementMet helper missing');
check(src.includes("case 'owner': return ownerSetupRequirementMet();"), 'owner step must enforce owner password profile');
check(src.includes('function hasOwnerPasswordAccount()'), 'hasOwnerPasswordAccount required');
check(src.includes('OwnerCreateForm'), 'boot must use OwnerCreateForm');
check(form.includes('MIN_PASSWORD_LENGTH = 8'), 'owner form min password 8');
check(form.includes('password_required') || form.includes('owner_password_required'), 'empty password rejected');
check(src.includes('owner_required_during_activation') || fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8').includes('owner_required_during_activation'), 'skip blocked during activation');

if (errors.length) {
  console.error('FAIL: phase25 owner setup gate');
  for (const err of errors) console.error(' -', err);
  process.exit(1);
}

console.log('OK: phase25 owner setup gate checks');
