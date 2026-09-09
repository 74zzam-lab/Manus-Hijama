/**
 * V2-5.10 — Fast Cloud Data Discovery (Main process).
 * Metadata-only probes with hard timeouts. NEVER downloads DB/backups/attachments.
 */
'use strict';

const drivePaths = require('./cloud-drive-paths');

const DISCOVERY_OVERALL_MS = 150000;
const DISCOVERY_MAX_MS = 180000;
const NO_PROGRESS_WATCHDOG_MS = 35000;
const PER_REQUEST_MS = 8000;
const PRIORITY_PARALLEL = 4;
const BACKUP_RETENTION_DISPLAY = 3;

/** Work-based stages — percent derived from completed stage weight, not elapsed time. */
const DISCOVERY_STAGES = Object.freeze([
  { id: 'oauth', weight: 5, label: 'اتصال Google' },
  { id: 'center', weight: 7, label: 'التحقق من المركز' },
  { id: 'license', weight: 8, label: 'فحص التراخيص' },
  { id: 'organizations', weight: 10, label: 'فحص المؤسسات' },
  { id: 'branches', weight: 15, label: 'فحص الفروع' },
  { id: 'datasets', weight: 15, label: 'فحص بيانات الفروع' },
  { id: 'backups', weight: 18, label: 'فحص Backup V2' },
  { id: 'versions', weight: 12, label: 'مقارنة revisions' },
  { id: 'done', weight: 10, label: 'اكتمال الفحص' },
]);

const STAGE_WEIGHT_TOTAL = DISCOVERY_STAGES.reduce((a, s) => a + s.weight, 0);

function clampTimeoutMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return DISCOVERY_OVERALL_MS;
  return Math.min(Math.max(Math.floor(n), 1000), DISCOVERY_MAX_MS);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`discovery_timeout:${label}`);
      err.code = 'DISCOVERY_TIMEOUT';
      err.label = label;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function nowIso() {
  return new Date().toISOString();
}

function startTrace(op) {
  return {
    op,
    startedAt: nowIso(),
    startedMs: Date.now(),
    steps: [],
  };
}

function pushStep(trace, name, startMs, result) {
  const endedMs = Date.now();
  trace.steps.push({
    op: name,
    startedAt: new Date(startMs).toISOString(),
    endedAt: new Date(endedMs).toISOString(),
    durationMs: endedMs - startMs,
    requests: result?.requests || 1,
    bytes: result?.bytes || 0,
    ok: result?.ok !== false,
    result: result?.status || (result?.ok === false ? 'fail' : 'ok'),
    detail: result?.detail || result?.message || null,
  });
}

function isBackupArtifact(name) {
  const n = String(name || '');
  if (/\.tdw$/i.test(n)) return true;
  if (/^Tadawi-Backup-V2/i.test(n)) return true;
  if (drivePaths.isDbBackupName(n)) return true;
  if (/^Backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.zip$/i.test(n)) return true;
  return false;
}

/**
 * All known backup folder layouts (V1 legacy, V2 root, center name/id, branch Backup).
 * Backup V2 uploads to `Backups/V2/` at Drive root — probed first.
 */
function buildDiscoveryProbeFolders(options = {}) {
  const centerId = String(options.centerId || '').trim();
  const centerName = String(options.centerName || '').trim();
  const branchId = String(options.branchId || '').trim();
  const branchName = String(options.branchName || '').trim();
  const V2 = drivePaths.DRIVE_V2_ROOT;
  const san = (s) => {
    const v = String(s || '').trim();
    return v ? drivePaths.sanitizeCenter(v) : '';
  };
  const folders = [];
  const add = (p) => {
    const s = String(p || '').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
    if (s && !folders.includes(s)) folders.push(s);
  };

  add('Backups/V2');
  add('Backups');

  const centerKeys = [...new Set([centerName, centerId].map(san).filter(Boolean))];
  for (const key of centerKeys) {
    add(`${V2}/${key}/Backups/V2`);
    add(`${V2}/${key}/Backups/Auto`);
    add(`${V2}/${key}/Backups/Manual`);
    add(`${V2}/${key}/Backups`);
    for (const bn of [...new Set([branchName, branchId].map(san).filter(Boolean))]) {
      add(`${V2}/${key}/Branches/${bn}/Backup`);
    }
  }

  if (centerId) {
    const cid = san(centerId);
    add(`${V2}/centers/${cid}/Backups/V2`);
    add(`${V2}/centers/${cid}/Backups/Auto`);
    add(`${V2}/centers/${cid}/Backups/Manual`);
    add(`${V2}/centers/${cid}/Backups`);
    if (branchId) add(`${V2}/centers/${cid}/branches/${san(branchId)}/Backup`);
    add(drivePaths.buildV2Path(centerId, 'Backups', 'V2'));
    add(drivePaths.buildV2Path(centerId, 'Backups', 'Auto'));
    add(drivePaths.buildV2Path(centerId, 'Backups', 'Manual'));
    add(drivePaths.buildV2Path(centerId, 'Backups'));
  }

  if (centerName) {
    add(`${drivePaths.DRIVE_APP_FOLDER}/${san(centerName)}`);
  }

  return folders;
}

function buildVersionsProbePaths(options = {}) {
  const centerId = String(options.centerId || '').trim();
  const centerName = String(options.centerName || '').trim();
  const branchId = String(options.branchId || '').trim();
  const branchName = String(options.branchName || '').trim();
  const V2 = drivePaths.DRIVE_V2_ROOT;
  const san = (s) => {
    const v = String(s || '').trim();
    return v ? drivePaths.sanitizeCenter(v) : '';
  };
  const paths = new Set();
  if (centerId) paths.add(drivePaths.buildV2SyncVersionsPath(centerId));
  for (const key of [...new Set([centerName, centerId].map(san).filter(Boolean))]) {
    paths.add(`${V2}/${key}/Sync/versions.json`);
    for (const bn of [...new Set([branchName, branchId].map(san).filter(Boolean))]) {
      paths.add(`${V2}/${key}/Branches/${bn}/versions.json`);
    }
  }
  if (centerId && branchId) {
    paths.add(`${V2}/centers/${san(centerId)}/branches/${san(branchId)}/versions.json`);
  }
  return [...paths];
}

/**
 * Shallow list of files in ONE folder (no recursion).
 */
async function listFolderShallow(googleDrive, folderPath, { pageSize = 50, maxPages = 2 } = {}) {
  const { oauth2 } = await googleDrive.getAuthedClient();
  const parts = String(folderPath || '').split('/').filter(Boolean);
  const parentId = await googleDrive.resolveFolderPath(oauth2, parts, { create: false });
  if (parts.length && !parentId) {
    return { ok: true, items: [], folderMissing: true, requests: 1 };
  }
  const driveApi = require('./cloud-providers/google-drive-api');
  const items = [];
  let pageToken;
  let pages = 0;
  let requests = 1; // resolveFolderPath counted roughly
  do {
    pages += 1;
    const q = [
      parentId ? `'${parentId}' in parents` : "'root' in parents",
      'trashed=false',
    ].join(' and ');
    const res = await driveApi.listFiles(oauth2, {
      q,
      fields: 'nextPageToken,files(id,name,size,modifiedTime,md5Checksum,mimeType)',
      orderBy: 'modifiedTime desc',
      pageSize,
      pageToken,
    });
    requests += 1;
    for (const f of res.files || []) {
      if (f.mimeType === 'application/vnd.google-apps.folder') continue;
      items.push({
        id: f.id,
        name: f.name,
        path: `${folderPath}/${f.name}`,
        size: Number(f.size || 0),
        modifiedAt: f.modifiedTime || null,
        md5: f.md5Checksum || null,
        isMain: drivePaths.isMainBackupName(f.name),
        isBackupV2: isBackupArtifact(f.name),
      });
    }
    pageToken = res.nextPageToken;
  } while (pageToken && pages < maxPages);
  return { ok: true, items, truncated: !!pageToken, requests };
}

async function probeFileMeta(googleDrive, remotePath) {
  const { oauth2 } = await googleDrive.getAuthedClient();
  const file = await googleDrive.findFileByPath(oauth2, remotePath);
  if (!file) return { ok: true, found: false, requests: 1 };
  return {
    ok: true,
    found: true,
    requests: 1,
    bytes: Number(file.size || 0),
    item: {
      id: file.id,
      name: file.name,
      path: remotePath,
      size: Number(file.size || 0),
      modifiedAt: file.modifiedTime || null,
      md5: file.md5Checksum || null,
    },
  };
}

async function assertDrivePathReadable(remotePath) {
  const googleDrive = require('./cloud-providers/google-drive');
  try {
    const meta = await probeFileMeta(googleDrive, remotePath);
    if (!meta.found) {
      return { ok: false, error: 'drive_download_auth_failed', reason: 'path_not_found' };
    }
    return { ok: true, item: meta.item, requests: meta.requests };
  } catch (err) {
    const msg = err?.message || String(err);
    if (/google_not_connected|google_no_access_token|unauthorized|401|invalid_grant/i.test(msg)) {
      return { ok: false, error: 'google_token_unavailable', reason: 'drive_auth_failed', detail: msg };
    }
    return { ok: false, error: 'drive_download_auth_failed', reason: 'probe_failed', detail: msg };
  }
}

async function verifyFileIdMetadata(googleFileId, options = {}) {
  const googleDrive = require('./cloud-providers/google-drive');
  const fileId = String(googleFileId || '').trim();
  if (!fileId) return { ok: false, error: 'backup_remote_not_found', reason: 'missing_file_id' };
  try {
    const meta = await googleDrive.getFileMetadataById(fileId);
    if (!meta?.ok || !meta.item) {
      return { ok: false, error: 'backup_remote_not_found', reason: 'file_id_not_found' };
    }
    const item = meta.item;
    const expectedSize = Number(options.expectedSize || 0) || null;
    if (expectedSize && Number(item.size || 0) !== expectedSize) {
      return {
        ok: false,
        error: 'backup_remote_probe_failed',
        reason: 'size_mismatch',
        detail: { expectedSize, actualSize: Number(item.size || 0) },
      };
    }
    const expectedModifiedAt = options.expectedModifiedAt || null;
    if (expectedModifiedAt && item.modifiedAt && String(item.modifiedAt) !== String(expectedModifiedAt)) {
      return {
        ok: false,
        error: 'backup_remote_probe_failed',
        reason: 'modified_at_mismatch',
        detail: { expectedModifiedAt, actualModifiedAt: item.modifiedAt },
      };
    }
    return { ok: true, item, requests: 1 };
  } catch (err) {
    const msg = err?.message || String(err);
    if (/google_not_connected|google_no_access_token|unauthorized|401|invalid_grant/i.test(msg)) {
      return { ok: false, error: 'google_token_unavailable', reason: 'drive_auth_failed', detail: msg };
    }
    return { ok: false, error: 'backup_remote_probe_failed', reason: 'probe_failed', detail: msg };
  }
}

function finalizeRestorePoints(out) {
  out.restorePoints.sort((a, b) => String(b.modifiedAt || '').localeCompare(String(a.modifiedAt || '')));
  const backupFiles = filterBackupRestorePoints(out.restorePoints);
  const syncPoints = filterSyncHydratePoints(out.restorePoints);
  out.latestBackups = backupFiles.slice(0, BACKUP_RETENTION_DISPLAY);
  out.newestBackup = backupFiles[0] || null;
  out.syncRestorePoints = syncPoints;
  out.newestSyncCheckpoint = syncPoints[0] || null;
  out.newest = out.newestBackup || out.newestSyncCheckpoint || out.restorePoints[0] || null;
  return out.newest;
}

const { classifyBackupFile, classifyLabelAr } = require('./backup-v2-classify');
const {
  filterBackupRestorePoints,
  filterSyncHydratePoints,
  isBackupRestorePoint,
} = require('./restore-point-kinds');
const { isCloudProviderAuthenticated } = require('./cloud-provider-auth');

function buildDiscoverySummary(out, options = {}) {
  const branchIds = new Set();
  for (const p of out.restorePoints || []) {
    if (p.branchId) branchIds.add(String(p.branchId));
  }
  const localBranches = Array.isArray(options.localBranches) ? options.localBranches.length : 0;
  const branchCount = Math.max(branchIds.size, localBranches, options.branchId ? 1 : 0);
  const backupFiles = filterBackupRestorePoints(out.restorePoints || []);
  const backupCount = backupFiles.length;
  const retentionDisplay = options.backupRetentionDisplay || 3;
  const breakdown = { automatic: 0, manual: 0, safety: 0, pinned: 0, other: 0 };
  backupFiles.forEach((p) => {
    const kind = classifyBackupFile(p.name);
    if (breakdown[kind] != null) breakdown[kind] += 1;
    else breakdown.other += 1;
  });
  const breakdownParts = [];
  if (breakdown.automatic) breakdownParts.push(`دورية: ${breakdown.automatic}`);
  if (breakdown.manual) breakdownParts.push(`يدوية: ${breakdown.manual}`);
  if (breakdown.safety) breakdownParts.push(`أمان: ${breakdown.safety}`);
  if (breakdown.pinned) breakdownParts.push(`مثبتة: ${breakdown.pinned}`);
  if (breakdown.other) breakdownParts.push(`أخرى: ${breakdown.other}`);
  const breakdownLine = breakdownParts.length ? breakdownParts.join(' · ') : null;
  return {
    googleConnected: !!out.googleConnected,
    organizations: out.googleConnected && options.centerId ? 1 : 0,
    licenses: out.licenseFound ? 1 : (options.centerId ? 1 : 0),
    branches: branchCount,
    branchesInLicense: localBranches || (options.branchId ? 1 : 0),
    branchesInBackup: branchIds.size || null,
    devices: out.devicesFound || 0,
    datasets: out.datasetsFound || branchCount,
    backups: backupCount,
    backupsTotal: backupCount,
    backupsRetention: retentionDisplay,
    backupsBreakdown: breakdown,
    backupsDetail: backupCount > retentionDisplay
      ? `${backupCount} (إجمالي) · retention: ${retentionDisplay}${breakdownLine ? ` · ${breakdownLine}` : ''}`
      : `${backupCount}${breakdownLine ? ` · ${breakdownLine}` : ''}`,
    attachments: out.attachmentsFound ?? null,
    syncCheckpoints: (out.restorePoints || []).filter((p) => p.kind === 'sync_checkpoint').length,
  };
}

function computeStagePercent(stageId, intraRatio) {
  const idx = DISCOVERY_STAGES.findIndex((s) => s.id === stageId);
  if (idx < 0) return 5;
  let done = 0;
  for (let i = 0; i < idx; i += 1) done += DISCOVERY_STAGES[i].weight;
  const stage = DISCOVERY_STAGES[idx];
  const ratio = Math.min(1, Math.max(0, Number(intraRatio) || 0));
  const current = stage.weight * ratio;
  return Math.min(99, Math.round(((done + current) / STAGE_WEIGHT_TOTAL) * 100));
}

function formatTimeoutSeconds(ms) {
  return Math.round(ms / 1000);
}

/**
 * Discover restore points for a center/branch without downloading payloads.
 */
async function discoverCloudRestorePoints(options = {}) {
  const googleDrive = require('./cloud-providers/google-drive');
  const trace = startTrace('cloud_fast_discovery');
  const centerId = String(options.centerId || '').trim();
  const branchId = String(options.branchId || '').trim();
  const centerName = String(options.centerName || '').trim();
  const branchName = String(options.branchName || '').trim();
  const overallMs = clampTimeoutMs(options.timeoutMs);
  const progressSender = options.progressSender || null;

  const out = {
    ok: true,
    mode: 'fast_discovery',
    centerId: centerId || null,
    branchId: branchId || null,
    branchName: branchName || null,
    centerName: centerName || null,
    googleConnected: false,
    restorePoints: [],
    latestBackups: [],
    newest: null,
    summary: null,
    licenseFound: false,
    devicesFound: 0,
    datasetsFound: 0,
    attachmentsFound: null,
    status: 'unknown',
    message: null,
    durationMs: 0,
    timedOut: false,
    partialScan: false,
    truncatedFolders: [],
    downloadedBytes: 0,
    downloadedFullBackup: false,
    syncEngineStarted: false,
    instrumentation: trace,
  };

  const overallDeadline = Date.now() + overallMs;
  let foldersProbed = 0;
  let lastRealProgressMs = Date.now();
  let currentStageId = 'oauth';
  let noProgressWarned = false;
  const localBranches = Array.isArray(options.localBranches) ? options.localBranches : [];

  function markRealProgress() {
    lastRealProgressMs = Date.now();
    noProgressWarned = false;
  }

  function emitProgress(extra = {}) {
    if (extra.stageId) currentStageId = extra.stageId;
    const elapsedMs = Date.now() - trace.startedMs;
    const foldersDone = extra.foldersDone != null ? extra.foldersDone : foldersProbed;
    const foldersTotal = extra.foldersTotal || null;
    let intraRatio = extra.intraRatio;
    if (intraRatio == null && foldersTotal > 0) {
      intraRatio = foldersDone / foldersTotal;
    }
    const percent = extra.percent != null
      ? extra.percent
      : computeStagePercent(currentStageId, intraRatio != null ? intraRatio : 0);

    let etaMs = null;
    if (foldersTotal > 0 && foldersDone > 0 && foldersDone < foldersTotal) {
      const perFolder = elapsedMs / foldersDone;
      etaMs = Math.round(perFolder * (foldersTotal - foldersDone));
    }

    if (Date.now() - lastRealProgressMs > NO_PROGRESS_WATCHDOG_MS && !noProgressWarned) {
      noProgressWarned = true;
      extra.stalled = true;
    }

    if (extra.realProgress === true) {
      lastRealProgressMs = Date.now();
      noProgressWarned = false;
    }
    const payload = {
      phase: extra.phase || 'cloud',
      stageId: currentStageId,
      folder: extra.folder || null,
      foldersDone,
      foldersTotal,
      foundCount: out.restorePoints.length,
      backupCount: filterBackupRestorePoints(out.restorePoints || []).length,
      elapsedMs,
      budgetMs: overallMs,
      etaMs,
      percent,
      stalled: !!extra.stalled,
      stalledMs: extra.stalled ? Date.now() - lastRealProgressMs : 0,
      label: extra.label || DISCOVERY_STAGES.find((s) => s.id === currentStageId)?.label || 'فحص Google Drive',
      summary: out.summary || null,
    };
    if (typeof options.onProgress === 'function') {
      try { options.onProgress(payload); } catch { /* observer only */ }
    }
    if (progressSender && typeof progressSender.send === 'function' && !progressSender.isDestroyed?.()) {
      try { progressSender.send('backup:discoveryProgress', payload); } catch { /* observer only */ }
    }
  }

  async function step(name, fn, budgetMs = PER_REQUEST_MS) {
    const remaining = overallDeadline - Date.now();
    if (remaining <= 0) {
      const err = new Error('discovery_timeout:overall');
      err.code = 'DISCOVERY_TIMEOUT';
      throw err;
    }
    const start = Date.now();
    try {
      const result = await withTimeout(fn(), Math.min(budgetMs, remaining), name);
      pushStep(trace, name, start, result && typeof result === 'object' ? result : { ok: true });
      return result;
    } catch (err) {
      pushStep(trace, name, start, {
        ok: false,
        status: err.code || 'error',
        detail: err.message || String(err),
      });
      throw err;
    }
  }

  const seen = new Set();

  function ingestListedItems(listed, folder) {
    if (listed?.truncated) {
      out.partialScan = true;
      if (!out.truncatedFolders.includes(folder)) out.truncatedFolders.push(folder);
    }
    let added = 0;
    for (const item of listed.items || []) {
      if (!isBackupArtifact(item.name)) continue;
      if (seen.has(item.id || item.path)) continue;
      seen.add(item.id || item.path);
      out.restorePoints.push({
        kind: 'backup_v2',
        source: 'cloud_backup',
        id: item.id,
        googleFileId: item.id,
        name: item.name,
        path: item.path,
        remotePath: item.path,
        sizeBytes: item.size || 0,
        expectedSize: item.size || 0,
        expectedModifiedAt: item.modifiedAt,
        modifiedAt: item.modifiedAt,
        md5: item.md5,
        centerId,
        branchId: branchId || null,
        schemaVersion: null,
        revision: null,
        attachmentCount: null,
        recordCount: null,
        backupClass: classifyBackupFile(item.name),
        backupClassLabel: classifyLabelAr(classifyBackupFile(item.name)),
        scopeLabel: branchId ? 'فرع' : 'مؤسسة',
        validation: (item.size || 0) > 0 && (item.size || 0) < 100 * 1024 ? 'metadata_suspicious_small' : 'metadata_ok',
        probedFolder: folder,
      });
      added += 1;
    }
    return added;
  }

  async function probeBackupFolder(folder, foldersTotal, listOpts = {}) {
    if (Date.now() >= overallDeadline) return false;
    emitProgress({
      phase: 'folders',
      stageId: 'backups',
      folder,
      foldersTotal,
      label: `فحص مجلد: ${folder}`,
    });
    try {
      const listed = await step(`list_shallow:${folder}`, () => listFolderShallow(googleDrive, folder, {
        pageSize: listOpts.pageSize || 40,
        maxPages: listOpts.maxPages || 1,
      }), PER_REQUEST_MS);
      ingestListedItems(listed, folder);
    } catch (err) {
      if (err.code === 'DISCOVERY_TIMEOUT') throw err;
      // folder missing / access — continue other probes
    }
    foldersProbed += 1;
    emitProgress({
      phase: 'folders',
      stageId: 'backups',
      folder,
      foldersDone: foldersProbed,
      foldersTotal,
      realProgress: true,
    });
    return true;
  }

  try {
    emitProgress({ phase: 'oauth', stageId: 'oauth', label: 'التحقق من اتصال Google…', percent: computeStagePercent('oauth', 0.5), realProgress: true });

    // 1) Google connection / token
    const status = await step('oauth_status', async () => {
      const s = await googleDrive.getStatus();
      return {
        ok: !!s?.connected && !s?.needsReauth,
        status: s?.needsReauth ? 'needs_reauth' : (s?.connected ? 'connected' : 'disconnected'),
        detail: s?.email || null,
        requests: 1,
        raw: s,
      };
    });
    out.googleConnected = isCloudProviderAuthenticated(status?.raw || status);
    if (!out.googleConnected) {
      out.status = status?.status === 'needs_reauth' ? 'token_expired' : 'offline';
      out.message = status?.status === 'needs_reauth'
        ? 'انتهت صلاحية جلسة Google — أعد الربط ثم أعد المحاولة.'
        : 'حساب Google غير متصل.';
      out.ok = true;
      out.durationMs = Date.now() - trace.startedMs;
      trace.endedAt = nowIso();
      trace.durationMs = out.durationMs;
      return out;
    }

    emitProgress({ phase: 'center', stageId: 'center', label: 'التحقق من المركز…', percent: computeStagePercent('center', 0.5), realProgress: true });

    if (!centerId) {
      out.status = 'missing_center';
      out.message = 'لا يوجد centerId محلي للبحث عن بيانات سحابية.';
      out.durationMs = Date.now() - trace.startedMs;
      trace.endedAt = nowIso();
      trace.durationMs = out.durationMs;
      return out;
    }

    emitProgress({ phase: 'license', stageId: 'license', label: 'فحص الترخيص…', percent: computeStagePercent('license', 0.3), realProgress: true });
    try {
      const licPath = drivePaths.buildV2Path(centerId, 'license.json');
      const licMeta = await step('license_meta', () => probeFileMeta(googleDrive, licPath), PER_REQUEST_MS);
      out.licenseFound = !!licMeta.found;
    } catch (err) {
      if (err.code === 'DISCOVERY_TIMEOUT') throw err;
    }

    emitProgress({ phase: 'organizations', stageId: 'organizations', label: 'فحص المؤسسة…', percent: computeStagePercent('organizations', 0.5), realProgress: true });
    emitProgress({ phase: 'branches', stageId: 'branches', label: 'فحص الفروع…', percent: computeStagePercent('branches', 0.2), realProgress: true });

    // 2) Shallow backup folder probes — priority batch in parallel, then sequential until 3 backups or all folders
    const backupFolders = buildDiscoveryProbeFolders({
      centerId, centerName, branchId, branchName,
    });
    out.probedFolders = backupFolders.slice();
    const foldersTotal = backupFolders.length;
    const priorityBatch = backupFolders.slice(0, PRIORITY_PARALLEL);
    const remainingFolders = backupFolders.slice(PRIORITY_PARALLEL);

    emitProgress({
      phase: 'folders',
      stageId: 'backups',
      foldersDone: 0,
      foldersTotal,
      label: `فحص ${foldersTotal} مساراً معروفاً على Drive…`,
      percent: computeStagePercent('backups', 0.05),
    });

    const v2DeepList = { pageSize: 50, maxPages: 3 };
    await Promise.all(priorityBatch.map((folder) => probeBackupFolder(
      folder,
      foldersTotal,
      folder === 'Backups/V2' ? v2DeepList : {}
    )));

    const backupCount = filterBackupRestorePoints(out.restorePoints).length;
    if (backupCount < BACKUP_RETENTION_DISPLAY) {
      for (const folder of remainingFolders) {
        if (Date.now() >= overallDeadline) {
          out.partialScan = foldersProbed < foldersTotal;
          break;
        }
        if (filterBackupRestorePoints(out.restorePoints).length >= BACKUP_RETENTION_DISPLAY
          && folder !== 'Backups/V2') {
          continue;
        }
        await probeBackupFolder(folder, foldersTotal, folder.includes('Backups/V2') ? v2DeepList : {});
      }
    } else {
      out.partialScan = remainingFolders.length > 0;
    }

    out.datasetsFound = Math.max(localBranches.length, branchId ? 1 : 0);
    try {
      const devicesPath = drivePaths.buildV2Path(centerId, 'devices.json');
      const devMeta = await step('devices_meta', () => probeFileMeta(googleDrive, devicesPath), PER_REQUEST_MS);
      if (devMeta.found && devMeta.item?.size > 2) out.devicesFound = 1;
    } catch (err) {
      if (err.code === 'DISCOVERY_TIMEOUT') throw err;
    }

    emitProgress({ phase: 'datasets', stageId: 'datasets', label: 'تلخيص مجموعات البيانات…', percent: computeStagePercent('datasets', 0.8), realProgress: true });
    emitProgress({ phase: 'versions', stageId: 'versions', label: 'فحص نقاط المزامنة (versions.json)…', percent: computeStagePercent('versions', 0.1), realProgress: true });
    const versionsPaths = buildVersionsProbePaths({
      centerId, centerName, branchId, branchName,
    });
    for (const versionsPath of versionsPaths) {
      if (Date.now() >= overallDeadline) {
        out.partialScan = true;
        break;
      }
      try {
        const meta = await step(`versions_meta:${versionsPath}`, () => probeFileMeta(googleDrive, versionsPath), PER_REQUEST_MS);
        if (meta.found) {
          out.restorePoints.push({
            kind: 'sync_checkpoint',
            source: 'cloud_sync',
            id: meta.item.id,
            name: meta.item.name,
            path: meta.item.path,
            sizeBytes: meta.item.size || 0,
            modifiedAt: meta.item.modifiedAt,
            md5: meta.item.md5,
            centerId,
            branchId: branchId || null,
            schemaVersion: null,
            revision: 'versions.json',
            attachmentCount: null,
            recordCount: null,
            validation: 'metadata_ok',
          });
          break;
        }
      } catch (err) {
        if (err.code === 'DISCOVERY_TIMEOUT') throw err;
      }
    }

    finalizeRestorePoints(out);
    out.summary = buildDiscoverySummary(out, {
      centerId,
      branchId,
      localBranches,
    });
    emitProgress({
      phase: 'done',
      stageId: 'done',
      percent: 100,
      label: out.partialScan ? 'اكتمل الفحص جزئياً — لم تُفحص كل صفحات Drive' : 'اكتمل الفحص',
      realProgress: true,
      summary: out.summary,
    });

    if (!out.newest) {
      out.status = out.partialScan ? 'timeout' : 'not_found';
      out.message = out.partialScan
        ? `نتائج الفحص غير مكتملة: لم تُفحص جميع مسارات أو صفحات Drive${out.truncatedFolders.length ? ` (${out.truncatedFolders.length} مجلد/مجلدات مقصوصة)` : ''}. لا يمكن الجزم بعدم وجود نسخة؛ أعد المحاولة أو اختر مصدراً آخر.`
        : 'لم يتم العثور على نسخ سحابية على Drive لهذا المركز. تأكد من نفس حساب Google قبل إعادة التثبيت، أو اختر «ملف Backup» إذا لديك نسخة محلية (.tdw).';
      if (out.partialScan) out.timedOut = true;
    } else {
      out.status = 'ready';
      out.message = out.partialScan
        ? `وُجدت نقطة استعادة سحابية، لكن نتائج Drive جزئية${out.truncatedFolders.length ? ` (${out.truncatedFolders.length} مجلد/مجلدات مقصوصة)` : ''} — أكّد النقطة المختارة فقط ولا تعتبر القائمة كاملة.`
        : 'وُجدت نقطة استعادة سحابية — أكّد قبل التنزيل.';
    }
  } catch (err) {
    finalizeRestorePoints(out);
    if (err.code === 'DISCOVERY_TIMEOUT') {
      out.timedOut = true;
      out.partialScan = true;
      const sec = formatTimeoutSeconds(overallMs);
      if (out.newest) {
        out.status = 'ready';
        out.message = `وُجدت نقطة استعادة سحابية — تجاوز الفحص المهلة (${sec} ث) لكن النتائج متاحة للتأكيد.`;
      } else {
        out.status = 'timeout';
        out.message = `تجاوز فحص السحابة المهلة (${sec} ثانية). أعد المحاولة أو اختر مصدراً آخر.`;
      }
      out.ok = true;
    } else {
      out.ok = false;
      out.status = 'error';
      out.message = err.message || String(err);
    }
  }

  out.durationMs = Date.now() - trace.startedMs;
  trace.endedAt = nowIso();
  trace.durationMs = out.durationMs;
  out.instrumentation = trace;
  return out;
}

module.exports = {
  DISCOVERY_OVERALL_MS,
  DISCOVERY_MAX_MS,
  NO_PROGRESS_WATCHDOG_MS,
  BACKUP_RETENTION_DISPLAY,
  DISCOVERY_STAGES,
  PER_REQUEST_MS,
  clampTimeoutMs,
  withTimeout,
  listFolderShallow,
  probeFileMeta,
  isBackupArtifact,
  buildDiscoveryProbeFolders,
  buildVersionsProbePaths,
  buildDiscoverySummary,
  computeStagePercent,
  finalizeRestorePoints,
  discoverCloudRestorePoints,
  assertDrivePathReadable,
  verifyFileIdMetadata,
  isBackupRestorePoint,
};
