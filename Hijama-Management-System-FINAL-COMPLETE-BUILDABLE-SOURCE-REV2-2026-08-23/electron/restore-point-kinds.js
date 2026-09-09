'use strict';

/** Restore point kind contracts — discovery, BootFlow, restore handlers. */

function isBackupV2Kind(kind) {
  return kind === 'backup_v2' || kind === 'backup_file';
}

function isSyncHydrateKind(kind) {
  return kind === 'sync_checkpoint' || kind === 'sync_dataset';
}

function isBackupRestorePoint(point) {
  return !!(point && (isBackupV2Kind(point.kind) || point.source === 'cloud_backup'));
}

function isSyncHydratePoint(point) {
  return !!(point && isSyncHydrateKind(point.kind));
}

function filterBackupRestorePoints(points) {
  return (points || []).filter(isBackupRestorePoint);
}

function filterSyncHydratePoints(points) {
  return (points || []).filter(isSyncHydratePoint);
}

module.exports = {
  isBackupV2Kind,
  isSyncHydrateKind,
  isBackupRestorePoint,
  isSyncHydratePoint,
  filterBackupRestorePoints,
  filterSyncHydratePoints,
};
