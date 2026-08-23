'use strict';

/**
 * Migration-only: import legacy encrypted Backup V2 (.tdw with CDB2/CDBK envelope).
 * Decrypts and stages under Backups/V2/legacy-migration-staging — never swaps production DB.
 */
const fs = require('fs');
const path = require('path');
const backupV2 = require('./backup-v2-core');
const { writeFileAtomicSync } = require('./atomic-file');

function legacyMigrationRoot(userDataDir) {
  return path.join(path.resolve(userDataDir || ''), 'Backups', 'V2', 'legacy-migration-staging');
}

async function importLegacyEncryptedBackup(options) {
  if (!options?.filePath) return { ok: false, error: 'file_path_required' };
  const password = String(options.password || '');
  if (password.length < 8) return { ok: false, error: 'password_too_short' };
  const buf = fs.readFileSync(options.filePath);
  if (!backupV2.isEncryptedBackupBuffer(buf)) {
    return { ok: false, error: 'not_legacy_encrypted_backup' };
  }
  try {
    const inspected = backupV2.inspectBackupBuffer(buf, password, options);
    backupV2.assertOperationalRestoreAllowed(inspected, { legacyMigrationImport: true });

    const userDataDir = path.resolve(options.userDataDir || '');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const stagingDir = path.join(legacyMigrationRoot(userDataDir), `import-${stamp}`);
    fs.mkdirSync(stagingDir, { recursive: true });

    const zipPath = path.join(stagingDir, 'decrypted-package.zip');
    writeFileAtomicSync(zipPath, inspected.zipBuffer, { mode: 0o600 });

    const meta = {
      version: 1,
      at: new Date().toISOString(),
      sourceFile: path.basename(options.filePath),
      packageSha256: inspected.packageSha256,
      encryptedSha256: inspected.encryptedSha256,
      encryptedSize: inspected.encryptedSize,
      backupId: inspected.manifest?.backupId || null,
      source: inspected.manifest?.source || null,
      scope: inspected.manifest?.scope || null,
      database: {
        ok: inspected.database?.ok === true,
        schemaVersion: inspected.database?.schemaVersion ?? null,
        integrity: inspected.database?.quickCheck || null,
      },
      note: 'legacy_encrypted_migration_staging_only_not_production_restore',
    };
    writeFileAtomicSync(
      path.join(stagingDir, 'legacy-import-meta.json'),
      `${JSON.stringify(meta, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 }
    );

    return {
      ok: true,
      legacy: true,
      migrationOnly: true,
      stagingPath: stagingDir,
      stagingZipPath: zipPath,
      manifest: inspected.manifest,
      database: inspected.database,
      packageSha256: inspected.packageSha256,
      meta,
    };
  } catch (error) {
    return { ok: false, error: error.code || error.message || 'legacy_import_failed' };
  }
}

module.exports = { importLegacyEncryptedBackup, legacyMigrationRoot };
