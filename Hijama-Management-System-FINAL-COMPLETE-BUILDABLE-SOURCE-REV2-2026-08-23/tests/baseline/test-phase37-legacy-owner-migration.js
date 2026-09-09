#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const migrationSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-migration.js'), 'utf8');
const hubSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8');
const errors = [];
function check(ok, msg) { if (!ok) errors.push(msg); }

const mem = new Map();
const adminUser = { id: 'u-admin', username: 'owner-legacy', role: 'admin', active: true };
const sandbox = {
  console,
  currentUser: adminUser,
  users: [adminUser],
  DB: {
    get(k, d) { return mem.has(k) ? mem.get(k) : d; },
    set(k, v) { mem.set(k, v); }
  },
  RolePolicy: {
    hasManagerAccount: () => true,
    isManager: (u) => !!(u && (u.role === 'admin' || u.role === 'owner' || u.role === 'hq_admin'))
  },
  LicenseCloud: { loadLocal: () => ({ activation: { consumed: true } }) },
  OwnerProfile: {
    hasProfile: () => false,
    async createProfile({ username }) { return { ok: true, profile: { username } }; }
  },
  OwnerSetupState: { clearRequired() {} },
  licLoadMeta: () => ({ activationConsumed: true }),
  prompt: (() => {
    const queue = ['owner-legacy', 'pass123', 'rcv123'];
    return () => queue.shift() || '';
  })(),
  async tdwAskText({ message } = {}) {
    if (/Recovery/i.test(String(message || ''))) return 'rcv123';
    if (/كلمة مرور|password/i.test(String(message || ''))) return 'pass123';
    return 'owner-legacy';
  },
  async tdwAskPassword() { return 'pass123'; },
  AuditLogger: { log() {} }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

try { vm.runInNewContext(migrationSrc, sandbox, { timeout: 1000 }); } catch (e) { errors.push('owner-migration eval failed: ' + e.message); }

check(!!sandbox.OwnerMigration, 'OwnerMigration missing');
check(sandbox.OwnerMigration.shouldMigrate() === true, 'shouldMigrate should be true for legacy consumed license');

async function run() {
  const res = await sandbox.OwnerMigration.runInteractiveMigration();
  check(res.ok === true, 'interactive migration should succeed');
  const status = sandbox.OwnerMigration.getStatus();
  check(status.completed === true, 'status.completed should be true after migration');
  check(status.needsMigration === false, 'needsMigration should be false after completion');
  check(sandbox.users[0].role === 'owner', 'migration must promote user role to owner');
  check(typeof sandbox.OwnerMigration.promoteUserToOwnerRole === 'function', 'promoteUserToOwnerRole missing');
  check(hubSrc.includes('OwnerHub.runLegacyOwnerMigration()'), 'OwnerHub run migration action missing');
  check(hubSrc.includes('OwnerHub.skipLegacyOwnerMigration()'), 'OwnerHub skip migration action missing');
  check(hubSrc.includes('requireOwnerBootstrap'), 'OwnerHub bootstrap gate missing');

  if (errors.length) {
    console.error('FAIL: phase37 legacy owner migration');
    for (const err of errors) console.error(' -', err);
    process.exit(1);
  }
  console.log('OK: phase37 legacy owner migration checks');
}

run();
