#!/usr/bin/env node
'use strict';

/**
 * V2-5.3 Owner / Identity / License lifecycle unit suite (VM sandbox).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const root = path.join(__dirname, '..', '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-3', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

function load(file, sandbox) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInNewContext(src, sandbox, { timeout: 3000, filename: file });
}

function makeSandbox(sharedDoc) {
  const mem = Object.create(null);
  const audit = [];
  const sandbox = {
    console,
    currentUser: null,
    users: [],
    DB: {
      get(k, d) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : d; },
      set(k, v) { mem[k] = v; },
    },
    LicenseCloud: {
      _doc: sharedDoc,
      loadLocal() { return this._doc; },
      saveLocal(doc) {
        if (!doc || doc === this._doc) return;
        // Mutate the shared root reference so callers holding `doc` see updates.
        if (this._doc && typeof this._doc === 'object') {
          Object.keys(this._doc).forEach((k) => delete this._doc[k]);
          Object.assign(this._doc, JSON.parse(JSON.stringify(doc)));
        } else {
          this._doc = JSON.parse(JSON.stringify(doc));
        }
      },
      async pullLatest() { return { ok: true, doc: this._doc }; },
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
    notify() {},
    clearUserSession() { mem.__session_cleared = true; },
    APP_VERSION: '2.5.3',
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox._audit = audit;
  sandbox._mem = mem;
  sandbox.OwnerHub = {
    async saveLicenseDoc(doc) {
      sandbox.LicenseCloud.saveLocal(doc);
      return doc;
    },
  };
  load('cloud/organization.js', sandbox);
  load('cloud/center-id.js', sandbox);
  load('cloud/device-config.js', sandbox);
  load('cloud/license-limits.js', sandbox);
  load('cloud/license-lifecycle.js', sandbox);
  load('cloud/owner-profile.js', sandbox);
  load('cloud/owner-migration.js', sandbox);
  load('cloud/owner-bootstrap.js', sandbox);
  load('cloud/device-registry.js', sandbox);
  load('cloud/role-policy.js', sandbox);
  return sandbox;
}

async function main() {
  const baseDoc = () => ({
    centerId: 'NJR-CLINIC-ABCD1234',
    licenseVersion: 1,
    expiresAt: '2028-12-31T00:00:00.000Z',
    features: ['cloud_owner_hub', 'cloud_multi_device'],
    limits: { maxDevices: 2, maxBranches: 2, maxUsers: 2, offlineGraceDays: 30 },
    branches: [{ id: 'BR-MAIN', name: 'Main', active: true }],
    devices: { registered: [] },
    ownerBootstrap: {
      tokenHash: '',
      emails: ['owner@clinic.test'],
      consumed: false,
      issuedAt: new Date().toISOString(),
      ttlHours: 24,
    },
    ownerIdentity: { authorizedEmail: 'owner@clinic.test' },
    activation: { consumed: true, deviceUuid: 'dev-a' },
  });

  // ── OWN: token TTL / invalid / reuse / race / google ──
  {
    const doc = baseDoc();
    const sb = makeSandbox(doc);
    check(sb.OwnerBootstrap.googleLoginImpliesOwner() === false, 'Google ≠ Owner');

    const token = 'SETUP-TOKEN-V253';
    doc.ownerBootstrap.tokenHash = await sb.OwnerBootstrap.hashToken(token);

    const expired = await sb.OwnerBootstrap.verifySetupToken(token, {
      nowMs: Date.now() + 48 * 3600 * 1000,
    });
    check(expired.ok === false && expired.error === 'token_expired', 'expired token rejected');

    const bad = await sb.OwnerBootstrap.verifySetupToken('WRONG');
    check(bad.ok === false && bad.error === 'invalid_setup_token', 'invalid token rejected');

    const first = await sb.OwnerBootstrap.redeemSetupToken(token, {
      username: 'owner1', password: 'Pass@123', recoveryCode: 'REC-001',
    });
    check(first.ok === true, 'first redeem ok');
    check(sb.OwnerProfile.hasProfile() === true, 'owner profile created');
    check(!!doc.ownerBootstrap.consumed, 'bootstrap consumed on license');
    check(!!doc.ownerBootstrap.emergencyRecoveryHash, 'emergency hash stored');
    check(!!doc.ownerBootstrap.recoverySalt, 'recovery salt stored');

    const reuse = await sb.OwnerBootstrap.redeemSetupToken(token, {
      username: 'owner2', password: 'Pass@123', recoveryCode: 'REC-002',
    });
    check(reuse.ok === false, 'reused token rejected');
  }

  // Two-device race — shared license doc
  {
    const shared = baseDoc();
    const token = 'RACE-TOKEN';
    const sbA = makeSandbox(shared);
    shared.ownerBootstrap.tokenHash = await sbA.OwnerBootstrap.hashToken(token);
    // Device B shares same LicenseCloud doc object
    const sbB = makeSandbox(shared);
    const saveShared = (d) => {
      const copy = JSON.parse(JSON.stringify(d));
      Object.keys(shared).forEach((k) => delete shared[k]);
      Object.assign(shared, copy);
      sbA.LicenseCloud._doc = shared;
      sbB.LicenseCloud._doc = shared;
    };
    sbA.LicenseCloud.loadLocal = () => shared;
    sbB.LicenseCloud.loadLocal = () => shared;
    sbA.LicenseCloud.saveLocal = saveShared;
    sbB.LicenseCloud.saveLocal = saveShared;
    sbA.OwnerHub.saveLicenseDoc = async (d) => { saveShared(d); return shared; };
    sbB.OwnerHub.saveLicenseDoc = async (d) => { saveShared(d); return shared; };

    const [r1, r2] = await Promise.all([
      sbA.OwnerBootstrap.redeemSetupToken(token, {
        username: 'raceA', password: 'Pass@123', recoveryCode: 'RA',
      }).catch((e) => ({ ok: false, error: String(e && e.message || e) })),
      sbB.OwnerBootstrap.redeemSetupToken(token, {
        username: 'raceB', password: 'Pass@123', recoveryCode: 'RB',
      }).catch((e) => ({ ok: false, error: String(e && e.message || e) })),
    ]);
    const wins = [r1, r2].filter((r) => r && r.ok);
    const losses = [r1, r2].filter((r) => r && !r.ok);
    check(wins.length === 1, `race: exactly one success got ${wins.length} r1=${r1 && r1.error} r2=${r2 && r2.error}`);
    check(losses.length === 1, 'race: exactly one failure');
    if (losses[0]) {
      check(
        losses[0].error === 'bootstrap_already_consumed' ||
        losses[0].error === 'claim_conflict' ||
        losses[0].error === 'owner_already_exists',
        'race loser error=' + losses[0].error
      );
    }
  }

  // Owner recovery + emergency + unauthorized
  {
    const doc = baseDoc();
    const sb = makeSandbox(doc);
    const token = 'REC-TOKEN';
    doc.ownerBootstrap.tokenHash = await sb.OwnerBootstrap.hashToken(token);
    const created = await sb.OwnerBootstrap.redeemSetupToken(token, {
      username: 'ownrec', password: 'Old@1234', recoveryCode: 'RECOVER-ME',
    });
    check(created.ok === true, 'create for recovery');

    const reset = await sb.OwnerProfile.resetPasswordWithRecovery({
      recoveryCode: 'RECOVER-ME',
      newPassword: 'New@4567',
    });
    check(reset.ok === true, 'password reset ok');
    check(reset.sessionsInvalidated === true, 'sessions invalidated on reset');
    check(sb._mem.__session_cleared === true, 'clearUserSession called');
    const epoch1 = sb.OwnerProfile.getSessionEpoch();
    check(epoch1 >= 2, 'session epoch bumped');

    // Simulate profile loss after restore (license retains emergency hash)
    const emergencyHash = doc.ownerBootstrap.emergencyRecoveryHash;
    const recoverySalt = doc.ownerBootstrap.recoverySalt;
    sb.OwnerProfile.clearProfile();
    check(sb.OwnerProfile.hasProfile() === false, 'profile cleared');

    const deniedGoogle = await sb.OwnerProfile.emergencyRecoverOwner({
      googleOnly: true,
      googleEmail: 'hacker@gmail.com',
    });
    check(deniedGoogle.ok === false, 'google-only recovery denied');

    const deniedBad = await sb.OwnerProfile.emergencyRecoverOwner({
      recoveryCode: 'WRONG',
      username: 'x',
      password: 'y',
      newRecoveryCode: 'z',
    });
    check(deniedBad.ok === false && deniedBad.error === 'recovery_unauthorized', 'bad emergency denied');

    const recovered = await sb.OwnerProfile.emergencyRecoverOwner({
      recoveryCode: 'RECOVER-ME',
      salt: recoverySalt,
      username: 'ownrec2',
      password: 'Emerg@12',
      newRecoveryCode: 'NEW-REC',
    });
    check(recovered.ok === true, 'emergency recovery ok');
    check(sb.OwnerProfile.hasProfile() === true, 'profile restored');
    check(
      sb._audit.some((a) => a.action === 'OWNER_EMERGENCY_RECOVERY'),
      'emergency recovery audited'
    );
    check(!!emergencyHash, 'had emergency hash before recover');
  }

  // Ownership transfer + demote
  {
    const doc = baseDoc();
    const sb = makeSandbox(doc);
    sb.users = [{ id: '1', username: 'oldowner', role: 'owner', active: true }];
    sb.currentUser = sb.users[0];
    await sb.OwnerProfile.createProfile({
      username: 'oldowner', password: 'Old@1234', recoveryCode: 'T1',
    });
    const xfer = await sb.OwnerProfile.transferOwnership({
      currentPassword: 'Old@1234',
      newUsername: 'newowner',
      newPassword: 'New@1234',
      newRecoveryCode: 'T2',
    });
    check(xfer.ok === true, 'transfer ok');
    check(xfer.previousOwner === 'oldowner', 'previous owner recorded');
    const old = sb.users.find((u) => u.username === 'oldowner');
    check(old && old.role === 'admin', 'old owner demoted to admin');
    const neu = sb.users.find((u) => u.username === 'newowner');
    check(neu && neu.role === 'owner', 'new owner promoted');
    check(sb._audit.some((a) => a.action === 'OWNER_TRANSFER'), 'transfer audited');
  }

  // Identity stability + center switch confirm
  {
    const doc = baseDoc();
    const sb = makeSandbox(doc);
    const id1 = sb.CenterId.ensureCenterId('NJR-CLINIC-ABCD1234');
    check(id1 === 'NJR-CLINIC-ABCD1234', 'center id set');
    check(sb.CenterId.getStoredCenterId() === id1, 'center id stable');
    check(sb.Organization.getId() === id1, 'org id == center id');

    const refuse = sb.CenterId.requestCenterSwitch('NJR-CLINIC-FFFF9999');
    check(refuse.ok === false && refuse.error === 'confirmation_required', 'center switch needs confirm');
    check(sb.CenterId.getStoredCenterId() === id1, 'center unchanged without confirm');

    const okSwitch = sb.CenterId.confirmCenterSwitch('NJR-CLINIC-FFFF9999');
    check(okSwitch.ok === true && okSwitch.switched === true, 'confirmed switch ok');
    check(sb.CenterId.getStoredCenterId() === 'NJR-CLINIC-FFFF9999', 'center switched');

    const uuid1 = sb.DeviceConfig.ensureDeviceUuid();
    const uuid2 = sb.DeviceConfig.ensureDeviceUuid();
    check(uuid1 === uuid2, 'device uuid stable across ensure');
  }

  // Device transfer + revoke blocks sync, DB intact
  {
    const doc = baseDoc();
    doc.limits.maxDevices = 3;
    const sb = makeSandbox(doc);
    sb.currentUser = { role: 'owner', active: true };
    sb.OwnerProfile.getRole = () => 'owner';
    doc.devices.registered = [
      { deviceUuid: 'dev-old', deviceName: 'Old', branchId: 'BR-MAIN', status: 'approved', active: true },
    ];
    // pretend business DB marker
    sb.DB.set('clients', [{ id: 'c1' }]);

    const xfer = await sb.DeviceRegistry.transferDevice('dev-old', {
      deviceUuid: 'dev-new', deviceName: 'New', branchId: 'BR-MAIN',
    }, { force: true });
    check(xfer.ok === true, 'device transfer ok');
    check(xfer.dbIntact === true, 'db intact flag');
    check(xfer.fromCanSync && xfer.fromCanSync.ok === false, 'old device sync blocked');
    check(xfer.toCanSync && xfer.toCanSync.ok === true, 'new device can sync');
    check(Array.isArray(sb.DB.get('clients')) && sb.DB.get('clients').length === 1, 'business DB not deleted');
  }

  // License limits: maxUsers, offline grace, upgrade/downgrade preserve data
  {
    const doc = baseDoc();
    doc.limits.maxUsers = 1;
    const sb = makeSandbox(doc);
    sb.users = [{ id: '1', username: 'u1', role: 'admin', active: true }];
    const blocked = sb.LicenseLimits.canCreateUser(doc, { users: sb.users, isNew: true });
    check(blocked.ok === false && blocked.error === 'user_limit_reached', 'maxUsers enforced');

    const graceFail = sb.LicenseLimits.evaluateOfflineGrace(
      { lastSuccessfulOnlineValidation: new Date(Date.now() - 40 * 86400000).toISOString() },
      new Date(),
      doc
    );
    check(graceFail.ok === false && graceFail.error === 'offline_grace_exceeded', 'offline grace enforced');

    const graceOk = sb.LicenseLimits.evaluateOfflineGrace(
      { lastSuccessfulOnlineValidation: new Date(Date.now() - 5 * 86400000).toISOString() },
      new Date(),
      doc
    );
    check(graceOk.ok === true, 'within grace ok');

    sb.DB.set('users', [{ id: '1' }, { id: '2' }]);
    doc.devices.registered = [
      { deviceUuid: 'd1', active: true, status: 'approved' },
      { deviceUuid: 'd2', active: true, status: 'approved' },
    ];
    const down = sb.LicenseLifecycle.downgradeLicense(doc, { maxDevices: 1, maxUsers: 1 });
    check(down.ok === true && down.dataPreserved === true, 'downgrade preserves data');
    check(down.devicesUnchanged === true, 'devices array not pruned');
    check(sb.DB.get('users').length === 2, 'users not deleted on downgrade');

    const up = sb.LicenseLifecycle.upgradeLicense(sb.LicenseCloud.loadLocal(), {
      maxDevices: 5, maxUsers: 10, addFeatures: ['cap_cloud'],
    });
    check(up.ok === true && up.dataPreserved === true, 'upgrade preserves data');
    check(sb.DB.get('users').length === 2, 'users intact after re-upgrade');

    const expired = sb.LicenseLifecycle.evaluateLicenseState(
      { ...sb.LicenseCloud.loadLocal(), expiresAt: '2020-01-01T00:00:00.000Z' },
      {}
    );
    check(expired.status === 'expired', 'expired license detected');

    const invalid = sb.LicenseLifecycle.evaluateLicenseState(doc, { invalidSignature: true });
    check(invalid.status === 'invalid', 'invalid license detected');

    const mismatch = sb.LicenseLifecycle.evaluateLicenseState(
      { ...doc, activation: { deviceUuid: 'other' } },
      { enforceDeviceBinding: true, deviceUuid: 'dev-a' }
    );
    check(mismatch.status === 'device_mismatch', 'device mismatch detected');
  }

  // Boot-flow / OwnerHub wiring presence
  {
    const boot = fs.readFileSync(path.join(root, 'cloud', 'boot-flow-ui.js'), 'utf8');
    const hub = fs.readFileSync(path.join(root, 'cloud', 'owner-hub.js'), 'utf8');
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    check(boot.includes('OwnerCreateForm') || boot.includes('owner'), 'boot-flow wires Owner create step');
    check(hub.includes('redeemSetupTokenInteractive'), 'owner-hub redeem UI');
    check(hub.includes('emergencyRecoverInteractive'), 'owner-hub emergency UI');
    check(hub.includes('transferOwnershipInteractive'), 'owner-hub transfer UI');
    check(index.includes('LicenseLimits.canCreateUser'), 'index enforces maxUsers');
    check(index.includes('evaluateOfflineGrace'), 'index enforces offline grace');
    check(index.includes('sessionEpoch'), 'index session epoch');
    check(index.includes('license-lifecycle.js'), 'lifecycle script loaded');
  }

  const report = {
    ok: errors.length === 0,
    errors,
    at: new Date().toISOString(),
    suite: 'v2-5.3-owner-identity-license',
  };
  fs.writeFileSync(
    path.join(evidenceDir, 'owner-identity-license-unit.json'),
    JSON.stringify(report, null, 2) + '\n'
  );

  if (errors.length) {
    console.error('FAIL: v2-5.3 owner/identity/license');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('OK: v2-5.3 owner/identity/license checks');
}

main().catch((e) => {
  console.error('FAIL: v2-5.3 owner/identity/license');
  console.error(e);
  process.exit(1);
});
