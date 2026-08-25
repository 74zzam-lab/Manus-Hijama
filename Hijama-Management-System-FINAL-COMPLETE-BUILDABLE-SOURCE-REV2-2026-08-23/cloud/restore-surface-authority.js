/**
 * PR9.5 — Renderer restore surface authority.
 * JSON merge / staging paths are migration-only; DR is Backup V2 atomic pipeline.
 */
(function (global) {
  'use strict';

  const SURFACE = Object.freeze({
    BACKUP_V2: 'ACTIVE_PRODUCTION',
    JSON_STAGING: 'MIGRATION_ONLY',
    CLOUD_HYDRATE: 'SYNC_HYDRATE_NOT_DR',
    LEGACY_DB: 'DISABLED',
  });

  /** Sources allowed to merge staged JSON into production (never full DB swap). */
  const MIGRATION_MERGE_SOURCES = new Set([
    'import_studio_undo',
    'settings_restore_point',
    'legacy_drive_sync',
    'migration_import',
    'admin_migration',
  ]);

  function denyLegacyMergeRestore(source) {
    return {
      ok: false,
      error: 'legacy_restore_disabled',
      code: 'LEGACY_RESTORE_DISABLED',
      message: 'JSON merge restore cannot replace production as disaster recovery. Use Backup V2 atomic restore.',
      surface: SURFACE.JSON_STAGING,
      source: source || null,
    };
  }

  function assertMigrationMergeAllowed(meta = {}, options = {}) {
    if (meta.migrationOnly === true || options.migrationOnly === true) return { ok: true };
    if (meta.disasterRecovery === true || options.disasterRecovery === true) {
      return denyLegacyMergeRestore(meta.source || options.source);
    }
    const source = String(meta.source || options.source || '').trim();
    if (MIGRATION_MERGE_SOURCES.has(source)) return { ok: true };
    return denyLegacyMergeRestore(source || 'unknown');
  }

  global.RestoreSurfaceAuthority = {
    SURFACE,
    MIGRATION_MERGE_SOURCES,
    denyLegacyMergeRestore,
    assertMigrationMergeAllowed,
  };
})(typeof window !== 'undefined' ? window : globalThis);
