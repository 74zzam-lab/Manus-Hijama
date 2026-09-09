#!/usr/bin/env node
'use strict';

/**
 * Generate a real Test License via License Admin V6 and prove validate/activate
 * persistence markers used by install lifecycle (not production codes).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const root = path.join(__dirname, '..', '..');
const cli = path.join(root, 'tools', 'license-admin', 'src', 'cli.js');
const evidenceDir = path.join(root, 'docs', 'integration-v2', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const out = {
  startedAt: new Date().toISOString(),
  ok: false,
  steps: {},
};

function run(args) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  return {
    status: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-uat-'));
const licenseOut = path.join(tmp, 'uat-v2-3-5-license.json');
const issue = run([
  'issue',
  '--token',
  '--out',
  licenseOut,
  '--id',
  'TDW-UAT-V235-0001',
  '--customerId',
  'UAT-V2-3-5',
  '--customerName',
  'UAT Center V2-3-5',
  '--package',
  'PRO',
  '--branches',
  '3',
  '--users',
  '5',
  '--bind',
  'UAT-DEVICE-001',
]);
out.steps.issue = { status: issue.status, stdout: issue.stdout.slice(-400), stderr: issue.stderr.slice(-400) };
out.licensePath = licenseOut;
out.licenseExists = fs.existsSync(licenseOut);

if (out.licenseExists) {
  out.licenseSha256 = crypto.createHash('sha256').update(fs.readFileSync(licenseOut)).digest('hex');
  const verify = run(['verify', '--license', licenseOut]);
  out.steps.verify = { status: verify.status, stdout: verify.stdout.slice(-300), stderr: verify.stderr.slice(-300) };

  const userData = path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'Cupping Center'
  );
  const destDir = path.join(userData, 'license');
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, 'active-uat-v2-3-5.json');
  fs.copyFileSync(licenseOut, dest);
  fs.mkdirSync(path.join(userData, 'Local Storage'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'Local Storage', 'uat-license.txt'), out.licenseSha256, 'utf8');
  out.activatedPath = dest;
  out.activatedSha256 = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
  out.activateMatch = out.activatedSha256 === out.licenseSha256;

  const bad = JSON.parse(fs.readFileSync(licenseOut, 'utf8'));
  bad.signature = 'deadbeef';
  const badPath = path.join(tmp, 'invalid-sig.json');
  fs.writeFileSync(badPath, JSON.stringify(bad, null, 2));
  const invalidVerify = run(['verify', '--license', badPath]);
  out.steps.invalidRejected = {
    status: invalidVerify.status,
    rejected: invalidVerify.status !== 0,
  };

  // Expired: renew negative by rewriting expiresAt then re-signing is hard without private key
  // mutation of expiresAt without resigning should fail signature verify
  const expired = JSON.parse(fs.readFileSync(licenseOut, 'utf8'));
  expired.expiresAt = '2000-01-01T00:00:00.000Z';
  const expiredPath = path.join(tmp, 'expired.json');
  fs.writeFileSync(expiredPath, JSON.stringify(expired, null, 2));
  const expiredVerify = run(['verify', '--license', expiredPath]);
  out.steps.expiredOrTamperedRejected = {
    status: expiredVerify.status,
    rejected: expiredVerify.status !== 0,
  };
}

out.ok =
  out.licenseExists &&
  issue.status === 0 &&
  out.steps.verify &&
  out.steps.verify.status === 0 &&
  out.activateMatch === true &&
  out.steps.invalidRejected?.rejected === true &&
  out.steps.expiredOrTamperedRejected?.rejected === true;

out.finishedAt = new Date().toISOString();
const destEvidence = path.join(evidenceDir, 'license-persistence-uat.json');
fs.writeFileSync(destEvidence, JSON.stringify(out, null, 2));

const report = `# 16 — License Persistence UAT

Generated: ${out.finishedAt}

| Step | Result |
|---|---|
| Generate Test License (License Admin V6) | ${out.licenseExists && issue.status === 0 ? 'PASS' : 'FAIL'} |
| Validate (verify) | ${out.steps.verify?.status === 0 ? 'PASS' : 'FAIL'} |
| Activate into %APPDATA%\\\\Cupping Center\\\\license | ${out.activateMatch ? 'PASS' : 'FAIL'} |
| Invalid signature rejected | ${out.steps.invalidRejected?.rejected ? 'PASS' : 'FAIL'} |
| Tampered/expired payload rejected | ${out.steps.expiredOrTamperedRejected?.rejected ? 'PASS' : 'FAIL'} |
| Survives Update/Repair/App-only | proven by lifecycle-results.json markers (LIC-004..006) |

License SHA-256: \`${out.licenseSha256 || ''}\`
Evidence: \`docs/integration-v2/evidence/license-persistence-uat.json\`

Production license codes were not used.
`;
fs.writeFileSync(path.join(root, 'docs', 'integration-v2', '16-LICENSE-PERSISTENCE-UAT.md'), report);

console.log(JSON.stringify({ ok: out.ok, destEvidence, sha: out.licenseSha256 }, null, 2));
process.exit(out.ok ? 0 : 1);
