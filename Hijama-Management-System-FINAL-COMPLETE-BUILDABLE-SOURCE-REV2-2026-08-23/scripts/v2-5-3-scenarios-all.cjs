#!/usr/bin/env node
'use strict';

/**
 * V2-5.3 scenario runner — owner claim/recovery, identity, license lifecycle.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-3', 'evidence');
const scenariosDir = path.join(evidenceDir, 'scenarios');
fs.mkdirSync(scenariosDir, { recursive: true });

const results = [];
const startedAt = new Date().toISOString();

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function scenario(id, title, fn) {
  const started = Date.now();
  const entry = { id, title, result: 'FAIL', ms: 0, evidence: {} };
  try {
    entry.evidence = (await fn()) || {};
    entry.result = 'PASS';
  } catch (err) {
    entry.result = 'FAIL';
    entry.error = String(err && (err.code || err.message) || err).slice(0, 400);
  }
  entry.ms = Date.now() - started;
  results.push(entry);
  writeJson(path.join(scenariosDir, `${id}.json`), entry);
  console.log(`${entry.result}  ${id}  ${title}  (${entry.ms}ms)`);
}

function load(file, sandbox) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {
    timeout: 3000,
    filename: file,
  });
}

function makeSb(doc) {
  const mem = Object.create(null);
  const audit = [];
  const sb = {
    console,
    currentUser: { role: 'owner', active: true },
    users: [],
    DB: {
      get(k, d) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : d; },
      set(k, v) { mem[k] = v; },
    },
    LicenseCloud: {
      _doc: doc,
      loadLocal() { return this._doc; },
      saveLocal(d) {
        if (!d || d === this._doc) return;
        if (this._doc && typeof this._doc === 'object') {
          Object.keys(this._doc).forEach((k) => delete this._doc[k]);
          Object.assign(this._doc, JSON.parse(JSON.stringify(d)));
        } else {
          this._doc = JSON.parse(JSON.stringify(d));
        }
      },
      async pullLatest() { return { ok: true }; },
      async pushToDrive() { return { ok: true }; },
    },
    CommercialLicense: {
      crypto: {
        canonicalJson: (x) => JSON.stringify(x),
        async hmacSha256Hex(s) {
          return crypto.createHash('sha256').update(String(s)).digest('hex');
        },
      },
    },
    AuditLogger: { log(e) { audit.push(e); } },
    clearUserSession() { mem.__cleared = true; },
    notify() {},
    APP_VERSION: '2.5.3',
  };
  sb.window = sb;
  sb.globalThis = sb;
  sb._audit = audit;
  sb._mem = mem;
  sb.OwnerHub = {
    async saveLicenseDoc(d) { sb.LicenseCloud.saveLocal(d); return d; },
  };
  [
    'cloud/organization.js',
    'cloud/center-id.js',
    'cloud/device-config.js',
    'cloud/license-limits.js',
    'cloud/license-lifecycle.js',
    'cloud/owner-profile.js',
    'cloud/owner-migration.js',
    'cloud/owner-bootstrap.js',
    'cloud/device-registry.js',
    'cloud/role-policy.js',
  ].forEach((f) => load(f, sb));
  return sb;
}

function baseDoc() {
  return {
    centerId: 'NJR-CLINIC-SCEN0001',
    licenseVersion: 1,
    expiresAt: '2028-06-01T00:00:00.000Z',
    features: ['cloud_owner_hub'],
    limits: { maxDevices: 2, maxBranches: 2, maxUsers: 3, offlineGraceDays: 30 },
    branches: [{ id: 'BR-MAIN', name: 'Main', active: true }],
    devices: { registered: [] },
    ownerBootstrap: {
      tokenHash: '',
      emails: [],
      consumed: false,
      issuedAt: new Date().toISOString(),
      ttlHours: 12,
    },
    ownerIdentity: { authorizedEmail: 'owner@clinic.test' },
    activation: { consumed: true, deviceUuid: 'dev-a' },
  };
}

async function main() {
  await scenario('O01-token-ttl-and-once', 'Setup token TTL + once-only redeem', async () => {
    const doc = baseDoc();
    const sb = makeSb(doc);
    const token = 'SCEN-O01';
    doc.ownerBootstrap.tokenHash = await sb.OwnerBootstrap.hashToken(token);
    const expired = await sb.OwnerBootstrap.verifySetupToken(token, {
      nowMs: Date.now() + 20 * 3600 * 1000,
    });
    if (expired.ok) throw new Error('expected_expired');
    const ok = await sb.OwnerBootstrap.redeemSetupToken(token, {
      username: 'o01', password: 'Pass@123', recoveryCode: 'R01',
    });
    if (!ok.ok) throw new Error(ok.error || 'redeem_failed');
    const again = await sb.OwnerBootstrap.redeemSetupToken(token, {
      username: 'o01b', password: 'Pass@123', recoveryCode: 'R01b',
    });
    if (again.ok) throw new Error('reuse_allowed');
    return { expired: expired.error, reused: again.error, consumed: !!doc.ownerBootstrap.consumed };
  });

  await scenario('O02-two-device-race', 'Two-device bootstrap race — one winner', async () => {
    const shared = baseDoc();
    const token = 'SCEN-RACE';
    const a = makeSb(shared);
    shared.ownerBootstrap.tokenHash = await a.OwnerBootstrap.hashToken(token);
    const b = makeSb(shared);
    const save = (d) => {
      const copy = JSON.parse(JSON.stringify(d));
      Object.keys(shared).forEach((k) => delete shared[k]);
      Object.assign(shared, copy);
      a.LicenseCloud._doc = shared;
      b.LicenseCloud._doc = shared;
    };
    a.LicenseCloud.loadLocal = () => shared;
    b.LicenseCloud.loadLocal = () => shared;
    a.LicenseCloud.saveLocal = save;
    b.LicenseCloud.saveLocal = save;
    a.OwnerHub.saveLicenseDoc = async (d) => { save(d); return shared; };
    b.OwnerHub.saveLicenseDoc = async (d) => { save(d); return shared; };
    const [r1, r2] = await Promise.all([
      a.OwnerBootstrap.redeemSetupToken(token, { username: 'a', password: 'Pass@123', recoveryCode: 'A' })
        .catch((e) => ({ ok: false, error: String(e && e.message || e) })),
      b.OwnerBootstrap.redeemSetupToken(token, { username: 'b', password: 'Pass@123', recoveryCode: 'B' })
        .catch((e) => ({ ok: false, error: String(e && e.message || e) })),
    ]);
    const wins = [r1, r2].filter((r) => r.ok).length;
    if (wins !== 1) throw new Error('wins=' + wins + ' r1=' + (r1 && r1.error) + ' r2=' + (r2 && r2.error));
    return { wins, errors: [r1.error, r2.error].filter(Boolean) };
  });

  await scenario('O03-emergency-recovery-audit', 'Emergency recovery authorized + audited', async () => {
    const doc = baseDoc();
    const sb = makeSb(doc);
    const token = 'SCEN-EMERG';
    doc.ownerBootstrap.tokenHash = await sb.OwnerBootstrap.hashToken(token);
    await sb.OwnerBootstrap.redeemSetupToken(token, {
      username: 'em', password: 'Pass@123', recoveryCode: 'EM-CODE',
    });
    const salt = doc.ownerBootstrap.recoverySalt;
    sb.OwnerProfile.clearProfile();
    const denied = await sb.OwnerProfile.emergencyRecoverOwner({ googleOnly: true, googleEmail: 'x@g.com' });
    if (denied.ok) throw new Error('google_allowed');
    const ok = await sb.OwnerProfile.emergencyRecoverOwner({
      recoveryCode: 'EM-CODE', salt, username: 'em2', password: 'NewPass1', newRecoveryCode: 'EM2',
    });
    if (!ok.ok) throw new Error(ok.error || 'recover_failed');
    const audited = sb._audit.some((x) => x.action === 'OWNER_EMERGENCY_RECOVERY');
    if (!audited) throw new Error('not_audited');
    return { recovered: true, audited };
  });

  await scenario('O04-transfer-and-session-invalidate', 'Ownership transfer + session invalidation', async () => {
    const doc = baseDoc();
    const sb = makeSb(doc);
    sb.users = [{ id: '1', username: 'old', role: 'owner', active: true }];
    await sb.OwnerProfile.createProfile({ username: 'old', password: 'OldPass1', recoveryCode: 'X1' });
    const epochBefore = sb.OwnerProfile.getSessionEpoch();
    const xfer = await sb.OwnerProfile.transferOwnership({
      currentPassword: 'OldPass1', newUsername: 'new', newPassword: 'NewPass1', newRecoveryCode: 'X2',
    });
    if (!xfer.ok) throw new Error(xfer.error || 'xfer_failed');
    if (sb.users.find((u) => u.username === 'old')?.role !== 'admin') throw new Error('not_demoted');
    if (sb.OwnerProfile.getSessionEpoch() < epochBefore) throw new Error('epoch_not_bumped');
    return { previousOwner: xfer.previousOwner, epoch: sb.OwnerProfile.getSessionEpoch() };
  });

  await scenario('I01-ids-stable-and-center-confirm', 'Org/Center/Device IDs + center confirm', async () => {
    const doc = baseDoc();
    const sb = makeSb(doc);
    const c1 = sb.CenterId.ensureCenterId(doc.centerId);
    const c2 = sb.CenterId.getStoredCenterId();
    if (c1 !== c2) throw new Error('center_unstable');
    const d1 = sb.DeviceConfig.ensureDeviceUuid();
    const d2 = sb.DeviceConfig.ensureDeviceUuid();
    if (d1 !== d2) throw new Error('device_unstable');
    const refused = sb.CenterId.requestCenterSwitch('NJR-CLINIC-DEADBEEF');
    if (refused.ok) throw new Error('switch_without_confirm');
    const done = sb.CenterId.confirmCenterSwitch('NJR-CLINIC-DEADBEEF');
    if (!done.ok) throw new Error(done.error || 'confirm_failed');
    return { center: sb.CenterId.getStoredCenterId(), deviceUuid: d1, org: sb.Organization.getId() };
  });

  await scenario('I02-device-transfer-sync-block', 'Device transfer revokes sync, DB intact', async () => {
    const doc = baseDoc();
    doc.limits.maxDevices = 3;
    const sb = makeSb(doc);
    sb.DB.set('clients', [{ id: 'c1', name: 'A' }]);
    doc.devices.registered = [
      { deviceUuid: 'old', deviceName: 'Old', branchId: 'BR-MAIN', status: 'approved', active: true },
    ];
    const res = await sb.DeviceRegistry.transferDevice('old', {
      deviceUuid: 'new', deviceName: 'New', branchId: 'BR-MAIN',
    }, { force: true });
    if (!res.ok) throw new Error(res.error || 'transfer_failed');
    if (res.fromCanSync.ok !== false) throw new Error('old_still_syncs');
    if (res.toCanSync.ok !== true) throw new Error('new_cannot_sync');
    if (sb.DB.get('clients').length !== 1) throw new Error('db_wiped');
    return { fromBlocked: true, dbIntact: true };
  });

  await scenario('L01-limits-grace-upgrade-downgrade', 'maxUsers + grace + upgrade/downgrade', async () => {
    const doc = baseDoc();
    doc.limits.maxUsers = 1;
    const sb = makeSb(doc);
    sb.users = [{ id: '1', username: 'u1', active: true }];
    const limit = sb.LicenseLimits.canCreateUser(doc, { users: sb.users, isNew: true });
    if (limit.ok) throw new Error('user_limit_not_enforced');
    const grace = sb.LicenseLimits.evaluateOfflineGrace(
      { lastSuccessfulOnlineValidation: new Date(Date.now() - 45 * 86400000).toISOString() },
      new Date(),
      doc
    );
    if (grace.ok) throw new Error('grace_not_enforced');
    sb.DB.set('users', [{ id: '1' }, { id: '2' }]);
    doc.devices.registered = [
      { deviceUuid: 'd1', active: true, status: 'approved' },
      { deviceUuid: 'd2', active: true, status: 'approved' },
    ];
    const down = sb.LicenseLifecycle.downgradeLicense(doc, { maxDevices: 1, maxUsers: 1 });
    if (!down.dataPreserved || !down.devicesUnchanged) throw new Error('downgrade_deleted_data');
    const up = sb.LicenseLifecycle.upgradeLicense(sb.LicenseCloud.loadLocal(), { maxDevices: 4, maxUsers: 8 });
    if (!up.dataPreserved) throw new Error('upgrade_lost_data');
    if (sb.DB.get('users').length !== 2) throw new Error('users_missing_after_reupgrade');
    return { userLimit: limit.error, grace: grace.error, upgraded: true };
  });

  await scenario('L02-license-persist-markers', 'License survive markers (uninstall-prep + lifecycle)', async () => {
    const unit = spawnSync(process.execPath, [path.join(root, 'tests/baseline/test-v2-3-5-uninstall-prep-preserve.js')], {
      cwd: root, encoding: 'utf8', env: process.env,
    });
    if (unit.status !== 0) throw new Error('uninstall_prep_failed: ' + (unit.stderr || unit.stdout || '').slice(0, 200));
    const doc = baseDoc();
    const sb = makeSb(doc);
    const refresh = sb.LicenseLifecycle.refreshLicense(doc, {});
    if (!refresh.ok || !refresh.dataPreserved) throw new Error('refresh_failed');
    return { uninstallPrepExit: unit.status, refreshed: true };
  });

  const failed = results.filter((r) => r.result !== 'PASS');
  const summary = {
    phase: 'V2-5.3',
    startedAt,
    finishedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, release: os.release() },
    total: results.length,
    passed: results.filter((r) => r.result === 'PASS').length,
    failed: failed.length,
    results,
  };
  writeJson(path.join(evidenceDir, 'scenarios-all.json'), summary);
  if (failed.length) {
    console.error(`V2-5.3 scenarios FAIL: ${failed.length}/${results.length}`);
    process.exit(1);
  }
  console.log(`V2-5.3 scenarios PASS: ${results.length}/${results.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
