'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const backupV2 = require('../../electron/backup-v2-core');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-retention-'));
function write(name, mtimeMs) {
  const target = path.join(dir, name);
  fs.writeFileSync(target, 'fixture');
  fs.utimesSync(target, new Date(mtimeMs), new Date(mtimeMs));
  return target;
}

const oldScheduled = write('Tadawi-Backup-V2-scheduled-old.tdw', 1000);
const recentScheduled = write('Tadawi-Backup-V2-scheduled-recent.tdw', 4000);
const extraScheduled = write('Tadawi-Backup-V2-scheduled-mid.tdw', 2500);
const manual = write('Tadawi-Backup-V2-manual.tdw', 2000);
const safety = write('Tadawi-Backup-V2-safety-before-restore.tdw', 1500);
const pinned = write('Tadawi-Backup-V2-pinned.tdw', 3000);
const legacyAuto = write('Hijama-Backup-2026-08-01T10-00-00.json', 500);
const legacyAuto2 = write('Hijama-Backup-auto-2026-08-02T10-00-00.json', 600);
const legacyManual = write('Hijama-Backup-manual-2026-08-03T10-00-00.json', 700);

try {
  assert.strictEqual(backupV2.DEFAULT_LOCAL_RETENTION, 1, 'replace previous automatic local backup');
  const result = backupV2.pruneLocalBackups(dir, 1);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(fs.existsSync(recentScheduled), true, 'newest scheduled backup must remain');
  assert.strictEqual(fs.existsSync(oldScheduled), false, 'old scheduled backup may be pruned');
  assert.strictEqual(fs.existsSync(extraScheduled), false, 'older scheduled backup beyond retention may be pruned');
  assert.strictEqual(fs.existsSync(manual), true, 'manual backup must be retained');
  assert.strictEqual(fs.existsSync(safety), true, 'safety backup must be retained');
  assert.strictEqual(fs.existsSync(pinned), true, 'pinned backup must be retained');
  assert.strictEqual(fs.existsSync(legacyManual), true, 'explicit legacy manual backup must be retained');
  assert.strictEqual(fs.existsSync(legacyAuto), false, 'unlabeled legacy 15-min dump may be pruned');
  assert.strictEqual(fs.existsSync(legacyAuto2), false, 'legacy -auto- dump beyond retention may be pruned');
  assert.deepStrictEqual(
    result.protected.map((row) => row.classification).sort(),
    ['manual', 'manual', 'pinned', 'safety'],
    'protected result must identify the retained recovery artifacts'
  );
  console.log('PASS remediation:backup-retention-classification');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
