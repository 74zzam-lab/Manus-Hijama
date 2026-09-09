#!/usr/bin/env node
'use strict';

/**
 * V2-5.7 — Index release artifacts under dist/: Setup exe, win-unpacked exe,
 * portable (if any), icons from package.json, SHA-256 checksums.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-7', 'evidence');
const distDir = path.join(root, 'dist');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function rel(p) {
  return path.relative(root, p).split(path.sep).join('/');
}

function fileInfo(abs) {
  if (!abs || !fs.existsSync(abs)) return null;
  const st = fs.statSync(abs);
  return {
    path: rel(abs),
    sizeBytes: st.size,
    sha256: sha256File(abs),
    mtime: st.mtime.toISOString(),
  };
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) walkFiles(abs, acc);
    else acc.push(abs);
  }
  return acc;
}

function findSetupExes() {
  if (!fs.existsSync(distDir)) return [];
  return fs
    .readdirSync(distDir)
    .filter((n) => /Setup-.*\.exe$/i.test(n) || /HijamaManagement-Setup.*\.exe$/i.test(n))
    .map((n) => path.join(distDir, n))
    .filter((p) => fs.statSync(p).isFile())
    .sort();
}

function findPortableArtifacts(pkg) {
  const targets = (((pkg.build || {}).win || {}).target || []);
  const targetNames = targets.map((t) => (typeof t === 'string' ? t : t && t.target)).filter(Boolean);
  const portableConfigured = targetNames.some((t) => /portable/i.test(String(t)));
  const portableFiles = [];
  if (fs.existsSync(distDir)) {
    for (const n of fs.readdirSync(distDir)) {
      if (/portable/i.test(n) && /\.exe$/i.test(n)) {
        portableFiles.push(path.join(distDir, n));
      }
    }
  }
  if (!portableConfigured) {
    return {
      supported: false,
      reason:
        'package.json build.win.target lists only nsis (x64); portable is not an official build target for V2-5.7',
      configuredTargets: targetNames,
      foundArtifacts: portableFiles.map((p) => rel(p)),
    };
  }
  return {
    supported: true,
    configuredTargets: targetNames,
    artifacts: portableFiles.map((p) => fileInfo(p)).filter(Boolean),
  };
}

function inspectExeIcon(exePath) {
  if (!exePath || !fs.existsSync(exePath)) {
    return { ok: false, reason: 'exe_missing' };
  }
  const r = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'inspect-win-exe-icon.cjs'), exePath],
    { cwd: root, encoding: 'utf8', timeout: 120000 }
  );
  try {
    return JSON.parse((r.stdout || '').trim() || '{}');
  } catch {
    return {
      ok: r.status === 0,
      status: r.status,
      stderr: (r.stderr || '').slice(0, 400),
    };
  }
}

function buildSourceArchive() {
  const outPath = path.join(evidenceDir, 'source-archive-manifest.json');
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const sha = (r.stdout || '').trim() || 'UNKNOWN';
  const short = sha.slice(0, 12);
  const archiveName = `source-release-${short}.tar.gz`;
  const archivePath = path.join(evidenceDir, archiveName);
  const paths = [
    'package.json',
    'package-lock.json',
    'electron',
    'database',
    'cloud',
    'build',
    'license',
    'renderer',
    'scripts/verify-v2-5-7-completion.cjs',
    'scripts/v2-5-7-release-artifacts.cjs',
    'scripts/v2-5-7-migration-harness.cjs',
    'scripts/v2-5-7-lifecycle-matrix.cjs',
    'docs/integration-v2-5-7/00-CURRENT-REALITY.md',
    'docs/integration-v2-5-7/01-TARGET-DESIGN.md',
    'docs/integration-v2-5-7/09-RELEASE-READINESS.md',
    'docs/integration-v2-5-7/REQUIREMENTS-TRACEABILITY.md',
    '.github/workflows/v2-5-7-release-gate.yml',
  ].filter((p) => fs.existsSync(path.join(root, p)));

  if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);

  // Write to /tmp first so we never tar the archive into itself
  const tmpArchive = path.join(os.tmpdir(), archiveName);
  if (fs.existsSync(tmpArchive)) fs.unlinkSync(tmpArchive);

  let method = 'tar';
  let arch = spawnSync('tar', ['-czf', tmpArchive, ...paths], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120000,
  });
  if (arch.status !== 0 || !fs.existsSync(tmpArchive) || fs.statSync(tmpArchive).size === 0) {
    method = 'git-archive';
    const committed = paths.filter((p) => {
      const ls = spawnSync('git', ['ls-files', '--error-unmatch', p], {
        cwd: root,
        encoding: 'utf8',
      });
      return ls.status === 0;
    });
    arch = spawnSync(
      'git',
      ['archive', '--format=tar.gz', `-o`, tmpArchive, 'HEAD', ...committed],
      { cwd: root, encoding: 'utf8', timeout: 120000 }
    );
  }

  if (arch.status === 0 && fs.existsSync(tmpArchive) && fs.statSync(tmpArchive).size > 0) {
    fs.copyFileSync(tmpArchive, archivePath);
    try {
      fs.unlinkSync(tmpArchive);
    } catch {
      /* ignore */
    }
  }

  const info =
    fs.existsSync(archivePath) && fs.statSync(archivePath).size > 0
      ? { ...fileInfo(archivePath), ok: true }
      : {
          ok: false,
          status: arch.status,
          stderr: (arch.stderr || '').slice(0, 400),
        };
  const manifest = {
    at: new Date().toISOString(),
    commit: sha,
    archive: info,
    method: info.ok ? method : 'failed',
    paths,
  };
  fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function main() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const build = pkg.build || {};
  const nsis = build.nsis || {};
  const win = build.win || {};

  const setupExes = findSetupExes();
  const latestSetup = setupExes.length ? setupExes[setupExes.length - 1] : null;
  const winUnpackedExe = path.join(distDir, 'win-unpacked', 'Hijama Management System.exe');
  const winUnpackedDir = path.join(distDir, 'win-unpacked');

  const icons = {
    appIcon: build.icon || null,
    winIcon: win.icon || null,
    installerIcon: nsis.installerIcon || null,
    uninstallerIcon: nsis.uninstallerIcon || null,
    installerHeaderIcon: nsis.installerHeaderIcon || null,
    exists: {},
  };
  for (const [k, v] of Object.entries(icons)) {
    if (k === 'exists' || !v) continue;
    icons.exists[k] = fs.existsSync(path.join(root, v));
  }

  const portable = findPortableArtifacts(pkg);
  const setupInfo = latestSetup ? fileInfo(latestSetup) : null;
  const unpackedInfo = fileInfo(winUnpackedExe);
  const iconInspect = inspectExeIcon(
    fs.existsSync(winUnpackedExe) ? winUnpackedExe : latestSetup
  );

  const sourceArchive = buildSourceArchive();

  const checksumLines = [];
  const artifacts = {
    setup: setupInfo,
    allSetupExes: setupExes.map((p) => fileInfo(p)),
    winUnpacked: unpackedInfo,
    winUnpackedPresent: fs.existsSync(winUnpackedDir),
    portable,
    icons,
    iconInspect,
    sourceArchive,
  };

  for (const item of [...(artifacts.allSetupExes || []), unpackedInfo].filter(Boolean)) {
    checksumLines.push(`${item.sha256}  ${item.path}`);
  }
  if (portable.supported && Array.isArray(portable.artifacts)) {
    for (const item of portable.artifacts) {
      checksumLines.push(`${item.sha256}  ${item.path}`);
    }
  }
  if (sourceArchive.archive && sourceArchive.archive.sha256) {
    checksumLines.push(`${sourceArchive.archive.sha256}  ${sourceArchive.archive.path}`);
  }

  const artifactsPresent = !!(setupInfo || unpackedInfo);
  const iconsOk = icons.exists.appIcon !== false && Object.values(icons.exists).every((v) => v !== false);
  const report = {
    phase: 'V2-5.7',
    at: new Date().toISOString(),
    version: pkg.version,
    productName: build.productName || pkg.name,
    platform: process.platform,
    arch: process.arch,
    distExists: fs.existsSync(distDir),
    artifactsPresent,
    distDeferred: !artifactsPresent,
    artifacts,
    notes: [
      'Portable is unsupported unless listed in package.json build.win.target',
      'Setup exe on non-Windows hosts may be a wine/NSIS stub; win-unpacked Electron binary is authoritative when present',
      'Icon paths taken from package.json build / nsis; PE icon groups inspected via resedit when EXE present',
      'When dist/ is absent (npm test before build:win), indexer still exits 0 with distDeferred=true; re-run after build for SHA evidence',
    ],
    // Exit 0 without dist so CI can run npm test before build:win; require icon config + portable policy always.
    ok: iconsOk && portable.supported === false,
  };

  fs.writeFileSync(
    path.join(evidenceDir, 'release-artifacts.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(evidenceDir, 'checksums.sha256'),
    `${checksumLines.join('\n')}${checksumLines.length ? '\n' : ''}`
  );
  fs.writeFileSync(
    path.join(evidenceDir, 'icons.json'),
    `${JSON.stringify({ at: report.at, icons, iconInspect, ok: !!(iconInspect && iconInspect.ok) || Object.values(icons.exists).every(Boolean) }, null, 2)}\n`
  );

  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        distDeferred: report.distDeferred,
        artifactsPresent,
        setup: setupInfo && setupInfo.path,
        winUnpacked: unpackedInfo && unpackedInfo.path,
        portableSupported: portable.supported,
        checksumCount: checksumLines.length,
      },
      null,
      2
    )
  );
  if (!report.ok) process.exit(1);
}

main();
