#!/usr/bin/env node
'use strict';

/**
 * RC Consolidation — verify PR1→PR13 commits are ancestors of Final HEAD.
 */
const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

const PR_LINEAGE = [
  { pr: 'PR1', label: 'Sync Safety Core', sha: '7c28800' },
  { pr: 'PR2', label: 'Backup Cloud Operations', sha: '8f01499' },
  { pr: 'PR3', label: 'Backup Scope Truth', sha: '345eb5d' },
  { pr: 'PR4', label: 'SQLite Operational Truth', sha: '556b42c' },
  { pr: 'PR5', label: 'Transactions & Crash Safety', sha: '1a2f3ad' },
  { pr: 'PR6', label: 'Remove Backup Encryption', sha: '371d9b6' },
  { pr: 'PR7', label: 'Branch SQL Isolation', sha: 'ecef2d3' },
  { pr: 'PR8', label: 'Branch Switching', sha: 'ee2b082' },
  { pr: 'PR9', label: 'Atomic Restore', sha: '2a99cb9' },
  { pr: 'PR9.5', label: 'Restore Consolidation', sha: 'e3e0dbc' },
  { pr: 'PR10', label: 'Conflict/Tombstone/Idempotency', sha: 'c70c859' },
  { pr: 'PR11', label: 'Owner Lifecycle', sha: '2afd4fd' },
  { pr: 'PR12', label: 'Owner/Admin Separation', sha: '2f9446e' },
  { pr: 'PR13', label: 'Error Truth + Migration Safety', sha: '59d443a' },
];

function sh(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();
}

const head = sh('git rev-parse HEAD');
const branch = sh('git rev-parse --abbrev-ref HEAD');

console.log('══ RC Lineage Verification ══');
console.log(`Branch: ${branch}`);
console.log(`HEAD:   ${head}\n`);

const failures = [];
for (const entry of PR_LINEAGE) {
  let isAncestor = false;
  try {
    execSync(`git merge-base --is-ancestor ${entry.sha} HEAD`, { cwd: root, stdio: 'pipe' });
    isAncestor = true;
  } catch {
    isAncestor = false;
  }
  const resolved = sh(`git rev-parse ${entry.sha}`).slice(0, 7);
  const mark = isAncestor ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${entry.pr.padEnd(6)} ${resolved}  ${entry.label}`);
  if (!isAncestor) failures.push(entry);
}

console.log('');
if (failures.length) {
  console.error(`FAIL: ${failures.length} PR commit(s) not ancestor of HEAD`);
  process.exit(1);
}
console.log(`PASS: all ${PR_LINEAGE.length} PR commits are ancestors of Final HEAD`);
