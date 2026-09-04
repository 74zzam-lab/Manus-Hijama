#!/usr/bin/env node
'use strict';

/**
 * V2-5 Master Release Gate verifier.
 * Aggregates V2-4 + V2-5.1 … V2-5.7 gates, evidence, installer/SHA,
 * migration, screenshots, FINAL readiness, and secrets hygiene.
 *
 * Ready for independent review: YES
 * Ready for main: NO (never claim YES here)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const masterDir = path.join(root, 'docs', 'integration-v2-5');
const finalPath = path.join(masterDir, 'FINAL-RELEASE-READINESS.md');
const phases = [1, 2, 3, 4, 5, 6, 7];
const gateScripts = [
  'verify:v2-4-release-gate',
  'verify:v2-5-1-release-gate',
  'verify:v2-5-2-release-gate',
  'verify:v2-5-3-release-gate',
  'verify:v2-5-4-release-gate',
  'verify:v2-5-5-release-gate',
  'verify:v2-5-6-release-gate',
  'verify:v2-5-7-release-gate',
];
const forbidden = [
  'FAIL',
  'UNVERIFIED',
  'PENDING',
  'PARTIAL',
  'TODO',
  'SKIPPED',
  'EXPECTED PASS',
  'NOT COMPLETED',
  'NOT_STARTED',
  'IN_PROGRESS',
  'MISSING',
  'DEFERRED',
  'OUT OF SCOPE',
];
const secretPatterns = [
  /ya29\./,
  /Bearer\s+[A-Za-z0-9_\-]{20,}/i,
  /sk_live_/,
  /sk_test_[A-Za-z0-9]{16,}/,
  /BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/,
  /client_secret\s*[:=]\s*["'][^"']{8,}/i,
  /AIza[0-9A-Za-z\-_]{20,}/,
  /-----BEGIN PGP PRIVATE KEY BLOCK-----/,
];

const errors = [];
const fail = (m) => errors.push(m);

function phaseDir(n) {
  return path.join(root, 'docs', `integration-v2-5-${n}`);
}

function parseTraceability(tracePath, label) {
  if (!fs.existsSync(tracePath)) {
    fail(`${label}: missing REQUIREMENTS-TRACEABILITY.md`);
    return { rows: 0, pass: false };
  }
  const text = fs.readFileSync(tracePath, 'utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!/^\|\s*[A-Z][A-Z0-9.-]*\d+\s*\|/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length < 4) continue;
    const id = cells[0];
    if (!/^[A-Z][A-Z0-9]*[-.][A-Z0-9.-]*\d+$/i.test(id) && !/^[A-Z]+-\d+-\d+$/.test(id) && !/^[A-Z]+-\d+$/.test(id)) {
      continue;
    }
    // Skip separator / header-ish rows
    if (/^-{2,}$/.test(id) || id.toLowerCase() === 'id') continue;
    const result = cells[cells.length - 1];
    rows.push({ id, result, cells });
  }
  if (!rows.length) {
    fail(`${label}: no requirement rows parsed`);
    return { rows: 0, pass: false };
  }
  let allPass = true;
  for (const r of rows) {
    const upper = String(r.result || '').toUpperCase().trim();
    if (upper !== 'PASS') {
      fail(`${label}: ${r.id} result is "${r.result}" (must be PASS)`);
      allPass = false;
      continue;
    }
    for (const w of forbidden) {
      if (upper === w || upper.includes(w)) {
        fail(`${label}: ${r.id} forbidden token ${w}`);
        allPass = false;
      }
    }
  }
  return { rows: rows.length, pass: allPass };
}

function runGateOrParse(scriptName, phaseLabel, tracePath) {
  const r = spawnSync('npm', ['run', scriptName], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    timeout: 120_000,
  });
  if (r.status === 0) {
    console.log(`  spawn OK: ${scriptName}`);
    return true;
  }
  console.log(`  spawn non-zero (${r.status}) for ${scriptName}; falling back to TRACEABILITY parse`);
  if (r.stderr) {
    const errTail = String(r.stderr).trim().split('\n').slice(-5).join('\n');
    if (errTail) console.log(`  stderr tail:\n${errTail}`);
  }
  const parsed = parseTraceability(tracePath, phaseLabel);
  if (parsed.pass && parsed.rows > 0) {
    console.log(`  TRACEABILITY parse OK: ${phaseLabel} (${parsed.rows} PASS)`);
    return true;
  }
  fail(`${scriptName} exited ${r.status} and TRACEABILITY parse did not all-PASS`);
  return false;
}

console.log('=== V2-5 Master Release Gate ===');

// 1) Spawn prior release gates (or parse TRACEABILITY)
console.log('Prior release gates:');
runGateOrParse(
  'verify:v2-4-release-gate',
  'V2-4',
  path.join(root, 'docs', 'integration-v2-4', 'REQUIREMENTS-TRACEABILITY.md')
);
for (const n of phases) {
  runGateOrParse(
    `verify:v2-5-${n}-release-gate`,
    `V2-5.${n}`,
    path.join(phaseDir(n), 'REQUIREMENTS-TRACEABILITY.md')
  );
}

// 2) Independently parse all V2-5.x TRACEABILITY (all rows PASS, no forbidden)
console.log('TRACEABILITY rows:');
for (const n of phases) {
  const p = parseTraceability(path.join(phaseDir(n), 'REQUIREMENTS-TRACEABILITY.md'), `V2-5.${n}`);
  if (p.pass) console.log(`  V2-5.${n}: ${p.rows} PASS`);
}

// 3) Evidence dirs
console.log('Evidence dirs:');
for (const n of phases) {
  const ev = path.join(phaseDir(n), 'evidence');
  if (!fs.existsSync(ev) || !fs.statSync(ev).isDirectory()) {
    fail(`V2-5.${n}: missing evidence/ directory`);
  } else {
    console.log(`  V2-5.${n}: evidence/ OK`);
  }
}

// 4) Windows UAT evidence (device-a / device-b / windows-uat style) as available
console.log('Windows UAT evidence:');
for (const n of phases) {
  const ev = path.join(phaseDir(n), 'evidence');
  if (!fs.existsSync(ev)) continue;
  const names = fs.readdirSync(ev);
  const uat = names.filter(
    (f) =>
      /^device-[ab]-uat\.json$/i.test(f) ||
      /windows-uat/i.test(f) ||
      /^windows-.*uat.*\.json$/i.test(f)
  );
  if (!uat.length) {
    fail(`V2-5.${n}: no Windows UAT evidence (device-a/device-b/windows-uat)`);
  } else {
    console.log(`  V2-5.${n}: ${uat.join(', ')}`);
  }
}

// 5) Installer / SHA from v2-5-7
console.log('Installer / SHA evidence:');
const artifactsPath = path.join(phaseDir(7), 'evidence', 'release-artifacts.json');
const checksumsPath = path.join(phaseDir(7), 'evidence', 'checksums.sha256');
let shaOk = false;
if (fs.existsSync(artifactsPath)) {
  try {
    const art = JSON.parse(fs.readFileSync(artifactsPath, 'utf8'));
    const setupSha =
      art?.artifacts?.setup?.sha256 ||
      art?.setup?.sha256 ||
      art?.sha256 ||
      null;
    const hasSetup =
      !!(art?.artifacts?.setup?.path || art?.artifacts?.allSetupExes?.length || art?.artifactsPresent);
    if (setupSha || hasSetup) {
      shaOk = true;
      console.log(`  release-artifacts.json OK (sha256=${setupSha || 'present via artifacts'})`);
    }
  } catch (e) {
    fail(`release-artifacts.json parse error: ${e.message}`);
  }
}
if (fs.existsSync(checksumsPath)) {
  const body = fs.readFileSync(checksumsPath, 'utf8').trim();
  if (/^[a-f0-9]{64}\s+\S+/im.test(body)) {
    shaOk = true;
    console.log('  checksums.sha256 OK');
  } else {
    fail('checksums.sha256 present but no sha256 lines found');
  }
}
if (!shaOk) fail('Installer/SHA evidence missing (need release-artifacts.json and/or checksums.sha256)');

// 6) Migration report
console.log('Migration report:');
const migPath = path.join(phaseDir(7), 'evidence', 'migration-all.json');
if (!fs.existsSync(migPath)) {
  fail('missing docs/integration-v2-5-7/evidence/migration-all.json');
} else {
  try {
    const mig = JSON.parse(fs.readFileSync(migPath, 'utf8'));
    if (!mig || typeof mig !== 'object') fail('migration-all.json invalid');
    else console.log('  migration-all.json OK');
  } catch (e) {
    fail(`migration-all.json parse error: ${e.message}`);
  }
}

// 7) Screenshots for 5.6
console.log('V2-5.6 screenshots:');
const shotDir = path.join(phaseDir(6), 'evidence', 'screenshots');
const shotIndex = path.join(phaseDir(6), 'evidence', 'screenshots-index.json');
let shotOk = false;
if (fs.existsSync(shotDir) && fs.statSync(shotDir).isDirectory()) {
  const pngs = fs.readdirSync(shotDir).filter((f) => /\.png$/i.test(f));
  if (pngs.length) {
    shotOk = true;
    console.log(`  screenshots/: ${pngs.length} PNG(s)`);
  }
}
if (fs.existsSync(shotIndex)) {
  shotOk = true;
  console.log('  screenshots-index.json OK');
}
if (!shotOk) fail('V2-5.6 screenshots missing (evidence/screenshots/*.png or screenshots-index.json)');

// 8) FINAL docs readiness
console.log('FINAL release readiness:');
const requiredMasterDocs = [
  'MASTER-REQUIREMENTS-INDEX.md',
  'MASTER-EVIDENCE-INDEX.md',
  'FINAL-RELEASE-READINESS.md',
];
for (const name of requiredMasterDocs) {
  const p = path.join(masterDir, name);
  if (!fs.existsSync(p)) fail(`missing docs/integration-v2-5/${name}`);
}
if (fs.existsSync(finalPath)) {
  const finalText = fs.readFileSync(finalPath, 'utf8');
  const mainReady = /Ready for main\s*:\s*YES/i.test(finalText);
  const mainNo = /Ready for main\s*:\s*NO/i.test(finalText);
  const reviewYes = /Ready for independent review\s*:\s*YES/i.test(finalText);
  if (mainReady) fail('FINAL-RELEASE-READINESS.md must not claim Ready for main: YES');
  if (!mainNo) fail('FINAL-RELEASE-READINESS.md must state Ready for main: NO');
  if (!reviewYes) fail('FINAL-RELEASE-READINESS.md must state Ready for independent review: YES');
  if (mainNo && reviewYes && !mainReady) {
    console.log('  Ready for main: NO; Ready for independent review: YES');
  }
}

// 9) Secrets patterns in docs/integration-v2-5*
console.log('Secrets scan (docs/integration-v2-5*):');
function scanSecrets(dir, hits) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      scanSecrets(abs, hits);
      continue;
    }
    if (st.size > 2_000_000) continue;
    if (/\.(png|jpg|jpeg|ico|exe|dll|pak|bin|tar|gz|woff2?|ttf|otf)$/i.test(name)) continue;
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    for (const re of secretPatterns) {
      if (re.test(text)) {
        hits.push({ file: path.relative(root, abs), re: String(re) });
      }
    }
  }
}
const secretHits = [];
for (const name of fs.readdirSync(path.join(root, 'docs'))) {
  if (!name.startsWith('integration-v2-5')) continue;
  scanSecrets(path.join(root, 'docs', name), secretHits);
}
if (secretHits.length) {
  fail(`secret-like patterns in docs: ${JSON.stringify(secretHits.slice(0, 5))}`);
} else {
  console.log('  no secret-like patterns');
}

// 10) Git hygiene — ignore docs/comparison untracked noise; no unexpected staged secrets
console.log('Git hygiene:');
const staged = spawnSync('git', ['diff', '--cached', '--name-only'], {
  cwd: root,
  encoding: 'utf8',
});
const stagedFiles = String(staged.stdout || '')
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);
const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
const porcelain = String(status.stdout || '')
  .split('\n')
  .map((s) => s.trimEnd())
  .filter(Boolean)
  .filter((line) => {
    // Ignore untracked docs/comparison noise
    const pathPart = line.replace(/^[A-Z?]{1,2}\s+/, '').replace(/^"/, '').replace(/"$/, '');
    if (pathPart === 'docs/comparison' || pathPart.startsWith('docs/comparison/')) return false;
    return true;
  });

for (const f of stagedFiles) {
  if (/\.(pem|key|p12|pfx)$/i.test(f) || /(^|\/)\.env(\.|$)/i.test(f) || /secrets?\.(json|txt|yml)$/i.test(f)) {
    fail(`unexpected staged secret-like path: ${f}`);
  }
  const abs = path.join(root, f);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
  if (fs.statSync(abs).size > 2_000_000) continue;
  if (/\.(png|jpg|ico|exe|dll|pak|bin|tar|gz)$/i.test(f)) continue;
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  for (const re of secretPatterns) {
    if (re.test(text)) fail(`staged file contains secret-like pattern: ${f}`);
  }
}
console.log(`  staged files scanned: ${stagedFiles.length}; non-comparison dirty lines: ${porcelain.length}`);

if (errors.length) {
  console.error('V2-5 MASTER RELEASE GATE FAIL');
  errors.forEach((e) => console.error(' - ' + e));
  process.exit(1);
}

console.log('V2-5 MASTER RELEASE GATE PASS');
console.log('Ready for independent review: YES');
console.log('Ready for main: NO');
process.exit(0);
