#!/usr/bin/env node
/**
 * Smoke test for uninstall-prep — V2-3.5:
 * App-only preserves ALL data including license markers.
 * Full removal deletes the live root.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const {
  runUninstallPrep,
  writeUninstallCenterMeta,
  wipeChromiumLicenseStorage,
} = await import(
  pathToFileURL(join(process.cwd(), 'electron/uninstall-prep.js')).href
);

const appData = mkdtempSync(join(tmpdir(), 'tdw-uninstall-'));
const userData = join(appData, 'Cupping Center');
mkdirSync(join(userData, 'cache', 'CTR-001'), { recursive: true });
mkdirSync(join(userData, 'database'), { recursive: true });
mkdirSync(join(userData, 'Local Storage', 'leveldb'), { recursive: true });
mkdirSync(join(userData, 'Session Storage'), { recursive: true });
mkdirSync(join(userData, 'IndexedDB'), { recursive: true });
mkdirSync(join(userData, 'CloudVault', 'tokens'), { recursive: true });
writeFileSync(join(userData, 'cache', 'CTR-001', 'license.json'), JSON.stringify({ licenseId: 'L-1' }));
writeFileSync(join(userData, 'Local Storage', 'leveldb', '000003.log'), '__tdw_lic__=SECRET');
writeFileSync(join(userData, 'Session Storage', '000003.log'), 'session');
writeFileSync(join(userData, 'CloudVault', 'tokens', 'google.json'), '{"refresh":"x"}');
writeFileSync(join(userData, 'database', 'tadawi.db'), 'sqlite-placeholder');
writeFileSync(join(userData, 'tadawi-db.json'), JSON.stringify({ clients: [{ id: 'c1' }] }));
writeUninstallCenterMeta(userData, { centerName: 'مركز اختبار', centerId: 'CTR-001' });

const chromeProbe = join(appData, 'probe');
mkdirSync(join(chromeProbe, 'Local Storage'), { recursive: true });
writeFileSync(join(chromeProbe, 'Local Storage', 'x'), 'x');
const chromeOk = wipeChromiumLicenseStorage(chromeProbe)
  && !existsSync(join(chromeProbe, 'Local Storage'));

const preserve = await runUninstallPrep({
  userDataRoot: userData,
  execPath: process.execPath,
  fullRemoval: false,
  scanLegacyRoots: false,
});

let ok = chromeOk
  && preserve.ok
  && preserve.preserved === true
  && preserve.licensePreserved === true
  && preserve.skippedWipe === true
  && existsSync(userData)
  && existsSync(join(userData, 'database', 'tadawi.db'))
  && existsSync(join(userData, 'tadawi-db.json'))
  && existsSync(join(userData, 'Local Storage'))
  && existsSync(join(userData, 'cache', 'CTR-001', 'license.json'));

writeFileSync(join(userData, 'keep-me.json'), '{}');
const full = await runUninstallPrep({
  userDataRoot: userData,
  execPath: process.execPath,
  fullRemoval: true,
  scanLegacyRoots: false,
});
ok = ok && full.ok && full.fullRemoval === true && !existsSync(userData);

rmSync(appData, { recursive: true, force: true });
if (!ok) {
  console.error('uninstall-prep smoke test FAILED', { preserve, full });
  process.exit(1);
}
console.log('uninstall-prep smoke test PASS (app-only keeps license; full wipe explicit)');
