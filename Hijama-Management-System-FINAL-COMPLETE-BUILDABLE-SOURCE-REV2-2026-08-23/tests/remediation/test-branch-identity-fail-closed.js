'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const branchSlice = require('../../database/repositories/branch-slice');

assert.throws(
  () => branchSlice.normalizeBranchId(''),
  (error) => error?.code === 'branch_id_required',
  'operational branch access must not silently default to BR-MAIN'
);
assert.strictEqual(branchSlice.recordMatchesBranch({ branchId: null }, 'BR-MAIN'), false, 'legacy null branch is not a silent BR-MAIN membership');

const db = {
  prepare: () => ({
    get: () => ({ branch_id: 'BR-A', payload_json: JSON.stringify({ id: 'same-id', branchId: 'BR-A' }) }),
  }),
};
assert.throws(
  () => branchSlice.assertNoBranchIdCollision(db, 'clients', 'same-id', 'BR-B'),
  (error) => error?.code === 'branch_id_collision' && error.existingBranchId === 'BR-A',
  'same record ID in a different branch must be rejected rather than overwrite'
);
const orchestratorSource = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'upgrade-migration-orchestrator.js'), 'utf8');
assert.match(orchestratorSource, /'employees'/, 'branch upgrade must include employees with branch_id');
assert.match(orchestratorSource, /SELECT id, payload_json FROM attendance/, 'branch upgrade must inspect attendance payload branch identity');
assert.match(orchestratorSource, /payload\.branchId = defaultBranch/, 'single-branch migration must stamp legacy attendance deterministically');
console.log('PASS remediation:branch-identity-fail-closed');
