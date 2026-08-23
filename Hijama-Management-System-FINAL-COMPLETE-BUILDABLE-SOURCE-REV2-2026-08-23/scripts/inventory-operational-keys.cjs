#!/usr/bin/env node
'use strict';

/**
 * Category B: inventory operational keys vs SQLite bridge coverage.
 * Exit 0 always (report). Use --strict to fail on unclassified SYNCED gaps.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const bridge = fs.readFileSync(path.join(root, 'cupping-sqlite-bridge.js'), 'utf8');
const repo = fs.readFileSync(path.join(root, 'cloud/repository.js'), 'utf8');

function extractArray(src, name) {
  const re = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`);
  const m = src.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}

function extractSynced(src) {
  const m = src.match(/SYNCED_TABLES\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}

const core = extractArray(bridge, 'CORE_TABLES');
const kv = extractArray(bridge, 'KV_MIRROR');
const synced = extractSynced(repo);
const covered = new Set([...core, ...kv]);
const gaps = synced.filter((t) => !covered.has(t));

const report = {
  at: new Date().toISOString(),
  coreTables: core,
  kvMirror: kv,
  repositorySyncedTables: synced,
  syncedNotInBridge: gaps,
  note: 'Gaps are Category B candidates for SQLite KV/core migration — not Requirement PASS.',
};

const outDir = path.join(root, 'docs/integration-v2-5-10/evidence');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'operational-keys-inventory.json'), JSON.stringify(report, null, 2));

console.log('Operational keys inventory');
console.log('  CORE_TABLES:', core.length);
console.log('  KV_MIRROR:', kv.length);
console.log('  Repository.SYNCED_TABLES:', synced.length);
console.log('  syncedNotInBridge:', gaps.length ? gaps.join(', ') : '(none)');
console.log('Wrote docs/integration-v2-5-10/evidence/operational-keys-inventory.json');

if (process.argv.includes('--strict') && gaps.length) {
  console.error('FAIL: synced tables missing from SQLite bridge coverage');
  process.exit(1);
}
process.exit(0);
