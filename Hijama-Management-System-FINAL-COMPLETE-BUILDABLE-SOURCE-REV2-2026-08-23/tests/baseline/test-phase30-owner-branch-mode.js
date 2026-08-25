#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const modeSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-branch-mode.js'), 'utf8');
const hubSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8');
const errors = [];
function check(ok, msg) { if (!ok) errors.push(msg); }

const session = new Map();
const sandbox = {
  console,
  currentUser: { role: 'owner' },
  RolePolicy: { isOrganizationOwner: (u) => !!u && u.role === 'owner' },
  BranchScope: {
    _active: 'BR-MAIN',
    setActiveBranchId(b) { this._active = b; },
    initSessionBranch() { this._active = 'BR-MAIN'; }
  },
  sessionStorage: {
    getItem(k) { return session.has(k) ? session.get(k) : null; },
    setItem(k, v) { session.set(k, v); },
    removeItem(k) { session.delete(k); }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

try { vm.runInNewContext(modeSrc, sandbox, { timeout: 1000 }); } catch (e) { errors.push('owner-branch-mode eval failed: ' + e.message); }

const M = sandbox.OwnerBranchMode || {};
check(typeof M.enterBranchMode === 'function', 'enterBranchMode missing');
check(typeof M.exitToOwnerMode === 'function', 'exitToOwnerMode missing');
check(M.getMode() === 'owner', 'default mode should be owner');
const enter = M.enterBranchMode('BR-002');
check(enter.ok === true, 'enter branch mode should succeed');
check(M.getMode() === 'branch' && M.getBranchId() === 'BR-002', 'branch mode state mismatch');
check(sandbox.BranchScope._active === 'BR-002', 'active branch should switch in branch mode');
const exit = M.exitToOwnerMode();
check(exit.ok === true, 'exit owner mode should succeed');
check(M.getMode() === 'owner', 'mode should return owner');
check(sandbox.BranchScope._active === 'BR-MAIN', 'active branch should reset after exit');

check(hubSrc.includes('OwnerHub.enterBranchMode(') || hubSrc.includes('enterBranchMode(branchId)'), 'OwnerHub branch mode integration missing');
check(hubSrc.includes('OwnerHub.exitToOwnerMode()') || hubSrc.includes('exitToOwnerMode()'), 'OwnerHub owner mode return integration missing');

if (errors.length) {
  console.error('FAIL: phase30 owner branch mode');
  for (const err of errors) console.error(' -', err);
  process.exit(1);
}
console.log('OK: phase30 owner branch mode checks');
