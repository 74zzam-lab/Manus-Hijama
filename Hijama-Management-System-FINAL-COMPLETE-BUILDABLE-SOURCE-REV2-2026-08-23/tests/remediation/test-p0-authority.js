'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const rbac = require('../../electron/rbac-session');
const bootstrapRestore = require('../../electron/bootstrap-restore-capability');
const { verifyCountsAgainstManifest } = require('../../electron/backup-restore-coordinator');

function expectDenied(fn, label) {
  let denied = false;
  try { fn(); } catch { denied = true; }
  assert.ok(denied, label);
}

assert.strictEqual(
  rbac.PUBLIC_CHANNELS.has('database:seedUsersIfEmpty'),
  false,
  'first-owner seeding must never be a public renderer channel'
);
assert.strictEqual(
  rbac.PUBLIC_CHANNELS.has('bootstrap:issueRestoreCapability'),
  false,
  'bootstrap restore authorization must not be public without a trusted main-issued bootstrap token'
);

rbac.configureRuntime({ isProduction: true });
const devInProduction = rbac.bindSession({ sender: { id: 91599 } }, { userId: '__dev__', role: 'admin' });
assert.strictEqual(devInProduction.ok, false, 'synthetic developer account must be unavailable in packaged production mode');
assert.strictEqual(devInProduction.error, 'dev_account_disabled_in_production');
rbac.configureRuntime({ isProduction: false });

const noSessionEvent = { sender: { id: 91600 } };
expectDenied(
  () => rbac.assertChannelAllowed(noSessionEvent, 'cache:writeLicense', {}),
  'cache license writes must never bypass a session merely because the policy declares allowWithoutSession'
);
expectDenied(
  () => rbac.assertChannelAllowed(noSessionEvent, 'bootstrap:issueRestoreCapability', {}),
  'bootstrap-only IPC must require trusted main bootstrap context'
);
expectDenied(
  () => rbac.assertChannelAllowed(noSessionEvent, 'app:writeUninstallCenterMeta', {}),
  'uninstall-only IPC must require actual uninstall-process context'
);

const bootstrapLicenseChannels = [
  'backup:startOAuth',
  'backup:connectGoogle',
  'backup:registerCloudAccount',
  'backup:getCloudStatus',
  'backup:disconnectCloud',
  'backup:listCloudBackups',
  'backup:discoverCloudRestorePoints',
  'backup:downloadCloudBackup',
  'backup:uploadCloud',
  'cache:writeLicense',
  'bootstrap:syncWizardState',
];

for (const channel of [
  'backup:listCloudBackups',
  'backup:downloadCloudBackup',
  'backup:listDbBackups',
  'backup:verifyCloudBackup',
  'backup:uploadCloud',
  'backup:disconnectCloud',
]) {
  assert.strictEqual(rbac.PUBLIC_CHANNELS.has(channel), false, `${channel} must not be public`);
  expectDenied(() => rbac.assertChannelAllowed(noSessionEvent, channel, {}), `${channel} must require a session`);
}

for (const channel of bootstrapLicenseChannels) {
  assert.strictEqual(rbac.PUBLIC_CHANNELS.has(channel), false, `${channel} must not be public`);
  expectDenied(() => rbac.assertChannelAllowed(noSessionEvent, channel, {}), `${channel} must require trusted bootstrap context`);
  const gate = rbac.assertChannelAllowed(noSessionEvent, channel, { __trustedIpcContext: { bootstrapPhase: true } });
  assert.strictEqual(gate.ok, true, `${channel} must allow a main-issued bootstrap context`);
}

const event = { sender: { id: 91601 } };
const bound = rbac.bindSession(event, {
  userId: 'employee-regression',
  role: 'employee',
  lookupUsers: () => [{ id: 'employee-regression', role: 'employee', active: true, branchScope: ['BR-A'] }],
});
assert.strictEqual(bound.ok, true, 'test employee session must bind');
for (const channel of [
  'backup:v2:deleteLocal',
  'backup:v2:prune',
  'backup:v2:scheduleConfigure',
  'backup:v2:stageRemote',
  'backup:v2:importLegacy',
  'backup:v2:verify',
  'backup:v2:inspect',
  'backup:v2:listLocal',
]) {
  expectDenied(() => rbac.assertChannelAllowed(event, channel, {}), `${channel} must be denied to employee`);
}
rbac.clearSession(event);

(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-bootstrap-cap-'));
  const backupDir = path.join(userData, 'Backups', 'V2');
  fs.mkdirSync(backupDir, { recursive: true });
  const localPath = path.join(backupDir, 'candidate.tdw');
  fs.writeFileSync(localPath, 'test');
  bootstrapRestore.configure({
    getUserDataPath: () => userData,
    readKv: () => null,
    readLicense: () => ({ ok: false }),
    getCloudStatus: async () => ({ connected: false }),
    getSession: () => null,
  });
  const issued = await bootstrapRestore.issueRestoreCapability(
    { sender: { id: 91602 } },
    { bootFlow: true, source: 'local', centerId: 'CENTER-A', localPath, licenseSnapshot: { centerId: 'CENTER-A' } }
  );
  assert.strictEqual(issued.ok, false, 'renderer license snapshot must not authorize bootstrap restore');
  fs.rmSync(userData, { recursive: true, force: true });

const zeroCount = verifyCountsAgainstManifest(
  { recordCounts: { clients: 0, visits: 0, bookings: 0 } },
  null,
  { clients: 1, visits: 1, bookings: 1 }
);
assert.strictEqual(zeroCount.ok, false, 'post-restore verification must reject actual records when manifest expects zero');
assert.strictEqual(zeroCount.mismatches.length, 3, 'all zero-count mismatches must be reported');

console.log('PASS remediation:p0-authority');
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
