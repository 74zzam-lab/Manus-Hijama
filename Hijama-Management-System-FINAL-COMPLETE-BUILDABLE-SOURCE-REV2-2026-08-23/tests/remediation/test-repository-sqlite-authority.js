'use strict';

const assert = require('assert');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const rawWrites = [];
const raw = {
  get: (_key, def) => def,
  set: (key, value) => rawWrites.push({ key, value }),
};
const committed = Object.create(null);
const authoritativeWrites = [];

global.SqliteBridge = {
  getCommittedRaw: (key) => committed[key],
  setAuthoritative: async (key, value) => {
    committed[key] = value;
    authoritativeWrites.push({ key, value });
    return { ok: true, authoritative: true };
  },
  isOperationalKey: (key) => ['cases', '__tdw_repo_revisions__'].includes(key),
};
global.DB = raw;
global.Repository = null;

delete require.cache[require.resolve(path.join(root, 'cloud', 'repository.js'))];
delete require.cache[require.resolve(path.join(root, 'cloud', 'db-bridge.js'))];
require(path.join(root, 'cloud', 'repository.js'));
require(path.join(root, 'cloud', 'db-bridge.js'));

(async () => {
  global.DbBridge.install();
  assert.strictEqual(global.Repository.adapter.name, 'sqlite-authoritative', 'Repository must bind to SQLite authority after bridge install');
  const result = await global.DbBridge.set('cases', [{ id: 'C-1', branchId: 'BR-A' }]);
  assert.strictEqual(result.ok, true, 'authoritative set must resolve only after SQLite commit');
  assert.deepStrictEqual(committed.cases, [{ id: 'C-1', branchId: 'BR-A' }], 'SQLite authority must receive operational data');
  assert.ok(Object.prototype.hasOwnProperty.call(committed, '__tdw_repo_revisions__'), 'revisions must persist through SQLite authority');
  assert.deepStrictEqual(rawWrites, [], 'raw localStorage adapter must receive no operational writes');
  assert.deepStrictEqual(global.DbBridge.get('cases', []), [{ id: 'C-1', branchId: 'BR-A' }], 'read path must return authoritative committed data');

  const directSet = await global.Repository.setAll('cases', [{ id: 'C-2', branchId: 'BR-A' }]);
  assert.strictEqual(directSet.ok, true, 'direct Repository.setAll must return its authoritative SQLite commit');
  assert.deepStrictEqual(committed.cases, [{ id: 'C-2', branchId: 'BR-A' }], 'direct setAll must update SQLite only');

  const upsert = await global.Repository.upsert('cases', { id: 'C-3', branchId: 'BR-A' });
  assert.strictEqual(upsert.ok, true, 'direct Repository.upsert must await authoritative commit');
  assert.ok(committed.cases.some((row) => row.id === 'C-3'), 'upsert must commit to SQLite authority');

  const deleted = await global.Repository.delete('cases', 'C-3', { branchId: 'BR-A' });
  assert.strictEqual(deleted, true, 'direct Repository.delete must commit its tombstone through SQLite');
  assert.ok(committed.cases.some((row) => row.id === 'C-3' && row.deletedAt), 'delete must persist tombstone in SQLite authority');
  assert.deepStrictEqual(rawWrites, [], 'no direct Repository mutator may write raw localStorage after SQLite binding');
  console.log('PASS remediation:repository-sqlite-authority');
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
