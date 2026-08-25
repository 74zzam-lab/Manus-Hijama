'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const licenseData = require('../../electron/license-data');
const rbac = require('../../electron/rbac-session');

const setupToken = 'one-time-test-token';
const signedLicense = licenseData.signDocument({
  centerId: 'CENTER-A',
  licenseVersion: 1,
  branches: [{ id: 'BR-A' }],
  ownerBootstrap: { tokenHash: licenseData.hashBootstrapToken(setupToken), consumed: false },
});
assert.strictEqual(licenseData.verifySignedDocument(signedLicense).ok, true, 'signed cache license must verify in main');
assert.strictEqual(licenseData.verifyBootstrapToken(setupToken, signedLicense.ownerBootstrap.tokenHash), true, 'correct setup token must verify');
assert.strictEqual(licenseData.verifyBootstrapToken('wrong-token', signedLicense.ownerBootstrap.tokenHash), false, 'wrong setup token must be rejected');
assert.strictEqual(
  rbac.sessionAllowsChannel(null, 'owner:provisionInitial', {} ).ok,
  false,
  'owner provisioning must reject a renderer-only call without main bootstrap context'
);
assert.strictEqual(
  rbac.sessionAllowsChannel(null, 'owner:provisionInitial', { __trustedIpcContext: { bootstrapPhase: true } }).ok,
  true,
  'main bootstrap context may enter the narrow owner provisioning handler'
);

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'cloud', 'owner-bootstrap.js'), 'utf8');
const ownerFormSource = fs.readFileSync(path.join(__dirname, '..', '..', 'cloud', 'owner-create-form.js'), 'utf8');
const ownerManagementSource = fs.readFileSync(path.join(__dirname, '..', '..', 'cloud', 'owner-management.js'), 'utf8');
const ownerMigrationSource = fs.readFileSync(path.join(__dirname, '..', '..', 'cloud', 'owner-migration.js'), 'utf8');
assert.match(ownerFormSource, /main_owner_provisioning_required/, 'OwnerCreateForm must refuse renderer-side first-owner creation in Electron');
assert.match(ownerManagementSource, /needsBootstrap && \(global\.cuppingElectron \|\| global\.tadawi\)/, 'OwnerManagement must fence Electron bootstrap from renderer creation');
assert.match(ownerMigrationSource, /main_owner_mutation_required/, 'OwnerMigration must not mutate owner roles in Electron renderer');
let forwarded = null;
const sandbox = {
  console,
  TextEncoder,
  globalThis: null,
  cuppingElectron: {
    owner: {
      provisionInitial: async (payload) => {
        forwarded = payload;
        return { ok: true, user: { username: payload.username, role: 'owner' } };
      },
    },
  },
  LicenseCloud: { loadLocal: () => ({ centerId: 'CENTER-A' }) },
  CenterId: { getStoredCenterId: () => 'CENTER-A' },
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'owner-bootstrap.js' });

(async () => {
  const result = await sandbox.OwnerBootstrap.redeemSetupToken(setupToken, {
    username: 'owner_a', password: 'correct horse battery staple', recoveryCode: 'RECOVERY-1', fullName: 'Owner A',
  });
  assert.strictEqual(result.ok, true, 'renderer must receive the main provisioning result');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(forwarded)), {
    centerId: 'CENTER-A',
    setupToken,
    username: 'owner_a',
    password: 'correct horse battery staple',
    recoveryCode: 'RECOVERY-1',
    fullName: 'Owner A',
  }, 'renderer must forward only credential input and token; it must not select role or hashes');
  console.log('PASS remediation:first-owner-main-authority');
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
