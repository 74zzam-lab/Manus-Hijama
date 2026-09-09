'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const sourcePath = path.join(root, 'cloud', 'auth-credential-truth.js');
const source = fs.readFileSync(sourcePath, 'utf8');

async function loadAndEnsure({ hydrate, immediateTimeout = false }) {
  const context = {
    console,
    Promise,
    clearTimeout,
    setTimeout: immediateTimeout ? (fn) => { fn(); return 1; } : setTimeout,
    globalThis: null,
    users: [{ id: 'u-1', role: 'reception', active: true, password: 'hash' }],
    SqliteBridge: { bootFromSQLiteSoTOnce: hydrate },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: sourcePath });
  return context.AuthCredentialTruth.ensureAuthCredentialsReady();
}

(async () => {
  const explicitFailure = await loadAndEnsure({
    hydrate: async () => ({ ok: false, error: 'hydrate_failed' }),
  });
  assert.strictEqual(explicitFailure.ok, false, 'explicit SQLite hydrate failure must not report auth ready');
  assert.strictEqual(explicitFailure.error, 'hydrate_failed');

  const timeoutFailure = await loadAndEnsure({
    hydrate: () => new Promise(() => {}),
    immediateTimeout: true,
  });
  assert.strictEqual(timeoutFailure.ok, false, 'hydrate timeout must not report auth ready');
  assert.strictEqual(timeoutFailure.error, 'auth_hydration_timeout');
  assert.strictEqual(timeoutFailure.timedOut, true);

  const rejectedFailure = await loadAndEnsure({
    hydrate: async () => { throw new Error('hydrate_rejected'); },
  });
  assert.strictEqual(rejectedFailure.ok, false, 'rejected SQLite hydrate must become a truthful result');
  assert.strictEqual(rejectedFailure.error, 'auth_hydration_failed');

  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const callerChecks = index.match(/AuthCredentialTruth\.ensureAuthCredentialsReady\(\)[\s\S]{0,450}?\.ok/g) || [];
  assert(callerChecks.length >= 2, 'login and post-hydrate reconciliation must branch on the readiness result');

  console.log('PASS remediation:auth-hydration-truth');
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
