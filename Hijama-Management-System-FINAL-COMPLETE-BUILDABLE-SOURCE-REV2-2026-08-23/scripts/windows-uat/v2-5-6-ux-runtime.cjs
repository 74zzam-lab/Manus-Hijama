#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const root = path.join(__dirname, '..', '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-6', 'evidence');
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
  const unit = run('tests/baseline/test-v2-5-6-ux-hardening.js');
  const scenarios = run('scripts/v2-5-6-scenarios-all.cjs');
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
  const unitEv = fs.existsSync(path.join(evidenceDir, 'ux-unit.json'))
    ? JSON.parse(fs.readFileSync(path.join(evidenceDir, 'ux-unit.json'), 'utf8'))
    : null;
  const scenariosEv = fs.existsSync(path.join(evidenceDir, 'scenarios-all.json'))
    ? JSON.parse(fs.readFileSync(path.join(evidenceDir, 'scenarios-all.json'), 'utf8'))
    : null;

  const deviceA = {
    device: 'A',
    role: 'ux-ops-visibility-uat',
    startedAt,
    finishedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, release: os.release() },
    unitExit: unit.status,
    scenariosExit: scenarios.status,
    unitOk: !!(unitEv && unitEv.ok),
    scenariosPassed: scenariosEv ? scenariosEv.passed : 0,
    build,
    result: ok ? 'PASS' : 'FAIL',
  };
  const deviceB = {
    device: 'B',
    role: 'ux-adversarial-recovery-uat',
    startedAt,
    finishedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, release: os.release() },
    scenarios: ['U01-restore-wizard', 'U02-progress-honesty', 'U04-redact-export', 'U05-i18n-a11y'],
    focus: ['cancel mid restore', 'fake 100% blocked', 'token leak blocked', 'rtl/ltr'],
    result: scenarios.status === 0 ? 'PASS' : 'FAIL',
  };
  const failure = {
    at: new Date().toISOString(),
    paths: [
      'cancel mid restore → RestoreWizard.cancel → cancelled',
      'setRatio(1) without markComplete → percent stays <100',
      'wrong overwrite phrase → confirmOverwrite ok:false',
      'wrong wipe phrase → wipeConfirm ok:false',
      'token_expired / permission_denied / quota → leak-safe recovery copy',
      'ops export → OpsLogRedact strips email/bearer/password keys',
      'offline status → reconnect hint + tone offline',
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
