#!/usr/bin/env node
'use strict';

const assert = require('assert');
const cloud = require('../../electron/backup-v2-cloud');
const { classifyBackupFile } = require('../../electron/backup-v2-classify');

assert.strictEqual(cloud.DEFAULT_CLOUD_RETENTION, 3);
assert.ok(cloud.isV2FullBackupName('Tadawi-Backup-V2-2026-01-01.tdw'));
assert.ok(cloud.isV2FullBackupName('Tadawi-Backup-V2-scheduled-2026.tdw'));
assert.ok(!cloud.isV2FullBackupName('2026-08-20.tdw'));
assert.ok(!cloud.isV2FullBackupName('Hijama-Clinic-Backup.tdw'));

assert.strictEqual(classifyBackupFile('Tadawi-Backup-V2-2026-08-22.tdw'), 'manual');
assert.strictEqual(classifyBackupFile('Tadawi-Backup-V2-scheduled-2026.tdw'), 'automatic');

const filtered = cloud.filterV2FullBackups([
  { name: '2026-08-20.tdw', path: 'NajjarTech/x/Backup/2026-08-20.tdw', size: 12000, modifiedAt: '2026-08-20T02:00:00Z' },
  { name: 'Tadawi-Backup-V2-a.tdw', path: 'Backups/V2/Tadawi-Backup-V2-a.tdw', size: 50000000, modifiedAt: '2026-08-19T10:00:00Z' },
  { name: 'Tadawi-Backup-V2-b.tdw', path: 'Backups/V2/Tadawi-Backup-V2-b.tdw', size: 51000000, modifiedAt: '2026-08-20T10:00:00Z' },
]);
assert.strictEqual(filtered.length, 2);
assert.strictEqual(filtered[0].name, 'Tadawi-Backup-V2-b.tdw');
assert.strictEqual(filtered[0].backupClass, 'manual');

(async () => {
  const deleted = [];
  const result = await cloud.pruneCloudV2Backups(
    async () => ({
      ok: true,
      items: [
        { name: 'Tadawi-Backup-V2-scheduled-1.tdw', path: 'Backups/V2/1.tdw', modifiedAt: '2026-08-22T00:00:00Z' },
        { name: 'Tadawi-Backup-V2-scheduled-2.tdw', path: 'Backups/V2/2.tdw', modifiedAt: '2026-08-21T00:00:00Z' },
        { name: 'Tadawi-Backup-V2-scheduled-3.tdw', path: 'Backups/V2/3.tdw', modifiedAt: '2026-08-20T00:00:00Z' },
        { name: 'Tadawi-Backup-V2-scheduled-4.tdw', path: 'Backups/V2/4.tdw', modifiedAt: '2026-08-19T00:00:00Z' },
        { name: 'Tadawi-Backup-V2-manual.tdw', path: 'Backups/V2/manual.tdw', modifiedAt: '2026-08-18T00:00:00Z' },
      ],
    }),
    async (remotePath) => { deleted.push(remotePath); return { ok: true }; },
    3,
    'Backups/V2/1.tdw'
  );
  assert.deepStrictEqual(deleted, ['Backups/V2/4.tdw']);
  assert.strictEqual(result.excludedCount, 1);
  console.log('OK: backup v2 cloud retention (periodic-only prune)');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
