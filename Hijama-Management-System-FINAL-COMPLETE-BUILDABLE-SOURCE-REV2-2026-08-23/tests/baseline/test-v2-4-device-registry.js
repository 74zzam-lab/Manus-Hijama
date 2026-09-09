#!/usr/bin/env node
'use strict';

/**
 * Device registry approve/revoke/canSync (Node vm load of cloud/device-registry.js).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

async function main() {
  const context = {
    window: {},
    globalThis: {},
    console,
    APP_VERSION: '2.0.1-test',
  };
  context.window = context;
  context.globalThis = context;

  let licenseDoc = {
    centerId: 'CTR-T',
    licenseVersion: 1,
    devices: { registered: [] },
    limits: { maxDevices: 5 },
  };

  context.LicenseCloud = {
    loadLocal: () => licenseDoc,
    saveLocal: (d) => { licenseDoc = d; },
    pushToDrive: async () => ({ ok: true }),
    verifyLicenseDoc: async () => true,
  };
  context.DeviceConfig = {
    ensureDeviceUuid: () => 'DEV-NEW',
    load: () => ({ deviceUuid: 'DEV-NEW', deviceName: 'PC-B' }),
  };
  context.LicenseLimits = {
    canRegisterDevice: () => ({ ok: true }),
  };
  context.OwnerProfile = { getRole: () => 'owner', currentUserIsOwner: () => true };
  context.currentUser = { id: 'owner-1', role: 'owner', fullName: 'Owner' };
  context.AuditLogger = { log: () => {} };
  context.CommercialLicense = null;

  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../cloud/device-registry.js'), 'utf8'), context);

  const DR = context.DeviceRegistry;
  check(!!DR, 'DeviceRegistry loaded');
  check(DR.canSync(licenseDoc, 'unknown').ok === true, 'unregistered may sync (bootstrap)');

  const req = await DR.requestEnrollment({ deviceName: 'PC-B', branchId: 'BR-A' });
  check(req.ok && req.pending, 'enrollment pending');
  check(DR.canSync(licenseDoc, 'DEV-NEW').ok === false, 'pending cannot sync');
  check((DR.listPending(licenseDoc) || []).length === 1, 'pending listed');

  const appr = await DR.approveDevice('DEV-NEW', { branchId: 'BR-A' });
  check(appr.ok, 'approve ok');
  check(DR.canSync(licenseDoc, 'DEV-NEW').ok === true, 'approved can sync');

  const rev = await DR.revokeDevice('DEV-NEW', { reason: 'lost' });
  check(rev.ok, 'revoke ok');
  check(DR.canSync(licenseDoc, 'DEV-NEW').ok === false, 'revoked cannot sync');
  const stillThere = DR.findDevice(licenseDoc, 'DEV-NEW');
  check(stillThere && stillThere.status === 'revoked', 'device row preserved (no DB wipe)');

  context.OwnerProfile.getRole = () => 'employee';
  context.OwnerProfile.currentUserIsOwner = () => false;
  context.currentUser = { id: 'emp-1', role: 'employee', fullName: 'Employee' };
  const denied = await DR.approveDevice('DEV-NEW');
  check(denied.ok === false && denied.error === 'owner_required', 'employee cannot approve');

  if (errors.length) {
    console.error('FAIL: v2-4 device registry');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('OK: v2-4 device registry enroll/approve/revoke');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
