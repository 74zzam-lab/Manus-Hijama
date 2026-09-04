'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const sourcePath = path.join(root, 'cloud', 'drive-adapter.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const context = { globalThis: null, console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: sourcePath });

(async () => {
  const upload = await context.DriveAdapter.uploadVersions('CENTER-A', { branches: {} });
  assert.strictEqual(upload.ok, false);
  assert.strictEqual(upload.error, 'branch_context_required', 'version upload requires an explicit trusted branch');

  const conditional = await context.DriveAdapter.uploadVersionsConditional('CENTER-A', { branches: {} });
  assert.strictEqual(conditional.ok, false);
  assert.strictEqual(conditional.error, 'branch_context_required', 'conditional version upload requires an explicit trusted branch');

  const download = await context.DriveAdapter.downloadVersions('CENTER-A');
  assert.strictEqual(download.ok, false);
  assert.strictEqual(download.error, 'branch_context_required', 'version download requires an explicit trusted branch');

  context.BranchScope = { getActiveBranchId: () => 'BR-A' };
  assert(!/getActiveBranchId\?\.\(\)\s*\|\|\s*'BR-MAIN'/.test(source), 'drive adapter must not retain an implicit BR-MAIN fallback');
  console.log('PASS remediation:drive-adapter-branch-context-truth');
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
