'use strict';

/**
 * Backup V2 IPC wiring (Hybrid). Main-process only — no CSP impact.
 * Feature flag: HYBRID_BACKUP_V2 (default enabled).
 */
const path = require('path');
const fs = require('fs');
const { dialog, webContents } = require('electron');
const backupV2 = require('./backup-v2-core');
const restoreAuthority = require('./restore-authority');
const backupV2Cloud = require('./backup-v2-cloud');
const backupV2ScopeTruth = require('./backup-v2-scope-truth');
const { BackupV2Scheduler } = require('./backup-v2-scheduler');
const { copyWithResume, uploadWithResume } = require('./backup-v2-transfer');
const backupMain = require('./backup');
const bootstrapRestoreCap = require('./bootstrap-restore-capability');
const backupRestoreCoordinator = require('./backup-restore-coordinator');
const cloudDiscovery = require('./cloud-data-discovery');

function isBackupV2Enabled() {
  const raw = process.env.HYBRID_BACKUP_V2;
  if (raw == null || raw === '') return true;
  return raw !== '0' && raw !== 'false';
}

function asIdentity(opts = {}) {
  const centerId = String(opts.centerId || opts.organizationId || '').slice(0, 128);
  const organizationId = String(opts.organizationId || opts.centerId || '').slice(0, 128);
  const branchId = String(opts.branchId || '').slice(0, 128);
  const authorizedBranchIds = Array.isArray(opts.authorizedBranchIds)
    ? opts.authorizedBranchIds.map((v) => String(v).slice(0, 128)).filter(Boolean)
    : (branchId ? [branchId] : []);
  return {
    centerId,
    organizationId,
    branchId,
    authorizedBranchIds,
    deviceId: String(opts.deviceId || '').slice(0, 128),
    centerName: String(opts.centerName || '').slice(0, 200),
    deviceName: String(opts.deviceName || '').slice(0, 200),
    allowMissingSourceMetadata: opts.allowMissingSourceMetadata === true,
  };
}

function createFileCredentialVault(userDataDir) {
  const storePath = path.join(userDataDir, 'settings', 'backup-v2-credentials.json');
  function readAll() {
    try {
      return JSON.parse(fs.readFileSync(storePath, 'utf8'));
    } catch {
      return {};
    }
  }
  function writeAll(data) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, `${JSON.stringify(data)}\n`, { encoding: 'utf8', mode: 0o600 });
  }
  return {
    has(key) {
      const all = readAll();
      return Boolean(all[key]);
    },
    get(key) {
      const all = readAll();
      return all[key] || null;
    },
    set(key, value) {
      const all = readAll();
      all[key] = String(value || '');
      writeAll(all);
    },
    remove(key) {
      const all = readAll();
      delete all[key];
      writeAll(all);
    },
  };
}

function registerBackupV2Ipc({
  handle,
  V,
  getUserDataPath,
  appVersion,
  app,
  closeDatabase,
  reopenDatabase,
  applySecurityMaterial,
  rollbackSecurityMaterial,
  getCurrentSecurityMaterial,
  getLiveIdentity,
}) {
  if (!isBackupV2Enabled()) return { enabled: false, scheduler: null };

  let scheduler = null;
  try {
    const recovered = backupV2.recoverInterruptedRestore?.(getUserDataPath(), {
      restoreRoots: backupV2.RESTORE_ROOTS,
    });
    if (recovered?.action === 'rolled_back') {
      console.warn('[backup-v2] recovered interrupted restore via rollback', recovered);
    }
  } catch (e) {
    console.warn('[backup-v2] recoverInterruptedRestore failed', e?.message || e);
  }

  function resolveIdentity(opts = {}) {
    const fromLive = typeof getLiveIdentity === 'function' ? (getLiveIdentity() || {}) : {};
    return asIdentity({ ...fromLive, ...opts });
  }

  function databasePath() {
    return path.join(getUserDataPath(), 'database', 'tadawi.db');
  }

  function configureRestoreCoordinator() {
    backupRestoreCoordinator.configure({
      getUserDataPath,
      downloadCloudBackup: (remotePath, provider) => backupMain.downloadCloudBackup(remotePath, provider || 'google'),
      downloadCloudBackupByFileId: (fileId, options) => backupMain.downloadCloudBackupByFileId(fileId, 'google', options),
      verifyFileIdMetadata: (fileId, options) => cloudDiscovery.verifyFileIdMetadata(fileId, options),
      runLocalRestore: (filePath, opts) => runRestore(filePath, opts),
      rollbackLocalRestore: ({ userDataDir, rollbackPath }) =>
        backupV2.rollbackCommittedRestore(userDataDir || getUserDataPath(), rollbackPath),
      reopenDatabase,
      countDatabaseRows: (dbPath) => backupV2.countDatabaseRows(dbPath),
      inspectBackupBuffer: (buf, password, opts) => backupV2.inspectBackupBuffer(buf, password, opts),
      verifyBackupFile: (filePath, password, opts) => backupV2.verifyBackupFile(filePath, password, opts),
      scopeFromManifest: (manifest) => backupV2ScopeTruth.extractScopeSummaryFromManifest(manifest),
      issueBootstrapAuthorization: async (request) => {
        const capReq = {
          bootFlow: true,
          centerId: request.centerId,
          organizationId: request.organizationId,
          branchId: request.branchId,
          remotePath: request.remotePath,
          googleFileId: request.googleFileId,
          backupId: request.backupId,
          expectedSize: request.expectedSize,
          expectedModifiedAt: request.expectedModifiedAt,
          licensedBranchIds: request.licensedBranchIds,
          licenseSnapshot: request.licenseSnapshot,
          diagnosticId: request.diagnosticId,
        };
        return bootstrapRestoreCap.issueRestoreCapability(
          { sender: { id: request.webContentsId ?? -1 } },
          capReq
        );
      },
      consumeBootstrapCapability: (id) => bootstrapRestoreCap.consumeCapability(id),
      assertBootstrapManifestScope: (cap, manifest, scope) => bootstrapRestoreCap.assertManifestScope(cap, manifest, scope),
      getCapability: (id) => bootstrapRestoreCap.getCapability(id),
      isBackupBufferEncrypted: (buf) => backupV2.isEncryptedBackupBuffer(buf),
      friendlyError: (err) => backupV2.friendlyBackupError(err),
    });
  }

  configureRestoreCoordinator();

  const pendingRehydrates = new Map();
  const REHYDRATE_TIMEOUT_MS = 120000;

  async function rehydrateRuntime(opts = {}) {
    const diagnosticId = String(opts.diagnosticId || '').trim();
    const wcId = Number(opts.webContentsId);
    if (!diagnosticId || !Number.isFinite(wcId) || wcId < 0) {
      return { ok: true, skipped: true, reason: 'no_renderer' };
    }
    const wc = webContents.fromId(wcId);
    if (!wc || wc.isDestroyed?.()) {
      return { ok: false, error: 'restore_rehydrate_renderer_unavailable' };
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pendingRehydrates.delete(diagnosticId);
        resolve({ ok: false, error: 'restore_rehydrate_timeout' });
      }, Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : REHYDRATE_TIMEOUT_MS);

      pendingRehydrates.set(diagnosticId, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result || { ok: false, error: 'restore_rehydrate_empty_result' });
        },
      });

      try {
        wc.send('backup:restoreRehydrateRequest', {
          diagnosticId,
          rowCounts: opts.rowCounts || null,
          manifest: opts.manifest || null,
          scopeTruth: opts.scopeTruth || null,
          source: opts.source || 'backup_v2_restore_rehydrate',
        });
      } catch (err) {
        clearTimeout(timeout);
        pendingRehydrates.delete(diagnosticId);
        resolve({ ok: false, error: String(err?.message || err || 'restore_rehydrate_send_failed') });
      }
    });
  }

  handle('backup:restoreRehydrateResult', async (_event, payload) => {
    const diagnosticId = String(payload?.diagnosticId || '').trim();
    const pending = diagnosticId ? pendingRehydrates.get(diagnosticId) : null;
    if (pending) {
      pendingRehydrates.delete(diagnosticId);
      pending.resolve(payload);
    }
    return { ok: true, received: !!pending };
  });

  backupRestoreCoordinator.configure({
    rehydrateRuntime,
    rollbackLocalRestore: ({ userDataDir, rollbackPath }) =>
      backupV2.rollbackCommittedRestore(userDataDir || getUserDataPath(), rollbackPath),
    runLocalRestore: async (filePath, opts) => {
      try {
        return await runRestore(filePath, opts);
      } catch (error) {
        return {
          ok: false,
          error: error.code || error.message || 'restore_failed',
          message: error.message || error.code || 'restore_failed',
          rolledBack: error.rollbackError == null,
          progress: error.progress,
        };
      }
    },
  });

  function buildScopeContext(opts = {}, identity = {}) {
    return {
      centerId: identity.centerId,
      organizationId: identity.organizationId,
      branchId: identity.branchId,
      deviceId: identity.deviceId,
      sourceDeviceId: opts.sourceDeviceId || identity.deviceId,
      appVersion: appVersion || '2.0.0',
      licensedBranchIds: Array.isArray(opts.licensedBranchIds) ? opts.licensedBranchIds : [],
      localBranchIds: Array.isArray(opts.localBranchIds) ? opts.localBranchIds : [],
      branchNames: opts.branchNames && typeof opts.branchNames === 'object' ? opts.branchNames : {},
      branchIds: identity.authorizedBranchIds,
    };
  }

  function resolveScopeForCreate(opts = {}, identity = {}) {
    const userDataDir = getUserDataPath();
    const dbPath = databasePath();
    const scopeCtx = buildScopeContext(opts, identity);
    const signals = backupV2ScopeTruth.collectDatabaseSignals(dbPath, userDataDir, scopeCtx);
    const requestedScope = String(opts.scopeType || SCOPE_BRANCH_DEFAULT).toLowerCase();
    try {
      const scopeTruth = backupV2ScopeTruth.resolveBackupScope(requestedScope, signals, scopeCtx);
      return { scopeTruth, signals, requestedScope: scopeTruth.scopeType };
    } catch (error) {
      const friendly = backupV2.friendlyBackupError(error);
      const err = new Error(friendly.message);
      err.code = friendly.code;
      err.details = error.details || null;
      throw err;
    }
  }

  const SCOPE_BRANCH_DEFAULT = 'branch';

  function defaultBackupDir() {
    return path.join(getUserDataPath(), 'Backups', 'V2');
  }

  function resolveManagedLocalBackup(filePath) {
    const root = path.resolve(defaultBackupDir());
    const candidate = path.resolve(String(filePath || ''));
    if (!candidate.startsWith(root + path.sep) || !/\.tdw$/i.test(candidate)) {
      const err = new Error('backup_local_path_denied');
      err.code = 'backup_local_path_denied';
      throw err;
    }
    const stat = fs.lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      const err = new Error('backup_local_file_invalid');
      err.code = 'backup_local_file_invalid';
      throw err;
    }
    const realRoot = fs.realpathSync(root);
    const realFile = fs.realpathSync(candidate);
    if (!realFile.startsWith(realRoot + path.sep)) {
      const err = new Error('backup_local_path_denied');
      err.code = 'backup_local_path_denied';
      throw err;
    }
    return realFile;
  }

  function stageSelectedLocalBackup(filePath) {
    const requested = path.resolve(String(filePath || ''));
    if (!/\.tdw$/i.test(requested)) {
      const err = new Error('backup_local_file_invalid');
      err.code = 'backup_local_file_invalid';
      throw err;
    }
    const stat = fs.lstatSync(requested);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      const err = new Error('backup_local_file_invalid');
      err.code = 'backup_local_file_invalid';
      throw err;
    }
    const importsDir = path.join(defaultBackupDir(), 'imports');
    fs.mkdirSync(importsDir, { recursive: true });
    const safeName = path.basename(requested).replace(/[^a-zA-Z0-9._-]+/g, '_');
    const destination = path.join(importsDir, `${Date.now()}-${safeName}`);
    fs.copyFileSync(requested, destination, fs.constants.COPYFILE_EXCL);
    return resolveManagedLocalBackup(destination);
  }

  function resolveManagedBackupDirectory(dir) {
    const root = path.resolve(defaultBackupDir());
    const requested = path.resolve(String(dir || root));
    if (requested !== root) {
      const err = new Error('backup_local_directory_denied');
      err.code = 'backup_local_directory_denied';
      throw err;
    }
    fs.mkdirSync(root, { recursive: true });
    return root;
  }

  function cloudRetentionCount(opts = {}) {
    const n = Number(opts.cloudRetentionCount ?? opts.retentionCount);
    return Number.isFinite(n) && n > 0
      ? Math.min(100, Math.max(1, n))
      : backupV2Cloud.DEFAULT_CLOUD_RETENTION;
  }

  async function pruneCloudAfterUpload(uploadResult, opts = {}) {
    const keepPath = uploadResult?.remotePath || uploadResult?.path || null;
    return backupV2Cloud.pruneCloudV2Backups(
      (provider, prefix) => backupMain.listCloudBackups(provider, prefix),
      (remotePath, provider) => backupMain.deleteCloudBackup(remotePath, provider),
      cloudRetentionCount(opts),
      keepPath
    );
  }

  async function stageCloudBackupsForRestore(maxCandidates = 5) {
    const listed = await backupV2Cloud.listCloudV2Backups(
      (provider, prefix) => backupMain.listCloudBackups(provider, prefix)
    );
    if (!listed.ok || !listed.items.length) return [];
    const stageDir = path.join(getUserDataPath(), 'Backups', 'V2', 'cloud-staging');
    fs.mkdirSync(stageDir, { recursive: true });
    const staged = [];
    for (const item of listed.items.slice(0, Math.max(1, maxCandidates))) {
      const remotePath = item.path || item.remotePath;
      if (!remotePath) continue;
      const dl = await backupMain.downloadCloudBackup(remotePath, 'google');
      if (!dl?.ok) continue;
      const buf = dl.buffer || Buffer.from(String(dl.text || ''), 'utf8');
      if (!buf?.length) continue;
      const safeName = path.basename(remotePath).replace(/[^\w.\-]+/g, '_');
      const destPath = path.join(stageDir, safeName);
      fs.writeFileSync(destPath, buf);
      staged.push({
        ...item,
        filePath: destPath,
        createdAt: item.modifiedAt || item.createdAt,
        source: 'cloud',
      });
    }
    return staged;
  }

  async function collectRestoreCandidates(opts = {}) {
    const localDir = opts.dir
      ? V.asString(opts.dir, { name: 'dir', required: true, allowEmpty: false })
      : defaultBackupDir();
    const local = backupV2.listLocalBackupFiles(localDir).map((f) => ({ ...f, source: 'local' }));
    const explicit = Array.isArray(opts.cloudCandidates) ? opts.cloudCandidates : [];
    if (explicit.length) return [...local, ...explicit];
    if (opts.includeCloud === false) return local;
    const staged = await stageCloudBackupsForRestore(Number(opts.cloudCandidateLimit) || 5);
    return [...local, ...staged];
  }

  function optionalBackupPassword(opts) {
    if (opts.password == null || opts.password === '') return null;
    const password = V.asString(opts.password, { name: 'password', required: false, allowEmpty: true, max: 256 });
    if (password && password.length < 8) {
      const err = new Error('password_too_short');
      err.code = 'password_too_short';
      throw err;
    }
    return password || null;
  }

  async function runRestore(filePath, opts = {}) {
    const identity = resolveIdentity(opts);
    const progress = [];
    const buf = fs.readFileSync(filePath);
    if (backupV2.isEncryptedBackupBuffer(buf)) {
      const friendly = backupV2.friendlyBackupError({ code: 'backup_legacy_encrypted_direct_restore_blocked' });
      const err = new Error(friendly.message);
      err.code = friendly.code;
      throw err;
    }
    const licensedBranchIds = Array.isArray(opts.licensedBranchIds)
      ? opts.licensedBranchIds.map((v) => String(v).slice(0, 128)).filter(Boolean)
      : [];
    try {
      const result = await backupV2.restoreBackupFile({
        filePath,
        userDataDir: opts.targetUserDataDir || getUserDataPath(),
        expectedIdentity: identity,
        licensedBranchIds,
        skipScopeTruth: opts.skipScopeTruth === true,
        requireScopeTruth: opts.requireScopeTruth === true,
        allowLegacyBranchless: opts.allowLegacyBranchless !== false,
        closeDatabase: closeDatabase || undefined,
        reopenDatabase: reopenDatabase || undefined,
        applySecurityMaterial: applySecurityMaterial || undefined,
        rollbackSecurityMaterial: rollbackSecurityMaterial || undefined,
        currentSecurityMaterial: typeof getCurrentSecurityMaterial === 'function'
          ? getCurrentSecurityMaterial()
          : undefined,
        onProgress: (evt) => progress.push(evt),
        unrestorableReport: Array.isArray(opts.unrestorableReport) ? opts.unrestorableReport : [],
      });
      result.progress = progress;
      if (result.ok && result.needRestart && opts.relaunch !== false && app) {
        setTimeout(() => {
          try {
            app.relaunch();
            app.exit(0);
          } catch { /* ignore */ }
        }, 250);
      }
      return result;
    } catch (error) {
      const friendly = backupV2.friendlyBackupError(error);
      const err = new Error(friendly.message);
      err.code = friendly.code;
      err.progress = progress;
      throw err;
    }
  }

  handle('backup:v2:health', async () => {
    const databasePath = path.join(getUserDataPath(), 'database', 'tadawi.db');
    const gate = backupV2.readRestoreGate(getUserDataPath());
    // Reporting channel: a failing database must be described, never thrown at the UI.
    let health;
    try {
      health = backupV2.databaseHealth(databasePath, { mode: 'strict' });
    } catch (error) {
      const friendly = backupV2.friendlyBackupError(error);
      health = { ok: false, error: friendly.code, message: friendly.message, reasons: error.reasons || [] };
    }
    return { ...health, gate, rowCounts: backupV2.countDatabaseRows(databasePath) };
  });

  handle('backup:v2:readiness', async (_e, options) => {
    const opts = V.asObject(options || {}, { name: 'options' });
    const identity = resolveIdentity(opts);
    const userDataDir = getUserDataPath();
    const dbPath = databasePath();
    const scopeCtx = buildScopeContext(opts, identity);
    return backupV2ScopeTruth.assessBackupReadiness(userDataDir, dbPath, scopeCtx);
  });

  handle('backup:v2:create', async (_e, options) => {
    const opts = V.asObject(options, { name: 'options' });
    const identity = resolveIdentity(opts);
    const { scopeTruth, requestedScope } = resolveScopeForCreate(opts, identity);
    const userDataDir = getUserDataPath();
    const outDir = opts.outputDir
      ? V.asString(opts.outputDir, { name: 'outputDir', required: true, allowEmpty: false })
      : defaultBackupDir();
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(outDir, `Tadawi-Backup-V2-${stamp}.tdw`);
    const createOpts = {
      userDataDir,
      outputPath: filePath,
      appVersion: appVersion || '2.0.0',
      backupType: opts.backupType || 'manual',
      centerId: identity.centerId,
      organizationId: identity.organizationId,
      branchId: identity.branchId,
      branchIds: scopeTruth.includedBranchIds,
      includedBranchIds: scopeTruth.includedBranchIds,
      deviceId: identity.deviceId,
      centerName: identity.centerName,
      deviceName: identity.deviceName,
      scopeType: requestedScope,
      scopeTruth,
      retentionCount: Number(opts.retentionCount) || 20,
      cloudRetentionCount: cloudRetentionCount(opts),
    };

    const uploadRequested = opts.cloud === true || opts.upload === true;
    if (!uploadRequested) {
      const created = await backupV2.createBackupFile(createOpts);
      const pruned = backupV2.pruneLocalBackups(outDir, createOpts.retentionCount, { keepPath: created.path });
      return { ...created, localOk: true, cloudOk: false, cloudSkipped: true, pruned: pruned.pruned };
    }

    return backupV2.createBackupWithUpload({
      ...createOpts,
      upload: async ({ path: localPath, buffer, filename, hash, manifest }) => {
        const stageDir = path.join(outDir, 'upload-staging');
        fs.mkdirSync(stageDir, { recursive: true });
        const staged = path.join(stageDir, filename);
        uploadWithResume(localPath, staged, { resume: true });
        const remotePath = `${backupV2Cloud.CLOUD_V2_PREFIX}/${filename}`;
        const uploaded = await backupMain.uploadCloud(buffer, filename, 'google', {
          remotePath,
          overwrite: false,
          sha256: hash,
          manifest,
        });
        if (!uploaded?.ok) {
          const err = new Error(uploaded?.message || 'cloud_upload_failed');
          err.code = uploaded?.needsReauth ? 'needs_reauth' : 'cloud_upload_failed';
          if (/quota|storageExceeded/i.test(String(uploaded?.message || ''))) err.code = 'quota_exceeded';
          throw err;
        }
        try { fs.unlinkSync(staged); } catch { /* ignore */ }
        try { fs.unlinkSync(`${staged}.partial`); } catch { /* ignore */ }
        return {
          ok: true,
          remotePath: uploaded.path || remotePath,
          id: uploaded.id || null,
          expectedHash: hash,
          remoteHash: uploaded.md5 || uploaded.sha256 || hash,
          filename,
        };
      },
      pruneAfterUpload: async (upload) => {
        const localPruned = backupV2.pruneLocalBackups(outDir, createOpts.retentionCount, { keepPath: filePath }).pruned;
        const cloudPruned = await pruneCloudAfterUpload(upload, createOpts);
        return Number(localPruned || 0) + Number(cloudPruned?.pruned || 0);
      },
    });
  });

  handle('backup:v2:prune', async (_e, options) => {
    const opts = V.asObject(options || {}, { name: 'options' });
    const dir = resolveManagedBackupDirectory(opts.dir || defaultBackupDir());
    const retention = Number(opts.retentionCount) || 20;
    return backupV2.pruneLocalBackups(dir, retention);
  });

  handle('backup:v2:formatPolicy', async () => backupV2.backupFormatPolicy());

  handle('backup:v2:verify', async (_e, options) => {
    const opts = V.asObject(options, { name: 'options', required: true });
    const requestedPath = V.asString(opts.filePath, { name: 'filePath', required: true, allowEmpty: false });
    const filePath = resolveManagedLocalBackup(requestedPath);
    const password = optionalBackupPassword(opts);
    return backupV2.verifyBackupFile(filePath, password, opts);
  });

  handle('backup:v2:inspect', async (_e, options) => {
    const opts = V.asObject(options, { name: 'options', required: true });
    const requestedPath = V.asString(opts.filePath, { name: 'filePath', required: true, allowEmpty: false });
    const filePath = resolveManagedLocalBackup(requestedPath);
    const password = optionalBackupPassword(opts);
    const buf = fs.readFileSync(filePath);
    const inspected = backupV2.inspectBackupBuffer(buf, password, opts);
    return {
      ok: true,
      manifest: inspected.manifest,
      scope: backupV2ScopeTruth.extractScopeSummaryFromManifest(inspected.manifest),
      database: inspected.database,
      encrypted: inspected.encrypted,
      packageSha256: inspected.packageSha256,
      encryptedSha256: inspected.encryptedSha256,
      encryptedSize: inspected.encryptedSize,
      size: inspected.size,
    };
  });

  handle('backup:v2:restore', async (_e, options) => {
    const opts = V.asObject(options, { name: 'options', required: true });
    const requestedPath = V.asString(opts.filePath, { name: 'filePath', required: true, allowEmpty: false });
    const filePath = resolveManagedLocalBackup(requestedPath);
    return runRestore(filePath, { ...opts, filePath });
  });

  handle('backup:v2:listLocal', async (_e, options) => {
    const opts = V.asObject(options || {}, { name: 'options' });
    const requestedDir = opts.dir
      ? V.asString(opts.dir, { name: 'dir', required: true, allowEmpty: false })
      : defaultBackupDir();
    const dir = resolveManagedBackupDirectory(requestedDir);
    return { ok: true, dir, files: backupV2.listLocalBackupFiles(dir) };
  });

  handle('backup:v2:deleteLocal', async (_e, options) => {
    const opts = V.asObject(options || {}, { name: 'options', required: true });
    const requestedPath = V.asString(opts.filePath, { name: 'filePath', required: true, allowEmpty: false });
    if (!fs.existsSync(requestedPath)) return { ok: false, error: 'not_found' };
    const filePath = resolveManagedLocalBackup(requestedPath);
    fs.unlinkSync(filePath);
    return { ok: true, filePath: path.basename(filePath) };
  });

  handle('backup:v2:listCloud', async (_e, options) => {
    const opts = V.asObject(options || {}, { name: 'options' });
    const prefix = opts.prefix
      ? V.asString(opts.prefix, { name: 'prefix', required: true, allowEmpty: false })
      : backupV2Cloud.CLOUD_V2_PREFIX;
    return backupV2Cloud.listCloudV2Backups(
      (provider, p) => backupMain.listCloudBackups(provider, p || prefix),
      prefix
    );
  });

  handle('backup:v2:pruneCloud', async (_e, options) => {
    const opts = V.asObject(options || {}, { name: 'options' });
    return pruneCloudAfterUpload(
      { remotePath: opts.keepRemotePath || opts.remotePath || null },
      opts
    );
  });

  handle('backup:v2:pickLatest', async (_e, options) => {
    const opts = V.asObject(options, { name: 'options', required: true });
    const identity = resolveIdentity(opts);
    const candidates = await collectRestoreCandidates(opts);
    const picked = backupV2.pickLatestAuthorizedBackup(
      candidates,
      null,
      identity,
      opts
    );
    if (!picked.ok) {
      const err = new Error('no_authorized_backup');
      err.code = 'no_authorized_backup';
      err.details = picked;
      throw err;
    }
    return picked;
  });

  handle('backup:v2:restoreLatest', async (_e, options) => {
    const opts = V.asObject(options, { name: 'options', required: true });
    const identity = resolveIdentity(opts);
    const candidates = await collectRestoreCandidates(opts);
    const picked = backupV2.pickLatestAuthorizedBackup(candidates, null, identity, opts);
    if (!picked.ok || !picked.selected?.filePath) {
      const err = new Error('no_authorized_backup');
      err.code = 'no_authorized_backup';
      throw err;
    }
    return runRestore(picked.selected.filePath, { ...opts, selected: picked.selected });
  });

  handle('backup:v2:pickFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'اختر نسخة Backup V2',
      filters: [{ name: 'Tadawi Backup V2', extensions: ['tdw'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths?.length) return { ok: false, canceled: true };
    const filePath = stageSelectedLocalBackup(result.filePaths[0]);
    return { ok: true, filePath, staged: true };
  });

  handle('backup:v2:importLegacy', async (_e, options) => {
    const legacyImport = require('./backup-v2-legacy-import');
    const opts = V.asObject(options, { name: 'options', required: true });
    const requestedPath = V.asString(opts.filePath, { name: 'filePath', required: true, allowEmpty: false });
    const filePath = resolveManagedLocalBackup(requestedPath);
    const password = V.asString(opts.password, { name: 'password', required: true, allowEmpty: false, max: 256 });
    if (password.length < 8) {
      const err = new Error('password_too_short');
      err.code = 'password_too_short';
      throw err;
    }
    return legacyImport.importLegacyEncryptedBackup({
      ...opts,
      filePath,
      password,
      userDataDir: getUserDataPath(),
    });
  });

  handle('backup:v2:gate', async () => backupV2.readRestoreGate(getUserDataPath()));

  handle('backup:v2:stageRemote', async (_e, options) => {
    const opts = V.asObject(options, { name: 'options', required: true });
    const remotePath = opts.remotePath
      ? V.asString(opts.remotePath, { name: 'remotePath', required: false, allowEmpty: false })
      : null;
    const googleFileId = opts.googleFileId
      ? V.asString(opts.googleFileId, { name: 'googleFileId', required: false, allowEmpty: false })
      : null;
    const sourcePath = opts.sourcePath
      ? V.asString(opts.sourcePath, { name: 'sourcePath', required: false, allowEmpty: false })
      : null;

    if (remotePath || googleFileId) {
      const outDir = backupRestoreCoordinator.downloadedDir(getUserDataPath());
      fs.mkdirSync(outDir, { recursive: true });
      const progress = [];
      let dl;
      if (googleFileId) {
        dl = await backupMain.downloadCloudBackupByFileId(googleFileId, 'google', {
          remotePath: remotePath || undefined,
          expectedSize: opts.expectedSize,
          onProgress: (evt) => progress.push(evt),
        });
      } else {
        dl = await backupMain.downloadCloudBackup(remotePath, 'google');
      }
      const buf = dl?.buffer || (dl?.text ? Buffer.from(String(dl.text), 'utf8') : null);
      if (!buf?.length) return { ok: false, error: dl?.error || 'download_failed', detail: dl?.message || null, progress };
      const safeName = path.basename(remotePath || dl.file?.name || `cloud-${googleFileId || Date.now()}.tdw`).replace(/[^\w.\-]+/g, '_');
      const destPath = path.join(outDir, safeName);
      fs.writeFileSync(destPath, buf);
      if (opts.verify !== false) {
        try { backupV2.verifyBackupFile(destPath, null, opts); } catch (err) {
          return { ok: false, error: err.code || 'verify_failed', message: err.message, progress };
        }
      }
      return { ok: true, filePath: destPath, path: destPath, localPath: destPath, downloadBytes: buf.length, progress };
    }

    if (!sourcePath) {
      V.fail('IPC_REQUIRED', 'sourcePath_or_remotePath_required');
    }

    const password = optionalBackupPassword(opts);
    const managedSourcePath = resolveManagedLocalBackup(sourcePath);
    const stageDir = path.join(getUserDataPath(), 'Backups', 'V2', 'staging');
    fs.mkdirSync(stageDir, { recursive: true });
    const destPath = path.join(stageDir, path.basename(managedSourcePath).replace(/[^\w.\-]+/g, '_'));
    const progress = [];
    const staged = copyWithResume(managedSourcePath, destPath, {
      resume: opts.resume !== false,
      failAfterBytes: opts.failAfterBytes,
      onProgress: (evt) => progress.push(evt),
    });
    if (password) {
      backupV2.verifyBackupFile(staged.path, password, opts);
    }
    return { ...staged, progress };
  });

  handle('backup:v2:downloadCloud', async (_e, options) => {
    const opts = V.asObject(options, { name: 'options', required: true });
    const remotePath = opts.remotePath
      ? V.asString(opts.remotePath, { name: 'remotePath', required: false, allowEmpty: false })
      : null;
    const googleFileId = opts.googleFileId
      ? V.asString(opts.googleFileId, { name: 'googleFileId', required: false, allowEmpty: false })
      : null;
    if (!remotePath && !googleFileId) V.fail('IPC_REQUIRED', 'remotePath_or_googleFileId_required');

    const outDir = backupRestoreCoordinator.downloadedDir(getUserDataPath());
    fs.mkdirSync(outDir, { recursive: true });
    const progress = [];
    let dl;
    if (googleFileId) {
      dl = await backupMain.downloadCloudBackupByFileId(googleFileId, 'google', {
        remotePath: remotePath || undefined,
        expectedSize: opts.expectedSize,
        onProgress: (evt) => progress.push(evt),
      });
    } else {
      dl = await backupMain.downloadCloudBackup(remotePath, 'google');
    }
    const buf = dl?.buffer || (dl?.text ? Buffer.from(String(dl.text), 'utf8') : null);
    if (!buf?.length) return { ok: false, error: dl?.error || 'download_failed', detail: dl?.message || null, progress };
    const safeName = path.basename(remotePath || dl.file?.name || `cloud-${googleFileId || Date.now()}.tdw`).replace(/[^\w.\-]+/g, '_');
    const filePath = path.join(outDir, safeName);
    fs.writeFileSync(filePath, buf);
    if (opts.verify !== false) {
      backupV2.verifyBackupFile(filePath, null, opts);
    }
    return {
      ok: true,
      filePath,
      path: filePath,
      localPath: filePath,
      remotePath,
      googleFileId,
      downloadBytes: buf.length,
      progress,
    };
  });

  async function invokeRestoreUnified(event, options) {
    const opts = V.asObject(options, { name: 'options', required: true });
    const source = opts.source === 'local' ? 'local' : 'cloud';
    const context = opts.bootstrapRestoreCapabilityId
      ? 'bootstrap'
      : (opts.context === 'bootstrap' ? 'bootstrap' : 'authenticated');
    const progressSender = event?.sender;
    const onProgress = (snap) => {
      if (progressSender && !progressSender.isDestroyed?.()) {
        try { progressSender.send('backup:restoreProgress', snap); } catch { /* observer */ }
      }
    };
    const identity = resolveIdentity(opts);
    const requestedLocalPath = opts.localPath || opts.filePath || null;
    const localPath = source === 'local' ? resolveManagedLocalBackup(requestedLocalPath) : null;
    return backupRestoreCoordinator.restore({
      ...opts,
      source,
      context,
      localPath,
      onProgress,
      webContentsId: event?.sender?.id,
      identity,
      licensedBranchIds: Array.isArray(opts.licensedBranchIds) ? opts.licensedBranchIds : [],
      centerId: opts.centerId || identity.centerId,
      organizationId: opts.organizationId || identity.organizationId,
      branchId: opts.branchId || identity.branchId,
    });
  }

  handle('backup:v2:restoreUnified', async (event, options) => invokeRestoreUnified(event, options));

  handle('backup:v2:downloadAndRestore', async (_e, options) => {
    const opts = V.asObject(options, { name: 'options', required: true });
    const sourcePath = V.asString(opts.sourcePath, { name: 'sourcePath', required: true, allowEmpty: false });
    const managedSourcePath = resolveManagedLocalBackup(sourcePath);
    const stageDir = path.join(getUserDataPath(), 'Backups', 'V2', 'staging');
    fs.mkdirSync(stageDir, { recursive: true });
    const destPath = path.join(stageDir, path.basename(managedSourcePath).replace(/[^\w.\-]+/g, '_'));
    const progress = [];
    const staged = copyWithResume(managedSourcePath, destPath, {
      resume: opts.resume !== false,
      onProgress: (evt) => progress.push(evt),
    });
    const restored = await runRestore(staged.path, opts);
    return { ...restored, staged, downloadProgress: progress };
  });

  handle('backup:v2:restoreFromCloudRemote', async (event, options) => {
    const opts = V.asObject(options, { name: 'options', required: true });
    const remotePath = V.asString(opts.remotePath, { name: 'remotePath', required: false, allowEmpty: false });
    const googleFileId = opts.googleFileId
      ? V.asString(opts.googleFileId, { name: 'googleFileId', required: false, allowEmpty: false })
      : null;
    if (!remotePath && !googleFileId) V.fail('IPC_REQUIRED', 'remotePath_or_googleFileId_required');

    const context = opts.bootstrapRestoreCapabilityId
      ? 'bootstrap'
      : (opts.context === 'bootstrap' ? 'bootstrap' : 'authenticated');
    const result = await invokeRestoreUnified(event, {
      ...opts,
      source: 'cloud',
      remotePath,
      googleFileId,
    });

    if (!result.ok) return result;

    const inspected = result.restore?.manifest
      ? { manifest: result.restore.manifest }
      : (result.filePath ? backupV2.inspectBackupBuffer(fs.readFileSync(result.filePath), null, opts) : {});

    return {
      ok: result.ok,
      filePath: result.filePath,
      remotePath,
      googleFileId,
      downloadBytes: result.download?.downloadBytes || null,
      manifest: inspected.manifest || result.restore?.manifest || null,
      scopeTruth: result.restore?.manifest?.scopeTruth
        || backupV2ScopeTruth.extractScopeSummaryFromManifest(inspected.manifest),
      recordCounts: result.rowCounts || result.restore?.rowCounts || null,
      restore: result.restore,
      countVerify: result.countVerify,
      restoreVerified: result.restoreVerified,
      diagnosticId: result.diagnosticId,
      bootstrapRestore: context === 'bootstrap',
      progressStages: result.stages,
    };
  });

  handle('backup:v2:scheduleStatus', async () => {
    if (!scheduler) return { ok: false, enabled: false, error: 'scheduler_not_started' };
    return { ok: true, ...scheduler.status() };
  });

  handle('backup:v2:scheduleConfigure', async (_e, options) => {
    if (!scheduler) {
      const err = new Error('scheduler_not_started');
      err.code = 'scheduler_not_started';
      throw err;
    }
    const opts = V.asObject(options || {}, { name: 'options' });
    return { ok: true, ...scheduler.configure(opts) };
  });

  // Start scheduler (idempotent)
  try {
    const userDataDir = getUserDataPath();
    const vault = createFileCredentialVault(userDataDir);
    scheduler = new BackupV2Scheduler({
      userDataDir,
      credentialVault: vault,
      runBackup: async (meta = {}) => {
        const identity = resolveIdentity(meta);
        const { scopeTruth, requestedScope } = resolveScopeForCreate(
          { ...meta, scopeType: meta.scopeType || SCOPE_BRANCH_DEFAULT },
          identity
        );
        const outDir = resolveManagedBackupDirectory(
          meta.localPath && String(meta.localPath).trim() ? String(meta.localPath).trim() : defaultBackupDir()
        );
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(outDir, `Tadawi-Backup-V2-scheduled-${stamp}.tdw`);
        const retentionCount = Number(meta.retentionCount) || 20;
        const cloudRetention = cloudRetentionCount(meta);
        const createOpts = {
          userDataDir,
          outputPath: filePath,
          appVersion: appVersion || '2.0.0',
          backupType: 'scheduled',
          centerId: identity.centerId,
          organizationId: identity.organizationId,
          branchId: identity.branchId,
          branchIds: scopeTruth.includedBranchIds,
          includedBranchIds: scopeTruth.includedBranchIds,
          deviceId: identity.deviceId,
          centerName: identity.centerName || meta.centerName,
          deviceName: identity.deviceName || meta.deviceName,
          scopeType: requestedScope,
          scopeTruth,
          retentionCount,
          cloudRetentionCount: cloudRetention,
        };
        if (meta.cloudEnabled === true) {
          return backupV2.createBackupWithUpload({
            ...createOpts,
            upload: async ({ buffer, filename, hash, manifest }) => {
              const remotePath = `${backupV2Cloud.CLOUD_V2_PREFIX}/${filename}`;
              const uploaded = await backupMain.uploadCloud(buffer, filename, 'google', {
                remotePath,
                overwrite: false,
                sha256: hash,
                manifest,
              });
              if (!uploaded?.ok) {
                const err = new Error(uploaded?.message || 'cloud_upload_failed');
                err.code = /quota|storageExceeded/i.test(String(uploaded?.message || ''))
                  ? 'quota_exceeded'
                  : 'cloud_upload_failed';
                throw err;
              }
              return {
                ok: true,
                remotePath: uploaded.path || remotePath,
                id: uploaded.id || null,
                expectedHash: hash,
                remoteHash: uploaded.md5 || hash,
              };
            },
            pruneAfterUpload: async (upload) => {
              const localPruned = backupV2.pruneLocalBackups(outDir, retentionCount, { keepPath: filePath }).pruned;
              const cloudPruned = await pruneCloudAfterUpload(upload, createOpts);
              return Number(localPruned || 0) + Number(cloudPruned?.pruned || 0);
            },
          });
        }
        const created = await backupV2.createBackupFile(createOpts);
        const pruned = backupV2.pruneLocalBackups(outDir, retentionCount, { keepPath: created.path });
        return { ...created, localOk: true, cloudOk: false, cloudSkipped: true, pruned: pruned.pruned };
      },
    });
    scheduler.start();
  } catch (error) {
    console.error('[backup-v2] scheduler start failed:', error.message);
    scheduler = null;
  }

  return { enabled: true, scheduler };
}

module.exports = {
  isBackupV2Enabled,
  registerBackupV2Ipc,
  backupV2,
  backupV2ScopeTruth,
  asIdentity,
  createFileCredentialVault,
};
