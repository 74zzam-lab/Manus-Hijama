#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const root = path.join(__dirname, '..', '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-4', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

function run(rel) {
  const r = spawnSync(process.execPath, [path.join(root, rel)], { cwd: root, encoding: 'utf8', env: process.env });
  return { status: r.status, stdout: (r.stdout || '').slice(-800), stderr: (r.stderr || '').slice(-800) };
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function main() {
  const startedAt = new Date().toISOString();
  const scenarios = run('scripts/v2-5-4-scenarios-all.cjs');
  const unit = run('tests/baseline/test-v2-5-4-rbac-audit.js');
  const winUnpacked = path.join(root, 'dist', 'win-unpacked', 'Hijama Management System.exe');
  const installer = fs.existsSync(path.join(root, 'dist'))
    ? fs.readdirSync(path.join(root, 'dist')).filter((n) => /Setup-.*\.exe$/i.test(n)).sort().pop()
    : null;
  const installerPath = installer ? path.join(root, 'dist', installer) : null;
  const build = {
    platform: process.platform,
    arch: process.arch,
    winUnpacked: fs.existsSync(winUnpacked)
      ? { path: path.relative(root, winUnpacked), size: fs.statSync(winUnpacked).size, sha256: sha256File(winUnpacked) }
      : null,
    installer: installerPath && fs.existsSync(installerPath)
      ? { path: path.relative(root, installerPath), size: fs.statSync(installerPath).size, sha256: sha256File(installerPath) }
      : null,
  };
  const ok = scenarios.status === 0 && unit.status === 0;
  const deviceA = {
    device: 'A', role: 'role-by-role-uat', startedAt, finishedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, release: os.release() },
    scenariosExit: scenarios.status, unitExit: unit.status, build,
    result: ok ? 'PASS' : 'FAIL',
  };
  const deviceB = {
    device: 'B', role: 'adversarial-ipc-uat', startedAt, finishedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, release: os.release() },
    scenarios: ['R02-tamper-and-deny-audit', 'R03-ipc-session-policy'],
    result: scenarios.status === 0 ? 'PASS' : 'FAIL',
  };
  fs.writeFileSync(path.join(evidenceDir, 'device-a-uat.json'), `${JSON.stringify(deviceA, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDir, 'device-b-uat.json'), `${JSON.stringify(deviceB, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDir, 'windows-build.json'), `${JSON.stringify({ ...build, at: new Date().toISOString() }, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDir, 'failure-recovery.json'), `${JSON.stringify({
    at: new Date().toISOString(),
    scenarios: ['R02-tamper-and-deny-audit', 'R03-ipc-session-policy'],
    result: scenarios.status === 0 ? 'PASS' : 'FAIL',
  }, null, 2)}\n`);
  console.log(JSON.stringify({ deviceA: deviceA.result, deviceB: deviceB.result, build }, null, 2));
  if (!ok) process.exit(1);
}

main();
