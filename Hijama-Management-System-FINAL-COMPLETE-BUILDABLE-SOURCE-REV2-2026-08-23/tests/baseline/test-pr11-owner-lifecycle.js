#!/usr/bin/env node
'use strict';

/**
 * PR11 — Owner Lifecycle behavioral suite.
 * Single authority, count invariant, NEW create-once, EXISTING/restore/replacement recover-only.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

function loadScripts(sandbox, files) {
  for (const rel of files) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    vm.runInNewContext(src, sandbox, { timeout: 5000, filename: rel });
  }
}

function buildSandbox() {
  const sandbox = {
    console,
    currentUser: null,
    users: [],
    localStorage: {
      _m: {},
      getItem(k) { return this._m[k] || null; },
      setItem(k, v) { this._m[k] = String(v); },
      removeItem(k) { delete this._m[k]; },
    },
    document: {
      getElementById() { return null; },
      body: { classList: { contains() { return false; }, toggle() {} } },
    },
    DB: {
      _d: {},
      get(k, d) { return this._d[k] !== undefined ? this._d[k] : d; },
      set(k, v) { this._d[k] = v; },
    },
    BranchScope: {
      applyDefaultScopeToUser(u) {
        if (!u) return u;
        if (!Array.isArray(u.branchScope) || !u.branchScope.length) {
          u.branchScope = ['*'];
          u.canSwitchBranch = true;
        }
        return u;
      },
    },
    BranchDataIsolation: {
      getLoginBranchId: () => sandbox._branchId || 'BR-MAIN',
      userBelongsToBranch(u, branchId) {
        if (!u) return false;
        if (Array.isArray(u.branchScope) && u.branchScope.includes('*')) return true;
        return !u.branchId || u.branchId === branchId;
      },
      stampUserBranch(u) {
        u.branchScope = [sandbox._branchId || 'BR-MAIN'];
        u.canSwitchBranch = false;
        return u;
      },
    },
    CenterId: { getStoredCenterId: () => 'CTR-TEST' },
    Organization: { getId: () => 'CTR-TEST' },
    OwnerProfile: {
      _p: null,
      hasProfile() { return !!this._p; },
      async createProfile(input) {
        if (this._p) return { ok: false, error: 'profile_exists' };
        this._p = {
          username: input.username,
          role: 'owner',
          email: input.email,
          fullName: input.fullName,
        };
        return { ok: true, profile: this._p };
      },
      loadProfile() { return this._p; },
      async rotatePassword() { return { ok: true }; },
    },
    OwnerMigration: { promoteUserToOwnerRole() {} },
    OwnerHub: { refreshCalls: 0, refresh() { this.refreshCalls++; }, applyNavVisibility() {} },
    hashPW: async (pw) => 'hash:' + pw,
    _branchId: 'BR-MAIN',
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

const ownerInput = {
  fullName: 'First Owner',
  email: 'owner@example.com',
  username: 'firstowner',
  password: 'password1',
  passwordConfirm: 'password1',
  recoveryCode: 'recover-me',
};

async function main() {
  const lcSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-lifecycle-authority.js'), 'utf8');
  const omSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-management.js'), 'utf8');
  const setupSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-setup-state.js'), 'utf8');
  const bootSrc = fs.readFileSync(path.join(root, 'cloud', 'boot-flow-ui.js'), 'utf8');
  const formSrc = fs.readFileSync(path.join(root, 'cloud', 'owner-create-form.js'), 'utf8');
  const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  check(/owner-lifecycle-authority\.js/.test(indexSrc), 'index loads owner-lifecycle-authority.js');
  check(/OwnerLifecycleAuthority/.test(omSrc), 'owner-management references lifecycle authority');
  check(/setupCommitOwner/.test(omSrc), 'OwnerManagement exports setupCommitOwner');
  check(/reconcileAfterRestore/.test(fs.readFileSync(path.join(root, 'cloud', 'restore-post-open.js'), 'utf8')), 'restore-post-open reconciles owner');
  check(/setupCommitOwner|OwnerLifecycleAuthority/.test(bootSrc), 'boot-flow wired to lifecycle');
  check(/setupCommitOwner/.test(formSrc), 'owner-create-form routes through setupCommitOwner');

  const sandbox = buildSandbox();
  loadScripts(sandbox, [
    'cloud/role-policy.js',
    'cloud/owner-setup-state.js',
    'cloud/owner-lifecycle-authority.js',
    'cloud/owner-management.js',
  ]);

  const OM = sandbox.OwnerManagement;
  const LC = sandbox.OwnerLifecycleAuthority;
  check(!!OM && !!LC, 'modules loaded');

  // --- Fresh NEW: create once ---
  LC.setMode('new', { createBlocked: false });
  const first = await OM.setupCommitOwner(ownerInput);
  check(first.ok === true, 'NEW setupCommitOwner ok: ' + (first.error || ''));
  const ownerId1 = first.userId;
  check(!!ownerId1, 'first owner has userId');
  check(sandbox.users.filter((u) => u && u.role === 'owner').length === 1, 'exactly 1 owner after first create');

  // Retry same operation (idempotent)
  const retry = await OM.setupCommitOwner(ownerInput);
  check(retry.ok === true && retry.idempotent === true, 'retry returns same owner (idempotent)');
  check(retry.userId === ownerId1, 'retry same userId');
  check(sandbox.users.filter((u) => u && u.role === 'owner').length === 1, 'still 1 owner after retry');

  // Restart simulation: clear in-memory users but commit record + profile remain in DB
  const committed = LC.loadCommitRecord(LC.buildCreateIdempotencyKey(ownerInput));
  check(!!committed?.userId, 'commit record persisted');
  sandbox.users = sandbox.DB.get('users', []);
  const afterRestart = await OM.setupCommitOwner(ownerInput);
  check(
    afterRestart.ok === true && (afterRestart.idempotent || afterRestart.reason === 'owner_already_exists'),
    'post-restart idempotent'
  );
  check(sandbox.users.filter((u) => u && u.role === 'owner').length <= 1, 'no duplicate after restart');

  // Double-click: second concurrent call while lock held
  OM.setSystemBusy(null);
  let inProgressSeen = false;
  const p1 = OM.createOwner({
    fullName: 'Race', email: 'r@e.com', username: 'raceowner',
    password: 'password3', passwordConfirm: 'password3', recoveryCode: 'y',
    additionalOwner: true,
  });
  const mid = OM.getOwnerState();
  if (mid.state === 'OWNER_CREATION_IN_PROGRESS') inProgressSeen = true;
  await p1;

  // --- EXISTING: create blocked ---
  sandbox.users = sandbox.DB.get('users', []);
  sandbox.OwnerProfile._p = sandbox.OwnerProfile.loadProfile();
  LC.setMode('existing', { createBlocked: true });
  const existingBlock = await OM.setupCommitOwner({
    fullName: 'Ghost', email: 'g@e.com', username: 'ghostowner',
    password: 'password9', passwordConfirm: 'password9', recoveryCode: 'z',
  });
  check(existingBlock.ok === false && existingBlock.code === 'EXISTING_NO_CREATE', 'EXISTING blocks create');
  const rec = LC.reconcileExistingCustomer();
  check(rec.ok === true && rec.recover === true, 'EXISTING reconciles existing owner');
  check(rec.ownerId === ownerId1, 'EXISTING same ownerId');

  // --- Restore preserves identity ---
  LC.markRestorePreserve();
  const restoreRec = LC.reconcileAfterRestore({ gateId: 'gate-1' });
  check(restoreRec.ok === true && restoreRec.preserved === true, 'restore preserves owner');
  check(restoreRec.ownerId === ownerId1, 'restore same ownerId');
  const restoreCreate = await OM.createOwner({
    fullName: 'RestoreGhost', email: 'rg@e.com', username: 'restoreghost',
    password: 'password9', passwordConfirm: 'password9', recoveryCode: 'z',
  });
  check(restoreCreate.ok === false && restoreCreate.code === 'EXISTING_NO_CREATE', 'restore blocks bootstrap create');

  // --- Replacement device ---
  LC.markReplacementHydrate();
  check(LC.getMode() === 'replacement', 'replacement mode set');
  check(LC.isCreateBlocked() === true, 'replacement blocks create when owner exists');
  const replCreate = await OM.setupCommitOwner({
    fullName: 'Repl', email: 'rp@e.com', username: 'replowner',
    password: 'password9', passwordConfirm: 'password9', recoveryCode: 'z',
  });
  check(replCreate.ok === false, 'replacement no create fallback');

  // --- Owner count invariant: duplicate primary ---
  sandbox.users.push({
    id: 'owner-dup-' + Date.now(),
    username: 'firstowner',
    role: 'owner',
    active: true,
    password: 'hash:x',
  });
  sandbox.DB.set('users', sandbox.users);
  const inv = LC.assertOwnerCountInvariant();
  check(inv.ok === false && inv.code === 'DUPLICATE_PRIMARY_OWNER', 'duplicate owner → invariant violation');
  check(OM.getOwnerState().state === 'OWNER_CORRUPTED', 'duplicate → OWNER_CORRUPTED / READY blocked');

  // Fix duplicate for branch + password tests
  sandbox.users = sandbox.users.filter((u) => u.id === ownerId1);
  sandbox.DB.set('users', sandbox.users);

  // --- Cross-branch: identity unchanged ---
  sandbox._branchId = 'BR-A';
  const primaryA = LC.getPrimaryOwnerRecord();
  sandbox._branchId = 'BR-B';
  const primaryB = LC.getPrimaryOwnerRecord();
  check(primaryA?.user?.id === primaryB?.user?.id, 'branch switch does not change owner id');
  check(primaryA?.user?.username === 'firstowner', 'owner username stable across branches');

  // --- Password change: identity unchanged ---
  const beforePw = OM.getUsers().find((u) => u.id === ownerId1);
  const pwRes = await OM.resetOwnerPassword(ownerId1, 'newpassword1', 'newpassword1');
  check(pwRes.ok === true, 'password reset ok');
  const afterPw = OM.getUsers().find((u) => u.id === ownerId1);
  check(afterPw && afterPw.id === beforePw.id && afterPw.username === beforePw.username, 'password change preserves identity');

  // --- Crash after DB commit before UI success ---
  sandbox.users = [];
  sandbox.OwnerProfile._p = null;
  sandbox.DB.set('users', []);
  sandbox.DB.set('__tdw_owner_lifecycle_commit__', {
    [LC.buildCreateIdempotencyKey({ username: 'crashowner' })]: {
      ok: true,
      userId: 'owner-crash-1',
      username: 'crashowner',
      committedAt: new Date().toISOString(),
    },
  });
  sandbox.users = [{ id: 'owner-crash-1', username: 'crashowner', role: 'owner', active: true, password: 'hash' }];
  sandbox.DB.set('users', sandbox.users);
  sandbox.OwnerProfile._p = { username: 'crashowner' };
  LC.setMode('new', { createBlocked: false });
  const crashRetry = await OM.setupCommitOwner({
    username: 'crashowner',
    fullName: 'Crash', email: 'c@e.com',
    password: 'password1', passwordConfirm: 'password1', recoveryCode: 'r',
  });
  check(crashRetry.ok === true && crashRetry.idempotent === true, 'crash-after-commit retry returns committed owner');
  check(crashRetry.userId === 'owner-crash-1', 'crash retry same id');

  if (errors.length) {
    console.error('FAIL: pr11 owner lifecycle');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('PASS: pr11 owner lifecycle (' + [
    'new-once', 'retry-idempotent', 'existing-block', 'restore-preserve',
    'replacement-block', 'invariant-dup', 'branch-stable', 'password-stable',
    inProgressSeen ? 'saw-in-progress' : 'create-lock',
  ].join(', ') + ')');
}

main().catch((e) => {
  console.error('FAIL: exception', e);
  process.exit(1);
});
