#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const limitsSrc = fs.readFileSync(path.join(root, 'cloud', 'license-limits.js'), 'utf8');
const regSrc = fs.readFileSync(path.join(root, 'cloud', 'device-registry.js'), 'utf8');
const errors = [];
function check(ok, msg) { if (!ok) errors.push(msg); }

const sandbox = {
  console,
  DeviceConfig: {
    getLockedBranchId() { return 'BR-MAIN'; },
    load() { return { deviceUuid: 'dev-a' }; },
    ensureDeviceUuid() { return 'dev-a'; }
  },
  LicenseCloud: {
    _doc: null,
    loadLocal() { return this._doc; },
    saveLocal(doc) { this._doc = doc; }
  },
  CommercialLicense: {
    crypto: {
      canonicalJson(obj) { return JSON.stringify(obj); },
      async hmacSha256Hex() { return 'sig'; }
    }
  },
  APP_VERSION: '2.0.0'
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

try { vm.runInNewContext(limitsSrc, sandbox, { timeout: 1000 }); } catch (e) { errors.push('limits eval failed: ' + e.message); }
try { vm.runInNewContext(regSrc, sandbox, { timeout: 1000 }); } catch (e) { errors.push('registry eval failed: ' + e.message); }

const lic = {
  limits: { maxDevices: 2 },
  branches: [{ id: 'BR-MAIN', active: true }],
  devices: {
    registered: [
      { deviceUuid: 'dev-a', active: true, branchId: 'BR-MAIN' },
      { deviceUuid: 'dev-b', active: true, branchId: 'BR-MAIN' }
    ]
  }
};

const gateNew = sandbox.LicenseLimits.canRegisterDevice(lic, { deviceUuid: 'dev-c', branchId: 'BR-MAIN' });
check(gateNew.ok === false && gateNew.error === 'device_limit_reached', 'new third device should be blocked');

const gateSame = sandbox.LicenseLimits.canRegisterDevice(lic, { deviceUuid: 'dev-a', branchId: 'BR-MAIN' });
check(gateSame.ok === true && gateSame.grandfathered === true, 'existing device should be grandfathered');

const gateBranch = sandbox.LicenseLimits.canRegisterDevice(lic, { deviceUuid: 'dev-c', branchId: 'BR-X' });
check(gateBranch.ok === false && gateBranch.error === 'branch_not_licensed', 'unlicensed branch should be blocked');

// Wiring check: DeviceRegistry should pass deviceUuid to LicenseLimits gate.
check(regSrc.includes('deviceUuid: uuid'), 'DeviceRegistry must pass deviceUuid to license limit gate');

if (errors.length) {
  console.error('FAIL: phase26 device limits');
  for (const err of errors) console.error(' -', err);
  process.exit(1);
}
console.log('OK: phase26 device limits checks');
