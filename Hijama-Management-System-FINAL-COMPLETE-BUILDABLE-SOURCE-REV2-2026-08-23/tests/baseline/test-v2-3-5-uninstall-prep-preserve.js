#!/usr/bin/env node
'use strict';

/**
 * V2-3.5 uninstall-prep: app-only preserves license; full wipe removes roots.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const prep = require('../../electron/uninstall-prep');

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-prep-'));
  const root = path.join(tmp, 'Cupping Center');
  fs.mkdirSync(path.join(root, 'database'), { recursive: true });
  fs.writeFileSync(path.join(root, 'database', 'tadawi.db'), 'db');
  fs.mkdirSync(path.join(root, 'Local Storage'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Local Storage', 'x'), 'lic');

  const appOnly = await prep.runUninstallPrep({
    userDataRoot: root,
    execPath: process.execPath,
    fullRemoval: false,
  });
  check(appOnly.ok === true, 'app-only ok');
  check(appOnly.licensePreserved === true, 'license preserved flag');
  check(appOnly.skippedWipe === true, 'skip wipe');
  check(fs.existsSync(path.join(root, 'Local Storage', 'x')), 'license storage must remain');
  check(fs.existsSync(path.join(root, 'database', 'tadawi.db')), 'db must remain');

  // Full wipe path uses resolveLegacyUserDataRoots which is win32-oriented;
  // call wipe helper directly for unit proof on any OS.
  const wipeRoot = path.join(tmp, 'wipe-me');
  fs.mkdirSync(path.join(wipeRoot, 'Local Storage'), { recursive: true });
  fs.writeFileSync(path.join(wipeRoot, 'Local Storage', 'y'), 'y');
  prep.stripLicenseFilesystem(wipeRoot);
  check(!fs.existsSync(path.join(wipeRoot, 'Local Storage')), 'full wipe helper removes Local Storage');

  fs.rmSync(tmp, { recursive: true, force: true });

  if (errors.length) {
    console.error('FAIL: v2-3.5 uninstall-prep preserve');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }
  console.log('OK: v2-3.5 uninstall-prep app-only preserves license');
})().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
