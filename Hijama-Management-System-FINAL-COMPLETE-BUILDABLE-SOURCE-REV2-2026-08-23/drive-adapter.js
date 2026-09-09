/**
 * Google Drive adapter — V2 path upload/download (Cloud V2 Sprint 4).
 */
(function (global) {
  'use strict';

  function getBridge() {
    return global.BackupBridge || null;
  }

  function isConnected() {
    const s = global.settings?.backup;
    if (!s) return false;
    const prov = s?.cloudProvider || 'google';
    const p = s?.providers?.[prov] || s?.providers?.google;
    if (!p || p.userDisconnected) return false;
    // Connected flag is enough — oauth may be undefined on older settings blobs.
    if (p.connected && p.oauth !== false) return true;
    return !!(s.cloudEnabled && p.connected);
  }

  /**
   * Sync live Electron OAuth into settings, then re-check.
   * Fixes false "connect Google first" after a successful browser OAuth.
   */
  async function ensureConnected() {
    if (typeof global.syncCloudStatusFromElectron === 'function') {
      try { await global.syncCloudStatusFromElectron(); } catch { /* empty */ }
    }
    if (isConnected()) return true;

    const bridge = getBridge();
    if (!bridge?.isElectron?.() || !bridge.getCloudStatus) return isConnected();
    try {
      const live = await bridge.getCloudStatus('google');
      if (live?.connected && !live?.needsReauth) {
        const s = global.settings;
        if (s?.backup) {
          s.backup.providers = s.backup.providers || {};
          s.backup.providers.google = {
            ...(s.backup.providers.google || {}),
            connected: true,
            email: live.email || s.backup.providers.google?.email || '',
            oauth: live.oauth !== false,
            hasRefreshToken: !!live.hasRefreshToken,
            userDisconnected: false
          };
          s.backup.cloudProvider = 'google';
          s.backup.cloudEnabled = true;
          if (global.DB?.set) global.DB.set('settings', s);
        }
      }
    } catch { /* empty */ }
    return isConnected();
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
    return branchId || global.BranchScope?.getActiveBranchId?.() || global.DeviceConfig?.getLockedBranchId?.() || null;
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
