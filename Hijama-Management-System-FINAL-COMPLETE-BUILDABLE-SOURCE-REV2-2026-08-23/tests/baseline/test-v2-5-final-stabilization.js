#!/usr/bin/env node
'use strict';

/**
 * V2-5 Final Stabilization — critical runtime regression suite.
 * Covers pre-login Google IPC public channels, OAuth soft errors,
 * Owner login role, DeviceRegistry owner authz, Sheets vault soft errors.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-stabilization', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

function main() {
  const rbac = require('../../electron/rbac-session.js');
  const ipcValidate = require('../../electron/security/ipc-validate.js');
  const sheets = require('../../cloud/google-sheets-ops.js');
  require('../../cloud/owner-profile.js');
  require('../../cloud/role-policy.js');

  // 1) Pre-login policy: static provider/license reads can be public; Google setup is
  // main-issued bootstrap only; cloud content and upload always require a user session.
  const publicNeeded = [
    'backup:listCloudProviders',
    'license:readActivationBundle',
    'cloudOAuth:getSettings',
    'cache:readLicense',
  ];
  for (const ch of publicNeeded) {
    const gate = rbac.sessionAllowsChannel(null, ch);
    check(gate.ok === true, `public metadata channel ${ch}`);
  }
  const setupNeeded = ['backup:startOAuth', 'backup:connectGoogle', 'backup:registerCloudAccount', 'backup:getCloudStatus'];
  for (const ch of setupNeeded) {
    check(rbac.PUBLIC_CHANNELS.has(ch) === false, `${ch} is not renderer-public`);
    check(rbac.sessionAllowsChannel(null, ch).ok === false, `${ch} denied without bootstrap context`);
    check(rbac.sessionAllowsChannel(null, ch, { __trustedIpcContext: { bootstrapPhase: true } }).ok === true, `${ch} allowed with trusted bootstrap context`);
  }
  for (const ch of ['backup:listCloudBackups', 'backup:downloadCloudBackup', 'backup:disconnectCloud', 'backup:uploadCloud', 'cache:writeLicense', 'backup:v2:restore']) {
    check(rbac.sessionAllowsChannel(null, ch).ok === false, `${ch} requires a session`);
  }

  // Wipe remains owner-only
  const wipeGate = rbac.sessionAllowsChannel(null, 'app:wipePersistentLicenseData');
  check(wipeGate.ok === false, 'wipe gated pre-login');

  // 2) RBAC soft return via ipc-validate guard
  const softHandler = ipcValidate.guard(async () => {
    const err = new Error('rbac_session_required');
    err.code = 'RBAC_DENIED';
    err.rbac = { error: 'rbac_session_required' };
    throw err;
  });
  return softHandler({}, {}).then(async (soft) => {
    check(soft && soft.ok === false, 'rbac soft ok:false');
    check(String(soft.error || '').includes('rbac') || soft.error === 'RBAC_DENIED', 'rbac soft error code');

    // 3) Owner profile prefers current user
    const OwnerProfile = globalThis.OwnerProfile;
    globalThis.DB = {
      _d: {},
      get(k, d) { return this._d[k] != null ? this._d[k] : d; },
      set(k, v) { this._d[k] = v; return v; },
    };
    globalThis.DB.set('__tdw_owner_profile_v1__', { role: 'owner', username: 'owner1' });
    globalThis.currentUser = { id: 'a1', role: 'admin', active: true };
    check(OwnerProfile.getRole() === 'admin', 'getRole prefers currentUser admin');
    check(OwnerProfile.currentUserIsOwner() === false, 'admin is not owner');
    globalThis.currentUser = { id: 'o1', role: 'owner', active: true };
    check(OwnerProfile.getRole() === 'owner', 'getRole owner');
    check(OwnerProfile.currentUserIsOwner() === true, 'currentUserIsOwner');

    // 4) Login UI includes owner
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    check(/login-role[\s\S]*value="owner"/.test(index), 'login owner option');
    check(/um-role[\s\S]*value="owner"/.test(index), 'user modal owner option');
    check(index.includes('google-sheets-ops.js'), 'sheets ops script wired');
    check(index.includes('connectGoogleDriveOnly') && /startOAuth[\s\S]{0,200}catch/.test(index.replace(/\n/g, ' ')), 'oauth try/catch');

    // 5) Sheets ops soft classification
    check(sheets.classifyVaultError({ message: '429 rate limit' }) === 'rate_limit', 'rate_limit');
    check(sheets.classifyVaultError({ message: 'permission denied' }) === 'permission_denied', 'permission_denied');
    check(sheets.classifyVaultError({ message: 'missing sheet Foo' }) === 'missing_sheet', 'missing_sheet');
    check(sheets.classifyVaultError({ message: 'failed to fetch' }) === 'vault_unreachable', 'vault_unreachable');
    const crashed = await sheets.safeCall('boom', async () => { throw new Error('timeout etimedout'); });
    check(crashed.ok === false && crashed.crash === false && crashed.code === 'network_timeout', 'safeCall no crash');
    const hard = await sheets.safeCall('hard', async () => ({ ok: false, error: 'activation_already_used', message: 'used' }));
    check(hard.ok === false && hard.soft === false && hard.crash === false, 'hard vault rejection stays hard');
    const caps = sheets.capabilityMatrix();
    check(caps.sheetsApiInElectron === false, 'no sheets api claim');

    // 6) oauth-loopback flexible export
    const loop = require('../../electron/cloud-providers/oauth-loopback.js');
    check(typeof loop.startLoopbackServer === 'function', 'loopback start');
    check(typeof loop.startLoopbackServerFlexible === 'function', 'loopback flexible');

    // 7) google-drive connect is soft (syntax load — electron may be stubbed)
    let driveLoadOk = false;
    try {
      driveLoadOk = fs.existsSync(path.join(root, 'electron/cloud-providers/google-drive.js'));
      const src = fs.readFileSync(path.join(root, 'electron/cloud-providers/google-drive.js'), 'utf8');
      check(/startLoopbackServerFlexible/.test(src), 'drive uses flexible loopback');
      check(/resolveFolderPath/.test(src), 'drive find-only path');
      check(/create:\s*false/.test(src), 'download/list no create');
      check(/revokeCredentials|revokeToken/.test(src), 'disconnect revoke');
      check(/code_challenge|createPkcePair|codeVerifier/.test(src), 'pkce enabled');
    } catch (e) {
      errors.push('drive_source:' + e.message);
    }
    check(driveLoadOk, 'google-drive.js present');

    // 8) Role display name + Owner mint guard + expired login allow owner
    const ext = fs.readFileSync(path.join(root, 'cupping-ext-modules.js'), 'utf8');
    check(/owner:\s*'المالك'/.test(ext), 'owner display name');
    check(/فقط المالك \(Owner\) يمكنه تعيين دور Owner|فقط المالك يمكنه إنشاء حساب Owner/.test(index), 'owner mint guard');
    check(/LicenseReadOnlyMode|read-only|قراءة فقط/.test(index) && /_licStatus === 'expired'/.test(index), 'all-role read-only login when license expired');

    // 9) token-store encryption present
    const ts = fs.readFileSync(path.join(root, 'electron/cloud-providers/token-store.js'), 'utf8');
    check(/safeStorage|aes-256-gcm/.test(ts), 'token encryption');

    // 10) role policy owner above admin
    const rp = fs.readFileSync(path.join(root, 'cloud/role-policy.js'), 'utf8');
    check(/ORGANIZATION_OWNER_ROLES[\s\S]*owner/.test(rp), 'org owner roles');
    check(/canManageOrganization/.test(rp), 'canManageOrganization');

    const report = {
      at: new Date().toISOString(),
      ok: errors.length === 0,
      errors,
      publicChannels: publicNeeded,
      sheetsApiInElectron: false,
      pkce: true,
      ownerIndependentRole: true,
    };
    fs.writeFileSync(path.join(evidenceDir, 'stabilization-unit.json'), `${JSON.stringify(report, null, 2)}\n`);

    if (errors.length) {
      console.error('FAIL: v2-5 final stabilization');
      for (const e of errors) console.error(' -', e);
      process.exit(1);
    }
    console.log('OK: v2-5 final stabilization');
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
