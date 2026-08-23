/**
 * Cloud V2 Bootstrap — new device hydrate from Drive (architecture §22).
 */
(function (global) {
  'use strict';

  function getCenterId() {
    return global.ConfigLayer?.getCenterId?.()
      || global.CloudMeta?.loadMeta?.()?.centerId
      || global.LicenseCloud?.loadLocal?.()?.centerId
      || '';
  }

  function getBranchId(branchId) {
    return branchId
      || global.BranchScope?.getActiveBranchId?.()
      || global.DeviceConfig?.load?.()?.lockedBranchId
      || 'BR-MAIN';
  }

  function isBootstrapComplete() {
    const meta = global.CloudMeta?.loadMeta?.() || {};
    return !!meta.bootstrapCompletedAt;
  }

  function markBootstrapComplete(branchId) {
    const meta = global.CloudMeta?.loadMeta?.() || {};
    meta.bootstrapCompletedAt = new Date().toISOString();
    meta.bootstrapBranchId = branchId || getBranchId();
    global.CloudMeta?.saveMeta?.(meta);
    return meta;
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function licenseExpiryStatus(doc) {
    const raw = doc?.expiresAt || doc?.expiry || '';
    if (!raw) return { status: 'unknown', expired: false, expiresAt: '' };
    const ts = Date.parse(raw);
    if (Number.isNaN(ts)) return { status: 'unknown', expired: false, expiresAt: String(raw) };
    const expired = ts < Date.now();
    return { status: expired ? 'expired' : 'active', expired, expiresAt: String(raw) };
  }

  function classifyDrivePullError(err) {
    const msg = String(err?.message || err?.error || err || '');
    const code = String(err?.code || err?.status || err?.statusCode || '');
    const blob = (msg + ' ' + code).toLowerCase();
    // Network before 404 — "ENOTFOUND" must not match not.?found
    if (/offline|network|enotfound|econnreset|etimedout|fetch failed/.test(blob)) {
      return { error: 'offline', retry: true, offline: true };
    }
    if (/timeout|aborted/.test(blob)) {
      return { error: 'drive_timeout', retry: true };
    }
    if (/401|unauthorized|invalid_grant|token.*revoked|login_required/.test(blob)) {
      return { error: 'oauth_unauthorized', retry: false };
    }
    if (/403|forbidden|access_denied|insufficient.?permissions/.test(blob)) {
      return { error: 'drive_forbidden', retry: false };
    }
    if (/\b404\b|file not found|path not found|not_found/.test(blob)) {
      return { error: 'drive_not_found', retry: false };
    }
    if (/429|rate.?limit|quota.*user|userRateLimitExceeded|too many requests/.test(blob)) {
      return { error: 'drive_rate_limit', retry: true };
    }
    if (global.DriveErrors?.classify) {
      const c = global.DriveErrors.classify(err);
      if (c?.type === 'drive_quota') return { error: 'drive_quota', retry: false };
      if (c?.type === 'oauth_error') return { error: 'oauth_unauthorized', retry: false };
      if (c?.type === 'offline') return { error: 'offline', retry: true, offline: true };
    }
    return { error: msg || 'license_download_failed', retry: !!err?.retry };
  }

  /** Reject wrong Google account before any local persist. Does not mutate storage. */
  function assertGoogleMayPullLicense(doc) {
    const connected = normalizeEmail(
      global.LicenseIdentity?.getConnectedGoogleEmail?.()
      || global.settings?.backup?.providers?.google?.email
      || ''
    );
    const bound = normalizeEmail(doc?.ownerIdentity?.boundGoogleEmail);
    const authorized = normalizeEmail(doc?.ownerIdentity?.authorizedEmail);
    // Legacy licenses without identity: allow pull (Drive account already gates access).
    if (!bound && !authorized) return { ok: true, email: connected || null, skipped: true };
    if (!connected) return { ok: false, error: 'google_not_connected' };
    if (bound && bound !== connected) {
      return { ok: false, error: 'google_identity_transfer', expected: bound, actual: connected };
    }
    if (authorized && authorized !== connected) {
      return { ok: false, error: 'google_email_mismatch', expected: authorized, actual: connected };
    }
    return { ok: true, email: connected };
  }

  function summarizeLicenseCandidate(data, path, item) {
    const exp = licenseExpiryStatus(data);
    return {
      path: path || '',
      centerId: data?.centerId || '',
      centerName: data?.centerName || '',
      licenseId: data?.licenseId || data?.licenseUuid || '',
      expiresAt: exp.expiresAt,
      status: exp.status,
      expired: exp.expired,
      modifiedAt: item?.modifiedAt || data?.updatedAt || '',
      boundGoogleEmail: data?.ownerIdentity?.boundGoogleEmail || '',
      authorizedEmail: data?.ownerIdentity?.authorizedEmail || ''
    };
  }

  /**
   * Persist a verified Drive license locally. Never wipes Device ID / Branch / Owner / DB.
   * On identity / foreign-org rejection, leaves existing local license untouched.
   */
  async function persistPulledLicense(data, path, options) {
    options = options || {};
    if (!data) return { ok: false, error: 'no_doc' };

    const verify = await global.LicenseCloud?.verifyLicenseDoc?.(data);
    if (verify && verify.ok === false) return verify;

    const exp = licenseExpiryStatus(data);
    if (exp.expired && options.allowExpired !== true) {
      const hasLocal = !!global.LicenseCloud?.loadLocal?.();
      if (hasLocal) {
        return { ok: false, error: 'license_expired', expiresAt: exp.expiresAt, preservedLocal: true };
      }
      // No local license: still reject empty activation with clear error (no blank license).
      return { ok: false, error: 'license_expired', expiresAt: exp.expiresAt };
    }

    const idCheck = assertGoogleMayPullLicense(data);
    if (!idCheck.ok) return idCheck;

    const local = global.LicenseCloud?.loadLocal?.();
    if (local?.centerId && data.centerId && local.centerId !== data.centerId && !options.confirmForeignOrg) {
      return {
        ok: false,
        error: 'foreign_organization',
        needsConfirm: true,
        localCenterId: local.centerId,
        remoteCenterId: data.centerId,
        candidate: summarizeLicenseCandidate(data, path)
      };
    }

    global.LicenseCloud?.saveLocal?.(data);
    if (data?.centerId && global.CloudMeta) {
      const meta = global.CloudMeta.loadMeta() || {};
      meta.centerId = data.centerId;
      global.CloudMeta.saveMeta(meta);
    }
    return { ok: true, license: data, fromDrive: true, path: path || null };
  }

  async function downloadLicenseJsonAtPath(path) {
    if (!path) return { ok: false, error: 'no_path' };
    const bridge = global.BackupBridge;
    try {
      if (bridge?.downloadCloudBackup) {
        const dl = await bridge.downloadCloudBackup(path, 'google');
        if (!dl?.ok) {
          const mapped = classifyDrivePullError(dl || { error: 'license_download_failed' });
          return { ok: false, ...mapped, path };
        }
        try {
          const data = JSON.parse(dl.text || dl.payload || '');
          return { ok: true, data, path };
        } catch {
          return { ok: false, error: 'signature_missing', path };
        }
      }
      const dl = await global.DriveAdapter.downloadJson(path);
      if (!dl?.ok || !dl.data) {
        const mapped = classifyDrivePullError(dl || { error: 'license_download_failed' });
        return { ok: false, ...mapped, path };
      }
      return { ok: true, data: dl.data, path: dl.path || path };
    } catch (e) {
      const mapped = classifyDrivePullError(e);
      return { ok: false, ...mapped, path };
    }
  }

  async function fetchLicenseFromDrive(centerId, options) {
    options = options || {};
    centerId = centerId || getCenterId();
    if (!centerId) return { ok: false, error: 'no_center_id' };
    if (typeof global.DriveAdapter?.ensureConnected === 'function') {
      await global.DriveAdapter.ensureConnected().catch(() => false);
    }
    if (!global.DriveAdapter?.isConnected?.()) {
      return { ok: false, offline: true, error: 'drive_not_connected', retry: true };
    }

    const paths = global.LicenseCloud?.drivePath
      ? (global.DriveLayout?.licenseJsonCandidates?.(centerId) || [global.LicenseCloud.drivePath(centerId)])
      : [];
    let dl;
    try {
      dl = typeof global.DriveAdapter.downloadJsonFirst === 'function'
        ? await global.DriveAdapter.downloadJsonFirst(paths)
        : await global.DriveAdapter.downloadJson(paths[0]);
    } catch (e) {
      return { ok: false, ...classifyDrivePullError(e) };
    }
    if (!dl?.ok || !dl.data) {
      return { ok: false, ...classifyDrivePullError(dl || { error: 'license_download_failed' }) };
    }

    if (options.persist === false) {
      const verify = await global.LicenseCloud?.verifyLicenseDoc?.(dl.data);
      if (verify && verify.ok === false) return verify;
      return { ok: true, license: dl.data, fromDrive: true, path: dl.path || paths[0], persisted: false };
    }

    return persistPulledLicense(dl.data, dl.path || paths[0], options);
  }

  /**
   * List verified license.json files on Drive without persisting or auto-picking.
   * Safe for recovery UI multi-select. Does not mutate local license / Device ID / Branch / Owner.
   */
  async function listLicensesFromDrive() {
    if (typeof global.DriveAdapter?.ensureConnected === 'function') {
      await global.DriveAdapter.ensureConnected().catch(() => false);
    }
    if (!global.DriveAdapter?.isConnected?.()) {
      return { ok: false, error: 'drive_not_connected', retry: true, offline: true, candidates: [] };
    }

    const bridge = global.BackupBridge;
    if (!bridge?.listCloudBackups) {
      return { ok: false, error: 'list_unavailable', candidates: [] };
    }

    const roots = [
      global.DriveLayout?.ROOT || 'NajjarTech',
      'NajjarTech Hijama Management'
    ].filter((v, i, a) => v && a.indexOf(v) === i);

    let allItems = [];
    let listOk = false;
    let lastListErr = null;
    for (const root of roots) {
      let list;
      try {
        list = await bridge.listCloudBackups('google', root);
      } catch (e) {
        lastListErr = classifyDrivePullError(e).error;
        continue;
      }
      if (!list?.ok) {
        lastListErr = classifyDrivePullError(list || { error: 'list_failed' }).error;
        continue;
      }
      listOk = true;
      allItems = allItems.concat(list.items || []);
    }
    if (!listOk) {
      return { ok: false, error: lastListErr || 'list_failed', candidates: [], retry: true };
    }

    const fileHits = allItems.filter(it => {
      const p = String(it.path || '');
      const n = String(it.name || '');
      return n === 'license.json'
        || /\/License\/license\.json$/i.test(p)
        || (n === 'license.json' && /License/i.test(p));
    });
    fileHits.sort((a, b) => String(b.modifiedAt || '').localeCompare(String(a.modifiedAt || '')));

    const candidates = [];
    const rejected = [];
    for (const item of fileHits) {
      const path = item.path;
      if (!path) continue;
      const dl = await downloadLicenseJsonAtPath(path);
      if (!dl?.ok || !dl.data) {
        rejected.push({ path, error: dl?.error || 'download_failed' });
        continue;
      }
      const verify = await global.LicenseCloud?.verifyLicenseDoc?.(dl.data);
      if (verify && verify.ok === false) {
        rejected.push({ path, error: verify.error || 'signature_invalid' });
        continue;
      }
      candidates.push({
        ...summarizeLicenseCandidate(dl.data, path, item),
        data: dl.data
      });
    }

    return {
      ok: true,
      candidates,
      rejected,
      scanned: fileHits.length
    };
  }

  /**
   * Discover + optionally persist a Drive license.
   * options.path / options.centerId: select explicitly (no silent wrong-org pick).
   * Multiple distinct licenses → needsSelection (never auto-pick).
   * Failure never deletes local license, Device ID, Branch binding, Owner, or DB.
   */
  async function discoverAndFetchLicenseFromDrive(options) {
    options = options || {};

    if (typeof global.DriveAdapter?.ensureConnected === 'function') {
      await global.DriveAdapter.ensureConnected().catch(() => false);
    }
    if (!global.DriveAdapter?.isConnected?.()) {
      return { ok: false, error: 'drive_not_connected', retry: true, offline: true };
    }

    if (options.path) {
      const dl = await downloadLicenseJsonAtPath(options.path);
      if (!dl?.ok) return dl;
      if (options.persist === false) {
        const verify = await global.LicenseCloud?.verifyLicenseDoc?.(dl.data);
        if (verify && verify.ok === false) return verify;
        return { ok: true, license: dl.data, fromDrive: true, path: dl.path, persisted: false };
      }
      const persisted = await persistPulledLicense(dl.data, dl.path, options);
      if (persisted?.ok) return { ...persisted, discovered: true };
      return persisted;
    }

    const stored = options.centerId
      || global.CenterId?.getStoredCenterId?.()
      || getCenterId();
    if (stored && global.CenterId?.isValidCenterId?.(stored) && !options.forceList) {
      const direct = await fetchLicenseFromDrive(stored, { ...options, persist: options.persist !== false });
      if (direct?.ok) return direct;
      // Fall through to discovery when stored center has no remote license.
      if (!['no_center_id', 'drive_not_connected', 'oauth_unauthorized', 'drive_forbidden', 'drive_rate_limit', 'offline'].includes(direct?.error)) {
        // continue scan
      } else if (direct?.error && direct.error !== 'no_center_id') {
        return direct;
      }
    }

    const listed = await listLicensesFromDrive();
    if (!listed?.ok) return listed;

    let candidates = listed.candidates || [];
    if (options.centerId) {
      candidates = candidates.filter(c => c.centerId === options.centerId);
    }

    if (!candidates.length) {
      return {
        ok: false,
        error: 'no_license_on_drive',
        scanned: listed.scanned || 0,
        rejected: listed.rejected || []
      };
    }

    // Deduplicate by centerId+licenseId, keep newest path first (already sorted).
    const unique = [];
    const seen = new Set();
    for (const c of candidates) {
      const key = (c.centerId || '') + '|' + (c.licenseId || c.path || '');
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(c);
    }

    if (unique.length > 1 && !options.path && !options.centerId && options.autoSelect !== true) {
      return {
        ok: false,
        error: 'multiple_licenses',
        needsSelection: true,
        candidates: unique.map(({ data, ...summary }) => summary),
        scanned: listed.scanned
      };
    }

    const pick = unique[0];
    if (options.persist === false) {
      return { ok: true, license: pick.data, fromDrive: true, path: pick.path, discovered: true, persisted: false };
    }
    const persisted = await persistPulledLicense(pick.data, pick.path, options);
    if (persisted?.ok) return { ...persisted, discovered: true };
    return persisted;
  }

  async function downloadBranchConfiguration(branchId) {
    branchId = getBranchId(branchId);
    const files = global.ConfigLayer?.CONFIG_FILES || ['settings.json', 'prices.json', 'services.json', 'packages.json', 'users.json'];
    const results = [];
    for (const fileName of files) {
      try {
        const r = await global.SyncEngine?.pullConfigFile?.(branchId, fileName);
        results.push({ file: fileName, ok: !!r?.ok, skipped: !!r?.skipped });
      } catch (e) {
        results.push({ file: fileName, ok: false, error: e.message || String(e) });
      }
    }
    const okCount = results.filter(r => r.ok).length;
    return { ok: okCount > 0, branchId, results, downloaded: okCount };
  }

  async function downloadOperationalData(branchId) {
    branchId = getBranchId(branchId);
    if (typeof global.SyncEngine?.pullBranchDatabase === 'function') {
      return global.SyncEngine.pullBranchDatabase(branchId);
    }
    const tables = global.OperationalLayer?.OPERATIONAL_TABLES || [];
    const results = [];
    for (const table of tables) {
      try {
        const r = await global.SyncEngine?.pullOperationalTable?.(branchId, table);
        results.push({ table, ok: !!r?.ok });
      } catch (e) {
        results.push({ table, ok: false, error: e.message || String(e) });
      }
    }
    const okCount = results.filter(r => r.ok).length;
    return { ok: true, branchId, results, downloaded: okCount };
  }

  async function hydrateFromDrive(branchId, options) {
    options = options || {};
    branchId = getBranchId(branchId);
    const centerId = getCenterId();
    if (!centerId) return { ok: false, error: 'no_center_id' };
    if (!global.CloudMeta?.isCloudV2Enabled?.()) return { ok: false, skipped: true, reason: 'cloud_v2_disabled' };
    if (!global.DriveAdapter?.isConnected?.()) return { ok: false, offline: true };

    const guard = global.SyncGuard?.canBootstrap?.(options);
    if (guard && !guard.ok && !guard.skipped && !options.force) {
      return { ok: false, blocked: true, reason: guard.reason, analysis: guard.analysis };
    }

    let analysis = null;
    if (global.DataStateAnalyzer?.analyze && !options.skipAnalysis) {
      analysis = await global.DataStateAnalyzer.analyze({ branchId, dryRun: false });
      if (analysis.blocked || analysis.requiresUserDecision) {
        global.SyncGuard?.blockUnsafe?.(analysis);
        return {
          ok: false,
          blocked: true,
          state: analysis.state,
          requiresUserDecision: true,
          analysis,
          error: 'unsafe_data_state'
        };
      }
      if (!options.skipSafeAuto && analysis.allowedActions?.length) {
        const auto = await global.DataStateAnalyzer.executeSafeAuto(analysis, { branchId });
        if (auto.ok && auto.results?.some(r => r.action !== 'noop' && r.ok)) {
          if (options.markComplete !== false) markBootstrapComplete(branchId);
          return { ok: true, branchId, centerId, steps: [{ step: 'safe_auto', ...auto }], analysis };
        }
      }
    }

    // Mark restore busy so Owner create cannot race with hydrate.
    try { global.OwnerManagement?.setSystemBusy?.('restore'); } catch { /* empty */ }

    const out = { ok: true, branchId, centerId, steps: [], analysis };

    if (!global.LicenseCloud?.loadLocal?.()) {
      let lic = null;
      if (centerId) {
        lic = await fetchLicenseFromDrive(centerId);
      } else if (typeof discoverAndFetchLicenseFromDrive === 'function') {
        lic = await discoverAndFetchLicenseFromDrive();
      } else {
        lic = { ok: false, error: 'no_center_id' };
      }
      out.steps.push({ step: 'license', ...lic });
      if (!lic?.ok && !options.allowMissingLicense) return { ...out, ok: false, error: lic?.error || 'license_failed' };
    } else {
      out.steps.push({ step: 'license', ok: true, cached: true });
    }

    const versionsRes = await global.DriveAdapter.downloadVersions(centerId, branchId);
    if (versionsRes?.ok && versionsRes.data) {
      const applied = await global.SyncEngine?.applyRemoteVersions?.(versionsRes.data, { branchId });
      out.steps.push({ step: 'versions', ok: !!applied?.ok, pulled: applied?.pulled?.length || 0 });
      if (applied?.ok && (applied.pulled?.length || 0) > 0) {
        await global.DeviceCache?.snapshotFromLocal?.(branchId).catch(() => {});
        if (options.markComplete !== false) markBootstrapComplete(branchId);
        return out;
      }
    }

    const cfg = await downloadBranchConfiguration(branchId);
    out.steps.push({ step: 'config', ...cfg });

    const ops = await downloadOperationalData(branchId);
    out.steps.push({ step: 'operational', ...ops });

    if (versionsRes?.ok && versionsRes.data) {
      global.VersionsIndex?.saveLocal?.({
        ...(global.VersionsIndex?.loadLocal?.(centerId) || {}),
        ...versionsRes.data,
        centerId
      });
    }

    await global.DeviceCache?.snapshotFromLocal?.(branchId).catch(() => {});

    if (options.markComplete !== false) markBootstrapComplete(branchId);

    try {
      const hydrating = await global.SyncBaseline?.markHydrating?.({
        organizationResolved: !!centerId,
        branchResolved: !!branchId,
      });
      if (hydrating?.ok === false) throw new Error(hydrating.error || 'sync_lifecycle_commit_failed');
      const remoteRev = Number(
        versionsRes?.data?.branches?.[branchId]?.databaseVersion
        || versionsRes?.data?.databaseVersion
        || 0
      );
      const health = global.OperationalDbHealth?.isOperationalAllowed?.();
      const integrityPass = health?.ok !== false;
      if (integrityPass) {
        const baseline = await global.SyncBaseline?.markBaselineKnown?.({
          branchId,
          remoteRevision: remoteRev,
          integrityPass: true,
          organizationResolved: !!centerId,
          branchResolved: !!branchId,
          operationId: options.operationId || null,
        });
        if (baseline?.ok === false) throw new Error(baseline.error || baseline.code || 'baseline_commit_failed');
        const ready = await global.SyncBaseline?.markReady?.({ operationId: options.operationId || null });
        if (ready?.ok === false) throw new Error(ready.error || ready.code || 'sync_ready_commit_failed');
      }
    } catch { /* fail closed — push remains blocked */ }

    global.AuditLogger?.logSyncEvent?.('BOOTSTRAP', {
      summary: `Bootstrap hydrate — فرع ${branchId}`,
      branchId,
      steps: out.steps?.length || 0
    });

    if (typeof global.AuditLogger?.log === 'function' && !global.AuditLogger.logSyncEvent) {
      global.AuditLogger.log({
        action: 'SETTINGS_CHANGED',
        entity: 'bootstrap',
        entityId: branchId,
        summary: `Bootstrap hydrate — فرع ${branchId}`
      });
    }

    // V2-5.9: restore must not open Owner Bootstrap for Google/activation users.
    // Clear restore busy; Owner account is a normal seeded user (support/migration only).
    try {
      if (typeof setTimeout === 'function') {
        setTimeout(() => {
          try { global.OwnerManagement?.clearSystemBusy?.('restore'); } catch { /* empty */ }
        }, 0);
      } else {
        try { global.OwnerManagement?.clearSystemBusy?.('restore'); } catch { /* empty */ }
      }
    } catch { /* empty */ }

    return out;
  }

  async function runNewDeviceBootstrap(options) {
    options = options || {};
    if (!global.CloudMeta?.isCloudV2Enabled?.()) return { ok: false, skipped: true, reason: 'cloud_v2_disabled' };

    const branchId = getBranchId(options.branchId);
    global.BranchScope?.setActiveBranchId?.(branchId);

    const result = await hydrateFromDrive(branchId, {
      markComplete: options.markComplete !== false,
      allowMissingLicense: options.allowMissingLicense,
      skipAnalysis: options.skipAnalysis,
      skipSafeAuto: options.skipSafeAuto,
      force: options.force
    });

    if (result?.blocked) return result;

    if (result?.ok && global.SyncEngine?.start && options.startSync !== false) {
      global.SyncGuard?.resume?.(result.analysis);
      global.SyncEngine.start({ pollIntervalMs: global.SyncState?.load?.()?.pollIntervalMs });
    }

    return result;
  }

  function getStatus() {
    const meta = global.CloudMeta?.loadMeta?.() || {};
    return {
      complete: !!meta.bootstrapCompletedAt,
      completedAt: meta.bootstrapCompletedAt || null,
      branchId: meta.bootstrapBranchId || null,
      centerId: getCenterId(),
      cloudV2: !!global.CloudMeta?.isCloudV2Enabled?.(),
      driveConnected: !!global.DriveAdapter?.isConnected?.()
    };
  }

  global.CloudBootstrap = {
    fetchLicenseFromDrive,
    discoverAndFetchLicenseFromDrive,
    listLicensesFromDrive,
    persistPulledLicense,
    downloadLicenseJsonAtPath,
    assertGoogleMayPullLicense,
    classifyDrivePullError,
    downloadBranchConfiguration,
    downloadOperationalData,
    hydrateFromDrive,
    runNewDeviceBootstrap,
    isBootstrapComplete,
    markBootstrapComplete,
    getStatus
  };
})(typeof window !== 'undefined' ? window : globalThis);
