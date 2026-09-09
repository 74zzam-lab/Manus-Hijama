#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const errors = [];

function check(ok, msg) {
  if (!ok) errors.push(msg);
}

const branchScopeSrc = fs.readFileSync(path.join(root, 'cloud', 'branch-scope.js'), 'utf8');
const conflictSrc = fs.readFileSync(path.join(root, 'cloud', 'conflict-queue.js'), 'utf8');
const repoSrc = fs.readFileSync(path.join(root, 'cloud', 'repository.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

check(branchScopeSrc.includes('function assertWriteAllowed(user, branchId, options)'), 'assertWriteAllowed missing');
check(branchScopeSrc.includes('function filterByUserScope(records, user)'), 'filterByUserScope missing');
check(branchScopeSrc.includes("error: 'branch_access_denied'"), 'branch_access_denied signal missing');
check(conflictSrc.includes('function listForUser(user, options)'), 'listForUser missing');
check(conflictSrc.includes("error: 'branch_access_denied'"), 'conflict resolve branch guard missing');
check(conflictSrc.includes('if (options.branchId) archive = archive.filter(x => x.branchId === options.branchId);'), 'history branch filter missing');
check(repoSrc.includes('assertWriteAllowed'), 'repository must enforce branch write guard');
check(/cloud\/branch-scope\.js/.test(html), 'branch-scope wired in index.html');
check(/cloud\/conflict-queue\.js/.test(html), 'conflict-queue wired in index.html');
check(/cloud\/repository\.js/.test(html), 'repository wired in index.html');
check(fs.existsSync(path.join(root, 'scripts', 'verify-cloud-v2.js')), 'verify-cloud-v2 script missing');
check(pkg.scripts?.['cloud:test'] === 'node scripts/verify-cloud-v2.js', 'cloud:test script missing');

const context = {
  console,
  sessionStorage: {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  },
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  },
  DB: {
    get(k, def) {
      try {
        const v = context.localStorage.getItem(k);
        return v ? JSON.parse(v) : def;
      } catch {
        return def;
      }
    },
    set(k, v) {
      context.localStorage.setItem(k, JSON.stringify(v));
    },
  },
  notify() {},
  currentUser: null,
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

function load(rel) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), context);
}

load('cloud/center-id.js');
load('cloud/branch-scope.js');
load('cloud/role-policy.js');
load('cloud/record-metadata.js');
load('cloud/merge-policy.js');
load('cloud/conflict-queue.js');
load('cloud/repository.js');

const BranchScope = context.BranchScope;
const ConflictQueue = context.ConflictQueue;
const RepositoryFactory = context.RepositoryFactory;

const reception = { id: '2', role: 'reception', username: 'rec', active: true, branchScope: ['BR-MAIN'] };
const hqAdmin = { id: '1', role: 'hq_admin', username: 'hq', active: true, branchScope: ['*'] };

check(BranchScope.userCanAccessBranch(reception, 'BR-MAIN'), 'reception should access BR-MAIN');
check(!BranchScope.userCanAccessBranch(reception, 'BR-JED'), 'reception must not access BR-JED');
check(BranchScope.userCanAccessBranch(hqAdmin, 'BR-JED'), 'hq_admin should access all branches');

const denied = BranchScope.assertWriteAllowed(reception, 'BR-JED', {});
check(!denied.ok && denied.error === 'branch_access_denied', 'write guard must deny out-of-scope branch');
const allowedTrusted = BranchScope.assertWriteAllowed(reception, 'BR-JED', { source: 'import' });
check(allowedTrusted.ok && allowedTrusted.skipped, 'trusted sync/import writes must remain allowed');

const mixed = [
  { id: 'a', branchId: 'BR-MAIN' },
  { id: 'b', branchId: 'BR-JED' },
];
const scoped = BranchScope.filterByUserScope(mixed, reception);
check(scoped.length === 1 && scoped[0].id === 'a', 'filterByUserScope must hide other branches');

const repo = RepositoryFactory.createRepository(
  RepositoryFactory.createLocalStorageAdapter(context.DB)
);
context.Repository = repo;
context.currentUser = reception;
const blockedUpsert = repo.upsert('bookings', {
  id: 'bk-1',
  branchId: 'BR-JED',
  status: 'pending',
});
check(!blockedUpsert.ok && blockedUpsert.error === 'branch_access_denied', 'repository upsert must enforce branch scope');

const localUpsert = repo.upsert('bookings', {
  id: 'bk-2',
  branchId: 'BR-MAIN',
  status: 'pending',
});
check(localUpsert.ok, 'repository upsert must allow in-scope branch');

ConflictQueue.enqueue({
  table: 'bookings',
  recordId: 'bk-x',
  branchId: 'BR-JED',
  local: { id: 'bk-x', name: 'L' },
  remote: { id: 'bk-x', name: 'R' },
  fields: ['name'],
});
ConflictQueue.enqueue({
  table: 'bookings',
  recordId: 'bk-y',
  branchId: 'BR-MAIN',
  local: { id: 'bk-y', name: 'L2' },
  remote: { id: 'bk-y', name: 'R2' },
  fields: ['name'],
});

const forReception = ConflictQueue.listForUser(reception, { status: 'pending' });
check(forReception.length === 1 && forReception[0].recordId === 'bk-y', 'conflict list must be branch-scoped for reception');
check(ConflictQueue.countPending({ branchId: 'BR-MAIN' }) === 1, 'countPending must honor branchId filter');

context.currentUser = hqAdmin;
const pendingJed = ConflictQueue.list({ status: 'pending', branchId: 'BR-JED' })[0];
check(!!pendingJed, 'admin can list other-branch conflicts');
const deniedResolveAsReception = (() => {
  context.currentUser = reception;
  return ConflictQueue.resolve(pendingJed.id, { choice: 'local' });
})();
check(!deniedResolveAsReception.ok && deniedResolveAsReception.error === 'manager_only', 'non-manager cannot resolve conflicts');

context.currentUser = { id: '9', role: 'admin', username: 'admin2', active: true, branchScope: ['BR-MAIN'] };
const deniedBranchResolve = ConflictQueue.resolve(pendingJed.id, { choice: 'local' });
check(!deniedBranchResolve.ok && deniedBranchResolve.error === 'branch_access_denied', 'manager cannot resolve out-of-scope branch conflict');

if (errors.length) {
  console.error('FAIL: phase18 multibranch cloud');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('OK: phase18 multibranch cloud checks');
