#!/usr/bin/env node
'use strict';

/**
 * Result-column-only Cloud Sync / completeness check for GHA.
 * Does not raw-scan prose for status vocabulary words.
 */
const fs = require('fs');
const path = require('path');

const text = fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'integration-v2-4', 'REQUIREMENTS-TRACEABILITY.md'),
  'utf8'
);

const bad = [];
let syncPass = false;
let rows = 0;

for (const line of text.split(/\n/)) {
  const cells = line
    .split('|')
    .map((c) => c.trim())
    .filter((_, i, a) => i > 0 && i < a.length - 1);
  if (cells.length < 6) continue;
  const id = cells[0];
  if (
    !/^(PROTO-4|ARCH|AUTH|OAUTH|ORG|CENTER|OWNER|BRANCH|DEVICE|DB|REPO|OUTBOX|INBOX|SYNC|PUSH|POLL|VERS|MERGE|CONF|LOCK|OFFLINE|RETRY|ATT|BACKUP|RESTORE|AUDIT|OBS|SEC|PERF|QUOTA|MIG|UAT|GHA|REL|REG)-\d+$/.test(
      id
    )
  ) {
    continue;
  }
  rows += 1;
  const result = String(cells[cells.length - 1] || '').toUpperCase();
  if (result !== 'PASS') bad.push(`${id}=${result}`);
  if (id === 'SYNC-001' && result === 'PASS') syncPass = true;
}

if (!rows) {
  console.error('No requirement rows parsed');
  process.exit(1);
}
if (!syncPass) {
  console.error('SYNC-001 must be PASS for V2-4 release gate');
  process.exit(1);
}
if (bad.length) {
  console.error('Non-PASS Results:', bad.slice(0, 30).join(', '));
  process.exit(1);
}

console.log(`Result-column gate OK: ${rows} requirements, SYNC-001=PASS`);
