'use strict';

const assert = require('assert');
const path = require('path');
const modulePath = path.join(__dirname, '..', '..', 'cloud', 'config-layer.js');

let writes = [];
let failWrites = false;
global.Repository = {
  adapter: { authoritative: true },
  get: (table) => table === 'users' ? [] : [],
  setAll: async (table, value, options) => {
    writes.push({ table, value, options });
    return failWrites ? { ok: false, error: 'simulated_sqlite_failure' } : { ok: true, authoritative: true };
  },
};
global.DB = { get: (_key, def) => def, set: () => ({ ok: true }) };
global.RecordMerger = {
  mergeRecords: (_local, remote) => ({ merged: remote, hasConflict: false, conflicts: [], stats: {} }),
};
global.SettingsSplit = {
  extractBranchSettings: (s) => s || {},
  extractPrices: (s) => s || {},
  filterUsersForBranch: (users) => users,
};
global.settings = { centerName: 'Clinic A' };
global.users = [];
global.VersionsIndex = { bumpConfig: () => {} };

delete require.cache[require.resolve(modulePath)];
require(modulePath);

(async () => {
  const ok = await global.ConfigLayer.importBranchPack({ branchId: 'BR-A', users: [{ id: 'U-1', username: 'owner_a' }] }, { branchId: 'BR-A' });
  assert.strictEqual(ok.ok, true, 'authoritative config import must resolve only after SQLite commit');
  assert.strictEqual(writes.length, 1, 'users import must make one repository commit');
  assert.strictEqual(writes[0].table, 'users');

  failWrites = true;
  const failed = await global.ConfigLayer.importBranchPack({ branchId: 'BR-A', services: [{ id: 'S-1' }] }, { branchId: 'BR-A' });
  assert.strictEqual(failed.ok, false, 'authoritative config import must expose SQLite commit failure');
  assert.strictEqual(failed.error, 'simulated_sqlite_failure');
  console.log('PASS remediation:config-authoritative-commit');
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
