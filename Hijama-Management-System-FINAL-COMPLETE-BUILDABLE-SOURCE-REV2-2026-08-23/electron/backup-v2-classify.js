'use strict';

/**
 * Backup V2 filename / manifest classification — shared by discovery, retention, UI.
 */
function classifyBackupFile(name, manifest) {
  const backupType = String(manifest?.backupType || manifest?.scopeTruth?.backupType || '').toLowerCase();
  if (backupType === 'scheduled') return 'automatic';
  if (backupType === 'manual') return 'manual';
  if (backupType === 'emergency-before-restore' || backupType === 'safety') return 'safety';
  const n = String(name || '').toLowerCase();
  if (/emergency|pre-?restore|safety|before-?restore/.test(n)) return 'safety';
  if (/scheduled|auto|periodic/.test(n)) return 'automatic';
  if (/manual|custom|user/.test(n)) return 'manual';
  if (/pinned|keep/.test(n)) return 'pinned';
  // Unlabeled legacy Brand-Backup-{iso} (not V2) — produced by the 15-min timer.
  if (/backup-\d{4}-\d{2}-\d{2}t/.test(n) && !/tadawi-backup-v2/.test(n)) return 'automatic';
  // Timestamp-only Tadawi-Backup-V2-{iso} without "scheduled" → user-triggered manual full backup.
  if (/tadawi-backup-v2-\d{4}-\d{2}-\d{2}/i.test(n) && !/scheduled/.test(n)) return 'manual';
  return 'manual';
}

function classifyLabelAr(kind) {
  const map = {
    automatic: 'دورية',
    manual: 'يدوية',
    safety: 'أمان',
    pinned: 'مثبتة',
    other: 'أخرى',
  };
  return map[kind] || kind || '—';
}

function isPrunableAutomaticBackup(name, manifest) {
  return classifyBackupFile(name, manifest) === 'automatic';
}

function isRetentionExcluded(name, manifest) {
  const kind = classifyBackupFile(name, manifest);
  return kind === 'manual' || kind === 'safety' || kind === 'pinned';
}

module.exports = {
  classifyBackupFile,
  classifyLabelAr,
  isPrunableAutomaticBackup,
  isRetentionExcluded,
};
