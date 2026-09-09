'use strict';

/**
 * Operational readiness — aggregate DB health + migration/sqlite gates for save/sync.
 */
const operationalDbHealth = require('./operational-db-health');

const BLOCKER_MESSAGES_AR = {
  database_unhealthy: 'قاعدة البيانات غير صالحة',
  integrity_check_failed: 'فشل فحص سلامة قاعدة البيانات',
  foreign_key_violation: 'انتهاك قيود الارتباط',
  schema_version_mismatch: 'إصدار مخطط غير متوقع',
  legacy_branch_migration_required: 'يلزم إكمال ترحيل الفروع',
  sqlite_primary_required: 'SQLite غير جاهز كمصدر معتمد',
  migration_pending: 'ترحيل بيانات معلّق',
  migration_in_progress: 'ترحيل قيد التنفيذ',
  migration_failed: 'فشل ترحيل سابق',
  owner_corrupted: 'حالة المالك تالفة',
};

function buildBlockerMessageAr(blockers) {
  const labels = (blockers || []).map((b) => BLOCKER_MESSAGES_AR[b] || b);
  return labels.length
    ? `التشغيل غير جاهز — ${labels.join('؛ ')}`
    : 'التشغيل غير جاهز';
}

/**
 * @param {object} ctx
 * @param {object} [ctx.health] - operationalHealth assessment
 * @param {boolean} [ctx.legacyBranchMigrationBlocked]
 * @param {boolean} [ctx.sqlitePrimary]
 * @param {boolean} [ctx.sqlitePrimaryRequired]
 * @param {boolean} [ctx.migrationPending]
 * @param {boolean} [ctx.migrationInProgress]
 * @param {boolean} [ctx.migrationFailed]
 * @param {boolean} [ctx.ownerCorrupted]
 */
function assessOperationalReadiness(ctx = {}) {
  const blockers = [];

  const health = ctx.health || ctx.operationalHealth;
  if (health && health.ok === false) {
    for (const reason of health.reasons || []) {
      blockers.push(reason);
    }
    if (!health.reasons?.length) blockers.push('database_unhealthy');
  }

  if (ctx.ownerCorrupted) {
    blockers.push('owner_corrupted');
  }

  if (ctx.migrationInProgress) {
    blockers.push('migration_in_progress');
  } else if (ctx.migrationFailed) {
    blockers.push('migration_failed');
  } else if (ctx.migrationPending) {
    blockers.push('migration_pending');
  }

  if (ctx.legacyBranchMigrationBlocked) {
    blockers.push('legacy_branch_migration_required');
  }

  if (ctx.sqlitePrimaryRequired && !ctx.sqlitePrimary) {
    blockers.push('sqlite_primary_required');
  }

  const uniqueBlockers = [...new Set(blockers)];
  const ok = uniqueBlockers.length === 0;

  return {
    ok,
    operational: ok,
    canWrite: ok,
    blockers: uniqueBlockers,
    messageAr: ok
      ? 'التشغيل جاهز — قاعدة البيانات والمتطلبات الأساسية سليمة'
      : (health?.messageAr && !ok ? health.messageAr : buildBlockerMessageAr(uniqueBlockers)),
    health: health || null,
    sqlitePrimary: ctx.sqlitePrimary,
    legacyBranchMigrationBlocked: !!ctx.legacyBranchMigrationBlocked,
    migrationPending: !!ctx.migrationPending,
    migrationInProgress: !!ctx.migrationInProgress,
    migrationFailed: !!ctx.migrationFailed,
    ownerCorrupted: !!ctx.ownerCorrupted,
    assessedAt: new Date().toISOString(),
  };
}

function assertOperationalReady(ctx) {
  const readiness = assessOperationalReadiness(ctx);
  if (readiness.ok) return { ok: true, readiness };
  return {
    ok: false,
    error: readiness.blockers[0] || 'operational_not_ready',
    blocked: true,
    readiness,
    messageAr: readiness.messageAr,
  };
}

module.exports = {
  BLOCKER_MESSAGES_AR,
  assessOperationalReadiness,
  assertOperationalReady,
  buildBlockerMessageAr,
};
