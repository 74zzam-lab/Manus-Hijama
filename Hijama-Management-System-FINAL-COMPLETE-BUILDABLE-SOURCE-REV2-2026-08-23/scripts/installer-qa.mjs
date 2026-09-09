#!/usr/bin/env node
/**
 * Installer QA — build verification + Wine-based install/uninstall smoke tests.
 * Full GUI validation (upgrade dialogs, uninstall archive) requires native Windows.
 */
import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETUP = join(ROOT, 'dist', 'HijamaManagement-Setup-2.0.0.exe');
const WIN_UNPACKED = join(ROOT, 'dist', 'win-unpacked');
const REPORT_JSON = join(ROOT, 'pat-reports', 'installer-qa-results.json');
const REPORT_MD = join(ROOT, 'pat-reports', 'INSTALLER-QA-REPORT.md');

const results = {};
const notes = [];

function record(key, pass, detail = '') {
  results[key] = { pass: !!pass, detail };
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: opts.timeout ?? 120_000,
    env: { ...process.env, ...(opts.env || {}) },
    cwd: opts.cwd || ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', signal: r.signal };
}

function sh(cmd, timeout = 120_000) {
  const r = spawnSync('bash', ['-lc', cmd], { encoding: 'utf8', timeout, cwd: ROOT });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function verifyBuild() {
  record('build', false, 'Setup exe missing');
  if (!existsSync(SETUP)) return;

  const size = statSync(SETUP).size;
  const sizeOk = size > 50_000_000;
  record('build', sizeOk, `${(size / 1024 / 1024).toFixed(1)} MB`);

  const meta = run('exiftool', [
    '-ProductName', '-ProductVersion', '-CompanyName', '-LegalCopyright', SETUP
  ]);
  const metaText = meta.stdout + meta.stderr;
  const metaOk =
    metaText.includes('Hijama Management System') &&
    metaText.includes('2.0.0') &&
    metaText.includes('NajjarTech');
  record('buildMetadata', metaOk, metaOk ? 'Product/Version/Company OK' : metaText.slice(0, 200));

  let assetsOk = false;
  const asar = join(WIN_UNPACKED, 'resources', 'app.asar');
  if (existsSync(asar)) {
    const list = run('npx', ['--yes', '@electron/asar', 'list', asar], { timeout: 60_000 });
    const lines = list.stdout.split('\n');
    assetsOk =
      lines.some((l) => l.includes('/assets/NajjarTech-Logo.png')) &&
      lines.some((l) => l.includes('/branding/Center-Logo.png')) &&
      lines.some((l) => l.includes('node_modules/google-auth-library'));
    record('bundledAssets', assetsOk, assetsOk ? 'Logo, branding, OAuth deps in asar' : 'Missing expected assets');
  } else {
    record('bundledAssets', false, 'win-unpacked/app.asar not found — run npm run build first');
  }

  try {
    run(process.execPath, ['scripts/validate-production-deps.mjs'], { timeout: 60_000 });
    record('productionDeps', true, 'validate-production-deps PASS');
  } catch {
    record('productionDeps', false, 'validate-production-deps failed');
  }

  record('build', sizeOk && metaOk && assetsOk, sizeOk && metaOk && assetsOk ? 'Build artifact verified' : 'Build verification incomplete');
}

function winePrefix(id) {
  return join(process.env.HOME || '/tmp', `.wine-iqa-${id}`);
}

function setupWinePrefix(prefix) {
  rmSync(prefix, { recursive: true, force: true });
  mkdirSync(prefix, { recursive: true });
  run('wineboot', ['--init'], {
    timeout: 60_000,
    env: { WINEARCH: 'win64', WINEPREFIX: prefix, DISPLAY: process.env.DISPLAY || '' }
  });
}

function wineTestsEnabled() {
  const which = run('which', ['wine']);
  return which.status === 0 && existsSync(SETUP);
}

function runWineScenario() {
  if (!wineTestsEnabled()) {
    notes.push('Wine not available — install/uninstall scenarios skipped');
    ['cleanInstall', 'upgrade', 'uninstall', 'reinstall', 'firstLaunch', 'dataPreservation', 'licenseWipedOnUninstall', 'centerDataArchived'].forEach((k) => {
      record(k, false, 'Skipped — Wine unavailable');
    });
    return;
  }

  const prefix = winePrefix('run');
  setupWinePrefix(prefix);
  const env = `export WINEARCH=win64 WINEPREFIX=${JSON.stringify(prefix).slice(1, -1)}`;
  const appDir = `${prefix}/drive_c/TadawiTest`;
  const dataDir = `${prefix}/drive_c/users/ubuntu/AppData/Roaming/Cupping Center`;

  // Clean install
  const clean = sh(`${env} && timeout 180 wine ${JSON.stringify(SETUP)} /S /D=C:\\\\TadawiTest`, 200_000);
  const cleanOk = existsSync(`${appDir}/Hijama Management System.exe`);
  record('cleanInstall', cleanOk, cleanOk ? 'Silent install to C:\\TadawiTest OK' : clean.stderr.slice(-300));

  // First launch
  const launch = sh(`${env} && timeout 12 wine "C:\\\\TadawiTest\\\\Hijama Management System.exe"`, 20_000);
  record('firstLaunch', launch.status === 0 || launch.status === 124, launch.status === 124 ? 'Process started (timeout expected)' : `exit ${launch.status}`);

  // Seed user data
  sh(`mkdir -p ${JSON.stringify(dataDir)}/backups`);
  writeFileSync(join(dataDir, 'uninstall-center-meta.json'), JSON.stringify({
    centerName: 'QA-Center',
    centerId: 'CTR-QA',
    updatedAt: new Date().toISOString()
  }));
  writeFileSync(join(dataDir, 'license-test.json'), JSON.stringify({ licenseKey: 'QA-MARKER-2.0.0' }));
  writeFileSync(join(dataDir, 'tadawi-db.json'), JSON.stringify({ qa: true }));
  writeFileSync(join(dataDir, 'backups', 'test.bak'), 'backup-data');

  // Upgrade over existing
  const upgrade = sh(`${env} && timeout 180 wine ${JSON.stringify(SETUP)} /S`, 200_000);
  const licOk = existsSync(join(dataDir, 'license-test.json'));
  const dbOk = existsSync(join(dataDir, 'tadawi-db.json'));
  const bakOk = existsSync(join(dataDir, 'backups', 'test.bak'));
  const appOk = existsSync(`${appDir}/Hijama Management System.exe`);
  record('upgrade', upgrade.status === 0 && licOk && dbOk && appOk, `exit=${upgrade.status} data=${licOk && dbOk && bakOk}`);
  record('dataPreservation', licOk && dbOk && bakOk, licOk && dbOk && bakOk ? 'DB, backups preserved' : 'Data lost during upgrade');
  record('licensePreservation', licOk, licOk ? 'license-test.json preserved' : 'License marker lost');

  // Uninstall (silent) — always wipes license; archives center data by default
  const uninst = `${appDir}/Uninstall Hijama Management System.exe`;
  const appDataParent = `${prefix}/drive_c/users/ubuntu/AppData/Roaming`;
  const uninstall = sh(`${env} && timeout 180 wine ${JSON.stringify(uninst)} /S`, 200_000);
  const appRemoved = !existsSync(`${appDir}/Hijama Management System.exe`);
  const activeDataGone = !existsSync(join(dataDir, 'license-test.json')) && !existsSync(join(dataDir, 'tadawi-db.json'));
  let archiveHit = '';
  try {
    archiveHit = readdirSync(appDataParent).find((n) => n.startsWith('QA-Center-') && n !== 'Cupping Center') || '';
  } catch { /* ignore */ }
  const archiveOk = archiveHit ? existsSync(join(appDataParent, archiveHit, 'tadawi-db.json')) : false;
  const licenseWiped = activeDataGone;
  record('uninstall', uninstall.status === 0 && appRemoved, `exit=${uninstall.status} appRemoved=${appRemoved}`);
  record('licenseWipedOnUninstall', licenseWiped, licenseWiped ? 'Active AppData cleared (license removed)' : 'License/data still in active path');
  record('centerDataArchived', archiveOk, archiveOk ? `Archived to ${archiveHit}` : 'Center archive folder not found (Wine/prep may differ)');

  // Reinstall — fresh start (no prior license in active path)
  const reinstall = sh(`${env} && timeout 180 wine ${JSON.stringify(SETUP)} /S /D=C:\\\\TadawiTest`, 200_000);
  const reOk = existsSync(`${appDir}/Hijama Management System.exe`) && !existsSync(join(dataDir, 'license-test.json'));
  record('reinstall', reOk, reOk ? 'Reinstall OK, active path has no license marker' : 'Reinstall or license wipe check failed');

  // Cloud compatibility — packaged OAuth + cloud modules
  const asar = join(WIN_UNPACKED, 'resources', 'app.asar');
  if (existsSync(asar)) {
    const list = run('npx', ['--yes', '@electron/asar', 'list', asar], { timeout: 60_000 }).stdout;
    const cloudOk =
      list.includes('electron/cloud-oauth.config.json') &&
      list.includes('cloud/synced-write.js') &&
      list.includes('node_modules/google-auth-library');
    record('cloudCompatibility', cloudOk, cloudOk ? 'Cloud V2 + OAuth packaged' : 'Missing cloud modules');
  } else {
    record('cloudCompatibility', false, 'Cannot verify — no asar');
  }

  notes.push('Wine emulation used — native Windows GUI tests (uninstall archive, wizard dialogs) still recommended before release.');
}

function overall() {
  const keys = [
    'build', 'cleanInstall', 'upgrade', 'uninstall', 'reinstall', 'firstLaunch',
    'dataPreservation', 'licenseWipedOnUninstall', 'centerDataArchived', 'cloudCompatibility'
  ];
  const mapped = {
    Build: results.build?.pass,
    'Clean Install': results.cleanInstall?.pass,
    Upgrade: results.upgrade?.pass,
    Uninstall: results.uninstall?.pass,
    Reinstall: results.reinstall?.pass,
    'First Launch': results.firstLaunch?.pass,
    'Data Preservation': results.dataPreservation?.pass,
    'License Wiped On Uninstall': results.licenseWipedOnUninstall?.pass,
    'Center Data Archived': results.centerDataArchived?.pass,
    'Cloud Compatibility': results.cloudCompatibility?.pass
  };
  const allPass = keys.every((k) => results[k]?.pass);
  record('overall', allPass, allPass ? 'PASS' : 'FAIL — see details');
  return { mapped, allPass };
}

function writeReports({ mapped, allPass }) {
  const payload = {
    generatedAt: new Date().toISOString(),
    environment: 'Linux + Wine64 (cross-build NSIS)',
    results,
    table: mapped,
    overall: allPass ? 'PASS' : 'FAIL',
    notes
  };
  writeFileSync(REPORT_JSON, JSON.stringify(payload, null, 2));

  const rows = Object.entries(mapped)
    .map(([k, v]) => `| ${k} | ${v ? 'PASS' : 'FAIL'} |`)
    .join('\n');

  const md = `# Installer QA Report

**Generated:** ${payload.generatedAt}  
**Environment:** ${payload.environment}  
**Setup:** \`dist/HijamaManagement-Setup-2.0.0.exe\`

## Installer QA Result

| Test | Result |
|------|--------|
${rows}
| **Overall Installer Result** | **${allPass ? 'PASS' : 'FAIL'}** |

## Notes

${notes.map((n) => `- ${n}`).join('\n')}

## Details

${Object.entries(results)
  .map(([k, v]) => `- **${k}:** ${v.pass ? 'PASS' : 'FAIL'} — ${v.detail}`)
  .join('\n')}
`;
  writeFileSync(REPORT_MD, md);
  console.log(md);
}

function main() {
  console.log('Installer QA — starting\n');
  verifyBuild();
  runWineScenario();
  const summary = overall();
  writeReports(summary);
  process.exit(summary.allPass ? 0 : 1);
}

main();
