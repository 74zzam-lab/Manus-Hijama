'use strict';

/**
 * Backup & Restore V2 core.
 *
 * The module deliberately has no Electron dependency so the complete backup,
 * verification, restore, migration and rollback pipeline can be exercised in
 * ordinary Node tests.
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const fflate = require('fflate');
const backupCrypto = require('./backup-crypto-v2');
const restoreValidation = require('./restore-v2-validation');
const { writeFileAtomicSync } = require('./atomic-file');
const { MIGRATIONS, runSchemaMigrations } = require('../database/hybrid-schema');

const BACKUP_VERSION = 2;
const BACKUP_FORMAT = 'tadawi-backup-v2';
const MANIFEST_PATH = 'backup-manifest.json';
const DATABASE_PATH = 'database/tadawi.db';
const SECURITY_PATH = 'security/field-key.json';
const RESTORE_ROOTS = Object.freeze(['database', 'attachments', 'settings', 'center-assets']);
const MAX_ARCHIVE_ENTRIES = 25000;
const MAX_UNCOMPRESSED_BYTES = 8 * 1024 * 1024 * 1024;
const DEFAULT_LOCAL_RETENTION = 5;
const CURRENT_SCHEMA_VERSION = Math.max(0, ...MIGRATIONS.map((migration) => Number(migration.version) || 0));

const EXCLUDED_SEGMENT = /^(?:cache|caches|temp|tmp|logs?|license-admin|admin-data)$/i;
const EXCLUDED_FILE = /(?:^|[-_.])(?:private[-_.]?key|credentials?|oauth|access[-_.]?token|refresh[-_.]?token|secret)(?:[-_.]|$)|\.(?:pem|p12|pfx|key)$/i;
const SENSITIVE_SETTING_KEY = /(?:password|passphrase|secret|token|privatekey|private_key|credential|licenseadmin|license_admin)/i;

function emitProgress(options, stage, details = {}) {
  try { options?.onProgress?.({ stage, at: new Date().toISOString(), ...details }); } catch { /* observer only */ }
}

function normalizeId(value) {
  return String(value || '').trim().slice(0, 128);
}

/**
 * Fail-closed identity gate before any live data mutation.
 * - If live binding is empty and backup source is empty → allow (pre-binding / lab).
 * - If live center/org is set and backup mismatches or omits source → reject.
 * - If live branch is set and backup branch/scope is not authorized → reject.
 */
function assertRestoreIdentityAllowed(manifest, expected = {}) {
  const source = (manifest && manifest.source) || {};
  const scope = (manifest && manifest.scope) || {};
  const expectedCenter = normalizeId(expected.centerId || expected.organizationId);
  const expectedOrg = normalizeId(expected.organizationId || expected.centerId);
  const expectedBranch = normalizeId(expected.branchId);
  const authorizedBranches = Array.isArray(expected.authorizedBranchIds)
    ? expected.authorizedBranchIds.map(normalizeId).filter(Boolean)
    : (expectedBranch ? [expectedBranch] : []);

  const backupCenter = normalizeId(source.centerId || source.organizationId);
  const backupOrg = normalizeId(source.organizationId || source.centerId);
  const backupBranch = normalizeId(source.branchId);
  const backupBranches = Array.isArray(scope.branchIds) && scope.branchIds.length
    ? scope.branchIds.map(normalizeId).filter(Boolean)
    : (backupBranch ? [backupBranch] : []);

  if (expected.allowMissingSourceMetadata === true) {
    return {
      ok: true,
      skipped: 'allow_missing_source_metadata',
      centerId: backupCenter || expectedCenter || expectedOrg,
      branchIds: backupBranches.length ? backupBranches : authorizedBranches,
    };
  }

  if (!expectedCenter && !expectedOrg && !expectedBranch && !authorizedBranches.length) {
    return { ok: true, skipped: 'no_live_binding' };
  }

  if (expectedCenter || expectedOrg) {
    if (!backupCenter && !backupOrg) {
      const err = new Error('restore_center_missing');
      err.code = 'restore_center_missing';
      throw err;
    }
    const live = expectedCenter || expectedOrg;
    const remote = backupCenter || backupOrg;
    if (live && remote && live !== remote) {
      const err = new Error('restore_center_mismatch');
      err.code = 'restore_center_mismatch';
      throw err;
    }
    if (expectedOrg && backupOrg && expectedOrg !== backupOrg) {
      const err = new Error('restore_center_mismatch');
      err.code = 'restore_center_mismatch';
      throw err;
    }
  }

  if (expectedBranch || authorizedBranches.length) {
    if (!backupBranches.length) {
      if (expected.allowLegacyBranchless === true) {
        return {
          ok: true,
          skipped: 'missing_backup_branch_metadata',
          centerId: backupCenter || expectedCenter || expectedOrg,
          branchIds: authorizedBranches,
        };
      }
      const err = new Error('restore_branch_missing');
      err.code = 'restore_branch_missing';
      throw err;
    }
    const allowed = new Set(authorizedBranches.length ? authorizedBranches : [expectedBranch]);
    const authorized = backupBranches.some((id) => allowed.has(id));
    if (!authorized) {
      const err = new Error('restore_branch_unauthorized');
      err.code = 'restore_branch_unauthorized';
      throw err;
    }
  }

  return {
    ok: true,
    centerId: backupCenter || expectedCenter,
    branchIds: backupBranches,
  };
}

/**
 * Operational restore is plaintext Backup V2 only.
 * Legacy encrypted envelopes must use migration/import staging — never direct production swap.
 */
function assertOperationalRestoreAllowed(inspected, options = {}) {
  if (!inspected?.encrypted) return { ok: true, plaintext: true };
  if (options.legacyMigrationImport === true) return { ok: true, legacy: true };
  const err = new Error('backup_legacy_encrypted_direct_restore_blocked');
  err.code = 'backup_legacy_encrypted_direct_restore_blocked';
  throw err;
}

function listLocalBackupFiles(backupDir, options = {}) {
  const dir = path.resolve(backupDir || '');
  if (!dir || !fs.existsSync(dir)) return [];
  const ext = options.includeJson ? /\.(tdw|json)$/i : /\.tdw$/i;
  return fs.readdirSync(dir)
    .filter((name) => ext.test(name))
    .map((name) => {
      const filePath = path.join(dir, name);
      let mtimeMs = 0;
      let size = 0;
      try {
        const st = fs.statSync(filePath);
        mtimeMs = st.mtimeMs;
        size = st.size;
      } catch { /* ignore */ }
      return { filePath, name, mtimeMs, size };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * Inspect candidates and pick the newest authorized backup.
 * Candidates: [{ filePath, createdAt? }] or plain path strings.
 */
function pickLatestAuthorizedBackup(candidates, password, expectedIdentity = {}, options = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const inspected = [];
  const rejected = [];
  for (const item of list) {
    const filePath = typeof item === 'string' ? item : item?.filePath;
    if (!filePath || !fs.existsSync(filePath)) {
      rejected.push({ filePath: filePath || null, reason: 'missing' });
      continue;
    }
    try {
      const buf = fs.readFileSync(filePath);
      const info = inspectBackupBuffer(buf, password, options);
      if (info.encrypted && options.legacyMigrationImport !== true) {
        rejected.push({ filePath, reason: 'backup_legacy_encrypted_direct_restore_blocked' });
        continue;
      }
      assertRestoreIdentityAllowed(info.manifest, expectedIdentity);
      const createdAt = String(info.manifest?.createdAt || item?.createdAt || '') || null;
      const createdMs = Date.parse(createdAt || '') || fs.statSync(filePath).mtimeMs;
      inspected.push({
        filePath,
        createdAt,
        createdMs,
        backupId: info.manifest?.backupId || null,
        source: info.manifest?.source || null,
        manifest: info.manifest || null,
        database: info.database,
      });
    } catch (error) {
      rejected.push({ filePath, reason: error.code || error.message });
    }
  }
  inspected.sort((a, b) => b.createdMs - a.createdMs);
  return {
    ok: inspected.length > 0,
    selected: inspected[0] || null,
    candidates: inspected,
    rejected,
  };
}

function saveRestoreDiagnosticCopy(filePath, userDataDir, reason) {
  const src = path.resolve(filePath || '');
  const root = path.resolve(userDataDir || '');
  if (!src || !root || !fs.existsSync(src)) return null;
  const outDir = path.join(root, 'diagnostics', 'restore-v2');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(outDir, `failed-${stamp}${path.extname(src) || '.tdw'}`);
  fs.copyFileSync(src, dest);
  writeFileAtomicSync(
    path.join(outDir, `failed-${stamp}.json`),
    `${JSON.stringify({ at: new Date().toISOString(), reason: String(reason || 'unknown').slice(0, 300), source: path.basename(src), diagnosticFile: path.basename(dest) }, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 }
  );
  return dest;
}

function writeRestoreGate(userDataDir, state) {
  const file = path.join(path.resolve(userDataDir), 'settings', 'restore-v2-gate.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomicSync(file, `${JSON.stringify({ version: 1, ...state, updatedAt: new Date().toISOString() }, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return file;
}

function readRestoreGate(userDataDir) {
  const file = path.join(path.resolve(userDataDir), 'settings', 'restore-v2-gate.json');
  if (!fs.existsSync(file)) return { pending: false, verified: true, missing: true };
  try {
    return { ...JSON.parse(fs.readFileSync(file, 'utf8')), missing: false };
  } catch {
    return { pending: true, verified: false, corrupt: true };
  }
}

function countDatabaseRows(databasePath) {
  const dbPath = path.resolve(databasePath);
  if (!fs.existsSync(dbPath)) return { ok: false, error: 'database_missing' };
  let db;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 5000 });
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all();
    const counts = {};
    for (const row of tables) {
      try {
        counts[row.name] = Number(db.prepare(`SELECT COUNT(*) AS c FROM "${String(row.name).replace(/"/g, '""')}"`).get()?.c || 0);
      } catch {
        counts[row.name] = null;
      }
    }
    const integrity = String(db.pragma('integrity_check', { simple: true }) || '');
    return { ok: integrity.toLowerCase() === 'ok', integrity, counts };
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

function hashTree(rootDir) {
  const root = path.resolve(rootDir || '');
  const out = [];
  if (!root || !fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const st = fs.statSync(current);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(current)) stack.push(path.join(current, name));
      continue;
    }
    const rel = path.relative(root, current).split(path.sep).join('/');
    const data = fs.readFileSync(current);
    out.push({ path: rel, size: data.length, sha256: backupCrypto.sha256Hex(data) });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function failpoint(options, name) {
  if (options?.failpoint !== name) return;
  if (name === 'disk_full') {
    const error = new Error('backup_disk_space_insufficient');
    error.code = 'ENOSPC';
    throw error;
  }
  throw new Error(`backup_failpoint_${name}`);
}

function safeRemove(target, expectedParent) {
  const resolved = path.resolve(target);
  const parent = path.resolve(expectedParent);
  if (resolved === parent || !resolved.startsWith(parent + path.sep)) throw new Error('unsafe_cleanup_target');
  if (fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true });
}

function normalizeArchivePath(value) {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new Error('backup_entry_path_invalid');
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('backup_entry_path_invalid');
  }
  return segments.join('/');
}

function shouldExclude(relativePath) {
  const normalized = normalizeArchivePath(relativePath);
  const segments = normalized.split('/');
  return segments.some((segment) => EXCLUDED_SEGMENT.test(segment)) || EXCLUDED_FILE.test(segments.at(-1));
}

function sanitizeSettingsValue(value, seen = new WeakSet()) {
  if (Array.isArray(value)) return value.map((item) => sanitizeSettingsValue(item, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return null;
  seen.add(value);
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_SETTING_KEY.test(key)) continue;
    output[key] = sanitizeSettingsValue(item, seen);
  }
  seen.delete(value);
  return output;
}

function readBackupFile(filePath, archivePath) {
  const buffer = fs.readFileSync(filePath);
  if (!archivePath.startsWith('settings/') || path.extname(filePath).toLowerCase() !== '.json') return buffer;
  try {
    const parsed = JSON.parse(buffer.toString('utf8'));
    return Buffer.from(`${JSON.stringify(sanitizeSettingsValue(parsed), null, 2)}\n`, 'utf8');
  } catch {
    return buffer;
  }
}

function collectDirectory(sourceRoot, archiveRoot, entries) {
  if (!fs.existsSync(sourceRoot)) return;
  for (const dirent of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    const source = path.join(sourceRoot, dirent.name);
    const archivePath = normalizeArchivePath(`${archiveRoot}/${dirent.name}`);
    if (shouldExclude(archivePath)) continue;
    if (dirent.isSymbolicLink()) continue;
    if (dirent.isDirectory()) collectDirectory(source, archivePath, entries);
    else if (dirent.isFile()) entries[archivePath] = new Uint8Array(readBackupFile(source, archivePath));
  }
}

/**
 * Health modes decide which findings abort the pipeline:
 * - `source`   — live database being copied into a backup. Only real corruption may abort;
 *                orphan rows and pending migrations must still be preservable.
 * - `archive`  — database inside a backup package, before `migrateStagedDatabase` runs.
 *                An older schema is expected and gets migrated; a newer one cannot.
 * - `strict`   — database already migrated and swapped in. Schema must match the app.
 */
const HEALTH_MODES = Object.freeze({
  source: { allowSchemaMismatch: true, allowForeignKeyViolations: true },
  archive: { allowSchemaMismatch: true, allowForeignKeyViolations: true },
  strict: { allowSchemaMismatch: false, allowForeignKeyViolations: true },
});

function databaseHealthError(assessment, mode) {
  if (assessment.schemaAheadOfApplication) return 'backup_schema_newer_than_application';
  if (assessment.reasons.includes('integrity_check_failed')) {
    return mode === 'strict' ? 'restored_sqlite_integrity_failed' : 'backup_database_corrupted';
  }
  if (assessment.reasons.includes('schema_version_mismatch')) return 'backup_database_schema_mismatch';
  if (assessment.reasons.includes('foreign_key_violation')) return 'backup_database_foreign_keys_broken';
  return 'backup_database_integrity_failed';
}

function databaseHealth(databasePath, options = {}) {
  if (!fs.existsSync(databasePath)) throw new Error('backup_database_not_found');
  const mode = HEALTH_MODES[options.mode] ? options.mode : 'archive';
  const operationalDbHealth = require('../database/operational-db-health');
  let db;
  try {
    db = new Database(databasePath, { readonly: true, fileMustExist: true, timeout: 5000 });
    const assessment = operationalDbHealth.assessHealth(db, {
      ...HEALTH_MODES[mode],
      expectedSchemaVersion: options.expectedSchemaVersion,
    });
    if (!assessment.ok) {
      const error = new Error(databaseHealthError(assessment, mode));
      error.code = error.message;
      error.healthMode = mode;
      error.reasons = assessment.reasons;
      throw error;
    }
    const { readSchemaVersion } = require('../database/hybrid-schema');
    return {
      ok: true,
      quickCheck: 'ok',
      healthMode: mode,
      schemaVersion: readSchemaVersion(db),
      operationalHealth: assessment,
      warnings: assessment.warnings || [],
      size: fs.statSync(databasePath).size,
    };
  } finally {
    try { db?.close(); } catch { /* best effort */ }
  }
}

async function createConsistentDatabaseSnapshot(sourcePath, targetPath, options = {}) {
  const mode = options.mode || 'source';
  databaseHealth(sourcePath, { mode });
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  let source;
  try {
    source = new Database(sourcePath, { readonly: true, fileMustExist: true, timeout: 5000 });
    await source.backup(targetPath);
  } finally {
    try { source?.close(); } catch { /* best effort */ }
  }
  return databaseHealth(targetPath, { mode });
}

function buildManifest(options, entries, databaseInfo) {
  const files = Object.keys(entries).sort().map((archivePath) => {
    const data = Buffer.from(entries[archivePath]);
    return {
      path: archivePath,
      size: data.length,
      sha256: backupCrypto.sha256Hex(data),
    };
  });
  return {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    backupId: options.backupId || crypto.randomUUID(),
    backupType: options.backupType || 'manual',
    appVersion: String(options.appVersion || '0.0.0'),
    buildVersion: String(options.buildVersion || options.appVersion || '0.0.0'),
    createdAt: (options.now || new Date()).toISOString(),
    databaseSchemaVersion: databaseInfo.schemaVersion,
    platform: process.platform,
    source: {
      centerName: String(options.centerName || '').slice(0, 200),
      deviceName: String(options.deviceName || '').slice(0, 200),
      organizationId: String(options.organizationId || options.centerId || '').slice(0, 128),
      centerId: String(options.centerId || options.organizationId || '').slice(0, 128),
      branchId: String(options.branchId || '').slice(0, 128),
      deviceId: String(options.deviceId || '').slice(0, 128),
    },
    scope: {
      type: String(options.scopeType || 'branch').slice(0, 32),
      organizationId: String(options.organizationId || options.centerId || '').slice(0, 128),
      branchIds: Array.isArray(options.branchIds)
        ? options.branchIds.slice(0, 100).map(value => String(value).slice(0, 128))
        : (options.branchId ? [String(options.branchId).slice(0, 128)] : []),
      includedBranchIds: Array.isArray(options.includedBranchIds)
        ? options.includedBranchIds.slice(0, 100).map(value => String(value).slice(0, 128))
        : undefined,
    },
    roots: [...RESTORE_ROOTS],
    encryption: { required: false, algorithm: null, note: 'plaintext_zip_v2_plain' },
    integrity: { algorithm: 'SHA-256', verifiedBeforeCommit: true },
    files,
  };
}

function zipEntries(entries) {
  return Buffer.from(fflate.zipSync(entries, { level: 6 }));
}

function unzipEntries(zipBuffer) {
  let count = 0;
  let total = 0;
  const names = new Set();
  const entries = fflate.unzipSync(new Uint8Array(zipBuffer), {
    filter(file) {
      const name = normalizeArchivePath(file.name);
      if (names.has(name)) throw new Error('backup_duplicate_entry');
      names.add(name);
      count++;
      total += Number(file.originalSize || 0);
      if (count > MAX_ARCHIVE_ENTRIES) throw new Error('backup_too_many_entries');
      if (total > MAX_UNCOMPRESSED_BYTES) throw new Error('backup_uncompressed_size_exceeded');
      return true;
    },
  });
  const normalized = {};
  for (const [name, data] of Object.entries(entries)) {
    const safeName = normalizeArchivePath(name);
    if (normalized[safeName]) throw new Error('backup_duplicate_entry');
    normalized[safeName] = Buffer.from(data);
  }
  return normalized;
}

function parseAndVerifyArchive(zipBuffer, options = {}) {
  const entries = unzipEntries(zipBuffer);
  const rawManifest = entries[MANIFEST_PATH];
  if (!rawManifest) throw new Error('backup_manifest_missing');
  let manifest;
  try { manifest = JSON.parse(rawManifest.toString('utf8')); } catch { throw new Error('backup_manifest_invalid'); }
  if (manifest.format !== BACKUP_FORMAT || manifest.backupVersion !== BACKUP_VERSION) {
    throw new Error('backup_version_unsupported');
  }
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error('backup_manifest_files_invalid');
  if (!entries[DATABASE_PATH]) throw new Error('backup_database_missing');
  if (Number(manifest.databaseSchemaVersion) > Number(options.currentSchemaVersion ?? CURRENT_SCHEMA_VERSION)) {
    throw new Error('backup_schema_newer_than_application');
  }
  const declared = new Set();
  for (const file of manifest.files) {
    const archivePath = normalizeArchivePath(file?.path);
    if (archivePath === MANIFEST_PATH || declared.has(archivePath)) throw new Error('backup_manifest_files_invalid');
    declared.add(archivePath);
    const data = entries[archivePath];
    if (!data) throw new Error('backup_file_missing');
    if (Number(file.size) !== data.length) throw new Error('backup_file_size_mismatch');
    if (!/^[a-f0-9]{64}$/i.test(String(file.sha256 || '')) || backupCrypto.sha256Hex(data) !== String(file.sha256).toLowerCase()) {
      throw new Error('backup_file_hash_mismatch');
    }
  }
  for (const archivePath of Object.keys(entries)) {
    if (archivePath !== MANIFEST_PATH && !declared.has(archivePath)) throw new Error('backup_undeclared_file');
  }
  let securityMaterial = null;
  if (entries[SECURITY_PATH]) {
    let parsed;
    try { parsed = JSON.parse(entries[SECURITY_PATH].toString('utf8')); } catch { throw new Error('backup_field_key_invalid'); }
    if (parsed?.version !== 1 || Buffer.from(String(parsed.fieldKey || ''), 'base64').length !== 32) {
      throw new Error('backup_field_key_invalid');
    }
    securityMaterial = { fieldKey: parsed.fieldKey };
  }
  return { manifest, entries, securityMaterial };
}

function verifyStagedDatabase(databaseBuffer) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-backup-verify-'));
  const target = path.join(root, 'tadawi.db');
  try {
    fs.writeFileSync(target, databaseBuffer, { mode: 0o600 });
    return databaseHealth(target, { mode: 'archive' });
  } finally {
    safeRemove(root, os.tmpdir());
  }
}

function isEncryptedBackupBuffer(buf) {
  const input = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  if (input.length < 4) return false;
  const magic = input.subarray(0, 4);
  return magic.equals(backupCrypto.MAGIC_V2) || magic.equals(backupCrypto.MAGIC_LEGACY);
}

function isZipBackupBuffer(buf) {
  const input = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  return input.length >= 2 && input[0] === 0x50 && input[1] === 0x4b;
}

/**
 * Inspect Backup V2 package: plaintext ZIP (default) or legacy encrypted envelope.
 */
function inspectBackupBuffer(outerBuffer, password, options = {}) {
  const outer = Buffer.isBuffer(outerBuffer) ? outerBuffer : Buffer.from(outerBuffer);
  let zipBuffer;
  let encrypted = false;
  let encryptedSha256 = null;
  let encryptedSize = null;
  if (isEncryptedBackupBuffer(outer)) {
    if (!password || String(password).length < 8) {
      const err = new Error('backup_legacy_encrypted_password_required');
      err.code = 'backup_legacy_encrypted_password_required';
      throw err;
    }
    zipBuffer = backupCrypto.decryptBuffer(outer, password);
    encrypted = true;
    encryptedSha256 = backupCrypto.sha256Hex(outer);
    encryptedSize = outer.length;
  } else if (!isZipBackupBuffer(outer)) {
    throw new Error('invalid_backup_format');
  } else {
    zipBuffer = outer;
  }
  const inspected = parseAndVerifyArchive(zipBuffer, options);
  const database = verifyStagedDatabase(inspected.entries[DATABASE_PATH]);
  const packageSha256 = backupCrypto.sha256Hex(outer);
  return {
    ...inspected,
    zipBuffer,
    database,
    encrypted,
    encryptedSha256,
    encryptedSize,
    packageSha256,
    hash: packageSha256,
    size: outer.length,
  };
}

function inspectEncryptedBackup(encryptedBuffer, password, options = {}) {
  return inspectBackupBuffer(encryptedBuffer, password, options);
}

async function createBackupBuffer(options) {
  if (!options?.userDataDir) throw new Error('backup_user_data_dir_required');
  const userDataDir = path.resolve(options.userDataDir);
  const sourceDatabase = path.resolve(options.databasePath || path.join(userDataDir, DATABASE_PATH.replace(/\//g, path.sep)));
  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-backup-v2-'));
  try {
    emitProgress(options, 'checking_database');
    const sourceHealth = databaseHealth(sourceDatabase, { mode: 'source' });
    failpoint(options, 'after_source_integrity');

    emitProgress(options, 'creating_snapshot');
    const stagedDatabase = path.join(stageRoot, 'tadawi.db');
    const databaseInfo = await createConsistentDatabaseSnapshot(sourceDatabase, stagedDatabase, { mode: 'source' });
    failpoint(options, 'after_snapshot');

    const entries = { [DATABASE_PATH]: new Uint8Array(fs.readFileSync(stagedDatabase)) };
    emitProgress(options, 'collecting_files');
    for (const root of RESTORE_ROOTS.slice(1)) collectDirectory(path.join(userDataDir, root), root, entries);
    // Phase 3: no clinic field-key / security material in operational backup path.

    const manifest = buildManifest(options, entries, databaseInfo);
    if (options.scopeTruth) {
      require('./backup-v2-scope-truth').applyScopeTruthToManifest(manifest, options.scopeTruth);
    }
    entries[MANIFEST_PATH] = fflate.strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
    emitProgress(options, 'compressing', { files: manifest.files.length });
    const zipBuffer = zipEntries(entries);
    failpoint(options, 'after_package');

    emitProgress(options, 'verifying');
    const verified = inspectBackupBuffer(zipBuffer, null, options);
    if (verified.manifest.backupId !== manifest.backupId || verified.database.quickCheck !== 'ok') {
      throw new Error('backup_post_write_verification_failed');
    }
    return {
      buffer: zipBuffer,
      hash: verified.packageSha256,
      packageSha256: verified.packageSha256,
      encryptedSize: zipBuffer.length,
      zipSize: zipBuffer.length,
      manifest,
      sourceHealth,
      database: verified.database,
    };
  } finally {
    safeRemove(stageRoot, os.tmpdir());
  }
}

async function createBackupFile(options) {
  if (!options?.outputPath) throw new Error('backup_output_path_required');
  const outputPath = path.resolve(options.outputPath);
  const result = await createBackupBuffer(options);
  failpoint(options, 'disk_full');
  failpoint(options, 'before_commit');
  emitProgress(options, 'committing');
  writeFileAtomicSync(outputPath, result.buffer, { mode: 0o600 });
  const persisted = fs.readFileSync(outputPath);
  const verified = inspectBackupBuffer(persisted, null, options);
  if (verified.packageSha256 !== result.hash) throw new Error('backup_persisted_hash_mismatch');
  emitProgress(options, 'complete', { path: outputPath, hash: result.hash });
  return { ok: true, path: outputPath, ...result, buffer: undefined };
}

async function createBackupWithUpload(options) {
  const local = await createBackupFile(options);
  if (typeof options.upload !== 'function') return { ...local, localOk: true, cloudOk: false, cloudSkipped: true };
  emitProgress(options, 'uploading', { path: local.path });
  let upload;
  try {
    upload = await options.upload({
      path: local.path,
      buffer: fs.readFileSync(local.path),
      filename: path.basename(local.path),
      hash: local.hash,
      manifest: local.manifest,
    });
  } catch (error) {
    const code = error?.code || error?.status || '';
    const message = error?.message || String(error);
    upload = {
      ok: false,
      message,
      code,
      quota: /quota|storageExceeded|403.*storage/i.test(`${code} ${message}`),
    };
  }
  if (!upload?.ok) {
    emitProgress(options, 'upload_failed', {
      error: upload?.message || 'cloud_upload_failed',
      localPath: local.path,
      quota: !!upload?.quota,
    });
    return {
      ...local,
      localOk: true,
      cloudOk: false,
      uploadError: upload?.message || 'cloud_upload_failed',
      quota: !!upload?.quota,
      uploadCode: upload?.code || null,
    };
  }
  // Never treat a remote as valid without hash confirmation when expected.
  if (upload.expectedHash && upload.remoteHash && upload.expectedHash !== upload.remoteHash) {
    emitProgress(options, 'upload_failed', { error: 'remote_hash_mismatch', localPath: local.path });
    return {
      ...local,
      localOk: true,
      cloudOk: false,
      uploadError: 'remote_hash_mismatch',
      upload,
    };
  }
  let pruned = 0;
  if (typeof options.pruneAfterUpload === 'function') {
    pruned = Number(await options.pruneAfterUpload(upload, local)) || 0;
  } else if (Number(options.retentionCount) > 0) {
    pruned = pruneLocalBackups(path.dirname(local.path), Number(options.retentionCount), {
      keepPath: local.path,
    }).pruned;
  }
  emitProgress(options, 'upload_complete', { remotePath: upload.remotePath || upload.path, pruned });
  return { ...local, localOk: true, cloudOk: true, upload, pruned };
}

/**
 * Keep newest N eligible scheduled .tdw backups in a directory. Manual, imported,
 * pinned, safety, and emergency artifacts are deliberately retained; only explicit
 * owner deletion can remove those recovery points.
 */
function classifyRetention(file, options = {}) {
  const name = String(file?.name || '').toLowerCase();
  const filePath = path.resolve(file?.filePath || '');
  const pinned = new Set((options.pinnedPaths || []).map((item) => path.resolve(String(item))));
  if (pinned.has(filePath) || /(?:^|[._-])pinned(?:[._-]|$)/.test(name)) return 'pinned';
  if (/(?:emergency|safety|pre-restore|before-restore)/.test(name)) return 'safety';
  if (/(?:^|[._-])import(?:[._-]|$)/.test(name)) return 'imported';
  if (/(?:^|[._-])manual(?:[._-]|$)/.test(name)) return 'manual';
  if (/(?:^|[._-])(scheduled|auto|periodic)(?:[._-]|$)/.test(name)) return 'scheduled';
  // Legacy unlabeled Brand-Backup-{iso} dumps (15-min timer) — prune as automatic.
  if (/backup-\d{4}-\d{2}-\d{2}t/.test(name) && !/tadawi-backup-v2/.test(name)) return 'scheduled';
  return 'manual';
}

function pruneLocalBackups(backupDir, retentionCount, options = {}) {
  const dir = path.resolve(backupDir || '');
  const keep = Math.max(1, Number(retentionCount) || DEFAULT_LOCAL_RETENTION);
  const keepPath = options.keepPath ? path.resolve(options.keepPath) : null;
  if (!dir || !fs.existsSync(dir)) return { ok: true, pruned: 0, kept: 0, files: [] };
  const files = listLocalBackupFiles(dir, { includeJson: true })
    .filter((f) => !String(f.name).includes('.partial'))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const kept = [];
  const removed = [];
  const protectedFiles = [];
  let eligibleKept = 0;
  for (const file of files) {
    const classification = classifyRetention(file, options);
    if (keepPath && path.resolve(file.filePath) === keepPath) {
      kept.push(file);
      continue;
    }
    if (classification !== 'scheduled') {
      kept.push(file);
      protectedFiles.push({ name: file.name, classification });
      continue;
    }
    if (eligibleKept < keep) {
      kept.push(file);
      eligibleKept += 1;
      continue;
    }
    try {
      fs.unlinkSync(file.filePath);
      removed.push(file.name);
    } catch {
      /* best effort */
    }
  }
  return {
    ok: true,
    pruned: removed.length,
    kept: kept.length,
    removed,
    files: kept.map((f) => f.name),
    protected: protectedFiles,
  };
}

/**
 * Documented product decision for V2-5.2: incremental/differential Backup V2
 * formats are not implemented. Full snapshot .tdw is the DR unit; deltas are
 * Cloud Sync outbox revisions.
 */
function backupFormatPolicy() {
  return {
    fullSnapshot: true,
    incremental: { supported: false, reason: 'dr_unit_is_full_tdw_snapshot; deltas_via_cloud_sync' },
    differential: { supported: false, reason: 'not_required_while_full_snapshot_and_sync_exist' },
    versionHistory: 'local_mtime_list_plus_manifest_createdAt',
  };
}

function verifyBackupFile(filePath, password, options = {}) {
  const resolved = path.resolve(filePath);
  const inspected = inspectBackupBuffer(fs.readFileSync(resolved), password, options);
  return {
    ok: true,
    path: resolved,
    hash: inspected.packageSha256,
    size: inspected.size,
    manifest: inspected.manifest,
    database: inspected.database,
    encrypted: inspected.encrypted,
  };
}

function extractEntriesToStage(inspected, stageRoot) {
  for (const root of RESTORE_ROOTS) fs.mkdirSync(path.join(stageRoot, root), { recursive: true });
  for (const [archivePath, data] of Object.entries(inspected.entries)) {
    if (archivePath === MANIFEST_PATH || archivePath === SECURITY_PATH) continue;
    const root = archivePath.split('/')[0];
    if (!RESTORE_ROOTS.includes(root)) throw new Error('backup_restore_root_invalid');
    const target = path.resolve(stageRoot, archivePath.replace(/\//g, path.sep));
    const resolvedStage = path.resolve(stageRoot);
    if (!target.startsWith(resolvedStage + path.sep)) throw new Error('unsafe_backup_entry');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data, { mode: 0o600 });
  }
}

function migrateStagedDatabase(databasePath, now = new Date()) {
  let db;
  try {
    db = new Database(databasePath, { fileMustExist: true, timeout: 5000 });
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = DELETE');
    db.pragma('synchronous = FULL');
    const { readSchemaVersion } = require('../database/hybrid-schema');
    const before = readSchemaVersion(db);
    const migrations = runSchemaMigrations(db, now);
    const quickCheck = db.pragma('quick_check', { simple: true });
    if (quickCheck !== 'ok') throw new Error('restored_sqlite_integrity_failed');
    const operationalDbHealth = require('../database/operational-db-health');
    // Orphan rows inherited from an older build must not void an otherwise sound restore;
    // they are reported so post-restore maintenance can clean them.
    const operationalHealth = operationalDbHealth.assessHealth(db, { allowForeignKeyViolations: true });
    if (!operationalHealth.ok) throw new Error('restored_sqlite_integrity_failed');
    return {
      before,
      after: Math.max(0, ...migrations.map((item) => Number(item.version) || 0)),
      quickCheck,
      foreignKeyViolations: operationalHealth.foreignKeyCheck?.violations || 0,
      operationalHealth,
    };
  } finally {
    try { db?.close(); } catch { /* best effort */ }
  }
}

function buildEmergencyPath(userDataDir, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return path.join(userDataDir, 'Backups', 'Emergency', `Tadawi-Emergency-${stamp}.tdw`);
}

function rollbackSwaps(userDataDir, rollbackRoot, swapped) {
  for (const root of [...swapped].reverse()) {
    const live = path.join(userDataDir, root);
    const previous = path.join(rollbackRoot, root);
    if (fs.existsSync(live)) safeRemove(live, userDataDir);
    if (fs.existsSync(previous)) fs.renameSync(previous, live);
  }
}

async function restoreBackupFile(options) {
  if (!options?.userDataDir || !options?.filePath) {
    throw restoreValidation.restoreError('restore_request_invalid', 'restore_request_invalid', restoreValidation.STAGES.VALIDATION);
  }
  const password = options.password != null ? String(options.password) : '';
  const userDataDir = path.resolve(options.userDataDir);
  const filePath = path.resolve(options.filePath);

  const existingGate = readRestoreGate(userDataDir);
  emitProgress(options, 'reading_manifest');
  let inspected;
  try {
    inspected = inspectBackupBuffer(fs.readFileSync(filePath), password || options.password, options);
  } catch (error) {
    error.stage = error.stage || restoreValidation.STAGES.VALIDATION;
    try { saveRestoreDiagnosticCopy(filePath, userDataDir, error.code || error.message); } catch { /* best effort */ }
    throw error;
  }

  assertOperationalRestoreAllowed(inspected, options);
  if (options.requireSecurityMaterial && !inspected.securityMaterial?.fieldKey) {
    throw restoreValidation.restoreError('backup_field_key_missing', 'backup_field_key_missing', restoreValidation.STAGES.VALIDATION);
  }
  emitProgress(options, 'checking_identity');
  assertRestoreIdentityAllowed(inspected.manifest, {
    ...(options.expectedIdentity || {}),
    allowLegacyBranchless: options.allowLegacyBranchless !== false,
  });
  restoreValidation.assertRestoreScopeTruthAllowed(inspected.manifest, {
    ...options.expectedIdentity,
    licensedBranchIds: options.licensedBranchIds,
    requireScopeTruth: options.requireScopeTruth === true,
    skipScopeTruth: options.skipScopeTruth === true,
  });

  const backupId = inspected.manifest?.backupId || null;
  const idempotent = restoreValidation.assertIdempotentRestoreAllowed(
    existingGate,
    backupId,
    options
  );
  if (idempotent.alreadyVerified) {
    emitProgress(options, 'restore_complete', { idempotent: true, backupId });
    return {
      ok: true,
      needRestart: false,
      idempotent: true,
      manifest: inspected.manifest,
      gate: existingGate,
    };
  }
  failpoint(options, 'after_verify');

  writeRestoreGate(userDataDir, {
    pending: true,
    verified: false,
    backupId,
    source: inspected.manifest?.source || null,
    startedAt: new Date().toISOString(),
  });

  const stageRoot = fs.mkdtempSync(path.join(userDataDir, '.restore-v2-stage-'));
  const rollbackRoot = path.join(userDataDir, `.restore-v2-rollback-${Date.now()}-${process.pid}`);
  const swapped = [];
  let databaseClosed = false;
  let securityChanged = false;
  let emergency = null;
  let safetyCopy = null;
  let dataWarnings = [];
  try {
    emitProgress(options, 'staging_restore');
    extractEntriesToStage(inspected, stageRoot);
    const stagedDbPath = path.join(stageRoot, DATABASE_PATH.replace(/\//g, path.sep));
    databaseHealth(stagedDbPath, { mode: 'archive' });
    restoreValidation.validateStagedAttachments(stageRoot, inspected.manifest, options);
    const scopeSummary = (() => {
      try {
        return require('./backup-v2-scope-truth').extractScopeSummaryFromManifest(inspected.manifest);
      } catch {
        return { includedBranchIds: [] };
      }
    })();
    const semantics = restoreValidation.validateStagedSemanticInvariants(stagedDbPath, {
      allowedBranchIds: scopeSummary.includedBranchIds?.length
        ? scopeSummary.includedBranchIds
        : (options.expectedIdentity?.authorizedBranchIds || []),
      allowLegacyBranchless: options.allowLegacyBranchless !== false,
    });
    dataWarnings = semantics?.warnings || [];
    const migration = migrateStagedDatabase(stagedDbPath, options.now || new Date());
    failpoint(options, 'after_staging');

    emitProgress(options, 'creating_emergency_backup');
    const liveDatabasePath = path.join(userDataDir, DATABASE_PATH.replace(/\//g, path.sep));
    if (fs.existsSync(liveDatabasePath) && options.skipEmergencyBackup !== true) {
      const emergencyPath = path.resolve(options.emergencyOutputPath || buildEmergencyPath(userDataDir, options.now || new Date()));
      emergency = await createBackupFile({
        ...options,
        failpoint: undefined,
        expectedIdentity: undefined,
        outputPath: emergencyPath,
        backupType: 'emergency-before-restore',
        securityMaterial: options.currentSecurityMaterial,
        onProgress: undefined,
      });
      restoreValidation.assertSafetySnapshotOk(emergency, options);
    } else {
      emergency = { path: null, skipped: true, reason: 'no_live_database' };
    }
    failpoint(options, 'after_emergency');

    emitProgress(options, 'closing_database');
    await options.closeDatabase?.();
    databaseClosed = true;
    failpoint(options, 'after_close');

    emitProgress(options, 'safety_snapshot');
    if (options.skipSafetySnapshot !== true) {
      safetyCopy = restoreValidation.createSafetyDatabaseCopy(userDataDir, options);
    } else {
      safetyCopy = { ok: true, skipped: true, reason: 'skip_safety_snapshot' };
    }
    failpoint(options, 'after_safety_snapshot');

    if (inspected.securityMaterial && options.applySecurityMaterial) {
      await options.applySecurityMaterial(inspected.securityMaterial);
      securityChanged = true;
    }

    fs.mkdirSync(rollbackRoot, { recursive: false });
    emitProgress(options, 'swapping_data');
    for (const root of RESTORE_ROOTS) {
      const live = path.join(userDataDir, root);
      const staged = path.join(stageRoot, root);
      const previous = path.join(rollbackRoot, root);
      if (fs.existsSync(live)) fs.renameSync(live, previous);
      if (fs.existsSync(staged)) fs.renameSync(staged, live);
      else if (!fs.existsSync(live)) fs.mkdirSync(live, { recursive: true });
      swapped.push(root);
      if (swapped.length === 1) failpoint(options, 'after_first_swap');
    }
    failpoint(options, 'after_swap');
    const finalDbPath = path.join(userDataDir, DATABASE_PATH.replace(/\//g, path.sep));
    const finalHealth = databaseHealth(finalDbPath, { mode: 'strict' });
    const rowCounts = countDatabaseRows(finalDbPath);
    if (!finalHealth?.ok || rowCounts.ok === false) {
      throw restoreValidation.restoreError(
        'restored_sqlite_integrity_failed',
        'restored_sqlite_integrity_failed',
        restoreValidation.STAGES.REOPEN
      );
    }
    writeRestoreGate(userDataDir, {
      pending: false,
      verified: true,
      backupId,
      integrity: finalHealth,
      rowCounts: rowCounts.counts,
      source: inspected.manifest?.source || null,
      reconciliationRequired: true,
      postOpenRequired: true,
      dataWarnings,
      safetySnapshotPath: safetyCopy?.safetyRoot || emergency?.path || null,
      completedAt: new Date().toISOString(),
    });
    emitProgress(options, 'restore_complete', {
      emergencyPath: emergency?.path || null,
      safetySnapshotPath: safetyCopy?.safetyRoot || null,
      rollbackPath: rollbackRoot,
    });
    return {
      ok: true,
      needRestart: true,
      manifest: inspected.manifest,
      migration,
      database: finalHealth,
      rowCounts: rowCounts.counts,
      emergencyPath: emergency?.path || null,
      safetySnapshotPath: safetyCopy?.safetyRoot || null,
      rollbackPath: rollbackRoot,
      reconciliationRequired: true,
      dataWarnings,
      unrestorable: Array.isArray(options.unrestorableReport) ? options.unrestorableReport : [],
    };
  } catch (error) {
    if (!error.stage) {
      error.stage = swapped.length
        ? restoreValidation.STAGES.SWAP
        : (databaseClosed ? restoreValidation.STAGES.SNAPSHOT : restoreValidation.STAGES.STAGING);
    }
    let rollbackError = null;
    try { if (swapped.length) rollbackSwaps(userDataDir, rollbackRoot, swapped); } catch (caught) { rollbackError = caught; }
    try {
      if (securityChanged && options.rollbackSecurityMaterial) await options.rollbackSecurityMaterial(options.currentSecurityMaterial || null);
    } catch (caught) { rollbackError ||= caught; }
    try { if (databaseClosed) await options.reopenDatabase?.(); } catch (caught) { rollbackError ||= caught; }
    try { saveRestoreDiagnosticCopy(filePath, userDataDir, error.code || error.message); } catch { /* best effort */ }
    try {
      writeRestoreGate(userDataDir, {
        pending: false,
        verified: false,
        failed: true,
        backupId,
        error: String(error.code || error.message || 'restore_failed').slice(0, 300),
        stage: error.stage || null,
        rolledBack: !rollbackError,
      });
    } catch { /* best effort */ }
    if (rollbackError) error.rollbackError = rollbackError.message;
    emitProgress(options, 'restore_failed', { error: error.message, rolledBack: !rollbackError, stage: error.stage });
    throw error;
  } finally {
    try { if (fs.existsSync(stageRoot)) safeRemove(stageRoot, userDataDir); } catch { /* preserve primary result */ }
  }
}

function rollbackCommittedRestore(userDataDir, rollbackRoot) {
  if (!userDataDir || !rollbackRoot || !fs.existsSync(rollbackRoot)) {
    return { ok: false, error: 'restore_rollback_unavailable' };
  }
  const swapped = RESTORE_ROOTS.filter((root) => fs.existsSync(path.join(rollbackRoot, root)));
  if (!swapped.length) return { ok: false, error: 'restore_rollback_unavailable' };
  try {
    rollbackSwaps(userDataDir, rollbackRoot, swapped);
    writeRestoreGate(userDataDir, {
      pending: false,
      verified: false,
      rolledBack: true,
      rollbackAt: new Date().toISOString(),
      recoveryRequired: false,
    });
    return { ok: true, rolledBack: true, swapped };
  } catch (error) {
    return { ok: false, error: error.code || error.message || 'restore_rollback_failed' };
  }
}

function friendlyBackupError(error) {
  const code = error?.code === 'ENOSPC'
    ? 'backup_disk_space_insufficient'
    : String(error?.code || error?.message || 'backup_unknown_error');
  const messages = {
    backup_database_not_found: 'قاعدة البيانات غير موجودة ولا يمكن إنشاء النسخة.',
    backup_database_integrity_failed: 'فشل فحص سلامة قاعدة البيانات الحالية.',
    backup_database_corrupted: 'ملف قاعدة البيانات تالف (integrity_check) — لا يمكن نسخه أو استعادته.',
    backup_database_schema_mismatch: 'مخطط قاعدة بيانات النسخة غير متوافق ولا يمكن ترقيته.',
    backup_database_foreign_keys_broken: 'قاعدة البيانات تحتوي مراجع مكسورة تمنع إكمال العملية.',
    backup_authentication_failed: 'كلمة مرور النسخة غير صحيحة أو الملف تالف.',
    backup_manifest_missing: 'ملف بيان النسخة الاحتياطية غير موجود.',
    backup_manifest_invalid: 'بيان النسخة الاحتياطية غير صالح.',
    backup_version_unsupported: 'إصدار النسخة الاحتياطية غير مدعوم.',
    backup_schema_newer_than_application: 'النسخة أُنشئت بإصدار قاعدة بيانات أحدث من البرنامج.',
    backup_file_hash_mismatch: 'فشل التحقق من بصمة أحد ملفات النسخة.',
    backup_field_key_missing: 'هذه النسخة لا تحتوي مفتاح حماية البيانات المطلوب لاستعادة قاعدة البيانات المشفرة.',
    backup_disk_space_insufficient: 'لا توجد مساحة قرص كافية لإكمال العملية.',
    restored_sqlite_integrity_failed: 'قاعدة البيانات المستعادة لم تجتز فحص السلامة.',
    backup_legacy_encrypted_password_required: 'نسخة مشفّرة قديمة — استخدم «نسخة مشفّرة قديمة» للاستيراد (لا تُستعاد مباشرة فوق قاعدة الإنتاج).',
    backup_legacy_encrypted_direct_restore_blocked: 'رُفضت الاستعادة: النسخ المشفّرة القديمة لا تُستعاد مباشرة — استخدم «نسخة مشفّرة قديمة» ثم التحقق والدمج.',
    invalid_backup_format: 'صيغة النسخة غير مدعومة أو تالفة.',
    password_too_short: 'كلمة مرور النسخة القديمة يجب ألا تقل عن 8 أحرف.',
    restore_center_mismatch: 'رُفضت الاستعادة: النسخة تخص مركزاً مختلفاً عن الجهاز الحالي.',
    restore_center_missing: 'رُفضت الاستعادة: النسخة لا تتضمن هوية المركز المطلوبة.',
    restore_branch_unauthorized: 'رُفضت الاستعادة: النسخة تخص فرعاً غير مصرّح لهذا الجهاز.',
    restore_branch_missing: 'رُفضت الاستعادة: النسخة لا تتضمن هوية الفرع المطلوبة.',
    restore_request_invalid: 'طلب الاستعادة غير صالح.',
    restore_scope_truth_missing: 'بيان scopeTruth غير موجود — الاستعادة مرفوضة.',
    restore_scope_truth_not_ready: 'النسخة التنظيمية غير جاهزة للاستعادة.',
    restore_branch_scope_mismatch: 'نطاق الفروع في النسخة لا يطابق الترخيص.',
    restore_attachments_missing: 'ملفات مرفقات ناقصة في النسخة.',
    restore_attachment_reference_missing: 'مراجع مرفقات بدون ملفات فعلية.',
    restore_semantic_invariant_failed: 'فشل التحقق الدلالي من قاعدة البيانات المستعادة.',
    restore_safety_snapshot_failed: 'فشل نسخة الأمان — تم إيقاف الاستعادة.',
    restore_already_in_progress: 'استعادة قيد التنفيذ.',
    restore_interrupted_recovered: 'تم التراجع عن استعادة متقطعة.',
    restore_interrupted_no_rollback: 'استعادة متقطعة بدون تراجع متاح.',
    no_authorized_backup: 'لا توجد نسخة مصرّح بها يمكن استعادتها.',
    org_backup_not_ready: 'لا يمكن إنشاء نسخة مؤسسة — أكمل مزامنة جميع الفروع وأغلق التعارضات والـOutbox أولاً.',
  };
  return { code, message: messages[code] || `تعذّر إكمال عملية النسخ أو الاستعادة (${code}).` };
}

module.exports = {
  BACKUP_VERSION,
  BACKUP_FORMAT,
  MANIFEST_PATH,
  DATABASE_PATH,
  SECURITY_PATH,
  RESTORE_ROOTS,
  CURRENT_SCHEMA_VERSION,
  sanitizeSettingsValue,
  databaseHealth,
  createConsistentDatabaseSnapshot,
  createBackupBuffer,
  createBackupFile,
  createBackupWithUpload,
  inspectBackupBuffer,
  isEncryptedBackupBuffer,
  isZipBackupBuffer,
  inspectEncryptedBackup,
  verifyBackupFile,
  restoreBackupFile,
  rollbackCommittedRestore,
  friendlyBackupError,
  buildEmergencyPath,
  buildManifest,
  assertRestoreIdentityAllowed,
  assertOperationalRestoreAllowed,
  listLocalBackupFiles,
  pickLatestAuthorizedBackup,
  saveRestoreDiagnosticCopy,
  writeRestoreGate,
  readRestoreGate,
  countDatabaseRows,
  hashTree,
  pruneLocalBackups,
  classifyRetention,
  backupFormatPolicy,
  DEFAULT_LOCAL_RETENTION,
  recoverInterruptedRestore: restoreValidation.recoverInterruptedRestore,
  RESTORE_STAGES: restoreValidation.STAGES,
};
