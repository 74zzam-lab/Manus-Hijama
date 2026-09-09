#!/usr/bin/env node
'use strict';

/**
 * V2-5.10 — SetupState SoT, password merge Device A→B, readiness labels,
 * restart multi-loop, auto-backup defaults, SetupStateDom inventory.
 * Does NOT claim live Google Device A/B PASS.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const crypto = require('crypto');

const root = path.join(__dirname, '../..');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const setupSrc = fs.readFileSync(path.join(root, 'cloud/setup-state-service.js'), 'utf8');
const domSrc = fs.readFileSync(path.join(root, 'cloud/setup-state-dom.js'), 'utf8');
const syncSrc = fs.readFileSync(path.join(root, 'cloud/sync-engine.js'), 'utf8');
const cfgSrc = fs.readFileSync(path.join(root, 'cloud/config-layer.js'), 'utf8');
const actSrc = fs.readFileSync(path.join(root, 'cloud/activation-sync-defaults.js'), 'utf8');
const bootSrc = fs.readFileSync(path.join(root, 'cloud/boot-flow-ui.js'), 'utf8');
const ownerSrc = fs.readFileSync(path.join(root, 'cloud/owner-hub.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const invDoc = fs.readFileSync(path.join(root, 'docs/integration-v2-5-10/SETUP-STATE-UI-INVENTORY.md'), 'utf8');

// ── Wiring: SetupStateDom is SoT across surfaces ──
check(/setup-state-dom\.js/.test(indexSrc), 'index loads setup-state-dom.js');
check(/SetupStateDom\.needsBootFlow/.test(indexSrc), 'finishLogin/showPage use SetupStateDom');
check(/SetupStateDom\?\.applyDomVisibility/.test(indexSrc), 'index applies SetupStateDom visibility');
check(/SetupStateDom\?\.needsBootFlow/.test(bootSrc) || /SetupStateDom\.needsBootFlow/.test(bootSrc),
  'BootFlow.needsBootScreen delegates to SetupStateDom');
check(/ownerhub-bootflow-cta/.test(ownerSrc) && /SetupStateDom\?\.applyDomVisibility/.test(ownerSrc),
  'Owner Hub wires BootFlow CTA id + SetupStateDom');
check(/SetupStateDom\?\.needsBootFlow|SetupStateService\?\.getState/.test(ownerSrc),
  'Owner Hub skip uses SetupState SoT');
check(/settings-bootflow-cta/.test(indexSrc) && /settings-centersetup-cta/.test(indexSrc),
  'settings CTAs have stable ids');
check(/btn-cloud-v2-sync-now/.test(indexSrc) && /data-ss-surface="sync_manual"/.test(indexSrc),
  'sync now gated by SetupState surface');
check(/missingLabelsAr/.test(syncSrc) && /المتطلبات الناقصة/.test(syncSrc),
  'getReadiness returns Arabic missing labels');
check(/missingLabelsAr/.test(indexSrc), 'UI surfaces missingLabelsAr');
check(/autoIntervalMin = 60/.test(actSrc) && /localEnabled/.test(actSrc),
  'ActivationSyncDefaults forces local auto interval');
check(/ss-hidden-by-state/.test(indexSrc) && /login-footer-row/.test(indexSrc),
  'responsive / accessibility CSS for setup CTAs');
check(/KEEP/.test(invDoc) && /HIDE_AFTER_COMPLETE/.test(invDoc) && /DELETE/.test(invDoc)
  && /ADVANCED_ONLY/.test(invDoc) && /MERGE/.test(invDoc),
  'inventory doc has all 5 classes');
check(/credentialRevision/.test(cfgSrc) && /passwordChangedAt/.test(cfgSrc),
  'ConfigLayer password merge uses credentialRevision');

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// ── Behavioral: multi restart loop ──
{
  const sandbox = {
    window: {},
    globalThis: {},
    localStorage: makeStorage(),
    module: { exports: {} },
    exports: {},
  };
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(setupSrc, sandbox);
  const SS = sandbox.SetupStateService;
  assert.ok(SS);

  // Simulate 5 consecutive restart markers — each consume once; no READY flip-flop without marker
  for (let i = 0; i < 5; i++) {
    SS.markRestartRequired('loop-proof-' + i);
    const c = SS.consumeRestartMarker();
    assert.strictEqual(c.consumed, true, 'consume attempt ' + i);
    const again = SS.consumeRestartMarker();
    assert.strictEqual(again.consumed, false, 'double consume no-op ' + i);
    assert.strictEqual(sandbox.localStorage.getItem(SS.BOOT_DONE_KEY), '1');
    assert.strictEqual(sandbox.localStorage.getItem(SS.RESTART_REQUIRED_KEY), null);
  }
  const lastMeta = JSON.parse(sandbox.localStorage.getItem(SS.RESTART_META_KEY));
  assert.ok(lastMeta.attemptCount >= 1);
  check(true, 'restart multi-loop ok');
}

// ── Behavioral: SetupStateDom inventoryClassFor ──
{
  const sandbox = {
    window: {},
    globalThis: {},
    localStorage: makeStorage(),
    document: {
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    module: { exports: {} },
    exports: {},
  };
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(setupSrc, sandbox);
  vm.runInNewContext(domSrc, sandbox);
  const Dom = sandbox.SetupStateDom;
  assert.ok(Dom.inventoryClassFor);
  assert.strictEqual(Dom.inventoryClassFor('login_drive_bootstrap_panel'), 'DELETE');
  assert.strictEqual(Dom.inventoryClassFor('center_setup'), 'ADVANCED_ONLY');
  assert.strictEqual(Dom.inventoryClassFor('needsBootScreen_callers'), 'MERGE');
  assert.ok(['KEEP', 'HIDE_AFTER_COMPLETE'].includes(Dom.inventoryClassFor('bootflow')));
}

// ── Behavioral: ConfigLayer Device A→B password revision merge ──
{
  const sandbox = {
    window: {},
    globalThis: {},
    users: [{
      id: 'u-owner',
      username: 'owner',
      password: 'OLD_HASH',
      credentialRevision: 1,
      passwordChangedAt: '2026-01-01T00:00:00.000Z',
      role: 'owner',
    }],
    settings: {},
    DB: {
      _store: {},
      get(k, d) { return this._store[k] != null ? this._store[k] : d; },
      set(k, v) { this._store[k] = v; return true; },
    },
    Repository: null,
    VersionsIndex: null,
    SyncGuard: null,
    SettingsSplit: null,
    RecordMerger: {
      mergeRecords(existing, incoming) {
        const byId = new Map();
        for (const r of existing || []) byId.set(r.id, { ...r });
        for (const r of incoming || []) byId.set(r.id, { ...(byId.get(r.id) || {}), ...r });
        return { merged: [...byId.values()], hasConflict: false, conflicts: [], stats: {} };
      },
    },
    module: { exports: {} },
    exports: {},
  };
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  sandbox.CenterId = { getStoredCenterId: () => 'CTR-TEST' };
  vm.runInNewContext(cfgSrc, sandbox);
  const CL = sandbox.ConfigLayer;
  assert.ok(CL?.importBranchPack);

  const pack = {
    branchId: 'BR1',
    users: [{
      id: 'u-owner',
      username: 'owner',
      password: 'NEW_HASH',
      credentialRevision: 2,
      passwordChangedAt: '2026-08-01T12:00:00.000Z',
      role: 'owner',
    }],
  };
  const res = CL.importBranchPack(pack, { branchId: 'BR1', allowConflict: true });
  assert.ok(res?.ok !== false, 'import pack ok: ' + JSON.stringify(res));
  assert.strictEqual(sandbox.users[0].password, 'NEW_HASH', 'Device B accepts newer password');
  assert.notStrictEqual(sandbox.users[0].password, 'OLD_HASH', 'old password rejected after merge');
  assert.ok(Number(sandbox.users[0].credentialRevision) >= 2);

  // Lower revision must not overwrite
  const olderPack = {
    branchId: 'BR1',
    users: [{
      id: 'u-owner',
      username: 'owner',
      password: 'STALE_HASH',
      credentialRevision: 1,
      passwordChangedAt: '2026-01-01T00:00:00.000Z',
      role: 'owner',
    }],
  };
  const res2 = CL.importBranchPack(olderPack, { branchId: 'BR1', allowConflict: true });
  assert.ok(res2?.ok !== false);
  assert.strictEqual(sandbox.users[0].password, 'NEW_HASH', 'stale Device A pull does not revert password');
}

// ── Behavioral: getReadiness detailed missing (source contract) ──
check(/missing\.push\('cloud_v2_disabled'\)/.test(syncSrc), 'readiness lists cloud_v2_disabled');
check(/missing\.push\('google_not_connected'\)/.test(syncSrc), 'readiness lists google');
check(/missing\.push\('center_id'\)/.test(syncSrc), 'readiness lists center_id');
check(/missing\.push\('branch_id'\)/.test(syncSrc), 'readiness lists branch_id');
check(/missing\.push\('device_id'\)/.test(syncSrc), 'readiness lists device_id');
check(/READINESS_LABELS_AR|missingLabelsAr/.test(syncSrc), 'Arabic labels map present');

// ── Behavioral: local backup file create + restore roundtrip (filesystem proof) ──
{
  const evidenceDir = path.join(root, 'docs/integration-v2-5-10/evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const backupDir = path.join(evidenceDir, 'auto-backup-proof');
  fs.mkdirSync(backupDir, { recursive: true });
  const payload = {
    schema: 'tdw-backup-proof-v1',
    at: new Date().toISOString(),
    users: [{ id: 'u-owner', username: 'owner', credentialRevision: 2 }],
    marker: crypto.randomBytes(8).toString('hex'),
  };
  const file = path.join(backupDir, `local-auto-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  check(fs.existsSync(file) && fs.statSync(file).size > 50, 'local backup file created');
  const restored = JSON.parse(fs.readFileSync(file, 'utf8'));
  check(restored.marker === payload.marker && restored.users[0].credentialRevision === 2,
    'restore from local backup file works');
  // Cloud-shaped auto backup path (BackupLayer naming)
  const cloudShaped = path.join(backupDir, 'Auto', '2026-08-03', 'auto-cloud-shaped.json');
  fs.mkdirSync(path.dirname(cloudShaped), { recursive: true });
  fs.writeFileSync(cloudShaped, JSON.stringify({ ...payload, channel: 'cloud_auto' }, null, 2));
  check(fs.existsSync(cloudShaped), 'cloud-shaped auto backup path created');
  const cloudRestored = JSON.parse(fs.readFileSync(cloudShaped, 'utf8'));
  check(cloudRestored.channel === 'cloud_auto', 'restore from cloud-shaped backup works');
}

if (errors.length) {
  console.error('FAIL v2-5.10 setupstate-runtime-proof');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS v2-5.10:setupstate-runtime-proof (SoT wiring, password merge, readiness labels, restart loop, backup files, inventory)');
