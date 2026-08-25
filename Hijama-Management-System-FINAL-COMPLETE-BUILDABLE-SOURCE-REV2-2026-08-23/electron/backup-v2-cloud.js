'use strict';

/**
 * Backup V2 — Google Drive listing and retention (keep newest N periodic archives).
 */
const { classifyBackupFile, isPrunableAutomaticBackup } = require('./backup-v2-classify');

const CLOUD_V2_PREFIX = 'Backups/V2';
const DEFAULT_CLOUD_RETENTION = 3;

function isV2FullBackupName(name) {
  const n = String(name || '');
  return /Tadawi-Backup-V2/i.test(n) && /\.tdw$/i.test(n);
}

function normalizeCloudItem(item) {
  const modifiedAt = item?.modifiedAt || item?.createdAt || null;
  return {
    id: item?.id || item?.path || item?.name,
    name: item?.name || '',
    path: item?.path || item?.remotePath || '',
    remotePath: item?.path || item?.remotePath || '',
    size: Number(item?.size || 0),
    modifiedAt,
    createdAt: modifiedAt,
    mtimeMs: Date.parse(modifiedAt || '') || 0,
    source: 'cloud',
    label: item?.name || item?.path || 'cloud-backup',
    backupClass: classifyBackupFile(item?.name, item?.manifest),
  };
}

function filterV2FullBackups(items) {
  return (items || [])
    .filter((it) => isV2FullBackupName(it?.name))
    .map(normalizeCloudItem)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function listCloudV2Backups(listFn, prefix = CLOUD_V2_PREFIX) {
  if (typeof listFn !== 'function') {
    return { ok: false, items: [], message: 'list_fn_required' };
  }
  const res = await listFn('google', prefix);
  if (!res?.ok) {
    return { ok: false, items: [], message: res?.message || 'list_failed', needsReauth: res?.needsReauth };
  }
  const items = filterV2FullBackups(res.items);
  return { ok: true, items, prefix, totalListed: (res.items || []).length };
}

async function pruneCloudV2Backups(listFn, deleteFn, retentionCount = DEFAULT_CLOUD_RETENTION, keepRemotePath = null) {
  const listed = await listCloudV2Backups(listFn);
  if (!listed.ok) return { ok: false, pruned: 0, error: listed.message };
  const keepMax = Math.max(1, Number(retentionCount) || DEFAULT_CLOUD_RETENTION);
  const keepNorm = keepRemotePath ? String(keepRemotePath).replace(/\\/g, '/') : null;

  const automatic = listed.items.filter((item) => isPrunableAutomaticBackup(item.name, item.manifest));
  const excluded = listed.items.filter((item) => !isPrunableAutomaticBackup(item.name, item.manifest));

  const removed = [];
  let keptAutomatic = 0;
  for (const item of automatic) {
    const remotePath = item.path || item.remotePath;
    if (!remotePath) continue;
    if (keepNorm && remotePath === keepNorm) {
      keptAutomatic += 1;
      continue;
    }
    if (keptAutomatic < keepMax) {
      keptAutomatic += 1;
      continue;
    }
    if (typeof deleteFn !== 'function') continue;
    try {
      const del = await deleteFn(remotePath, 'google');
      if (del?.ok) removed.push(remotePath);
    } catch {
      /* best effort */
    }
  }

  return {
    ok: true,
    pruned: removed.length,
    removed,
    keptAutomatic,
    keptAutomaticMax: keepMax,
    excludedCount: excluded.length,
    totalListed: listed.items.length,
  };
}

module.exports = {
  CLOUD_V2_PREFIX,
  DEFAULT_CLOUD_RETENTION,
  isV2FullBackupName,
  normalizeCloudItem,
  filterV2FullBackups,
  listCloudV2Backups,
  pruneCloudV2Backups,
  classifyBackupFile,
  isPrunableAutomaticBackup,
};
