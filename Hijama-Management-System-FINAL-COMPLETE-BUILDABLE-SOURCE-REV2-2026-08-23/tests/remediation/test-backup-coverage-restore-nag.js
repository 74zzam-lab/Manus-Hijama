#!/usr/bin/env node
'use strict';

/**
 * After a full branch restore, do not nag "no backup yet" and do not
 * overwrite today's Auto snapshot. Periodic backup continues later.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

const Coverage = require(path.join(root, 'cloud/backup-coverage.js'));
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const enhSrc = fs.readFileSync(path.join(root, 'cupping-system-enhancements.js'), 'utf8');
const postSrc = fs.readFileSync(path.join(root, 'cloud/restore-post-open.js'), 'utf8');
const layerSrc = fs.readFileSync(path.join(root, 'cloud/backup-layer.js'), 'utf8');
const syncedSrc = fs.readFileSync(path.join(root, 'cloud/synced-write.js'), 'utf8');

const now = new Date('2026-08-29T12:00:00.000Z');
const clinic = {
  cases: [{ id: 'c1' }],
  clientsRegistry: [{ id: 'r1' }],
  bookings: [],
};

const never = Coverage.evaluateNag({ backupLog: [], ...clinic }, now);
check(never.nag === true && never.reason === 'never', 'empty device with no restore still nags');

const restored = Coverage.evaluateNag({
  backupLog: [],
  coverage: { source: 'restore', full: true, at: '2026-08-29T10:00:00.000Z', snapshotAt: '2026-08-29T09:00:00.000Z' },
  restoreVerified: true,
  ...clinic,
}, now);
check(restored.nag === false && restored.reason === 'restored_current', 'full restore hides the no-backup nag');

const recent = Coverage.evaluateNag({
  backupLog: [{ status: 'success', at: '2026-08-25T08:00:00.000Z' }],
  ...clinic,
}, now);
check(recent.nag === false && recent.reason === 'recent_backup', 'backup younger than 7 days hides nag');

const stale = Coverage.evaluateNag({
  backupLog: [{ status: 'success', at: '2026-08-01T08:00:00.000Z' }],
  ...clinic,
}, now);
check(stale.nag === true && stale.reason === 'stale', 'backup older than 7 days still nags');

const skipAuto = Coverage.shouldSkipSameDayAutoBackup({
  coverage: { source: 'restore', full: true, at: '2026-08-29T10:00:00.000Z' },
}, now);
check(skipAuto === true, 'same-day Auto backup is skipped after restore so it cannot overwrite other devices');

const nextDay = Coverage.shouldSkipSameDayAutoBackup({
  coverage: { source: 'restore', full: true, at: '2026-08-28T10:00:00.000Z' },
}, now);
check(nextDay === false, 'periodic Auto backup resumes on later days');

const kv = {};
Coverage.markRestored({ at: '2026-08-29T11:00:00.000Z', branchId: 'BR-MAIN' }, {
  db: { get(k, f) { return kv[k] != null ? kv[k] : f; }, set(k, v) { kv[k] = v; } },
});
check(kv.backupCoverage && kv.backupCoverage.source === 'restore' && kv.backupCoverage.full === true,
  'restore stamps local-only coverage');

check(/backup-coverage\.js/.test(indexSrc), 'index loads backup-coverage.js');
check(/evaluateNag/.test(enhSrc), 'dashboard reminder uses coverage evaluator');
check(/ensureRestoreBackupCoverage/.test(postSrc), 'post-open restore stamps coverage even when already verified');
check(/shouldSkipSameDayAutoBackup/.test(layerSrc), 'daily Auto backup honors restore same-day skip');
check(/backupCoverage/.test(syncedSrc), 'backup coverage stays local-only and is not live-synced');
check(/نسخ الآن/.test(enhSrc), 'weekly nag still offers backup when coverage is truly missing');

if (errors.length) {
  console.error('FAIL backup-coverage-restore-nag');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('PASS remediation:backup-coverage-restore-nag');
