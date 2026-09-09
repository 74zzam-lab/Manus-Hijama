#!/usr/bin/env node
'use strict';

/**
 * CLI: migrate a JSON backup file into a SQLite database.
 * Usage:
 *   node scripts/migrate-local-backup-to-sqlite.js --in backup.json --out /path/tadawi.db
 */
const fs = require('fs');
const path = require('path');
const { migrateFromFile } = require('../database/migrate-from-json');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const n = argv[i + 1];
      if (!n || n.startsWith('--')) out[k] = true;
      else { out[k] = n; i++; }
    } else out._.push(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const input = args.in || args._[0];
const output = args.out || path.join(process.cwd(), 'tadawi-migrated.db');
if (!input) {
  console.error('Usage: node scripts/migrate-local-backup-to-sqlite.js --in backup.json --out tadawi.db');
  process.exit(1);
}
if (!fs.existsSync(input)) {
  console.error('Input not found:', input);
  process.exit(1);
}

const report = migrateFromFile(input, output, {
  backupPath: args.backup || undefined,
  dryRun: !!args.dryRun,
});
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
