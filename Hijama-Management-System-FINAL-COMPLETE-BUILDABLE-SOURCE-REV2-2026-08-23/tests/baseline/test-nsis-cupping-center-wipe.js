#!/usr/bin/env node
'use strict';

/**
 * V2-3.5 — NSIS / uninstall-prep persistence policy (App-only keeps license).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const nsh = fs.readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8');
const prep = fs.readFileSync(path.join(root, 'electron', 'uninstall-prep.js'), 'utf8');
const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

check(nsh.includes('!macro customRemoveFiles'), 'customRemoveFiles required');
check(nsh.includes('UPDATE detected — preserving Cupping Center userData'), 'update must preserve userData');
check(nsh.includes('${if} ${isUpdated}'), 'must branch on isUpdated');
check(nsh.includes('RMDir /r $INSTDIR'), 'must still remove INSTDIR');
check(nsh.includes('App-only uninstall — preserving ALL'), 'mode 0 must preserve ALL userData');
check(nsh.includes('FINAL CONFIRMATION'), 'full wipe must require second confirmation');
check(nsh.includes('/FULLWIPE='), 'silent full wipe must require explicit /FULLWIPE=1');
check(nsh.includes('IfSilent nt_un_silent'), 'silent path must default preserve');
check(!nsh.includes('License data will ALWAYS be permanently deleted'), 'must not always wipe license');
check(!nsh.includes('license cleared'), 'must not claim license cleared on app-only');
check(/StrCpy \$NT_UninstallMode "0"/.test(nsh), 'default uninstall mode must be preserve (0)');
check(nsh.includes('preserve mode — no second-pass AppData wipe'), 'customUnInstall must not wipe in preserve mode');
check(nsh.includes('KEEP all local data, license'), 'welcome text must keep license by default');

check(prep.includes('licensePreserved: true'), 'app-only uninstall-prep must preserve license');
check(prep.includes('skippedWipe: true'), 'app-only must skip wipe');
check(prep.includes('fullRemoval'), 'fullRemoval gate required');

nsh.split('\n').forEach((line, i) => {
  if (!/MessageBox/i.test(line)) return;
  const jumpLabels = (line.match(/\bID(?:YES|NO|OK|CANCEL)\s+\w+/g) || []).length;
  if (jumpLabels > 2) errors.push(`installer.nsh:${i + 1} MessageBox has ${jumpLabels} jump labels (NSIS max 2)`);
});

if (errors.length) {
  console.error('FAIL: nsis persistence policy');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('OK: nsis persistence — update/app-only keep data+license; full wipe explicit');
