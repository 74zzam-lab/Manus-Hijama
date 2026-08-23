'use strict';

/**
 * Migration safety — mandatory pre-backup, dry-run on copy, rollback on failure.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/**
 * @returns {{ ok: true, targetDbPath, originalDbPath, backup, dryRun, tempDir, existed } | { ok: false, error }}
 */
function prepareMigrationRun(options = {}) {
  const dbPath = options.dbPath || ':memory:';
  const dryRun = !!options.dryRun;
  const skipBackup = !!options.skipBackup;
  const existed = dbPath !== ':memory:' && fileExists(dbPath);

  let backup = null;
  let targetDbPath = dbPath;
  let tempDir = null;

  if (dryRun && dbPath !== ':memory:') {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-mig-dry-'));
    targetDbPath = path.join(tempDir, 'dry-run.db');
    if (existed) {
      fs.copyFileSync(dbPath, targetDbPath);
    }
  } else if (existed && !skipBackup) {
    const backupPath = options.backupPath;
    if (!backupPath) {
      return { ok: false, error: 'migration_backup_required' };
    }
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(dbPath, backupPath);
    backup = {
      path: backupPath,
      size: fs.statSync(backupPath).size,
      sha256: sha256File(backupPath),
      at: new Date().toISOString(),
    };
  }

  return {
    ok: true,
    targetDbPath,
    originalDbPath: dbPath,
    backup,
    dryRun,
    tempDir,
    existed,
  };
}

function restoreFromBackup(originalDbPath, backupPath) {
  if (!fileExists(backupPath)) return { ok: false, error: 'backup_not_found' };
  fs.copyFileSync(backupPath, originalDbPath);
  return {
    ok: true,
    restoredFrom: backupPath,
    sha256: sha256File(originalDbPath),
    at: new Date().toISOString(),
  };
}

function cleanupTemp(ctx) {
  if (!ctx?.tempDir) return;
  try {
    fs.rmSync(ctx.tempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * Apply rollback on failed live migration; never touch original on dry-run.
 */
function finalizeMigrationRun(ctx, report) {
  report = report || { ok: false, error: 'unknown' };

  if (!ctx || !ctx.ok) {
    return report;
  }

  if (ctx.dryRun) {
    report.dryRun = true;
    cleanupTemp(ctx);
    return report;
  }

  if (ctx.backup) {
    report.preMigrationBackup = ctx.backup;
  }

  if (!report.ok && ctx.backup && ctx.existed) {
    const rollback = restoreFromBackup(ctx.originalDbPath, ctx.backup.path);
    report.rollback = rollback;
    if (rollback.ok) {
      report.rollbackApplied = true;
    }
  }

  return report;
}

function assertRowCountPreserved(before, after, label) {
  const b = Number(before) || 0;
  const a = Number(after) || 0;
  return {
    ok: b === a,
    label: label || 'rows',
    before: b,
    after: a,
  };
}

module.exports = {
  prepareMigrationRun,
  finalizeMigrationRun,
  restoreFromBackup,
  sha256File,
  assertRowCountPreserved,
  cleanupTemp,
};
