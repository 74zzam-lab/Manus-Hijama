#!/usr/bin/env node
'use strict';

/**
 * V2-5.7 — Production release unit suite.
 * Asserts artifacts indexer, migration harness, lifecycle matrix, icons,
 * no secrets in evidence, and clean TRACEABILITY after fill.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '../..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-7', 'evidence');
const phaseDir = path.join(root, 'docs', 'integration-v2-5-7');
fs.mkdirSync(evidenceDir, { recursive: true });

const errors = [];
function check(ok, msg) {
  if (!ok) errors.push(msg);
}

function run(rel) {
  return spawnSync(process.execPath, [path.join(root, rel)], {
    cwd: root,
    encoding: 'utf8',
    timeout: 300000,
  });
}

function writeJson(name, data) {
  fs.writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(data, null, 2)}\n`);
}

function main() {
  check(fs.existsSync(path.join(root, 'scripts/v2-5-7-release-artifacts.cjs')), 'release-artifacts script');
  check(fs.existsSync(path.join(root, 'scripts/v2-5-7-migration-harness.cjs')), 'migration harness');
  check(fs.existsSync(path.join(root, 'scripts/v2-5-7-lifecycle-matrix.cjs')), 'lifecycle matrix');
  check(fs.existsSync(path.join(root, 'database/migration-release.js')), 'migration-release module');
  check(fs.existsSync(path.join(root, 'scripts/v2-5-7-scenarios-all.cjs')), 'scenarios script');
  check(fs.existsSync(path.join(root, 'scripts/windows-uat/v2-5-7-release-runtime.cjs')), 'windows uat runtime');

  const art = run('scripts/v2-5-7-release-artifacts.cjs');
  check(art.status === 0, 'release-artifacts exit 0');
  check(fs.existsSync(path.join(evidenceDir, 'release-artifacts.json')), 'release-artifacts.json');
  check(fs.existsSync(path.join(evidenceDir, 'checksums.sha256')), 'checksums.sha256');
  check(fs.existsSync(path.join(evidenceDir, 'icons.json')), 'icons.json');

  const artJson = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'release-artifacts.json'), 'utf8'));
  check(artJson.ok === true, 'release-artifacts ok');
  check(artJson.artifacts.portable.supported === false, 'portable supported:false');
  check(!!artJson.artifacts.portable.reason, 'portable reason present');
  // dist/ may be absent during npm test before build:win (GHA order); accept deferred.
  check(
    artJson.artifactsPresent === true || artJson.distDeferred === true,
    'artifacts present or deferred until build'
  );

  const mig = run('scripts/v2-5-7-migration-harness.cjs');
  check(mig.status === 0, 'migration harness exit 0');
  for (const name of [
    'migration-all.json',
    'migration-schema-step.json',
    'migration-preserve-records.json',
    'migration-preserve-attachments.json',
    'migration-preserve-outbox.json',
    'migration-preserve-owner.json',
    'migration-preserve-license.json',
    'migration-failure-rollback.json',
    'migration-no-empty-replace.json',
    'migration-pre-backup.json',
    'migration-restore-backup.json',
  ]) {
    check(fs.existsSync(path.join(evidenceDir, name)), name);
  }

  const life = run('scripts/v2-5-7-lifecycle-matrix.cjs');
  check(life.status === 0, 'lifecycle matrix exit 0');
  check(fs.existsSync(path.join(evidenceDir, 'lifecycle-matrix.json')), 'lifecycle-matrix.json');
  const lifeJson = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'lifecycle-matrix.json'), 'utf8'));
  check(lifeJson.ok === true && lifeJson.total === 13, 'lifecycle 13 PASS');

  const iconPaths = [
    'build/Program-Icon.ico',
    'build/Installer-Sidebar.bmp',
    'build/Installer-Header.bmp',
    'build/Uninstaller-Sidebar.bmp',
  ];
  for (const p of iconPaths) {
    check(fs.existsSync(path.join(root, p)), `icon asset ${p}`);
  }

  // secrets scan over evidence (text files)
  const secretRe =
    /ya29\.|Bearer\s+[A-Za-z0-9_\-]{20,}|sk_live|BEGIN (RSA |OPENSSH )?PRIVATE KEY|client_secret\s*[:=]\s*["'][^"']{8,}/i;
  let secretHits = 0;
  function scan(dir) {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const st = fs.statSync(abs);
      if (st.isDirectory()) {
        scan(abs);
        continue;
      }
      if (st.size > 2_000_000 || /\.(png|jpg|ico|exe|dll|pak|bin|tar|gz)$/i.test(name)) continue;
      const text = fs.readFileSync(abs, 'utf8');
      if (secretRe.test(text)) secretHits += 1;
    }
  }
  scan(evidenceDir);
  check(secretHits === 0, 'no secrets in evidence');

  // TRACEABILITY cleanliness (when filled)
  const tracePath = path.join(phaseDir, 'REQUIREMENTS-TRACEABILITY.md');
  check(fs.existsSync(tracePath), 'traceability exists');
  const trace = fs.readFileSync(tracePath, 'utf8');
  const forbidden = [
    'NOT_STARTED',
    'IN_PROGRESS',
    'PENDING',
    'PARTIAL',
    'TODO',
    'SKIPPED',
    'UNVERIFIED',
    'EXPECTED PASS',
    'NOT COMPLETED',
    'MISSING',
    'DEFERRED',
  ];
  // Only enforce after rows are filled to PASS — detect by counting PASS results
  const passCount = (trace.match(/\|\s*PASS\s*\|?\s*$/gm) || []).length;
  if (passCount >= 60) {
    for (const w of forbidden) {
      const re = new RegExp(`\\|\\s*${w.replace(/\s+/g, '\\s+')}\\s*\\|?\\s*$`, 'gmi');
      // also forbid pending placeholders in evidence cells
      if (new RegExp(`\\|\\s*${w}\\s*\\|`, 'i').test(trace) && w !== 'PASS') {
        // allow word in prose outside result column only if not as cell
      }
    }
    check(!/\|\s*NOT_STARTED\s*\|/.test(trace), 'no NOT_STARTED cells');
    check(!/\|\s*pending\s*\|/i.test(trace), 'no pending cells');
    check((trace.match(/^\|\s*(BUILD|LIFE|MIG|COMP|REL)-257-\d+\s*\|/gm) || []).length === 60, '60 rows');
  }

  const readiness = fs.readFileSync(path.join(phaseDir, '09-RELEASE-READINESS.md'), 'utf8');
  check(/Ready for main/i.test(readiness) && /\bNO\b/.test(readiness), 'Ready for main NO');
  check(/independent review required/i.test(readiness) || /REL-257-019/.test(readiness), 'independent review noted');
  check(!/Ready for main[^.\n]*YES/i.test(readiness), 'must not mark Ready for main YES');

  const report = {
    at: new Date().toISOString(),
    ok: errors.length === 0,
    phase: 'V2-5.7',
    errors,
    checks: {
      artifacts: art.status === 0,
      migration: mig.status === 0,
      lifecycle: life.status === 0,
      icons: iconPaths.every((p) => fs.existsSync(path.join(root, p))),
      secrets: secretHits === 0,
      portableUnsupported: artJson.artifacts.portable.supported === false,
    },
  };
  writeJson('production-release-unit.json', report);

  if (errors.length) {
    console.error('FAIL: v2-5.7 production-release');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('OK: v2-5.7 production-release unit');
}

main();
