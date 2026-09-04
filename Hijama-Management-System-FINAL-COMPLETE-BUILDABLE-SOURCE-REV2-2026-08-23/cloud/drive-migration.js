/**
 * Drive branch folder migration — legacy Configuration/branches/{branchId}/ → Branches/{branchName}/
 */
(function (global) {
  'use strict';

  const LEGACY_CONFIG_RE = /\/Configuration\/branches\/([^/]+)\/([^/]+\.json)$/i;
  const LEGACY_OPS_RE = /\/Operational\/branches\/([^/]+)\/([^/]+\.json)$/i;

  function getCenterId() {
    return global.ConfigLayer?.getCenterId?.()
      || global.CloudMeta?.loadMeta?.()?.centerId
      || global.LicenseCloud?.loadLocal?.()?.centerId
      || '';
  }

  function parseLegacyPath(remotePath) {
    const path = String(remotePath || '');
    let m = path.match(LEGACY_CONFIG_RE);
    if (m) {
      return { layer: 'config', branchId: m[1], fileName: m[2] };
    }
    m = path.match(LEGACY_OPS_RE);
    if (m) {
      return { layer: 'operational', branchId: m[1], fileName: m[2] };
    }
    return null;
  }

  function branchMapFromLicense(license) {
    const map = {};
    (license?.branches || []).forEach(b => {
      if (b && b.id) map[b.id] = b;
    });
    return map;
  }

  function targetPath(centerId, parsed, branch) {
    const branchName = branch?.name || parsed.branchId;
    if (parsed.layer === 'config') {
      return global.DriveLayout?.configBranchFile?.(centerId, parsed.branchId, parsed.fileName, branchName) || '';
    }
    const table = parsed.fileName.replace(/\.json$/i, '');
    return global.DriveLayout?.operationalBranchFile?.(centerId, parsed.branchId, table, branchName) || '';
  }

  async function listCenterDriveFiles(centerId) {
    const bridge = global.BackupBridge;
    const roots = global.DrivePathResolver?.allCenterRoots?.(centerId)
      || global.DriveLayout?.centerRootCandidates?.(centerId) || [];
    if (!bridge?.listCloudBackups) {
      return { ok: false, error: 'list_unavailable', items: [] };
    }
    if (!global.DriveAdapter?.isConnected?.()) {
      return { ok: false, offline: true, items: [] };
    }
    const scanRoots = [...new Set(roots.filter(Boolean))];
    const items = [];
    for (const root of scanRoots) {
      const list = await bridge.listCloudBackups('google', root);
      if (list?.items?.length) items.push(...list.items);
    }
    return { ok: true, items };
  }

  function buildPlan(centerId, items, license) {
    centerId = centerId || getCenterId();
    const bmap = branchMapFromLicense(license || global.LicenseCloud?.loadLocal?.());
    const plan = [];
    const orphans = new Set();
    const byBranch = {};

    for (const item of items || []) {
      const parsed = parseLegacyPath(item.path);
      if (!parsed) continue;
      const branch = bmap[parsed.branchId];
      if (!branch) {
        orphans.add(parsed.branchId);
        continue;
      }
      const newPath = targetPath(centerId, parsed, branch);
      if (!newPath || newPath === item.path) continue;
      const entry = {
        legacyPath: item.path,
        newPath,
        branchId: parsed.branchId,
        branchName: branch.name || parsed.branchId,
        layer: parsed.layer,
        fileName: parsed.fileName,
        modifiedAt: item.modifiedAt || null
      };
      plan.push(entry);
      if (!byBranch[parsed.branchId]) {
        byBranch[parsed.branchId] = { branchId: parsed.branchId, branchName: entry.branchName, files: 0 };
      }
      byBranch[parsed.branchId].files++;
    }

    return {
      centerId,
      plan,
      orphans: [...orphans],
      byBranch: Object.values(byBranch),
      total: plan.length
    };
  }

  async function preview(options) {
    options = options || {};
    const centerId = options.centerId || getCenterId();
    if (!centerId) return { ok: false, error: 'no_center_id' };
    const list = await listCenterDriveFiles(centerId);
    if (!list?.ok) return list;
    const built = buildPlan(centerId, list.items, options.license);
    return { ok: true, ...built, driveConnected: true };
  }

  function saveMigrationMeta(patch) {
    const meta = global.CloudMeta?.loadMeta?.() || {};
    meta.driveBranchMigration = {
      ...(meta.driveBranchMigration || {}),
      ...patch,
      lastRunAt: new Date().toISOString()
    };
    global.CloudMeta?.saveMeta?.(meta);
    return meta.driveBranchMigration;
  }

  function getStatus() {
    return global.CloudMeta?.loadMeta?.()?.driveBranchMigration || null;
  }

  async function run(options) {
    options = options || {};
    if (!global.CloudMeta?.isCloudV2Enabled?.()) {
      return { ok: false, error: 'cloud_v2_disabled' };
    }
    if (!global.DriveAdapter?.isConnected?.()) {
      return { ok: false, offline: true };
    }

    const centerId = options.centerId || getCenterId();
    if (!centerId) return { ok: false, error: 'no_center_id' };

    const license = options.license || global.LicenseCloud?.loadLocal?.();
    if (!license?.branches?.length) {
      return { ok: false, error: 'no_branches_in_license' };
    }

    const previewRes = await preview({ centerId, license });
    if (!previewRes?.ok) return previewRes;

    const plan = previewRes.plan || [];
    if (!plan.length) {
      saveMigrationMeta({ completedAt: new Date().toISOString(), migrated: 0, skipped: 0, failed: 0, orphans: previewRes.orphans || [] });
      return { ok: true, migrated: 0, skipped: 0, failed: 0, orphans: previewRes.orphans || [], message: 'nothing_to_migrate' };
    }

    let migrated = 0;
    let skipped = 0;
    let failed = 0;
    const results = [];

    for (const entry of plan) {
      if (!options.force) {
        const exists = await global.DriveAdapter.downloadJson(entry.newPath);
        if (exists?.ok && exists.data != null) {
          skipped++;
          results.push({ ...entry, action: 'skipped', reason: 'new_path_exists' });
          continue;
        }
      }

      const dl = await global.DriveAdapter.downloadJson(entry.legacyPath);
      if (!dl?.ok || dl.data == null) {
        failed++;
        results.push({ ...entry, action: 'failed', error: dl?.error || dl?.message || 'download_failed' });
        continue;
      }

      if (Array.isArray(dl.data?.records)) {
        const bad = dl.data.records.filter(r => r && r.branchId && r.branchId !== entry.branchId);
        if (bad.length) {
          results.push({ ...entry, action: 'warn', warning: 'branchId_mismatch', count: bad.length });
        }
      }

      const up = await global.DriveAdapter.uploadJson(entry.newPath, dl.data, { overwrite: true });
      if (!up?.ok) {
        failed++;
        results.push({ ...entry, action: 'failed', error: up?.error || up?.message || 'upload_failed' });
        continue;
      }

      migrated++;
      results.push({ ...entry, action: 'migrated' });
    }

    const migrationMeta = saveMigrationMeta({
      completedAt: failed === 0 ? new Date().toISOString() : null,
      migrated,
      skipped,
      failed,
      orphans: previewRes.orphans || [],
      centerId
    });

    if (typeof global.AuditLogger?.log === 'function') {
      global.AuditLogger.log({
        action: 'SETTINGS_CHANGED',
        entity: 'drive_migration',
        entityId: centerId,
        summary: `Drive branch migration — ${migrated} migrated, ${skipped} skipped, ${failed} failed`
      });
      global.AuditLogger.flushToDrive?.().catch(() => {});
    }

    return {
      ok: failed === 0,
      migrated,
      skipped,
      failed,
      orphans: previewRes.orphans || [],
      byBranch: previewRes.byBranch || [],
      results,
      meta: migrationMeta
    };
  }

  global.DriveBranchMigration = {
    parseLegacyPath,
    buildPlan,
    preview,
    run,
    getStatus,
    listCenterDriveFiles
  };
})(typeof window !== 'undefined' ? window : globalThis);
