/**
 * Google Drive folder layout for Hijama Management System.
 * V1: NajjarTech Hijama Management / {centerName} /
 * V2: NajjarTech / {centerId} / License|Configuration|Operational|Sync|Backups|Logs
 */
const DRIVE_APP_FOLDER = 'NajjarTech Hijama Management';
const DRIVE_V2_ROOT = 'NajjarTech';
const MAIN_BACKUP_FILE = 'Hijama-Clinic-Backup.tdw';
const MANUAL_BACKUP_PREFIX = 'Backup_';

function sanitizeCenter(name) {
  return (name || 'Center').replace(/[<>:"|?*\\/]/g, '_').trim() || 'Center';
}

function sanitizeCenterId(centerId) {
  return (centerId || '').replace(/[<>:"|?*\\/]/g, '_').trim() || 'unknown';
}

function buildRemoteFolder(meta) {
  return `${DRIVE_APP_FOLDER}/${sanitizeCenter(meta?.centerName)}`;
}

function buildV2CenterRoot(centerId) {
  return `${DRIVE_V2_ROOT}/${sanitizeCenterId(centerId)}`;
}

function buildV2Path(centerId, ...segments) {
  return [buildV2CenterRoot(centerId), ...segments.map(s => sanitizeCenter(s))].join('/');
}

function buildV2LicensePath(centerId) {
  return buildV2Path(centerId, 'License', 'license.json');
}

function buildV2SyncVersionsPath(centerId) {
  return buildV2Path(centerId, 'Sync', 'versions.json');
}

function buildV2ConfigBranchPath(centerId, branchId, fileName, branchName) {
  const folder = branchName || branchId;
  return buildV2Path(centerId, 'Branches', folder, 'Configuration', fileName);
}

function buildV2OperationalPath(centerId, branchId, table, branchName) {
  const folder = branchName || branchId;
  const file = String(table || '').replace(/\.json$/i, '') + '.json';
  return buildV2Path(centerId, 'Branches', folder, 'Operational', file);
}

/** Legacy layout fallback */
function buildV2LegacyConfigBranchPath(centerId, branchId, fileName) {
  return buildV2Path(centerId, 'Configuration', 'branches', branchId, fileName);
}

function buildV2LegacyOperationalPath(centerId, branchId, table) {
  const file = String(table || '').replace(/\.json$/i, '') + '.json';
  return buildV2Path(centerId, 'Operational', 'branches', branchId, file);
}

function buildMainBackupRemotePath(meta) {
  if (meta?.centerId) {
    return buildV2Path(meta.centerId, 'Backups', 'Auto', MAIN_BACKUP_FILE);
  }
  return `${buildRemoteFolder(meta)}/${MAIN_BACKUP_FILE}`;
}

function buildManualBackupFilename(ts) {
  const d = ts ? new Date(ts) : new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${MANUAL_BACKUP_PREFIX}${y}-${mo}-${day}_${h}-${mi}.zip`;
}

function isMainBackupName(name) {
  return String(name || '') === MAIN_BACKUP_FILE;
}

function isManualBackupName(name) {
  return /^Backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.zip$/i.test(String(name || ''));
}

function isDbBackupName(name) {
  return isMainBackupName(name) || isManualBackupName(name);
}

module.exports = {
  DRIVE_APP_FOLDER,
  DRIVE_V2_ROOT,
  MAIN_BACKUP_FILE,
  MANUAL_BACKUP_PREFIX,
  sanitizeCenter,
  sanitizeCenterId,
  buildRemoteFolder,
  buildV2CenterRoot,
  buildV2Path,
  buildV2LicensePath,
  buildV2SyncVersionsPath,
  buildV2ConfigBranchPath,
  buildV2OperationalPath,
  buildV2LegacyConfigBranchPath,
  buildV2LegacyOperationalPath,
  buildMainBackupRemotePath,
  buildManualBackupFilename,
  isMainBackupName,
  isManualBackupName,
  isDbBackupName
};
