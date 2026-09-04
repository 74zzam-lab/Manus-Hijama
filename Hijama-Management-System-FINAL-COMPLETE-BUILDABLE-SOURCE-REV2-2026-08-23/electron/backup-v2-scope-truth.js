'use strict';

/**
 * Backup Scope Truth & DR Readiness — manifest metadata + org gate (PR3).
 * Fail-closed: organization backups require all licensed branches locally,
 * known revisions, zero pending outbox, zero open conflicts, integrity PASS.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { createDeviceCache } = require('./device-cache');

function backupCore() {
  return require('./backup-v2-core');
}

const SCOPE_BRANCH = 'branch';
const SCOPE_ORGANIZATION = 'organization';

function normalizeId(value) {
  return String(value || '').trim().slice(0, 128);
}

function uniqueIds(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list || []) {
    const id = normalizeId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function countAttachmentFiles(attachmentsDir) {
  const root = path.resolve(attachmentsDir || '');
  if (!root || !fs.existsSync(root)) return 0;
  let count = 0;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile()) count += 1;
    }
  }
  return count;
}

function readVersionsDoc(userDataDir, centerId) {
  if (!centerId) return null;
  try {
    const cache = createDeviceCache(userDataDir);
    const res = cache.readVersions(centerId);
    return res.ok ? res.data : null;
  } catch {
    return null;
  }
}

function listCachedBranchIds(userDataDir, centerId) {
  if (!centerId) return [];
  const cacheRoot = path.join(userDataDir, 'cache', centerId.replace(/[^a-zA-Z0-9._-]/g, '_'), 'branches');
  if (!fs.existsSync(cacheRoot)) return [];
  try {
    return fs.readdirSync(cacheRoot).filter((name) => {
      try {
        return fs.statSync(path.join(cacheRoot, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function collectSyncRevisionByBranch(versionsDoc, branchIds) {
  const out = {};
  const branches = versionsDoc?.branches && typeof versionsDoc.branches === 'object'
    ? versionsDoc.branches
    : {};
  for (const branchId of branchIds) {
    const entry = branches[branchId] || {};
    const dbRev = entry.databaseVersion != null
      ? Number(entry.databaseVersion)
      : (versionsDoc?.databaseVersion != null ? Number(versionsDoc.databaseVersion) : null);
    out[branchId] = {
      databaseVersion: Number.isFinite(dbRev) ? dbRev : null,
      settingsVersion: entry.settingsVersion != null ? Number(entry.settingsVersion) : null,
      updatedAt: entry.updatedAt || versionsDoc?.updatedAt || null,
    };
  }
  return out;
}

function collectDatabaseSignals(databasePath, userDataDir, options = {}) {
  const centerId = normalizeId(options.centerId || options.organizationId);
  const activeBranchId = normalizeId(options.branchId);
  const licensedBranchIds = uniqueIds(options.licensedBranchIds || []);
  const localFromOpts = uniqueIds(options.localBranchIds || []);
  const cachedBranchIds = listCachedBranchIds(userDataDir, centerId);
  const localBranchIdsPresent = uniqueIds([
    ...localFromOpts,
    ...cachedBranchIds,
    activeBranchId,
  ].filter(Boolean));

  const integrity = backupCore().databaseHealth(databasePath);
  const rowCountsResult = backupCore().countDatabaseRows(databasePath);
  const attachmentsCount = countAttachmentFiles(path.join(userDataDir, 'attachments'));

  let pendingOutbox = 0;
  let inflightOutbox = 0;
  let openConflicts = 0;
  let distinctOutboxBranches = [];

  let db;
  try {
    db = new Database(databasePath, { readonly: true, fileMustExist: true, timeout: 5000 });
    const pendingRow = db.prepare(
      `SELECT COUNT(*) AS c FROM sync_outbox WHERE status IN ('pending', 'inflight')`
    ).get();
    pendingOutbox = Number(pendingRow?.c || 0);
    const inflightRow = db.prepare(
      `SELECT COUNT(*) AS c FROM sync_outbox WHERE status = 'inflight'`
    ).get();
    inflightOutbox = Number(inflightRow?.c || 0);
    const conflictRow = db.prepare(
      `SELECT COUNT(*) AS c FROM sync_conflicts WHERE status = 'open'`
    ).get();
    openConflicts = Number(conflictRow?.c || 0);
    distinctOutboxBranches = db.prepare(
      `SELECT DISTINCT branch_id AS branchId FROM sync_outbox WHERE branch_id IS NOT NULL AND branch_id != ''`
    ).all().map((r) => normalizeId(r.branchId)).filter(Boolean);
  } catch {
    /* tables may be absent on empty DB — treat as zero */
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }

  const localWithOutbox = uniqueIds([...localBranchIdsPresent, ...distinctOutboxBranches]);
  const versionsDoc = readVersionsDoc(userDataDir, centerId);
  const revisionBranchIds = licensedBranchIds.length ? licensedBranchIds : localWithOutbox;
  const syncRevisionByBranch = collectSyncRevisionByBranch(versionsDoc, revisionBranchIds);

  return {
    centerId,
    activeBranchId,
    licensedBranchIds,
    localBranchIdsPresent: localWithOutbox,
    integrity,
    rowCounts: rowCountsResult.counts || {},
    rowCountsOk: rowCountsResult.ok !== false,
    attachmentsCount,
    pendingOutbox,
    inflightOutbox,
    openConflicts,
    syncRevisionByBranch,
    versionsDoc,
    schemaVersion: integrity?.schemaVersion ?? null,
  };
}

function assessOrganizationReadiness(signals, options = {}) {
  const reasons = [];
  const licensed = uniqueIds(options.licensedBranchIds || signals.licensedBranchIds || []);
  const localPresent = uniqueIds(signals.localBranchIdsPresent || []);
  const missingBranches = licensed.filter((id) => !localPresent.includes(id));

  if (!licensed.length) {
    reasons.push({ code: 'licensed_branches_unknown', message: 'لا توجد فروع مرخّصة معروفة محلياً' });
  }
  if (missingBranches.length) {
    reasons.push({
      code: 'branches_missing_locally',
      message: `فروع غير موجودة محلياً: ${missingBranches.join(', ')}`,
      missingBranches,
    });
  }

  if (!signals.integrity?.ok) {
    reasons.push({ code: 'integrity_failed', message: 'فحص سلامة SQLite لم ينجح' });
  }

  if (Number(signals.pendingOutbox) > 0) {
    reasons.push({
      code: 'pending_outbox',
      message: `Outbox معلّق: ${signals.pendingOutbox}`,
      count: signals.pendingOutbox,
    });
  }

  if (Number(signals.openConflicts) > 0) {
    reasons.push({
      code: 'blocking_conflicts',
      message: `تعارضات مفتوحة: ${signals.openConflicts}`,
      count: signals.openConflicts,
    });
  }

  for (const branchId of licensed) {
    const rev = signals.syncRevisionByBranch?.[branchId];
    if (!rev || rev.databaseVersion == null || !Number.isFinite(Number(rev.databaseVersion))) {
      reasons.push({
        code: 'revision_unknown',
        message: `مراجعة غير معروفة للفرع ${branchId}`,
        branchId,
      });
    }
  }

  const freshRequired = options.requireFreshRevisions !== false;
  if (freshRequired && licensed.length) {
    for (const branchId of licensed) {
      const rev = signals.syncRevisionByBranch?.[branchId];
      if (rev && Number(rev.databaseVersion) === 0 && localPresent.includes(branchId)) {
        reasons.push({
          code: 'revision_not_hydrated',
          message: `الفرع ${branchId} لم يُحدَّث بعد (databaseVersion=0)`,
          branchId,
        });
      }
    }
  }

  return {
    ok: reasons.length === 0,
    scopeType: SCOPE_ORGANIZATION,
    licensedBranchIds: licensed,
    localBranchIdsPresent: localPresent,
    missingBranches,
    pendingOutbox: signals.pendingOutbox,
    openConflicts: signals.openConflicts,
    integrityOk: !!signals.integrity?.ok,
    syncRevisionByBranch: signals.syncRevisionByBranch,
    reasons,
  };
}

function formatScopeLabelAr(scopeType, includedBranchIds, branchNames = {}) {
  const ids = uniqueIds(includedBranchIds);
  const labels = ids.map((id) => String(branchNames[id] || id).trim() || id);
  if (scopeType === SCOPE_ORGANIZATION) {
    return `نسخة مؤسسة: ${labels.join('، ') || '—'}`;
  }
  return `نسخة فرع: ${labels[0] || '—'}`;
}

function resolveBackupScope(requestedScopeType, signals, options = {}) {
  const requested = String(requestedScopeType || SCOPE_BRANCH).toLowerCase();
  const branchNames = options.branchNames && typeof options.branchNames === 'object'
    ? options.branchNames
    : {};
  const activeBranchId = normalizeId(options.branchId || signals.activeBranchId);
  const sourceDeviceId = normalizeId(options.sourceDeviceId || options.deviceId);
  const appVersion = String(options.appVersion || '0.0.0');
  const schemaVersion = signals.schemaVersion ?? options.schemaVersion ?? null;

  if (requested === SCOPE_ORGANIZATION) {
    const readiness = assessOrganizationReadiness(signals, options);
    if (!readiness.ok) {
      const err = new Error('org_backup_not_ready');
      err.code = 'org_backup_not_ready';
      err.details = readiness;
      throw err;
    }
    const includedBranchIds = readiness.licensedBranchIds.length
      ? readiness.licensedBranchIds
      : readiness.localBranchIdsPresent;
    return {
      scopeType: SCOPE_ORGANIZATION,
      classification: SCOPE_ORGANIZATION,
      includedBranchIds,
      sourceDeviceId,
      syncRevisionByBranch: readiness.syncRevisionByBranch,
      recordCounts: signals.rowCounts,
      attachmentsCount: signals.attachmentsCount,
      schemaVersion,
      appVersion,
      branchNames,
      scopeLabelAr: formatScopeLabelAr(SCOPE_ORGANIZATION, includedBranchIds, branchNames),
      readiness,
    };
  }

  const includedBranchIds = uniqueIds([
    activeBranchId,
    ...(options.branchIds || []),
  ]).filter(Boolean);
  const branchOnly = includedBranchIds.length ? [includedBranchIds[0]] : (activeBranchId ? [activeBranchId] : []);

  return {
    scopeType: SCOPE_BRANCH,
    classification: SCOPE_BRANCH,
    includedBranchIds: branchOnly,
    sourceDeviceId,
    syncRevisionByBranch: collectSyncRevisionByBranch(
      signals.versionsDoc,
      branchOnly.length ? branchOnly : includedBranchIds
    ),
    recordCounts: signals.rowCounts,
    attachmentsCount: signals.attachmentsCount,
    schemaVersion,
    appVersion,
    branchNames,
    scopeLabelAr: formatScopeLabelAr(SCOPE_BRANCH, branchOnly, branchNames),
    readiness: null,
  };
}

function applyScopeTruthToManifest(manifest, scopeTruth) {
  if (!manifest || !scopeTruth) return manifest;
  manifest.schemaVersion = scopeTruth.schemaVersion;
  manifest.appVersion = scopeTruth.appVersion;
  manifest.source = manifest.source || {};
  manifest.source.sourceDeviceId = scopeTruth.sourceDeviceId;
  manifest.source.deviceId = scopeTruth.sourceDeviceId || manifest.source.deviceId;

  manifest.scope = manifest.scope || {};
  manifest.scope.type = scopeTruth.scopeType;
  manifest.scope.classification = scopeTruth.classification;
  manifest.scope.includedBranchIds = scopeTruth.includedBranchIds.slice();
  manifest.scope.branchIds = scopeTruth.includedBranchIds.slice();
  manifest.scope.scopeLabelAr = scopeTruth.scopeLabelAr;

  manifest.scopeTruth = {
    classification: scopeTruth.classification,
    includedBranchIds: scopeTruth.includedBranchIds.slice(),
    sourceDeviceId: scopeTruth.sourceDeviceId,
    syncRevisionByBranch: scopeTruth.syncRevisionByBranch,
    recordCounts: scopeTruth.recordCounts,
    attachmentsCount: scopeTruth.attachmentsCount,
    schemaVersion: scopeTruth.schemaVersion,
    appVersion: scopeTruth.appVersion,
    scopeLabelAr: scopeTruth.scopeLabelAr,
    readiness: scopeTruth.readiness
      ? {
        ok: scopeTruth.readiness.ok,
        licensedBranchIds: scopeTruth.readiness.licensedBranchIds,
        localBranchIdsPresent: scopeTruth.readiness.localBranchIdsPresent,
        missingBranches: scopeTruth.readiness.missingBranches,
        pendingOutbox: scopeTruth.readiness.pendingOutbox,
        openConflicts: scopeTruth.readiness.openConflicts,
        integrityOk: scopeTruth.readiness.integrityOk,
        assessedAt: new Date().toISOString(),
      }
      : null,
  };
  return manifest;
}

function extractScopeSummaryFromManifest(manifest) {
  const truth = manifest?.scopeTruth || {};
  const scope = manifest?.scope || {};
  const includedBranchIds = uniqueIds(
    truth.includedBranchIds || scope.includedBranchIds || scope.branchIds || []
  );
  const classification = String(
    truth.classification || scope.classification || scope.type || SCOPE_BRANCH
  ).toLowerCase();
  return {
    classification,
    scopeType: classification,
    includedBranchIds,
    sourceDeviceId: truth.sourceDeviceId || manifest?.source?.sourceDeviceId || manifest?.source?.deviceId || '',
    syncRevisionByBranch: truth.syncRevisionByBranch || {},
    recordCounts: truth.recordCounts || {},
    attachmentsCount: truth.attachmentsCount ?? null,
    schemaVersion: truth.schemaVersion ?? manifest?.schemaVersion ?? manifest?.databaseSchemaVersion ?? null,
    appVersion: truth.appVersion ?? manifest?.appVersion ?? null,
    scopeLabelAr: truth.scopeLabelAr || scope.scopeLabelAr || formatScopeLabelAr(classification, includedBranchIds),
  };
}

function assessBackupReadiness(userDataDir, databasePath, options = {}) {
  const signals = collectDatabaseSignals(databasePath, userDataDir, options);
  const orgReadiness = assessOrganizationReadiness(signals, options);
  let branchScope;
  try {
    branchScope = resolveBackupScope(SCOPE_BRANCH, signals, options);
  } catch (err) {
    branchScope = { scopeType: SCOPE_BRANCH, scopeLabelAr: formatScopeLabelAr(SCOPE_BRANCH, [options.branchId], options.branchNames) };
  }
  return {
    signals,
    branch: {
      ready: !!signals.integrity?.ok && Number(signals.pendingOutbox) === 0 && Number(signals.openConflicts) === 0,
      scopeLabelAr: branchScope.scopeLabelAr,
      scopeType: SCOPE_BRANCH,
    },
    organization: orgReadiness,
    organizationAllowed: orgReadiness.ok,
  };
}

module.exports = {
  SCOPE_BRANCH,
  SCOPE_ORGANIZATION,
  normalizeId,
  countAttachmentFiles,
  collectDatabaseSignals,
  assessOrganizationReadiness,
  resolveBackupScope,
  applyScopeTruthToManifest,
  extractScopeSummaryFromManifest,
  formatScopeLabelAr,
  assessBackupReadiness,
  assertRestoreScopeTruthAllowed: require('./restore-v2-validation').assertRestoreScopeTruthAllowed,
};
