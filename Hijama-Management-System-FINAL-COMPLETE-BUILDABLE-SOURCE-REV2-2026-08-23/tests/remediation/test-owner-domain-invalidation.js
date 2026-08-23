#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const errors = [];
function check(ok, message) { if (!ok) errors.push(message); }

const sequence = [];
const users = [
  { id: 'owner-a', username: 'owner.a', fullName: 'Before', role: 'owner', active: true, password: 'hash-a' },
  { id: 'owner-b', username: 'owner.b', fullName: 'Second', role: 'owner', active: true, password: 'hash-b' },
];

const context = {
  console,
  users,
  currentUser: { id: 'owner-a', role: 'owner', active: true },
  DB: {
    get(key, fallback) { return key === 'users' ? context.users : fallback; },
    set(key, value) {
      check(key === 'users', 'Owner mutation must persist the users snapshot');
      check(context.users === value, 'Authoritative runtime users snapshot must be replaced before DB persistence');
      check(value.find((u) => u.id === 'owner-a')?.fullName === 'After', 'Persisted snapshot must contain the committed patch');
      sequence.push('persist');
    },
  },
  OwnerHub: {
    invalidateOwnerDomain(detail) {
      check(context.users.find((u) => u.id === 'owner-a')?.fullName === 'After', 'OwnerHub invalidation must observe committed authoritative state');
      check(detail?.type === 'update', 'OwnerHub invalidation must receive mutation detail');
      sequence.push('owner-domain-invalidation');
    },
    applyNavVisibility() { sequence.push('nav'); },
  },
  renderUsersList() { sequence.push('render-users'); },
  dispatchEvent(event) {
    check(event.type === 'tdw:owner-changed', 'Only compatibility owner-change notification may be dispatched');
    sequence.push('compatibility-event');
    return true;
  },
  CustomEvent: class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  },
  OwnerTrustedAuthority: { assertOwnerMutation() { return { ok: true }; } },
  OwnerProfile: { hasProfile() { return false; }, loadProfile() { return null; } },
  OwnerLifecycleAuthority: { assertOwnerCountInvariant() { return { ok: true }; } },
  LicenseCloud: { loadLocal() { return {}; } },
  Organization: { getId() { return 'ORG-1'; } },
  CenterId: { getStoredCenterId() { return 'ORG-1'; } },
  BranchScope: { applyDefaultScopeToUser(user) { user.branchScope = ['*']; } },
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'cloud', 'owner-management.js'), 'utf8'), context, { filename: 'owner-management.js' });

(async () => {
  const result = await context.OwnerManagement.updateOwner('owner-a', { fullName: 'After' });
  check(result?.ok, 'Owner update should succeed in an authorized fixture');
  check(sequence.join('|') === 'persist|owner-domain-invalidation|render-users|nav|compatibility-event',
    'Required ordering is persistence → domain invalidation → affected UI refresh → compatibility event; actual=' + sequence.join('|'));
  check(!fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8').includes("'tdw:owner-changed'"),
    'OwnerHub must not subscribe to the compatibility owner event as a refresh authority');

  if (errors.length) {
    console.error('FAIL: owner domain invalidation');
    errors.forEach((e) => console.error(' - ' + e));
    process.exit(1);
  }
  console.log('OK: owner mutation commits before domain-specific Hub invalidation and trailing compatibility notification');
})().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
