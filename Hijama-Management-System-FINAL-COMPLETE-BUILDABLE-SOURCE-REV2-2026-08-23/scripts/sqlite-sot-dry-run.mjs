#!/usr/bin/env node
'use strict';

/**
 * SQLite SoT dry-run — reports row counts + integrity without cutover.
 * Does not enable HYBRID_SQLITE_SOT.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { openDatabase, getSchemaVersion, integrityCheck } = require('../database/connection');
const hybrid = require('../database/hybrid-schema');

const dbPath = process.argv[2] || path.join(os.tmpdir(), 'hybrid-sot-dry-run', 'tadawi.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = openDatabase(dbPath);
const integrity = integrityCheck(db);
const version = getSchemaVersion(db);
const hybridVersion = hybrid.readSchemaVersion(db);

const tables = [
  'clients', 'visits', 'invoices', 'appointments', 'employees', 'payments', 'kv_store',
];
const counts = {};
for (const table of tables) {
  try {
    counts[table] = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
  } catch (err) {
    counts[table] = `ERR:${err.message}`;
  }
}

const report = {
  at: new Date().toISOString(),
  dbPath,
  schemaVersion: version,
  hybridSchemaVersion: hybridVersion,
  sotFlag: hybrid.isSqliteSotEnabled(),
  integrity,
  counts,
  note: 'Dual-run bridge remains default. HYBRID_SQLITE_SOT cutover is not performed by this script.',
};

const outDir = path.join(__dirname, '..', 'pat-reports');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'sqlite-sot-dry-run.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
db.close();
console.log(JSON.stringify(report, null, 2));
console.log(`Wrote ${outPath}`);
