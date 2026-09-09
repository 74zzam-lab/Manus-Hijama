'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const sourcePath = path.join(root, 'cloud', 'record-metadata.js');
const source = fs.readFileSync(sourcePath, 'utf8');

const context = { globalThis: null, console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: sourcePath });

const Metadata = context.RecordMetadata;
assert.strictEqual(Metadata.getBranchId(), null, 'missing trusted branch context must resolve to null, not BR-MAIN');

const unscoped = Metadata.stampNew({ id: 'unscoped' }, {});
assert.strictEqual(unscoped.branchId, null, 'unscoped record must not receive a silent main-branch identity');
const unscopedValidation = Metadata.validate(unscoped);
assert.strictEqual(unscopedValidation.ok, false, 'unscoped record must fail metadata validation');
assert(unscopedValidation.missing.includes('branchId'));

const explicit = Metadata.stampNew({ id: 'explicit' }, { branchId: 'BR-A' });
assert.strictEqual(explicit.branchId, 'BR-A', 'explicit trusted branch must still be stamped');
assert.strictEqual(Metadata.validate(explicit).ok, true);

assert(!/\|\|\s*'BR-MAIN'/.test(source), 'record metadata must not contain an implicit BR-MAIN fallback');
console.log('PASS remediation:record-metadata-branch-truth');
