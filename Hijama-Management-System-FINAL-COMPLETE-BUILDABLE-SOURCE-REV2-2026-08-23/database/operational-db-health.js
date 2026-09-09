'use strict';

/**
 * Operational DB health — integrity/FK/schema gates before writes and sync.
 */
const { integrityCheck, getSchemaVersion } = require('./connection');
const dbMaintenance = require('./db-maintenance');
const hybridSchema = require('./hybrid-schema');

const REASON_MESSAGES_AR = {
  integrity_check_failed: 'فشل فحص سلامة قاعدة البيانات',
  foreign_key_violation: 'انتهاك قيود الارتباط في قاعدة البيانات',
  schema_version_mismatch: 'إصدار مخطط قاعدة البيانات غير متوقع',
};

function buildMessageAr(reasons) {
  const labels = (reasons || []).map((r) => REASON_MESSAGES_AR[r] || r);
  return labels.length
    ? `قاعدة البيانات غير صالحة للتشغيل — ${labels.join('؛ ')}`
    : 'قاعدة البيانات غير صالحة للتشغيل';
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {object} [options]
 * @param {object} [options.maintenance] - db-maintenance module override for tests
 */
/**
 * @param {import('better-sqlite3').Database} db
 * @param {object} [options]
 * @param {object} [options.maintenance] - db-maintenance module override for tests
 * @param {boolean} [options.allowForeignKeyViolations] - report orphan rows as a warning
 * @param {boolean} [options.allowSchemaMismatch] - report schema drift as a warning
 *   (pre-migration archives and live databases awaiting migration)
 */
function assessHealth(db, options = {}) {
  const maint = options.maintenance || dbMaintenance;
  const reasons = [];
  const warnings = [];

  const integrity = maint.integrityCheck
    ? maint.integrityCheck(db)
    : integrityCheck(db);
  if (!integrity.ok) reasons.push('integrity_check_failed');

  const fk = maint.foreignKeyCheck ? maint.foreignKeyCheck(db) : { ok: true, violations: 0 };
  if (!fk.ok) (options.allowForeignKeyViolations ? warnings : reasons).push('foreign_key_violation');

  const schemaVersion = getSchemaVersion(db);
  const expectedSchemaVersion = options.expectedSchemaVersion != null
    ? Number(options.expectedSchemaVersion)
    : hybridSchema.CURRENT_SCHEMA_VERSION;
  const schemaMismatch = Number.isFinite(expectedSchemaVersion) && schemaVersion !== expectedSchemaVersion;
  if (schemaMismatch) {
    // A newer-than-application schema can never be migrated down — always blocking.
    const migratable = options.allowSchemaMismatch && schemaVersion < expectedSchemaVersion;
    (migratable ? warnings : reasons).push('schema_version_mismatch');
  }

  const ok = reasons.length === 0;
  return {
    ok,
    blocked: !ok,
    reasons,
    warnings,
    integrity,
    foreignKeyCheck: fk,
    schemaVersion,
    expectedSchemaVersion,
    schemaAheadOfApplication: schemaMismatch && schemaVersion > expectedSchemaVersion,
    messageAr: ok ? 'قاعدة البيانات سليمة وجاهزة' : buildMessageAr(reasons),
    assessedAt: new Date().toISOString(),
  };
}

function isWriteAllowed(health) {
  return !!(health && health.ok);
}

function assertWriteAllowed(health) {
  if (isWriteAllowed(health)) return { ok: true, health };
  return {
    ok: false,
    error: 'database_unhealthy',
    blocked: true,
    reasons: health?.reasons || ['database_unhealthy'],
    messageAr: health?.messageAr || buildMessageAr(health?.reasons),
    health,
  };
}

/**
 * Runtime gating policy. Orphan rows inherited from restores or legacy builds are
 * reported, not fatal — otherwise a single stale reference locks the clinic out of
 * every write and permanently blocks sync. Corruption and schema drift still block.
 */
const RUNTIME_HEALTH_OPTIONS = Object.freeze({ allowForeignKeyViolations: true });

module.exports = {
  REASON_MESSAGES_AR,
  RUNTIME_HEALTH_OPTIONS,
  assessHealth,
  isWriteAllowed,
  assertWriteAllowed,
  buildMessageAr,
};
