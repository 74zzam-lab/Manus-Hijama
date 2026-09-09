#!/usr/bin/env node
/**
 * Phase 17 — Release Evidence Bundle
 * Build an auditable manifest across FPV, RC, and Code Freeze reports.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'pat-reports');

const REQUIRED_ARTIFACTS = [
  'fpv-results.json',
  'FPV-REPORT-AR.md',
  'rc-results.json',
  'RC-REPORT-AR.md',
  'code-freeze-results.json',
  'CODE-FREEZE-REPORT.md',
];

function ensureFreezeGate() {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/code-freeze-gate.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 300000,
  });
  return r.status ?? 1;
}

function digestFile(absPath) {
  const content = fs.readFileSync(absPath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function gatherArtifacts() {
  return REQUIRED_ARTIFACTS.map((name) => {
    const abs = path.join(REPORT_DIR, name);
    const exists = fs.existsSync(abs);
    if (!exists) {
      return { name, exists: false, sha256: null, bytes: 0 };
    }
    return {
      name,
      exists: true,
      sha256: digestFile(abs),
      bytes: fs.statSync(abs).size,
    };
  });
}

function parseJsonSafe(name) {
  const file = path.join(REPORT_DIR, name);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function buildBundle(artifacts) {
  const missing = artifacts.filter((a) => !a.exists).map((a) => a.name);
  const rc = parseJsonSafe('rc-results.json');
  const freeze = parseJsonSafe('code-freeze-results.json');
  const fpv = parseJsonSafe('fpv-results.json');
  const blockingFails = Array.isArray(rc?.blockingFails) ? rc.blockingFails : [];
  const allPresent = missing.length === 0;

  return {
    generatedAt: new Date().toISOString(),
    allArtifactsPresent: allPresent,
    missingArtifacts: missing,
    artifacts,
    releaseSignals: {
      fpvReadinessPct: fpv?.summary?.pct ?? null,
      fpvFailCount: fpv?.summary?.fail ?? null,
      rcDecision: rc?.rcDecision ?? 'UNKNOWN',
      freezeDecision: freeze?.finalDecision ?? 'UNKNOWN',
      blockingFails,
    },
    finalDecision: allPresent && blockingFails.length === 0 ? 'EVIDENCE_READY' : 'EVIDENCE_INCOMPLETE',
  };
}

function writeOutputs(bundle) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'release-evidence-bundle.json'), JSON.stringify(bundle, null, 2));

  const md = [
    '# Release Evidence Bundle',
    '',
    `**Date:** ${new Date().toISOString().slice(0, 10)}`,
    `**Decision:** ${bundle.finalDecision}`,
    '',
    '## Artifacts',
    '',
    '| Artifact | Present | Bytes | SHA256 |',
    '|----------|---------|-------|--------|',
    ...bundle.artifacts.map((a) => `| ${a.name} | ${a.exists ? 'YES' : 'NO'} | ${a.bytes} | ${a.sha256 || '-'} |`),
    '',
    '## Release signals',
    '',
    `- FPV readiness: ${bundle.releaseSignals.fpvReadinessPct ?? '-'}%`,
    `- FPV fails: ${bundle.releaseSignals.fpvFailCount ?? '-'}`,
    `- RC decision: ${bundle.releaseSignals.rcDecision}`,
    `- Freeze decision: ${bundle.releaseSignals.freezeDecision}`,
    `- Blocking fails: ${bundle.releaseSignals.blockingFails.length ? bundle.releaseSignals.blockingFails.join(', ') : 'none'}`,
    '',
  ].join('\n');

  fs.writeFileSync(path.join(REPORT_DIR, 'RELEASE-EVIDENCE-REPORT.md'), md);
}

function main() {
  ensureFreezeGate();
  const artifacts = gatherArtifacts();
  const bundle = buildBundle(artifacts);
  writeOutputs(bundle);

  console.log('Release Evidence Bundle complete');
  console.log(`  Artifacts present: ${bundle.allArtifactsPresent ? 'yes' : 'no'}`);
  console.log(`  Decision: ${bundle.finalDecision}`);
  console.log(`  Report: ${path.join(REPORT_DIR, 'RELEASE-EVIDENCE-REPORT.md')}`);

  process.exit(bundle.finalDecision === 'EVIDENCE_READY' ? 0 : 1);
}

main();
