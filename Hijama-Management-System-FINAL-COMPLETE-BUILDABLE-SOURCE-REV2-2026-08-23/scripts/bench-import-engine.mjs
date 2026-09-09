#!/usr/bin/env node
/**
 * Benchmark import-engine-core dedup + batch loop (Node simulation).
 * Usage: node scripts/bench-import-engine.mjs [1000|5000|10000|25000|50000]
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const coreSrc = fs.readFileSync(path.join(root, 'import-engine-core.js'), 'utf8');
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(coreSrc, sandbox);
const Core = sandbox.module.exports;

const sizes = process.argv.slice(2).map(Number).filter(Boolean);
const testSizes = sizes.length ? sizes : [1000, 5000, 10000, 25000, 50000];
const BATCH = 400;

function bench(n) {
  const rows = Array.from({ length: n }, (_, i) => ({
    name: `عميل ${i}`,
    phone: `05${String(10000000 + (i % 9000000)).slice(-8)}`,
    date: '2024-03-10'
  }));
  const idx = Core.buildDedupIndexes([], []);
  const fileHashes = new Set();
  const sessionHashes = new Set();
  let processed = 0;
  let imported = 0;
  const t0 = performance.now();
  for (let start = 0; start < rows.length; start += BATCH) {
    const end = Math.min(start + BATCH, rows.length);
    for (let i = start; i < end; i++) {
      processed++;
      const rec = rows[i];
      const dup = Core.isDuplicateImportRow(rec, fileHashes, sessionHashes, idx);
      if (dup.dup) continue;
      const h = Core.importRowHash(rec);
      sessionHashes.add(h);
      fileHashes.add(h);
      idx.phones.add(rec.phone);
      imported++;
    }
  }
  const sec = (performance.now() - t0) / 1000;
  const rps = (processed / Math.max(sec, 0.001)).toFixed(0);
  return { n, processed, imported, sec: sec.toFixed(2), rps };
}

console.log('Import engine benchmark (Core dedup + batch loop, batch=' + BATCH + ')');
console.log('Rows\tImported\tSeconds\tRows/sec');
for (const n of testSizes) {
  const r = bench(n);
  console.log(`${r.n}\t${r.imported}\t${r.sec}\t${r.rps}`);
}
