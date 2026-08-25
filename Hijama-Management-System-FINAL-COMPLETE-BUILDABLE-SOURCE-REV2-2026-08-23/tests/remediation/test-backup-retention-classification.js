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
const manual = write('Tadawi-Backup-V2-manual.tdw', 2000);
const safety = write('Tadawi-Backup-V2-safety-before-restore.tdw', 1500);
const pinned = write('Tadawi-Backup-V2-pinned.tdw', 3000);

try {
  const result = backupV2.pruneLocalBackups(dir, 1);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(fs.existsSync(recentScheduled), true, 'newest scheduled backup must remain');
  assert.strictEqual(fs.existsSync(oldScheduled), false, 'old scheduled backup may be pruned');
  assert.strictEqual(fs.existsSync(manual), true, 'manual backup must be retained');
  assert.strictEqual(fs.existsSync(safety), true, 'safety backup must be retained');
  assert.strictEqual(fs.existsSync(pinned), true, 'pinned backup must be retained');
  assert.deepStrictEqual(
    result.protected.map((row) => row.classification).sort(),
    ['manual', 'pinned', 'safety'],
    'protected result must identify the retained recovery artifacts'
  );
  console.log('PASS remediation:backup-retention-classification');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
