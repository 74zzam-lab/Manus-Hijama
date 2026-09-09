'use strict';

const assert = require('assert');
const path = require('path');
const modulePath = path.join(__dirname, '..', '..', 'cloud', 'auth-credential-truth.js');

function loadTruth() {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

global.cuppingElectron = { database: {} };
global.tadawi = null;
global.users = [{ id: 'memory-owner', role: 'owner', active: true }];
global.DB = { get: () => [{ id: 'raw-owner', role: 'owner', active: true }] };
global.SqliteBridge = { getCommittedRaw: () => [{ id: 'sqlite-owner', role: 'owner', active: true }] };
let truth = loadTruth();
assert.deepStrictEqual(truth.readAuthoritativeUsers().map((u) => u.id), ['sqlite-owner'], 'Electron must use committed SQLite users only');

global.SqliteBridge = { getCommittedRaw: () => undefined };
global.users = [{ id: 'forged-memory-owner', role: 'owner', active: true }];
truth = loadTruth();
assert.deepStrictEqual(truth.readAuthoritativeUsers(), [], 'Electron must fail closed when authoritative SQLite users are unavailable');

console.log('PASS remediation:auth-credential-authority');
