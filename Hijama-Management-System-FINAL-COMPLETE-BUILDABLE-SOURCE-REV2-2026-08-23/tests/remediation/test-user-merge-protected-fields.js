'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'cloud', 'table-merge-policy.js'), 'utf8');
const sandbox = {
  globalThis: {},
  MergePolicy: {
    ACTIONS: { SKIP: 'skip', PUSH: 'push', PULL: 'pull', MERGE: 'merge', CONFLICT: 'conflict' },
    compareRevision: (local, remote) => Number(local.revision || 0) - Number(remote.revision || 0),
    isIdentical: () => false,
  },
};
sandbox.window = sandbox.globalThis;
vm.runInNewContext(source, sandbox, { filename: 'table-merge-policy.js' });
const policy = sandbox.globalThis.TableMergePolicy;
const base = {
  id: 'U-1', username: 'owner', fullName: 'Owner', password: 'hash-a', role: 'owner', active: true,
  branchScope: ['BR-A'], permissions: { users: 'manage' }, credentialRevision: 3, passwordChangedAt: '2026-01-01T00:00:00Z', revision: 10,
};
for (const field of ['password', 'role', 'active', 'branchScope', 'permissions', 'credentialRevision', 'passwordChangedAt']) {
  const remote = { ...base, revision: 99 };
  remote[field] = field === 'active' ? false : field === 'branchScope' ? ['BR-B'] : field === 'permissions' ? { users: 'read' } : `${String(base[field])}-changed`;
  const result = policy.decideForTable('users', base, remote);
  assert.strictEqual(result.action, 'conflict', `${field} divergence must not auto-merge`);
  assert.strictEqual(result.reason, 'protected_field');
  assert.ok(result.fields.includes(field));
}
console.log('PASS remediation:user-merge-protected-fields');
