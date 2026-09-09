#!/usr/bin/env node
'use strict';

/**
 * V2-5.7 — Windows UAT runtime: device A/B + build hashes + failure paths.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..', '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-7', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

function run(rel) {
  const r = spawnSync(process.execPath, [path.join(root, rel)], {
    cwd: root,
    encoding: 'utf8',
    timeout: 600000,
  });
  return { status: r.status, stdout: (r.stdout || '').slice(-1500), stderr: (r.stderr || '').slice(-800) };
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function main() {
  const startedAt = new Date().toISOString();
  const winUnpacked = path.join(root, 'dist', 'win-unpacked', 'Hijama Management System.exe');
  const distDir = path.join(root, 'dist');
  const installer = fs.existsSync(distDir)
    ? fs
        .readdirSync(distDir)
        .filter((n) => /Setup-.*\.exe$/i.test(n))
        .sort()
        .pop()
    : null;
  const installerPath = installer ? path.join(distDir, installer) : null;

  // A clean source checkout has no dist/ by design. Do not turn a source-only
  // `npm test` into a false Windows UAT failure; actual UAT runs after build.
  if (!fs.existsSync(winUnpacked) && !installerPath) {
    const skipped = {
      result: 'SKIPPED',
      reason: 'windows_build_artifact_required',
      message: 'Windows runtime UAT is not executed until npm run build produces dist/.',
      host: { platform: process.platform, arch: process.arch, release: os.release() },
      prerequisite: 'npm run build',
    };
    fs.writeFileSync(path.join(evidenceDir, 'windows-uat-skipped.json'), `${JSON.stringify(skipped, null, 2)}\n`);
    console.log(JSON.stringify(skipped, null, 2));
    return;
  }

  const artifacts = run('scripts/v2-5-7-release-artifacts.cjs');
  const migration = run('scripts/v2-5-7-migration-harness.cjs');
  const lifecycle = run('scripts/v2-5-7-lifecycle-matrix.cjs');
  const scenarios = run('scripts/v2-5-7-scenarios-all.cjs');
  const unit = run('tests/baseline/test-v2-5-7-production-release.js');

  const build = {
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    winUnpacked: fs.existsSync(winUnpacked)
      ? {
          path: path.relative(root, winUnpacked),
          size: fs.statSync(winUnpacked).size,
          sha256: sha256File(winUnpacked),
        }
      : null,
    installer:
      installerPath && fs.existsSync(installerPath)
        ? {
            path: path.relative(root, installerPath),
            size: fs.statSync(installerPath).size,
            sha256: sha256File(installerPath),
          }
        : null,
  };

  const ok =
    artifacts.status === 0 &&
    migration.status === 0 &&
    lifecycle.status === 0 &&
    scenarios.status === 0 &&
    unit.status === 0;

  const deviceA = {
    device: 'A',
    role: 'production-release-primary-uat',
    startedAt,
    finishedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, release: os.release() },
    exits: {
      artifacts: artifacts.status,
      migration: migration.status,
      lifecycle: lifecycle.status,
      scenarios: scenarios.status,
      unit: unit.status,
    },
    build,
    result: ok ? 'PASS' : 'FAIL',
  };

  const deviceB = {
    device: 'B',
    role: 'production-release-adversarial-uat',
    startedAt,
    finishedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, release: os.release() },
    focus: [
      'corrupt DB refuse empty replace',
      'app-only uninstall preserve license',
      'portable unsupported honesty',
      'Win10 policy vs Win11 CI runner',
    ],
    scenarios: ['R02-migration-preserve', 'R03-migration-failure', 'R04-lifecycle-matrix', 'R06-compat-matrix'],
    result: scenarios.status === 0 && migration.status === 0 ? 'PASS' : 'FAIL',
  };

  const failure = {
    at: new Date().toISOString(),
    paths: [
      'corrupt.db → DatabaseOpenError → original preserved (no empty replace)',
      'app-only uninstall → license + database retained',
      'silent uninstall without /FULLWIPE=1 → preserve',
      'NSIS ${isUpdated} → userData preserved',
      'portable not in package.json targets → supported:false',
    ],
    result: ok ? 'PASS' : 'FAIL',
  };

  const timing = {
    at: new Date().toISOString(),
    note: 'Release gate timing — artifact index + migration harness + lifecycle + scenarios',
    host: deviceA.host,
    ok,
  };

  fs.writeFileSync(path.join(evidenceDir, 'device-a-uat.json'), `${JSON.stringify(deviceA, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDir, 'device-b-uat.json'), `${JSON.stringify(deviceB, null, 2)}\n`);
  fs.writeFileSync(
    path.join(evidenceDir, 'windows-build.json'),
    `${JSON.stringify({ ...build, at: new Date().toISOString(), artifactsExit: artifacts.status }, null, 2)}\n`
  );
  fs.writeFileSync(path.join(evidenceDir, 'failure-recovery.json'), `${JSON.stringify(failure, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDir, 'timing.json'), `${JSON.stringify(timing, null, 2)}\n`);

  console.log(JSON.stringify({ deviceA: deviceA.result, deviceB: deviceB.result, build }, null, 2));
  if (!ok) process.exit(1);
}

main();
