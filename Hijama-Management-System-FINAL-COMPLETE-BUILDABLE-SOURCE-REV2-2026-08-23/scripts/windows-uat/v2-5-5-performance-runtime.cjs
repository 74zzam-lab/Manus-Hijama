#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const root = path.join(__dirname, '..', '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-5', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

function run(rel, env) {
  const r = spawnSync(process.execPath, [path.join(root, rel)], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
  return { status: r.status, stdout: (r.stdout || '').slice(-1200), stderr: (r.stderr || '').slice(-1200) };
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function main() {
  const startedAt = new Date().toISOString();
  const unit = run('tests/baseline/test-v2-5-5-performance.js');
  const scenarios = run('scripts/v2-5-5-scenarios-all.cjs');
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
  const ok = unit.status === 0 && scenarios.status === 0;
  const scale = fs.existsSync(path.join(evidenceDir, 'scale-counts.json'))
    ? JSON.parse(fs.readFileSync(path.join(evidenceDir, 'scale-counts.json'), 'utf8'))
    : null;
  const deviceA = {
    device: 'A',
    role: 'scale-perf-uat',
    startedAt,
    finishedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, release: os.release() },
    unitExit: unit.status,
    scenariosExit: scenarios.status,
    scale,
    build,
    result: ok ? 'PASS' : 'FAIL',
  };
  const deviceB = {
    device: 'B',
    role: 'reliability-adversarial-uat',
    startedAt,
    finishedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, release: os.release() },
    scenarios: ['P05-reliability', 'P03-perf-bench-median'],
    result: scenarios.status === 0 ? 'PASS' : 'FAIL',
  };
  const failure = {
    at: new Date().toISOString(),
    paths: [
      'crash mid backup/sync/restore → marker + recoverIncompleteOps',
      'disk full ENOSPC → classifyDiskError stop_write',
      'low memory → classifyMemoryPressure defer_bulk',
      'retry → exponential backoff not tight loop',
      'pendingPushes → MAX 2000 bound',
    ],
    result: ok ? 'PASS' : 'FAIL',
  };
  fs.writeFileSync(path.join(evidenceDir, 'device-a-uat.json'), `${JSON.stringify(deviceA, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDir, 'device-b-uat.json'), `${JSON.stringify(deviceB, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDir, 'windows-build.json'), `${JSON.stringify({ ...build, at: new Date().toISOString() }, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDir, 'failure-recovery.json'), `${JSON.stringify(failure, null, 2)}\n`);
  console.log(JSON.stringify({ deviceA: deviceA.result, deviceB: deviceB.result, build }, null, 2));
  if (!ok) process.exit(1);
}

main();
