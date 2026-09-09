/**
 * V2-5.9 Explicit Legacy Branch Migration — NO silent missing→BR-MAIN in multi-branch orgs.
 */
(function (global) {
  'use strict';

  const MARKER_KEY = '__tdw_legacy_branch_migration__';
  const REPORT_KEY = '__tdw_legacy_branch_report__';
  const OPERATIONAL = ['clientsRegistry', 'cases', 'bookings', 'expenses', 'attendance', 'doctors'];

  function loadMarker() {
    try { return global.DB?.get?.(MARKER_KEY, null) || null; } catch { return null; }
  }

  function saveMarker(m) {
    try { global.DB?.set?.(MARKER_KEY, m); } catch { /* empty */ }
    return m;
  }

  function enrolledBranchCount(doc) {
    doc = doc || global.LicenseCloud?.loadLocal?.() || {};
    return (doc.branches || []).filter((b) => b && b.active !== false && !b.pending).length;
  }

  function isMultiBranch() {
    return enrolledBranchCount() > 1;
  }

  function scanLegacy(records) {
    if (!Array.isArray(records)) return { total: 0, legacy: [], withBranch: 0 };
    const legacy = [];
    let withBranch = 0;
    for (const r of records) {
      if (!r || typeof r !== 'object') continue;
      if (r.branchId == null || r.branchId === '') legacy.push(r);
      else withBranch += 1;
    }
    return { total: legacy.length + withBranch, legacy, withBranch };
  }

  function detectLegacyRecords() {
    const byEntity = {};
    let legacyTotal = 0;
    for (const table of OPERATIONAL) {
      const rows = global[table]
        || (typeof global.DB?.get === 'function' ? global.DB.get(table, []) : [])
        || [];
      const scan = scanLegacy(Array.isArray(rows) ? rows : []);
      byEntity[table] = {
        total: scan.total,
        legacyCount: scan.legacy.length,
        withBranch: scan.withBranch,
        sampleIds: scan.legacy.slice(0, 5).map((r) => r.id || r.key || null),
      };
      legacyTotal += scan.legacy.length;
    }
    const report = {
      at: new Date().toISOString(),
      centerId: global.CenterId?.getStoredCenterId?.() || global.LicenseCloud?.loadLocal?.()?.centerId || null,
      multiBranch: isMultiBranch(),
      enrolledBranches: enrolledBranchCount(),
      legacyTotal,
      byEntity,
      historicalDeviceBranch: global.DeviceConfig?.getLockedBranchId?.() || null,
    };
    try { global.DB?.set?.(REPORT_KEY, report); } catch { /* empty */ }
    return report;
  }

  function isMigrationComplete() {
    const m = loadMarker();
    return !!(m && m.completed === true && m.markerVersion >= 1);
  }

  function needsMigration() {
    if (isMigrationComplete()) return false;
    const report = detectLegacyRecords();
    return report.legacyTotal > 0;
  }

  /** Blocks sync push / operational cloud upload until migration done when legacy rows exist. */
  function isPushBlocked() {
    if (isMigrationComplete()) return false;
    const report = detectLegacyRecords();
    if (report.legacyTotal === 0) return false;
    // Single-branch: still blocked until explicit migrate (or confirm BR-MAIN mapping).
    return true;
  }

  /**
   * Treat missing branchId as BR-MAIN ONLY when:
   * - migration completed with defaultMapping BR-MAIN, OR
   * - single-branch org AND no legacy pending (already migrated / none)
   * Never silently in multi-branch before mapping.
   */
  function resolveLegacyBranchId(record) {
    if (record && record.branchId) return record.branchId;
    const m = loadMarker();
    if (m?.completed && m.defaultMapping) return m.defaultMapping;
    if (!isMultiBranch() && isMigrationComplete()) return 'BR-MAIN';
    if (!isMultiBranch() && !needsMigration()) return 'BR-MAIN';
    return null; // unresolved — caller must exclude from write/view or force migration UI
  }

  async function createMandatoryBackup() {
    if (global.RestoreReconciliation?.createMandatoryPreRestoreSnapshot) {
      return global.RestoreReconciliation.createMandatoryPreRestoreSnapshot({});
    }
    if (typeof global.runBackupNow === 'function') {
      try {
        await global.runBackupNow('pre-legacy-migration');
        return { ok: true, type: 'legacy_backup' };
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    }
    return { ok: false, error: 'backup_unavailable' };
  }

  /**
   * @param {{ mapping: Record<string,string>|string, allowSingleBranchDefault?: boolean }} options
   * mapping: table→branchId or single branchId string applied to all legacy rows
   */
  async function runMigration(options) {
    options = options || {};
    const report = detectLegacyRecords();
    if (report.legacyTotal === 0) {
      const marker = saveMarker({
        completed: true,
        markerVersion: 1,
        at: new Date().toISOString(),
        defaultMapping: 'BR-MAIN',
        skipped: true,
        reason: 'no_legacy_rows',
      });
      return { ok: true, skipped: true, marker, report };
    }

    let mappingBranch = null;
    if (typeof options.mapping === 'string') mappingBranch = options.mapping;
    else if (options.mapping && typeof options.mapping === 'object' && options.mapping['*']) {
      mappingBranch = options.mapping['*'];
    }

    if (isMultiBranch() && !mappingBranch) {
      return {
        ok: false,
        error: 'mapping_required',
        report,
        message: 'مؤسسة متعددة الفروع — اختر فرع Mapping صراحة قبل الترحيل',
      };
    }
    if (!mappingBranch) {
      if (options.allowSingleBranchDefault === true || !isMultiBranch()) {
        mappingBranch = 'BR-MAIN';
      } else {
        return { ok: false, error: 'mapping_required', report };
      }
    }

    const backup = await createMandatoryBackup();
    if (!backup?.ok && !backup?.skipped) {
      return { ok: false, error: 'pre_migration_backup_required', backup };
    }

    const countsBefore = {};
    const countsAfter = {};
    for (const table of OPERATIONAL) {
      const rows = (global[table] || global.DB?.get?.(table, []) || []).slice();
      countsBefore[table] = rows.length;
      let changed = 0;
      for (const r of rows) {
        if (!r || typeof r !== 'object') continue;
        if (r.branchId == null || r.branchId === '') {
          r.branchId = mappingBranch;
          r._legacyBranchMigratedAt = new Date().toISOString();
          changed += 1;
        }
      }
      if (changed) {
        if (global.SqliteBridge?.setAuthoritative) {
          const res = await global.SqliteBridge.setAuthoritative(table, rows);
          if (!res?.ok) return { ok: false, error: 'migrate_commit_failed', table, detail: res };
        } else if (global.DB?.setAuthoritative) {
          const res = await global.DB.setAuthoritative(table, rows);
          if (!res?.ok) return { ok: false, error: 'migrate_commit_failed', table, detail: res };
        } else {
          global[table] = rows;
          global.DB?.set?.(table, rows);
        }
        if (global[table]) global[table] = rows;
      }
      countsAfter[table] = (global[table] || rows).length;
      if (countsAfter[table] !== countsBefore[table]) {
        return { ok: false, error: 'count_mismatch', table, countsBefore, countsAfter };
      }
    }

    const marker = saveMarker({
      completed: true,
      markerVersion: 1,
      at: new Date().toISOString(),
      defaultMapping: mappingBranch,
      backup: backup.path || backup.type || null,
      countsBefore,
      countsAfter,
      legacyTotal: report.legacyTotal,
      multiBranch: report.multiBranch,
    });

    global.AuditLogger?.log?.({
      action: 'LEGACY_BRANCH_MIGRATION',
      entity: 'branch',
      entityId: mappingBranch,
      summary: `Migrated ${report.legacyTotal} legacy rows → ${mappingBranch}`,
    });

    return { ok: true, marker, report, mappingBranch };
  }

  function assertOperationalAllowed(actionLabel) {
    if (!needsMigration()) return { ok: true };
    if (isMultiBranch()) {
      return {
        ok: false,
        error: 'legacy_branch_migration_required',
        readOnly: true,
        message: 'سجلات بلا branchId — أكمل ترحيل Mapping قبل التشغيل/الرفع',
        actionLabel,
      };
    }
    // Single-branch still requires explicit run (not silent).
    return {
      ok: false,
      error: 'legacy_branch_migration_required',
      suggestDefault: 'BR-MAIN',
      message: 'يوجد سجلات قديمة بلا فرع — أكّد الترحيل إلى BR-MAIN',
      actionLabel,
    };
  }

  global.LegacyBranchMigration = {
    MARKER_KEY,
    REPORT_KEY,
    OPERATIONAL,
    loadMarker,
    detectLegacyRecords,
    needsMigration,
    isMigrationComplete,
    isPushBlocked,
    resolveLegacyBranchId,
    runMigration,
    createMandatoryBackup,
    assertOperationalAllowed,
    isMultiBranch,
  };
})(typeof window !== 'undefined' ? window : globalThis);
