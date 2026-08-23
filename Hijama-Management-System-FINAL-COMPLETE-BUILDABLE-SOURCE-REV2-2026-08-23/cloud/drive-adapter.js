/**
 * Google Drive adapter — V2 path upload/download (Cloud V2 Sprint 4).
 */
(function (global) {
  'use strict';

  const GOOGLE_AUTHORITY_KEY = '__tdw_google_authority_status__';
  const AUTHORITY_MAX_AGE_MS = 120000;
  let inMemoryAuthoritySnapshot = null;

  function getBridge() {
    return global.BackupBridge || null;
  }

  function isBootstrapPhase() {
    const w = global.DB?.get?.('__tdw_boot_wizard__', null);
    if (w && w.syncDone === true) return false;
    return true;
  }

  /** PR38-compatible settings cache check — used as fallback after live refresh. */
  function isConnectedFromSettings() {
    const s = global.settings?.backup;
    if (!s) return false;
    const prov = s?.cloudProvider || 'google';
    const p = s?.providers?.[prov] || s?.providers?.google;
    if (!p || p.userDisconnected) return false;
    if (p.connected && p.oauth !== false) return true;
    return !!(s.cloudEnabled && p.connected);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function authoritySnapshot(options) {
    options = options || {};
    const maxAgeMs = Number(options.maxAgeMs || AUTHORITY_MAX_AGE_MS);
    const snap = global.DB?.get?.(GOOGLE_AUTHORITY_KEY, null) || inMemoryAuthoritySnapshot || null;
    if (!snap || snap.provider !== 'google' || !snap.checkedAt) {
      return { connected: false, verified: false, stale: true, reason: 'google_status_unverified' };
    }
    const ageMs = Math.max(0, Date.now() - new Date(snap.checkedAt).getTime());
    const stale = !Number.isFinite(ageMs) || ageMs > maxAgeMs;
    return {
      ...snap,
      connected: !!snap.connected && !snap.needsReauth && !stale,
      verified: !!snap.verified && !stale,
      stale,
      ageMs
    };
  }

  function persistAuthorityStatus(raw, source) {
    const live = raw || {};
    const settings = global.settings || global.DB?.get?.('settings', {}) || {};
    settings.backup = settings.backup || {};
    settings.backup.providers = settings.backup.providers || {};
    const prior = settings.backup.providers.google || {};
    const userDisconnected = !!prior.userDisconnected;
    const connected = !userDisconnected && !!live.connected && !live.needsReauth;
    const snapshot = {
      provider: 'google',
      connected,
      needsReauth: !!live.needsReauth || !connected,
      email: connected ? (live.email || prior.email || '') : '',
      oauth: live.oauth !== false && connected,
      hasRefreshToken: !!live.hasRefreshToken,
      verified: source === 'main_status',
      checkedAt: nowIso(),
      source: source || 'unknown',
      error: live.error || null
    };
    settings.backup.providers.google = {
      ...prior,
      connected: snapshot.connected,
      email: snapshot.email,
      oauth: snapshot.oauth,
      hasRefreshToken: snapshot.hasRefreshToken,
      userDisconnected,
      lastAuthoritativeCheckAt: snapshot.checkedAt,
      lastAuthoritativeStatus: snapshot.connected ? 'connected' : (snapshot.needsReauth ? 'needs_reauth' : 'disconnected')
    };
    settings.backup.cloudProvider = 'google';
    settings.backup.cloudEnabled = snapshot.connected;
    global.settings = settings;
    global.DB?.set?.('settings', settings);
    inMemoryAuthoritySnapshot = snapshot;
    global.DB?.set?.(GOOGLE_AUTHORITY_KEY, snapshot);
    return snapshot;
  }

  async function refreshAuthoritativeConnection() {
    const bridge = getBridge();
    const settings = global.settings || global.DB?.get?.('settings', {}) || {};
    const prior = settings?.backup?.providers?.google || {};
    if (prior.userDisconnected) {
      return persistAuthorityStatus({ connected: false, needsReauth: false, email: '' }, 'user_disconnect');
    }
    if (!bridge?.isElectron?.() || !bridge.getCloudStatus) {
      return persistAuthorityStatus({ connected: false, needsReauth: true, error: 'main_status_unavailable' }, 'unavailable');
    }
    try {
      const live = await bridge.getCloudStatus('google');
      return persistAuthorityStatus(live, 'main_status');
    } catch (error) {
      return persistAuthorityStatus({ connected: false, needsReauth: true, error: String(error?.message || error || 'status_failed') }, 'main_status_failed');
    }
  }

  function isConnected(options) {
    options = options || {};
    const snap = authoritySnapshot(options);
    if (snap.verified && snap.connected && !snap.needsReauth && !snap.stale) return true;
    if (options.requireAuthority === true) return false;
    return isConnectedFromSettings();
  }

  /**
   * Sync live Electron OAuth into settings, refresh main authority, then re-check.
   * Matches PR38 ensureConnected while keeping authoritative snapshot when available.
   */
  async function ensureConnected(options) {
    if (typeof global.syncCloudStatusFromElectron === 'function') {
      try { await global.syncCloudStatusFromElectron(); } catch { /* empty */ }
    }
    if (isConnectedFromSettings()) return true;

    const snapshot = await refreshAuthoritativeConnection(options);
    if (snapshot.verified && snapshot.connected && !snapshot.needsReauth) return true;

    return isConnectedFromSettings();
  }

  function splitRemotePath(remotePath) {
    const parts = String(remotePath || '').split('/').filter(Boolean);
    const filename = parts.pop() || 'file.json';
    const folder = parts.join('/');
    return { folder, filename };
  }

  async function uploadJson(remotePath, data, options) {
    options = options || {};
    const bridge = getBridge();
    if (!bridge) return global.DriveErrors?.handleFailure?.({ error: 'no_backup_bridge' }) || { ok: false, error: 'no_backup_bridge' };
    if (!isConnected()) {
      return global.DriveErrors?.handleFailure?.({ error: 'offline' }) || { ok: false, offline: true };
    }

    const payload = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const { filename } = splitRemotePath(remotePath);
    const provider = options.provider || global.settings?.backup?.cloudProvider || 'google';
    const centerMatch = String(remotePath || '').match(/centers\/([^/]+)\/branches\/([^/]+)/);
    const branchId = centerMatch ? centerMatch[2] : (options.branchId || null);

    const isManifest = /^versions\.json$/i.test(filename);
    const casResource = options.casResource || (isManifest ? 'manifest' : 'table');

    let res;
    if (bridge.uploadCloud) {
      res = await bridge.uploadCloud(payload, filename, provider, {
        remotePath,
        overwrite: options.overwrite !== false,
        brand: 'NajjarTech',
        atomicReplace: options.atomicReplace !== false && /\.json$/i.test(filename),
        hash: options.hash,
        casResource,
        expectedBranchRevision: options.expectedBranchRevision ?? options.expectedDatabaseVersion,
        expectedTableRevision: options.expectedTableRevision,
        expectedDatabaseVersion: options.expectedBranchRevision ?? options.expectedDatabaseVersion,
        branchId,
        operationId: options.operationId,
      });
    } else if (bridge.uploadSyncFile) {
      const { folder } = splitRemotePath(remotePath);
      res = await bridge.uploadSyncFile(payload, filename, provider, folder);
    } else {
      res = { ok: false, error: 'upload_unavailable' };
    }
    if (res?.ok === false) return global.DriveErrors?.handleFailure?.(res) || res;
    return res;
  }

  async function downloadJson(remotePath, options) {
    options = options || {};
    const bridge = getBridge();
    if (!bridge) return global.DriveErrors?.handleFailure?.({ error: 'no_backup_bridge' }) || { ok: false, error: 'no_backup_bridge' };
    if (!isConnected()) {
      return global.DriveErrors?.handleFailure?.({ error: 'offline' }) || { ok: false, offline: true };
    }

    let res;
    if (bridge.downloadCloudBackup) {
      const provider = options.provider || global.settings?.backup?.cloudProvider || 'google';
      res = await bridge.downloadCloudBackup(remotePath, provider);
      if (!res?.ok) return global.DriveErrors?.handleFailure?.(res) || res;
      const text = res.text || res.payload || (res.buffer ? String(res.buffer) : '');
      try {
        return { ok: true, data: JSON.parse(text), text };
      } catch {
        return { ok: true, text, data: null };
      }
    }

    if (bridge.downloadSyncFile) {
      const { folder, filename } = splitRemotePath(remotePath);
      const provider = options.provider || 'google';
      res = await bridge.downloadSyncFile(filename, provider, folder);
      if (!res?.ok) return global.DriveErrors?.handleFailure?.(res) || res;
      try {
        return { ok: true, data: JSON.parse(res.text || res.payload), text: res.text || res.payload };
      } catch {
        return { ok: true, text: res.text || res.payload, data: null };
      }
    }

    return global.DriveErrors?.handleFailure?.({ error: 'download_unavailable' }) || { ok: false, error: 'download_unavailable' };
  }

  function resolveBranchId(branchId) {
    const resolved = branchId
      || global.BranchScope?.getActiveBranchId?.()
      || global.DeviceConfig?.getLockedBranchId?.()
      || null;
    if (resolved) return resolved;
    if (isBootstrapPhase()) return 'BR-MAIN';
    return null;
  }

  async function uploadVersions(centerId, versions, branchId) {
    branchId = resolveBranchId(branchId);
    if (!branchId) return { ok: false, error: 'branch_context_required' };
    const path = global.VersionsIndex?.drivePath?.(centerId, branchId) || global.DriveLayout?.syncVersionsJson?.(centerId, branchId);
    if (!path) return { ok: false, error: 'no_versions_path' };
    return uploadJson(path, versions, { overwrite: true });
  }

  async function uploadVersionsConditional(centerId, versions, branchId, options) {
    options = options || {};
    branchId = resolveBranchId(branchId);
    if (!branchId) return { ok: false, error: 'branch_context_required' };
    const path = global.VersionsIndex?.drivePath?.(centerId, branchId) || global.DriveLayout?.syncVersionsJson?.(centerId, branchId);
    if (!path) return { ok: false, error: 'no_versions_path' };

    const remote = await downloadVersions(centerId, branchId);
    if (!remote?.ok && !/not_found|no_remote/i.test(String(remote?.error || ''))) {
      return { ok: false, code: 'manifest_revision_unconfirmed', error: remote?.error || 'manifest_revision_unconfirmed' };
    }
    const actual = Number(
      remote?.data?.branches?.[branchId]?.databaseVersion
      || remote?.data?.databaseVersion
      || 0
    );
    const expected = Number(
      options.expectedBranchRevision != null
        ? options.expectedBranchRevision
        : options.expectedDatabaseVersion
    );
    const manifestCas = global.SyncPushGuards?.evaluateManifestCasGuard?.({
      expectedManifestRevision: expected,
      actualManifestRevision: actual,
    });
    if (manifestCas && !manifestCas.ok) {
      return { ok: false, ...manifestCas, error: manifestCas.code };
    }

    const newDbRev = Number(options.newDatabaseVersion != null ? options.newDatabaseVersion : expected + 1);
    const enriched = {
      ...(versions || {}),
      centerId: centerId || versions?.centerId,
      updatedAt: new Date().toISOString(),
      writerDeviceId: options.writerDeviceId || null,
      operationId: options.operationId || null,
      databaseVersion: newDbRev,
      branches: {
        ...(versions?.branches || {}),
        [branchId]: {
          ...(versions?.branches?.[branchId] || {}),
          databaseVersion: newDbRev,
        },
      },
    };

    const up = await uploadJson(path, enriched, {
      overwrite: true,
      atomicReplace: true,
      casResource: 'manifest',
      expectedBranchRevision: expected,
      expectedDatabaseVersion: expected,
      branchId,
      operationId: options.operationId,
    });
    if (!up?.ok) return up;

    const verify = await downloadVersions(centerId, branchId);
    const verifiedRev = Number(
      verify?.data?.branches?.[branchId]?.databaseVersion
      || verify?.data?.databaseVersion
      || 0
    );
    if (verifiedRev !== newDbRev) {
      return { ok: false, code: 'remote_verify_manifest_mismatch', retry: true, expected: newDbRev, actual: verifiedRev };
    }
    return { ok: true, databaseVersion: verifiedRev, ...up };
  }

  async function downloadVersions(centerId, branchId) {
    branchId = resolveBranchId(branchId);
    if (!branchId) return { ok: false, error: 'branch_context_required' };
    const paths = global.VersionsIndex?.drivePathCandidates?.(centerId, branchId)
      || global.DriveLayout?.syncVersionsJsonCandidates?.(centerId, branchId)
      || [global.DriveLayout?.syncVersionsJson?.(centerId, branchId)];
    return downloadJsonFirst(paths);
  }

  /** Try paths in order — primary branch folder first, then legacy layout */
  async function downloadJsonFirst(paths, options) {
    const list = Array.isArray(paths) ? paths.filter(Boolean) : [paths];
    let last = { ok: false, error: 'not_found' };
    for (const p of list) {
      const res = await downloadJson(p, options);
      if (res?.ok && res.data != null) return { ...res, path: p };
      last = res || last;
    }
    return last;
  }

  global.DriveAdapter = {
    GOOGLE_AUTHORITY_KEY,
    AUTHORITY_MAX_AGE_MS,
    authoritySnapshot,
    persistAuthorityStatus,
    refreshAuthoritativeConnection,
    isConnectedFromSettings,
    isBootstrapPhase,
    isConnected,
    ensureConnected,
    uploadJson,
    downloadJson,
    downloadJsonFirst,
    uploadVersions,
    uploadVersionsConditional,
    downloadVersions,
    splitRemotePath
  };
})(typeof window !== 'undefined' ? window : globalThis);
