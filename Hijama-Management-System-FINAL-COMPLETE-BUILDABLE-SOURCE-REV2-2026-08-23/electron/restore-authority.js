'use strict';

/**
 * PR9.5 — Single disaster-recovery restore authority (main process).
 * Only Backup V2 atomic pipeline may replace production DB for DR.
 */

const SURFACE = Object.freeze({
  BACKUP_V2: 'ACTIVE_PRODUCTION',
  LEGACY_DB: 'DISABLED',
  CLOUD_HYDRATE: 'SYNC_HYDRATE_NOT_DR',
  JSON_STAGING: 'MIGRATION_ONLY',
  V1_LEVELDB: 'DISABLED',
  IMPORT: 'MIGRATION_ONLY',
  MIGRATE_IPC: 'MIGRATION_ONLY',
  DEAD: 'DEAD',
});

/** IPC channels allowed to perform production DR (atomic swap). */
const DR_IPC_CHANNELS = new Set([
  'backup:v2:restore',
  'backup:v2:restoreLatest',
]);

const MIGRATION_DB_REPLACE_SOURCES = new Set([
  'localStorage',
  'internal_migration',
  'legacy_import_staging',
  'migration_safety_rollback',
  'admin_migration_tool',
]);

function denyLegacyRestore(action) {
  return {
    ok: false,
    error: 'legacy_restore_disabled',
    code: 'LEGACY_RESTORE_DISABLED',
    action: action || 'restoreDbBackup',
    message: 'Legacy restore is disabled. Use Backup V2 atomic restore for disaster recovery.',
    surface: SURFACE.LEGACY_DB,
  };
}

function denyDirectDbReplacement(reason, extra = {}) {
  return {
    ok: false,
    error: reason || 'direct_db_replacement_blocked',
    code: 'DIRECT_DB_REPLACEMENT_BLOCKED',
    message: 'Direct production database replacement is not allowed on this path. Use Backup V2 atomic restore.',
    surface: SURFACE.MIGRATE_IPC,
    ...extra,
  };
}

/**
 * database:migrateFromBackup — migration tooling only, never DR bypass.
 */
function assertMigrationDbReplaceAllowed(options = {}) {
  if (options.migrationOnly === true) return { ok: true };
  if (options.internalMigration === true) return { ok: true };
  if (options.dryRun === true) return { ok: true };
  const label = String(options.sourceLabel || options.source || '').trim();
  if (label && MIGRATION_DB_REPLACE_SOURCES.has(label)) return { ok: true };
  return denyDirectDbReplacement('migration_context_required', {
    error: 'migration_context_required',
    hint: 'Pass migrationOnly:true, internalMigration:true, dryRun:true, or an approved sourceLabel.',
  });
}

function isDisasterRecoveryIpcChannel(channel) {
  return DR_IPC_CHANNELS.has(String(channel || ''));
}

module.exports = {
  SURFACE,
  DR_IPC_CHANNELS,
  MIGRATION_DB_REPLACE_SOURCES,
  denyLegacyRestore,
  denyDirectDbReplacement,
  assertMigrationDbReplaceAllowed,
  isDisasterRecoveryIpcChannel,
};
