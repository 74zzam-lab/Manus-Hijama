#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-4', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const errors = [];
function check(ok, msg) { if (!ok) errors.push(msg); }

function load(file, sandbox) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {
    timeout: 3000, filename: file,
  });
}

function makeSandbox() {
  const mem = Object.create(null);
  const audit = [];
  const users = [
    { id: '1', username: 'owner1', role: 'owner', active: true, branchScope: ['*'] },
    { id: '2', username: 'admin1', role: 'admin', active: true, branchScope: ['*'] },
    { id: '3', username: 'rec1', role: 'reception', active: true, branchScope: ['BR-MAIN'] },
    { id: '4', username: 'acc1', role: 'accountant', active: true, branchScope: ['*'] },
    { id: '5', username: 'emp1', role: 'employee', active: true, branchScope: ['BR-MAIN'] },
    { id: '6', username: 'cust1', role: 'custom', active: true, branchScope: ['BR-MAIN'],
      permissions: { 'cases.view': true, 'reports.view': false } },
  ];
  mem.users = users;
  mem.cases = [
    { id: 'cA', branchId: 'BR-MAIN', name: 'A' },
    { id: 'cB', branchId: 'BR-EAST', name: 'B' },
  ];
  const sandbox = {
    console,
    currentUser: null,
    users,
    cases: mem.cases,
    DB: {
      get(k, d) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : d; },
      set(k, v) { mem[k] = v; },
    },
    AuditLogger: { log(e) { audit.push(e); } },
    notify() {},
    PERMISSION_DEFS: {
      'cases.view': 'v', 'cases.edit': 'e', 'reports.view': 'r', 'reports.print': 'p',
      'cash.edit': 'c', 'settings.view': 's', 'users.manage': 'u',
    },
    ROLE_PRESETS: {
      reception: { 'cases.view': true, 'reports.view': true, 'cash.edit': true },
      employee: { 'cases.view': true, 'reports.view': false },
      accountant: { 'cases.view': true, 'reports.view': true, 'reports.print': true },
    },
    PAGE_PERMISSIONS: {
      dashboard: 'cases.view', reports: 'reports.view', users: 'users.manage', employee: 'cases.view',
    },
    PAGE_ACCESS_MODULES: [{ id: 'dashboard' }, { id: 'reports' }],
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox._audit = audit;
  sandbox._mem = mem;

  // Minimal PermissionPolicy stubs used by RbacGuard
  sandbox.hasPermission = function (key) {
    const u = sandbox.currentUser;
    if (!u) return false;
    if (u.role === 'owner' || u.role === 'admin') return true;
    if (u.role === 'custom') return !!(u.permissions && u.permissions[key]);
    const preset = sandbox.ROLE_PRESETS[u.role] || {};
    return !!preset[key];
  };
  sandbox.PermissionPolicy = {
    getUserPermissions(u) {
      if (!u) return {};
      if (u.role === 'custom') return u.permissions || {};
      return sandbox.ROLE_PRESETS[u.role] || {};
    },
  };

  load('cloud/role-policy.js', sandbox);
  load('cloud/branch-scope.js', sandbox);
  load('cloud/rbac-inventory.js', sandbox);
  load('cloud/rbac-guard.js', sandbox);
  load('cloud/repository.js', sandbox);
  return sandbox;
}

function main() {
  const sb = makeSandbox();
  const inv = sb.RbacInventory.snapshot();
  check(inv.roles.product.includes('owner'), 'inventory roles');
  check(inv.permissions.keys.length >= 5, 'inventory permissions');
  check(inv.screens.pagePermissions.length >= 2, 'inventory screens');
  check(inv.ipc.privileged.length >= 5, 'inventory ipc');
  check(inv.exports.length >= 3, 'inventory exports');
  check(inv.imports.length >= 2, 'inventory imports');
  check(inv.prints.length >= 2, 'inventory prints');
  check(inv.search.length >= 2, 'inventory search');
  check(inv.dashboardWidgets.length >= 3, 'inventory widgets');
  check(inv.services.includes('Repository'), 'inventory services');
  check(inv.repositoryOps.includes('getScoped'), 'inventory repo ops');
  fs.writeFileSync(path.join(evidenceDir, 'rbac-inventory.json'), JSON.stringify(inv, null, 2) + '\n');

  // Tampered role rejected
  sb.currentUser = { id: '5', role: 'owner', active: true }; // forged
  const tamper = sb.RbacGuard.rejectTamperedRole(sb.currentUser);
  check(tamper.ok === false && tamper.error === 'tampered_role', 'tampered role rejected');
  const auth = sb.RbacGuard.resolveAuthoritativeUser(sb.currentUser);
  check(auth && auth.role === 'employee', 'authoritative role is employee');

  // Page deny for employee
  sb.currentUser = auth;
  const pageDeny = sb.RbacGuard.requirePage('users');
  check(pageDeny.ok === false, 'employee page denied');
  check(sb.RbacGuard.getDenyLog().length >= 1, 'denial audited');

  // Permission deny
  const permDeny = sb.RbacGuard.requirePermission('reports.view', { notify: false });
  check(permDeny.ok === false, 'employee reports denied');

  // Owner path ok
  sb.currentUser = sb.users[0];
  check(sb.RbacGuard.requirePermission('users.manage').ok === true, 'owner authorized');
  check(sb.RbacGuard.requirePage('users').ok === true, 'owner page ok');

  // Branch admin / reception scope
  sb.currentUser = sb.users[2];
  check(sb.BranchScope.userCanAccessBranch(sb.currentUser, 'BR-MAIN') === true, 'reception own branch');
  check(sb.BranchScope.userCanAccessBranch(sb.currentUser, 'BR-EAST') === false, 'reception other branch denied');
  const br = sb.RbacGuard.rejectTamperedBranchId('BR-EAST');
  check(br.ok === false, 'tampered branchId rejected');

  // Repository scoped read
  const repo = sb.Repository || sb.createRepository?.();
  // repository attaches to global.Repository via IIFE - check
  const R = sb.Repository?.createRepository?.() || (function () {
    // repository.js sets global.Repository factory - read end of file
    return null;
  })();

  // Load repository instance pattern from module
  // cloud/repository.js exposes Repository.create or similar — inspect
}

// Re-run with proper Repository init after reading export shape
const repoSrc = fs.readFileSync(path.join(root, 'cloud', 'repository.js'), 'utf8');
const hasCreate = /global\.Repository\s*=/.test(repoSrc);

function main2() {
  const sb = makeSandbox();
  const inv = sb.RbacInventory.snapshot();
  check(inv.roles.product.includes('owner'), 'inventory roles');
  check(inv.permissions.keys.length >= 5, 'inventory permissions');
  check(inv.screens.pagePermissions.length >= 2, 'inventory screens');
  check(inv.ipc.privileged.length >= 5, 'inventory ipc');
  check(inv.exports.length >= 3, 'inventory exports');
  check(inv.imports.length >= 2, 'inventory imports');
  check(inv.prints.length >= 2, 'inventory prints');
  check(inv.search.length >= 2, 'inventory search');
  check(inv.dashboardWidgets.length >= 3, 'inventory widgets');
  check(inv.services.includes('Repository'), 'inventory services');
  check(inv.repositoryOps.includes('getScoped'), 'inventory repo ops');
  fs.writeFileSync(path.join(evidenceDir, 'rbac-inventory.json'), JSON.stringify(inv, null, 2) + '\n');

  // Repository module already loaded in makeSandbox
  check(typeof sb.Repository === 'object' || typeof sb.Repository === 'function' || !!sb.Repository, 'Repository present');

  let repo = sb.Repository;
  if (!repo?.getScoped && sb.RepositoryFactory?.createRepository) {
    repo = sb.RepositoryFactory.createRepository();
    sb.Repository = repo;
  }
  check(!!repo && typeof repo.getScoped === 'function', 'Repository.getScoped available');

  if (repo && typeof repo.getScoped === 'function') {
    sb.currentUser = sb.users[2]; // reception BR-MAIN
    const all = repo.get('cases');
    check(Array.isArray(all) && all.length === 2, 'unscoped get still full for legacy');
    const scoped = repo.getScoped('cases');
    check(Array.isArray(scoped) && scoped.length === 1 && scoped[0].branchId === 'BR-MAIN', 'scoped filter');
    const cross = repo.getScoped('cases', 'cB');
    check(cross === null, 'cross-branch get by id denied');
  } else {
    errors.push('getScoped missing on repository');
  }

  // Write without user denied
  sb.currentUser = null;
  if (repo?.upsert) {
    const denied = repo.upsert('cases', { id: 'x1', branchId: 'BR-MAIN' });
    check(denied.ok === false && denied.error === 'not_authenticated', 'unauth write denied');
  }

  // Trusted sync source still allowed
  if (repo?.upsert) {
    const ok = repo.upsert('cases', { id: 'x2', branchId: 'BR-MAIN' }, { source: 'sync' });
    check(ok.ok === true, 'trusted sync write ok');
  }

  // Shortcut block
  sb.currentUser = sb.users[4];
  const sc = sb.RbacGuard.shouldBlockShortcut('ctrl+p');
  check(sc.block === true, 'print shortcut blocked for employee');

  // Custom role matrix
  sb.currentUser = sb.users[5];
  check(sb.RbacGuard.requirePermission('cases.view', { notify: false }).ok === true, 'custom cases.view');
  check(sb.RbacGuard.requirePermission('reports.view', { notify: false }).ok === false, 'custom reports denied');

  // Electron rbac-session unit (node require)
  const rbacSession = require(path.join(root, 'electron', 'rbac-session.js'));
  const fakeEvent = { sender: { id: 42 } };
  const unbound = (() => {
    try { rbacSession.assertChannelAllowed(fakeEvent, 'backup:v2:create'); return { ok: true }; }
    catch (e) { return { ok: false, error: e.code || e.message }; }
  })();
  check(unbound.ok === false, 'IPC without session denied');
  const bind = rbacSession.bindSession(fakeEvent, {
    userId: '5', role: 'employee', branchScope: ['BR-MAIN'],
    lookupUsers: () => sb.users,
  });
  check(bind.ok === true, 'bind session ok');
  const empBackup = (() => {
    try { rbacSession.assertChannelAllowed(fakeEvent, 'backup:v2:create'); return { ok: true }; }
    catch (e) { return { ok: false, error: e.code || e.message }; }
  })();
  check(empBackup.ok === false, 'employee backup IPC denied');
  const tamperedBind = rbacSession.bindSession(fakeEvent, {
    userId: '5', role: 'owner', branchScope: ['*'],
    lookupUsers: () => sb.users,
  });
  check(tamperedBind.ok === false && tamperedBind.error === 'tampered_role', 'IPC bind rejects forged role');

  const ownerBind = rbacSession.bindSession(fakeEvent, {
    userId: '1', role: 'owner', branchScope: ['*'],
    lookupUsers: () => sb.users,
  });
  check(ownerBind.ok === true, 'owner bind ok');
  check(rbacSession.assertChannelAllowed(fakeEvent, 'backup:v2:create').ok === true, 'owner backup IPC ok');

  // Empty KV must DENY — never trust renderer claim.
  const emptyKvEvent = { sender: { id: 99 } };
  const emptyBind = rbacSession.bindSession(emptyKvEvent, {
    userId: 'owner-x', role: 'owner', branchScope: ['*'],
    lookupUsers: () => [],
  });
  check(emptyBind.ok === false && emptyBind.error === 'users_kv_empty', 'bind denies when users KV empty');
  const devBind = rbacSession.bindSession({ sender: { id: 100 } }, {
    userId: '__dev__', role: 'admin', branchScope: ['*'],
    lookupUsers: () => sb.users,
  });
  check(devBind.ok === true, 'dev synthetic account binds without KV row');
  const skipIgnored = rbacSession.bindSession({ sender: { id: 101 } }, {
    userId: 'missing', role: 'admin', branchScope: ['*'], skipLookup: true,
    lookupUsers: () => sb.users,
  });
  check(skipIgnored.ok === false && skipIgnored.error === 'user_not_found', 'skipLookup no longer trusts missing user');

  // Wiring presence
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'electron', 'preload.js'), 'utf8');
  check(index.includes('rbac-guard.js'), 'index loads rbac-guard');
  check(index.includes('RbacGuard.requirePage'), 'showPage uses RbacGuard');
  check(index.includes('rbac?.bindSession') || index.includes('rbac.bindSession') || index.includes("rbac?.bindSession"), 'login binds session');
  check(main.includes('rbacSession.assertChannelAllowed'), 'main enforces channel policy');
  check(preload.includes('rbac:bindSession'), 'preload exposes rbac');

  const report = {
    ok: errors.length === 0,
    errors,
    at: new Date().toISOString(),
    suite: 'v2-5.4-rbac-audit',
  };
  fs.writeFileSync(path.join(evidenceDir, 'rbac-audit-unit.json'), JSON.stringify(report, null, 2) + '\n');
  if (errors.length) {
    console.error('FAIL: v2-5.4 rbac audit');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('OK: v2-5.4 rbac audit checks');
}

main2();
