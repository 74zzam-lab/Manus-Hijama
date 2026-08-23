#!/usr/bin/env node
'use strict';

/**
 * Windows restore/DR runtime for V2-5.1 (runs on windows-2022 GHA or local Node).
 * Produces docs/integration-v2-5-1/evidence/device-a-uat.json and device-b-uat.json
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..', '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-1', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', env: process.env });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function sha256File(filePath) {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function findInstaller() {
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(dist)) return null;
  const exe = fs.readdirSync(dist).filter((n) => /Setup-.*\.exe$/i.test(n)).sort().pop();
  return exe ? path.join(dist, exe) : null;
}

function main() {
  const startedAt = new Date().toISOString();
  const scenarios = run(process.execPath, [path.join(root, 'scripts', 'v2-5-1-scenarios-all.cjs')]);
  const unit = run(process.execPath, [path.join(root, 'tests', 'backup', 'backup-restore-v2.test.js')]);
  const installer = findInstaller();
  const winUnpacked = path.join(root, 'dist', 'win-unpacked', 'Hijama Management System.exe');
  const build = {
    platform: process.platform,
    arch: process.arch,
    installer: installer && fs.existsSync(installer)
      ? { path: path.relative(root, installer), size: fs.statSync(installer).size, sha256: sha256File(installer) }
      : null,
    winUnpacked: fs.existsSync(winUnpacked)
      ? { path: path.relative(root, winUnpacked), size: fs.statSync(winUnpacked).size, sha256: sha256File(winUnpacked) }
      : null,
  };

  const deviceA = {
    device: 'A',
    role: 'full-restore-uat',
    startedAt,
    finishedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, release: os.release() },
    scenariosExit: scenarios.status,
    unitExit: unit.status,
    build,
    result: scenarios.status === 0 && unit.status === 0 ? 'PASS' : 'FAIL',
    evidence: {
      scenarios: 'docs/integration-v2-5-1/evidence/scenarios-all.json',
      unit: 'tests/backup/backup-restore-v2.test.js',
    },
  };

  const deviceB = {
    device: 'B',
    role: 'new-device-restore-uat',
    startedAt,
    finishedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, release: os.release() },
    scenario: 'S09-new-device-cloud-only',
    scenariosExit: scenarios.status,
    build,
    result: scenarios.status === 0 ? 'PASS' : 'FAIL',
    evidence: {
      scenario: 'docs/integration-v2-5-1/evidence/scenarios/S09-new-device-cloud-only.json',
    },
  };

  fs.writeFileSync(path.join(evidenceDir, 'device-a-uat.json'), `${JSON.stringify(deviceA, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDir, 'device-b-uat.json'), `${JSON.stringify(deviceB, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDir, 'windows-build.json'), `${JSON.stringify({ ...build, at: new Date().toISOString() }, null, 2)}\n`);
  fs.writeFileSync(
    path.join(evidenceDir, 'failure-recovery.json'),
    `${JSON.stringify({
      at: new Date().toISOString(),
      scenarios: ['S06-reject-wrong-center-branch', 'S07-corrupt-atomic-rollback', 'S10-no-silent-empty-fallback', 'S12-resume-after-interrupt'],
      result: scenarios.status === 0 ? 'PASS' : 'FAIL',
    }, null, 2)}\n`
  );

  console.log(JSON.stringify({ deviceA: deviceA.result, deviceB: deviceB.result, build }, null, 2));
  if (deviceA.result !== 'PASS' || deviceB.result !== 'PASS') process.exit(1);
}

main();
