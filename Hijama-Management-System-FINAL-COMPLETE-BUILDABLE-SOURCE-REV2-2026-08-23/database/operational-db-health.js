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
function assessHealth(db, options = {}) {
  const maint = options.maintenance || dbMaintenance;
  const reasons = [];

  const integrity = maint.integrityCheck
    ? maint.integrityCheck(db)
    : integrityCheck(db);
  if (!integrity.ok) reasons.push('integrity_check_failed');

  const fk = maint.foreignKeyCheck ? maint.foreignKeyCheck(db) : { ok: true, violations: 0 };
  if (!fk.ok) reasons.push('foreign_key_violation');

  const schemaVersion = getSchemaVersion(db);
  const expectedSchemaVersion = options.expectedSchemaVersion != null
    ? Number(options.expectedSchemaVersion)
    : hybridSchema.CURRENT_SCHEMA_VERSION;
  if (Number.isFinite(expectedSchemaVersion) && schemaVersion !== expectedSchemaVersion) {
    reasons.push('schema_version_mismatch');
  }

  const ok = reasons.length === 0;
  return {
    ok,
    blocked: !ok,
    reasons,
    integrity,
    foreignKeyCheck: fk,
    schemaVersion,
    expectedSchemaVersion,
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

module.exports = {
  REASON_MESSAGES_AR,
  assessHealth,
  isWriteAllowed,
  assertWriteAllowed,
  buildMessageAr,
};
