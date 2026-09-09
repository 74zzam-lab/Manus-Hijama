'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const sourcePath = path.join(root, 'cloud', 'sync-engine.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const context = {
  globalThis: null,
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: sourcePath });

assert.strictEqual(context.SyncEngine.getBranchId(), null, 'sync without trusted branch context must not default to BR-MAIN');
context.BranchScope = { getActiveBranchId: () => 'BR-A' };
assert.strictEqual(context.SyncEngine.getBranchId(), 'BR-A', 'active trusted branch remains valid');
assert.strictEqual(context.SyncEngine.getBranchId('BR-B'), 'BR-B', 'explicit branch remains valid');
assert(!/getActiveBranchId\?\.\(\)\s*\|\|\s*'BR-MAIN'/.test(source), 'sync resolver must not retain an implicit BR-MAIN fallback');
console.log('PASS remediation:sync-branch-context-truth');
