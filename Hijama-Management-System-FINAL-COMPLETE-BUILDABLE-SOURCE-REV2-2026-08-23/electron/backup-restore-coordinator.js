'use strict';

/**
 * RC Hotfix Round 7 — single Backup V2 restore pipeline for BootFlow, Backup page, and managers.
 * Cloud restore: download → verify → local restore. Never stream-restore directly from Drive.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const deviceIdentity = require('./device-identity-snapshot');

const STAGES = Object.freeze([
  'authorization',
  'downloading',
  'verifying_archive',
  'inspecting_manifest',
  'safety_snapshot',
  'restoring',
  'reopening',
  'rehydrating_runtime',
  'verifying_data',
  'completed',
]);

const STAGE_LABELS_AR = Object.freeze({
  authorization: 'التحقق من حساب Google',
  downloading: 'تنزيل النسخة',
  verifying_archive: 'التحقق من سلامة الملف',
  inspecting_manifest: 'فحص بيانات النسخة',
  safety_snapshot: 'إنشاء نسخة أمان للحالة الحالية',
  restoring: 'استعادة قاعدة البيانات',
  reopening: 'إعادة فتح SQLite',
  rehydrating_runtime: 'تحديث الذاكرة من قاعدة البيانات',
  verifying_data: 'التحقق من البيانات المستعادة',
  completed: 'تجهيز المزامنة',
});

let deps = {
  getUserDataPath: () => '',
  downloadCloudBackup: async () => ({ ok: false }),
  downloadCloudBackupByFileId: async () => ({ ok: false }),
  verifyFileIdMetadata: async () => ({ ok: false }),
  runLocalRestore: async () => ({ ok: false }),
  rollbackLocalRestore: async () => ({ ok: false, error: 'restore_rollback_unavailable' }),
  reopenDatabase: async () => {},
  countDatabaseRows: () => ({ ok: false, counts: {} }),
  rehydrateRuntime: async () => ({ ok: true, skipped: true }),
  inspectBackupBuffer: () => ({ manifest: null }),
  verifyBackupFile: () => ({ ok: true }),
  scopeFromManifest: () => ({}),
  issueBootstrapAuthorization: async () => ({ ok: false }),
  consumeBootstrapCapability: () => ({ ok: false }),
  assertBootstrapManifestScope: () => ({ ok: true }),
  getCapability: () => null,
  isBackupBufferEncrypted: () => false,
  friendlyError: (err) => ({ code: err?.code || 'restore_failed', message: err?.message || String(err) }),
};

let restoreInFlight = null;

function configure(nextDeps) {
  deps = { ...deps, ...nextDeps };
}

function newDiagnosticId(prefix = 'BKP') {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function downloadedDir(userDataDir) {
  return path.join(userDataDir, 'Backups', 'V2', 'Downloaded');
}

function stagePercent(stageId, intraRatio = 0) {
  const idx = STAGES.indexOf(stageId);
  if (idx < 0) return 0;
  const weight = 100 / STAGES.length;
  return Math.min(99, Math.round((idx + Math.min(1, Math.max(0, intraRatio))) * weight));
}

function buildProgressEmitter(onProgress, diagnosticId, startedMs) {
  return (stage, extra = {}) => {
    const payload = {
      stage,
      stageLabel: STAGE_LABELS_AR[stage] || stage,
      diagnosticId,
      elapsedMs: Date.now() - startedMs,
      percent: extra.percent != null ? extra.percent : stagePercent(stage, extra.intraRatio),
      ...extra,
    };
    try { onProgress?.(payload); } catch { /* observer */ }
    return payload;
  };
}

function verifyCountsAgainstManifest(manifest, scopeTruth, rowCounts) {
  const rc = scopeTruth?.recordCounts || manifest?.scopeTruth?.recordCounts || manifest?.recordCounts || null;
  if (!rc || typeof rc !== 'object') return { ok: true, skipped: true };
  const expected = {
    clients: Number(rc.clients ?? rc.clientsRegistry ?? rc.clientCount ?? -1),
    visits: Number(rc.cases ?? rc.visits ?? rc.caseCount ?? -1),
    bookings: Number(rc.bookings ?? rc.bookingCount ?? -1),
  };
  const actual = {
    clients: Number(rowCounts?.clientsRegistry ?? rowCounts?.clients ?? 0),
    visits: Number(rowCounts?.cases ?? rowCounts?.visits ?? 0),
    bookings: Number(rowCounts?.bookings ?? 0),
  };
  const mismatches = [];
  Object.keys(expected).forEach((key) => {
    const exp = expected[key];
    if (!Number.isFinite(exp) || exp < 0) return;
    const got = actual[key] || 0;
    if (got !== exp) mismatches.push({ key, expected: exp, actual: got });
  });
  return { ok: mismatches.length === 0, mismatches, expected, actual };
}

async function downloadCloudToLocal(request, emit) {
  const userDataDir = deps.getUserDataPath();
  const outDir = downloadedDir(userDataDir);
  fs.mkdirSync(outDir, { recursive: true });

  const googleFileId = String(request.googleFileId || '').trim();
  const remotePath = String(request.remotePath || '').trim();
  const expectedSize = Number(request.expectedSize || request.expectedSizeBytes || 0) || null;
  const downloadStarted = Date.now();
  let dl;

  if (googleFileId) {
    dl = await deps.downloadCloudBackupByFileId(googleFileId, {
      remotePath,
      expectedSize,
      onProgress: (evt) => {
        emit('downloading', {
          intraRatio: (evt.percent || 0) / 100,
          downloadedBytes: evt.downloadedBytes ?? evt.bytesCopied ?? 0,
          totalBytes: evt.totalBytes || expectedSize || 0,
          percent: evt.percent,
          speed: evt.speed,
          elapsedMs: Date.now() - downloadStarted,
          etaMs: evt.etaMs,
        });
      },
    });
  } else {
    if (!remotePath) {
      return { ok: false, error: 'backup_remote_not_found', stage: 'downloading', message: 'remotePath or googleFileId required' };
    }
    dl = await deps.downloadCloudBackup(remotePath, 'google');
    const buf = dl?.buffer || (dl?.text ? Buffer.from(String(dl.text), 'utf8') : null);
    const totalBytes = buf?.length || 0;
    emit('downloading', {
      intraRatio: 1,
      downloadedBytes: totalBytes,
      totalBytes,
      percent: 100,
      elapsedMs: Date.now() - downloadStarted,
    });
    dl = { ...dl, buffer: buf, totalBytes };
  }

  if (!dl?.ok && dl?.buffer == null) {
    return {
      ok: false,
      error: dl?.error || 'backup_remote_not_found',
      stage: 'downloading',
      message: dl?.message || dl?.detail || 'Cloud download failed',
      detail: dl,
    };
  }

  const buf = dl.buffer || (dl.text ? Buffer.from(String(dl.text), 'utf8') : null);
  if (!buf?.length) {
    return { ok: false, error: 'backup_remote_not_found', stage: 'downloading', message: 'Empty download' };
  }

  const safeName = path.basename(remotePath || dl.file?.name || `cloud-${googleFileId || Date.now()}.tdw`)
    .replace(/[^\w.\-]+/g, '_') || `cloud-${Date.now()}.tdw`;
  const filePath = path.join(outDir, safeName);
  fs.writeFileSync(filePath, buf);

  emit('verifying_archive', { intraRatio: 0.1, filePath, downloadedBytes: buf.length, totalBytes: buf.length });
  const packageSha256 = crypto.createHash('sha256').update(buf).digest('hex');
  if (expectedSize && buf.length !== expectedSize) {
    return {
      ok: false,
      error: 'backup_integrity_failed',
      stage: 'verifying_archive',
      message: `Size mismatch expected ${expectedSize} got ${buf.length}`,
      filePath,
      packageSha256,
    };
  }

  if (deps.isBackupBufferEncrypted(buf)) {
    return {
      ok: false,
      error: 'backup_legacy_encrypted_direct_restore_blocked',
      stage: 'verifying_archive',
      filePath,
    };
  }

  try {
    deps.verifyBackupFile(filePath, null, request);
  } catch (err) {
    const friendly = deps.friendlyError(err);
    return {
      ok: false,
      error: friendly.code || 'backup_integrity_failed',
      stage: 'verifying_archive',
      message: friendly.message,
      filePath,
      packageSha256,
    };
  }

  emit('verifying_archive', { intraRatio: 1, filePath, packageSha256, verified: true });
  return {
    ok: true,
    filePath,
    remotePath: remotePath || dl.remotePath || null,
    googleFileId: googleFileId || dl.file?.id || null,
    downloadBytes: buf.length,
    packageSha256,
    fileMeta: dl.file || null,
  };
}

/**
 * Unified restore entry — same contract for bootstrap + authenticated contexts.
 */
async function restoreInternal(request = {}) {
  const startedMs = Date.now();
  const diagnosticId = request.diagnosticId || newDiagnosticId();
  const emit = buildProgressEmitter(request.onProgress, diagnosticId, startedMs);
  const context = request.context === 'bootstrap' ? 'bootstrap' : 'authenticated';
  const source = request.source === 'local' ? 'local' : (request.source === 'cloud' ? 'cloud' : null);
  const userDataDir = deps.getUserDataPath();
  let bootstrapRestoreCapabilityId = request.authorization?.capabilityId
    || request.bootstrapRestoreCapabilityId
    || null;
  let localPath = request.localPath || request.filePath || null;
  let downloadResult = null;
  let identitySnapshot = null;

  try {
    if (source === 'cloud') {
      emit('authorization', { intraRatio: 0 });
      if (context === 'bootstrap' && !bootstrapRestoreCapabilityId) {
        const authRes = await deps.issueBootstrapAuthorization(request, emit);
        if (!authRes?.ok) {
          return {
            ok: false,
            error: authRes.error || 'restore_authorization_required',
            stage: 'authorization',
            diagnosticId,
            message: authRes.message || authRes.error,
            reason: authRes.reason,
            detail: authRes.detail,
          };
        }
        bootstrapRestoreCapabilityId = authRes.capabilityId || bootstrapRestoreCapabilityId;
      }

      downloadResult = await downloadCloudToLocal(request, emit);
      if (!downloadResult.ok) {
        return { ...downloadResult, diagnosticId, preservedIdentity: true };
      }
      localPath = downloadResult.filePath;

      emit('inspecting_manifest', { intraRatio: 0.2, filePath: localPath });
      const buf = fs.readFileSync(localPath);
      const inspected = deps.inspectBackupBuffer(buf, null, request);
      const scope = deps.scopeFromManifest(inspected.manifest);
      emit('inspecting_manifest', { intraRatio: 1, manifest: inspected.manifest, scopeTruth: scope });

      if (bootstrapRestoreCapabilityId) {
        const cap = deps.getCapability(bootstrapRestoreCapabilityId);
        const scopeGate = deps.assertBootstrapManifestScope(cap, inspected.manifest, scope);
        if (!scopeGate.ok) {
          return {
            ok: false,
            error: scopeGate.error || 'restore_scope_mismatch',
            stage: 'inspecting_manifest',
            diagnosticId,
          };
        }
      }
    } else if (!localPath) {
      return { ok: false, error: 'restore_request_invalid', stage: 'authorization', diagnosticId };
    }

    identitySnapshot = deviceIdentity.capture(userDataDir);
    emit('safety_snapshot', { intraRatio: 0.5, preservedDeviceIdentity: true });
    emit('restoring', { intraRatio: 0, filePath: localPath });

    const restoreRes = await deps.runLocalRestore(localPath, {
      ...request,
      ...request.identity,
      centerId: request.centerId || request.identity?.centerId,
      organizationId: request.organizationId || request.identity?.organizationId,
      branchId: request.branchId || request.identity?.branchId,
      licensedBranchIds: request.licensedBranchIds,
      bootstrapRestoreCapabilityId,
      relaunch: request.relaunch === true,
      allowMissingSourceMetadata: context === 'bootstrap' || request.allowMissingSourceMetadata === true,
      requireScopeTruth: context === 'bootstrap' ? false : request.requireScopeTruth === true,
      skipScopeTruth: context === 'bootstrap' ? true : request.skipScopeTruth === true,
      onProgress: (evt) => emit('restoring', { intraRatio: 0.5, restoreProgress: evt }),
    });

    if (!restoreRes || restoreRes.ok === false) {
      if (identitySnapshot) {
        try { deviceIdentity.restore(userDataDir, identitySnapshot); } catch { /* best effort */ }
      }
      return {
        ok: false,
        error: restoreRes?.error || restoreRes?.message || 'restore_failed',
        message: restoreRes?.message || restoreRes?.error || 'restore_failed',
        stage: 'restoring',
        diagnosticId,
        restoreVerified: false,
        preservedIdentity: !!identitySnapshot,
        restore: restoreRes || null,
      };
    }

    const postCommitFailure = async (error, stage, extra = {}) => {
      let rollback = null;
      try {
        rollback = await deps.rollbackLocalRestore({
          userDataDir,
          rollbackPath: restoreRes.rollbackPath,
          restore: restoreRes,
          diagnosticId,
        });
      } catch (rollbackError) {
        rollback = { ok: false, error: rollbackError?.code || rollbackError?.message || 'restore_rollback_failed' };
      }
      if (rollback?.ok) {
        try { await deps.reopenDatabase?.(); } catch { /* recovery is attempted again on next launch */ }
        return {
          ok: false,
          error,
          stage,
          diagnosticId,
          truthfulState: 'ROLLED_BACK_AFTER_POST_COMMIT_FAILURE',
          committed: false,
          rolledBack: true,
          rollback,
          preservedIdentity: !!identitySnapshot,
          restore: restoreRes,
          ...extra,
        };
      }
      return {
        ok: false,
        error: 'restore_committed_post_processing_failed',
        cause: error,
        stage,
        diagnosticId,
        truthfulState: 'COMMITTED_POST_PROCESSING_FAILURE',
        committed: true,
        rolledBack: false,
        rollback: rollback || { ok: false, error: 'restore_rollback_unavailable' },
        preservedIdentity: !!identitySnapshot,
        restore: restoreRes,
        ...extra,
      };
    };

    emit('reopening', { intraRatio: 0.3 });
    try {
      await deps.reopenDatabase?.();
      deviceIdentity.restore(userDataDir, identitySnapshot);
    } catch (error) {
      return postCommitFailure(error?.code || 'restore_reopen_failed', 'reopening', { message: error?.message || null });
    }
    emit('reopening', { intraRatio: 1, identityRestored: true });

    if (bootstrapRestoreCapabilityId) {
      deps.consumeBootstrapCapability(bootstrapRestoreCapabilityId);
    }

    const dbPath = path.join(userDataDir, 'database', 'tadawi.db');
    const rowCountRes = deps.countDatabaseRows(dbPath);
    const sqliteCounts = rowCountRes?.counts || restoreRes?.rowCounts || {};

    emit('rehydrating_runtime', { intraRatio: 0.05 });
    const rehydrateRes = await deps.rehydrateRuntime?.({
      diagnosticId,
      webContentsId: request.webContentsId,
      manifest: restoreRes?.manifest || downloadResult?.manifest || null,
      scopeTruth: restoreRes?.scopeTruth || downloadResult?.scopeTruth || null,
      rowCounts: sqliteCounts,
      onSubstage: (_name, ratio) => emit('rehydrating_runtime', { intraRatio: Math.min(0.95, 0.1 + (ratio || 0) * 0.85) }),
    }) || { ok: true, skipped: true };

    if (!rehydrateRes || rehydrateRes.ok === false) {
      return postCommitFailure(rehydrateRes?.error || 'restore_rehydrate_failed', 'rehydrating_runtime', {
        restoreVerified: false,
        rehydrate: rehydrateRes || null,
        rowCounts: sqliteCounts,
      });
    }
    emit('rehydrating_runtime', {
      intraRatio: 1,
      memoryCounts: rehydrateRes.memoryCounts,
      sqliteCounts: rehydrateRes.sqliteCounts || sqliteCounts,
    });

    emit('verifying_data', { intraRatio: 0.2 });
    const manifest = restoreRes?.manifest || downloadResult?.manifest || null;
    const scopeTruth = restoreRes?.scopeTruth || downloadResult?.scopeTruth || null;
    const countVerify = verifyCountsAgainstManifest(manifest, scopeTruth, sqliteCounts);
    const memoryVerify = rehydrateRes.skipped
      ? { ok: true, skipped: true }
      : {
        ok: rehydrateRes.ok !== false,
        memoryCounts: rehydrateRes.memoryCounts,
        sqliteCounts: rehydrateRes.sqliteCounts || sqliteCounts,
        mismatches: rehydrateRes.mismatches || [],
      };
    emit('verifying_data', {
      intraRatio: 1,
      rowCounts: sqliteCounts,
      countVerify,
      memoryVerify,
    });

    const restoreVerified = countVerify.ok !== false && memoryVerify.ok !== false;
    if (!restoreVerified) {
      return postCommitFailure(
        memoryVerify.ok === false ? 'restore_rehydrate_memory_mismatch' : 'restore_count_mismatch',
        memoryVerify.ok === false ? 'rehydrating_runtime' : 'verifying_data',
        {
          restoreVerified: false,
          countVerify,
          memoryVerify,
          rehydrate: rehydrateRes,
          rowCounts: sqliteCounts,
        }
      );
    }

    emit('completed', {
      intraRatio: 1,
      percent: 100,
      restoreVerified: true,
      reconciliationRequired: true,
    });

    return {
      ok: true,
      diagnosticId,
      filePath: localPath,
      remotePath: request.remotePath || downloadResult?.remotePath || null,
      googleFileId: request.googleFileId || downloadResult?.googleFileId || null,
      download: downloadResult,
      restore: restoreRes,
      rehydrate: rehydrateRes,
      rowCounts: sqliteCounts,
      countVerify,
      memoryVerify,
      restoreVerified: true,
      preservedIdentity: identitySnapshot,
      bootstrapRestore: context === 'bootstrap',
      durationMs: Date.now() - startedMs,
      stages: STAGES,
    };
  } catch (err) {
    if (identitySnapshot) {
      try { deviceIdentity.restore(userDataDir, identitySnapshot); } catch { /* best effort */ }
    }
    const friendly = deps.friendlyError(err);
    return {
      ok: false,
      error: friendly.code || err.code || 'restore_failed',
      message: friendly.message || err.message,
      diagnosticId,
      stage: err.stage || 'restoring',
      preservedIdentity: !!identitySnapshot,
    };
  }
}

async function restore(request = {}) {
  if (restoreInFlight) {
    return {
      ok: false,
      error: 'restore_in_progress',
      stage: 'authorization',
      diagnosticId: request.diagnosticId || null,
      message: 'A restore operation is already in progress for this application process.',
    };
  }
  const operation = restoreInternal(request);
  restoreInFlight = operation;
  try {
    return await operation;
  } finally {
    if (restoreInFlight === operation) restoreInFlight = null;
  }
}

module.exports = {
  STAGES,
  STAGE_LABELS_AR,
  configure,
  restore,
  downloadedDir,
  verifyCountsAgainstManifest,
  newDiagnosticId,
  _getRestoreInFlight: () => !!restoreInFlight,
};
