#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8');
const errors = [];
function check(ok, msg) { if (!ok) errors.push(msg); }

check(src.includes('async function renameDevice('), 'renameDevice missing');
check(src.includes('async function disableDevice('), 'disableDevice missing');
check(src.includes('async function deleteDevice('), 'deleteDevice missing');
check(src.includes('async function addBranch('), 'addBranch missing');
check(src.includes("source: 'owner_hub'"), 'addBranch must enroll via owner_hub source');
check(src.includes('BranchEnrollment.enrollBranch'), 'addBranch must use BranchEnrollment');
check(src.includes('async function renameBranch('), 'renameBranch missing');
check(src.includes('async function disableBranch('), 'disableBranch missing');
check(src.includes('async function deleteBranch('), 'deleteBranch missing');
check(src.includes('requireOwnerManage('), 'owner manage gate missing');
check(src.includes("action: 'DEVICE_RENAMED'"), 'device rename audit missing');
check(src.includes("action: 'DEVICE_DISABLED'"), 'device disable audit missing');
check(src.includes("action: 'DEVICE_DELETED'"), 'device delete audit missing');
check(src.includes("action: 'BRANCH_ADDED'"), 'branch added audit missing');
check(src.includes("action: 'BRANCH_RENAMED'"), 'branch renamed audit missing');
check(src.includes("action: 'BRANCH_DISABLED'"), 'branch disable audit missing');
check(src.includes("action: 'BRANCH_DELETED'"), 'branch delete audit missing');
check(src.includes('OwnerHub.promptAddBranch()'), 'Owner hub add branch button missing');
check(src.includes('OwnerHub.promptRenameDevice('), 'Owner hub device actions UI missing');

if (errors.length) {
  console.error('FAIL: phase27 owner hub controls');
  for (const err of errors) console.error(' -', err);
  process.exit(1);
}
console.log('OK: phase27 owner hub controls checks');
