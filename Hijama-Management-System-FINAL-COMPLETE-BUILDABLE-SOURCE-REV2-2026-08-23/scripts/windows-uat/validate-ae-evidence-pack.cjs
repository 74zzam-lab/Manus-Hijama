#!/usr/bin/env node
'use strict';

/**
 * Validates an operator-filled A–E evidence pack for Installed Setup EXE UAT.
 * Does NOT flip REQUIREMENTS-TRACEABILITY.md.
 * Exit 0 only when all five scenarios are structurally complete PASS packs.
 *
 * Usage:
 *   node scripts/windows-uat/validate-ae-evidence-pack.cjs [ae-scenarios-dir]
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const aeDir = path.resolve(process.argv[2] || path.join(root, 'docs/integration-v2-5-9/evidence/ae-scenarios'));
const errors = [];
const fail = (m) => errors.push(m);

const requiredFiles = [
  'A-device-ab.json',
  'B-new-branch.json',
  'C-disaster-recovery.json',
  'D-owner.json',
  'E-google-apis.json',
  'summary.json',
];

function load(name) {
  const p = path.join(aeDir, name);
  if (!fs.existsSync(p)) {
    fail('missing ' + name);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    fail('invalid JSON ' + name + ': ' + e.message);
    return null;
  }
}

for (const f of requiredFiles) load(f);

const scenarios = [
  ['A-device-ab.json', 'A'],
  ['B-new-branch.json', 'B'],
  ['C-disaster-recovery.json', 'C'],
  ['D-owner.json', 'D'],
  ['E-google-apis.json', 'E'],
];

for (const [file, label] of scenarios) {
  const j = load(file);
  if (!j) continue;
  if (j.result !== 'PASS') fail(label + ': result must be PASS (got ' + j.result + ')');
  if (!j.installedSetupExeProof || !String(j.installedSetupExeProof).startsWith('INSTALLED')) {
    fail(label + ': installedSetupExeProof must start with INSTALLED');
  }
  if (j.evidenceComplete !== true) fail(label + ': evidenceComplete must be true');
  if (!j.setupSha256 || !/^[a-f0-9]{64}$/i.test(j.setupSha256)) {
    fail(label + ': setupSha256 (64 hex) required');
  }
  if (!Array.isArray(j.checks) || j.checks.length < 3) {
    fail(label + ': checks[] must list completed live checks');
  } else {
    for (const c of j.checks) {
      if (c.result !== 'PASS') fail(label + ' check ' + (c.id || c.name || '?') + ' not PASS');
      if (!c.evidence || (!c.evidence.log && !c.evidence.artifact && !c.evidence.note)) {
        fail(label + ' check ' + (c.id || c.name || '?') + ' missing evidence pointer');
      }
    }
  }
  if (j.runtimeErrors !== 0 && j.runtimeErrorCount !== 0 && j.zeroRuntimeErrors !== true) {
    fail(label + ': must declare zeroRuntimeErrors:true or runtimeErrors:0');
  }
}

const summary = load('summary.json');
if (summary) {
  if (summary.readyForRelease === 'YES' && errors.length) {
    fail('summary must not claim readyForRelease YES while pack invalid');
  }
}

if (errors.length) {
  console.error('FAIL validate-ae-evidence-pack\n- ' + errors.join('\n- '));
  console.error('\nCurrent pack is NOT sufficient to flip Requirements or Release Gate.');
  process.exit(2);
}

console.log('PASS validate-ae-evidence-pack — structural A–E evidence complete');
console.log('Next: attach evidence paths in REQUIREMENTS-TRACEABILITY.md then re-run verify:v2-5-9-release-gate');
process.exit(0);
