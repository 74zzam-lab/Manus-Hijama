#!/usr/bin/env node
'use strict';

/**
 * V2-5.5 — generate scale dataset and write evidence JSON.
 * Env: V255_SCALE_TINY=1 → tiny CI profile; default → FULL_TARGETS cardinalities.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../database/connection');
const {
  FULL_TARGETS,
  TINY_TARGETS,
  generateScaleDataset,
  countTables,
} = require('../database/scale-dataset');
const { documentHost } = require('../cloud/perf-harness');

const root = path.join(__dirname, '..');
const evidenceDir = path.join(root, 'docs', 'integration-v2-5-5', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function main() {
  const tiny = process.env.V255_SCALE_TINY === '1';
  const targets = tiny ? TINY_TARGETS : FULL_TARGETS;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'v255-scale-'));
  const dbPath = path.join(work, 'scale.db');
  const host = documentHost();
  const startedAt = new Date().toISOString();

  console.log(`scale-dataset profile=${tiny ? 'TINY' : 'FULL'} targets=${JSON.stringify(targets)}`);
  const db = openDatabase(dbPath);
  let result;
  try {
    result = generateScaleDataset(db, { ...targets, tiny });
    const counts = countTables(db);
    result.counts = counts;
    result.ok =
      counts.clients >= targets.clients &&
      counts.visits >= targets.visits &&
      counts.invoices >= targets.invoices &&
      counts.appointments >= targets.appointments &&
      counts.attachments >= targets.attachments;
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }

  const evidence = {
    phase: 'V2-5.5',
    startedAt,
    finishedAt: new Date().toISOString(),
    profile: tiny ? 'TINY' : 'FULL',
    host,
    dbPath,
    targets,
    ...result,
  };

  writeJson(path.join(evidenceDir, 'scale-dataset.json'), evidence);
  writeJson(path.join(evidenceDir, 'scale-counts.json'), {
    profile: evidence.profile,
    targets,
    counts: result.counts,
    ok: result.ok,
    ms: result.ms,
  });

  console.log(JSON.stringify({ ok: result.ok, counts: result.counts, ms: result.ms }, null, 2));
  if (!result.ok) {
    console.error('SCALE DATASET FAIL — cardinalities not met');
    process.exit(1);
  }
  process.exit(0);
}

main();
