/**
 * Sync Engine — Push on write + Poll every 60s (Cloud V2 Sprint 4).
 */
(function (global) {
  'use strict';

  const PUSH_DEBOUNCE_MS = 2000;
  const DEFAULT_POLL_MS = 15000;

  const CONFIG_FIELD_FILES = {
    settingsVersion: 'settings.json',
    pricesVersion: 'prices.json',
    servicesVersion: 'services.json',
    packagesVersion: 'packages.json',
    usersVersion: 'users.json'
  };

  const TABLE_LAYER = {
    settings: { layer: 'config', file: 'settings.json', table: 'settings' },
    services: { layer: 'config', file: 'services.json', table: 'services' },
    packages: { layer: 'config', file: 'packages.json', table: 'packages' },
    users: { layer: 'config', file: 'users.json', table: 'users' },
    cases: { layer: 'operational', file: 'cases.json', table: 'cases' },
    clientsRegistry: { layer: 'operational', file: 'clients.json', table: 'clientsRegistry' },
    bookings: { layer: 'operational', file: 'bookings.json', table: 'bookings' },
    expenses: { layer: 'operational', file: 'expenses.json', table: 'expenses' },
    attendance: { layer: 'operational', file: 'attendance.json', table: 'attendance' },
    doctors: { layer: 'operational', file: 'doctors.json', table: 'doctors' },
    inventoryItems: { layer: 'operational', file: 'inventory-items.json', table: 'inventoryItems' },
    inventorySuppliers: { layer: 'operational', file: 'inventory-suppliers.json', table: 'inventorySuppliers' },
    inventoryMovements: { layer: 'operational', file: 'inventory-movements.json', table: 'inventoryMovements' },
    attachments_meta: { layer: 'operational', file: 'attachments-meta.json', table: 'attachments_meta' },
  };

  let _pollTimer = null;
  let _pushTimers = new Map();
  let _running = false;
  let _handlers = { online: null, offline: null };

  const BENIGN_SYNC_ERRORS = new Set([
    'no_center_id', 'no_remote_versions', 'no_versions_path', 'not_found',
    'offline', 'drive_not_connected', 'no_backup_bridge',
  ]);

  function isBenignSyncError(msg) {
    if (global.BenignOperationalErrors?.isBenignOperationalError) {
      return global.BenignOperationalErrors.isBenignOperationalError(msg);
    }
    if (!msg) return true;
    const m = String(msg).toLowerCase();
    if (BENIGN_SYNC_ERRORS.has(m)) return true;
    return /^(no_remote_versions|no_versions_path|not_found|offline|no_center_id|branch_pull_incomplete)$/i.test(m);
  }

  function isAfterRestorePullRecoverable(result, options) {
    if (!options?.afterRestore) return false;
    const err = String(result?.error || result?.reason || result?.code || '').toLowerCase();
    if (isBenignSyncError(err)) return true;
    if (result?.blocked || result?.hasConflict) return true;
    return false;
  }

  function isEnabled() {
    if (!global.CloudMeta?.isCloudV2Enabled?.()) return false;
    return global.DriveAdapter?.isConnected?.() !== false && global.DriveAdapter?.isConnected?.();
  }

  function getCenterId() {
    return global.ConfigLayer?.getCenterId?.() || global.CenterId?.getStoredCenterId?.() || '';
  }

  function getBranchId(branchId) {
    return branchId || global.BranchScope?.getActiveBranchId?.() || global.DeviceConfig?.getLockedBranchId?.() || null;
  }

  /** Device-locked branch only — prevents cross-branch pull on poll */
  function getSyncBranchScope() {
    if (global.DeviceConfig?.isBranchLocked?.()) {
      return global.DeviceConfig.getLockedBranchId() || null;
    }
    return null;
  }

  function shouldSyncBranch(branchId) {
    if (!branchId) return true;
    const scope = getSyncBranchScope();
    if (!scope) return true;
    return branchId === scope;
  }

  function checkSyncGuard(options) {
    options = options || {};
    if (!global.CloudMeta?.isCloudV2Enabled?.()) return { ok: true, skipped: true };
    if (options.force) return { ok: true, forced: true };
    // V2-4: revoked/pending devices must not push/pull
    try {
      const deviceId =
        global.DeviceConfig?.getDeviceId?.() ||
        global.DeviceConfig?.load?.()?.deviceUuid ||
        global.LicenseIdentity?.getDeviceId?.();
      if (deviceId && global.DeviceRegistry?.canSync) {
        const cs = global.DeviceRegistry.canSync(null, deviceId);
        if (cs && cs.ok === false) {
          return { ok: false, blocked: true, reason: cs.error || 'device_sync_blocked', ...cs };
        }
      }
    } catch { /* empty */ }
    return global.SyncGuard?.canSync?.(options) || { ok: true };
  }

  function blockIfUnsafePull(result, table) {
    if (result?.blocked || result?.hasConflict) {
      global.SyncGuard?.pause?.('conflict', { table, result });
      global.SyncState?.setError?.('sync_blocked_conflict');
      return { ok: false, blocked: true, table, ...result };
    }
    return result;
  }

  function getLocalRevisionForTable(table, branchId) {
    branchId = getBranchId(branchId);
    const fromRepo = Number(global.Repository?.getRevision?.(table) || 0);
    if (fromRepo > 0) return fromRepo;
    const local = global.VersionsIndex?.loadLocal?.(getCenterId());
    return Number(local?.branches?.[branchId]?.databaseVersion || local?.databaseVersion || 0);
  }

  async function getRemoteTableRevision(branchId, table) {
    branchId = getBranchId(branchId);
    const centerId = getCenterId();
    if (!centerId || !global.OperationalLayer?.drivePathForTable) {
      return { ok: false, remoteRevision: 0, error: 'remote_table_revision_unconfirmed' };
    }
    const remotePath = global.OperationalLayer.drivePathForTable(centerId, branchId, table);
    const dl = await global.DriveAdapter.downloadJson(remotePath);
    if (!dl?.ok) {
      if (isBenignSyncError(dl?.error)) {
        return { ok: true, remoteRevision: 0, emptyRemote: true };
      }
      return { ok: false, remoteRevision: 0, error: dl?.error || 'remote_table_revision_unconfirmed' };
    }
    return { ok: true, remoteRevision: Number(dl.data?.revision || 0), data: dl.data };
  }

  async function getRemoteBranchDatabaseRevision(branchId) {
    branchId = getBranchId(branchId);
    const centerId = getCenterId();
    if (!centerId || !global.DriveAdapter?.downloadVersions) {
      return { ok: false, remoteRevision: 0, error: 'remote_revision_unconfirmed' };
    }
    const res = await global.DriveAdapter.downloadVersions(centerId, branchId);
    if (!res?.ok || !res.data) {
      if (isBenignSyncError(res?.error)) {
        return { ok: true, remoteRevision: 0, versions: null, emptyRemote: true };
      }
      return { ok: false, remoteRevision: 0, error: res?.error || 'remote_revision_unconfirmed' };
    }
    const remoteRev = Number(
      res.data?.branches?.[branchId]?.databaseVersion || res.data?.databaseVersion || 0
    );
    return { ok: true, versions: res.data, remoteRevision: remoteRev };
  }

  function hashPayload(data) {
    try {
      if (global.crypto?.subtle) {
        /* browser path handled in verify step via JSON stringify compare */
      }
    } catch { /* empty */ }
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return `h${Math.abs(hash)}-${text.length}`;
  }

  async function verifyRemoteTableCommit(centerId, branchId, table, remotePath, expected) {
    expected = expected || {};
    const dl = await global.DriveAdapter.downloadJson(remotePath);
    if (!dl?.ok || !dl.data) {
      return { ok: false, code: 'remote_verify_download_failed', error: dl?.error };
    }
    if (expected.revision != null && Number(dl.data?.revision) !== Number(expected.revision)) {
      return {
        ok: false,
        code: 'remote_verify_revision_mismatch',
        expectedRevision: expected.revision,
        actualRevision: dl.data?.revision,
      };
    }
    const records = dl.data?.records || dl.data;
    const payloadHash = hashPayload(records);
    if (expected.payloadHash && payloadHash !== expected.payloadHash && expected.payloadHashAlt) {
      if (payloadHash !== expected.payloadHashAlt) {
        return { ok: false, code: 'remote_verify_hash_mismatch' };
      }
    }
    if (expected.verifyManifest === true) {
      const remoteHead = await getRemoteBranchDatabaseRevision(branchId);
      if (!remoteHead.ok) {
        return { ok: false, code: 'remote_verify_manifest_unconfirmed', error: remoteHead.error };
      }
      if (expected.databaseVersion != null && Number(remoteHead.remoteRevision) !== Number(expected.databaseVersion)) {
        return {
          ok: false,
          code: 'remote_verify_manifest_mismatch',
          expectedDatabaseVersion: expected.databaseVersion,
          actualDatabaseVersion: remoteHead.remoteRevision,
        };
      }
      return {
        ok: true,
        databaseVersion: remoteHead.remoteRevision,
        revision: dl.data?.revision,
        fileId: dl.data?.fileId || null,
      };
    }
    return {
      ok: true,
      revision: dl.data?.revision,
      fileId: dl.data?.fileId || null,
    };
  }

  async function assertPushAllowed(table, branchId, recordCount, options) {
    options = options || {};
    const localRev = options.localRevision != null
      ? Number(options.localRevision)
      : getLocalRevisionForTable(table, branchId);
    let remoteRev = Number(options.remoteRevision || 0);
    if (options.remoteRevision == null && !options.skipRemoteFetch) {
      const remote = await getRemoteBranchDatabaseRevision(branchId);
      remoteRev = Number(remote.remoteRevision || 0);
    }
    const guard = global.SyncPushGuards?.evaluatePushGuard?.({
      localRevision: localRev,
      remoteRevision: remoteRev,
      recordCount,
      strictLocalRevZero: options.strictLocalRevZero === true,
    }) || { ok: true };
    if (!guard.ok) {
      global.SyncState?.setError?.(guard.code || guard.reason);
      global.AuditLogger?.logSyncEvent?.('SYNC_PUSH_BLOCKED', {
        entity: table,
        entityId: branchId,
        summary: guard.code || guard.reason,
      });
    }
    return guard;
  }

  function schedulePush(table, branchId) {
    if (!global.CloudMeta?.isCloudV2Enabled?.()) return;
    branchId = getBranchId(branchId);
    const key = `${table}:${branchId}`;
    if (_pushTimers.has(key)) clearTimeout(_pushTimers.get(key));

    // V2-4/V2-5.2: durable SQLite outbox enqueue with full table payload (never null-only)
    try {
      const centerId = getCenterId();
      const deviceId =
        global.DeviceConfig?.getDeviceId?.() ||
        global.LicenseIdentity?.getDeviceId?.() ||
        'unknown-device';
      const rev =
        Number(global.VersionsIndex?.getTableRevision?.(table, branchId) ||
          global.Repository?._revisions?.[table] ||
          0);
      if (centerId && global.SqliteOutboxBridge?.enqueue) {
        let payload = null;
        try {
          payload = global.Repository?.get?.(table);
        } catch { /* empty */ }
        const payloadJson = payload == null ? JSON.stringify([]) : JSON.stringify(payload);
        const entry = {
          center_id: centerId,
          branch_id: branchId,
          table_name: table,
          operation: 'TABLE_BUMP',
          base_revision: Math.max(0, rev - 1),
          new_revision: rev,
          device_id: deviceId,
          payload_json: payloadJson,
        };
        Promise.resolve(global.SqliteOutboxBridge.enqueue(entry)).catch(() => { /* never throw into UI */ });
      }
    } catch { /* empty */ }

    _pushTimers.set(key, setTimeout(() => {
      _pushTimers.delete(key);
      if (global.SyncCoordinator?.scheduleDebounced) {
        global.SyncCoordinator.scheduleDebounced({ branchId, table, source: 'schedulePush' });
      } else {
        pushTable(table, branchId, { _internalPush: true }).catch(err => queueFailedPush(table, branchId, err));
      }
    }, PUSH_DEBOUNCE_MS));
  }

  function queueFailedPush(table, branchId, err) {
    const meta = TABLE_LAYER[table] || { layer: 'operational', table };
    global.SyncState?.queuePush?.({
      layer: meta.layer,
      table: meta.table || table,
      branchId,
      revision: global.Repository?.getRevision?.(table) || 0
    });
    const msg = err?.message || String(err || 'push_failed');
        if (!isBenignSyncError(msg)) {
          const handled = global.DriveErrors?.handleFailure?.({ message: msg }) || {};
          if (!handled.classified?.pauseSync) global.SyncState?.setError?.(msg);
        }
  }

  function checkOperationalWriteGate() {
    try {
      const gate = global.OperationalReadiness?.canWrite?.();
      if (gate && gate.ok === false) return gate;
    } catch { /* empty */ }
    return { ok: true };
  }

  async function pushTableOnce(table, branchId, options) {
    options = options || {};
    const opGate = checkOperationalWriteGate();
    if (!opGate.ok) {
      return {
        ok: false,
        blocked: true,
        reason: opGate.error || 'operational_not_ready',
        messageAr: opGate.messageAr,
        readiness: opGate.readiness,
      };
    }
    if (global.LegacyBranchMigration?.isPushBlocked?.()) {
      return { ok: false, blocked: true, reason: 'legacy_branch_migration_required' };
    }
    const guard = checkSyncGuard(options);
    if (!guard.ok && !guard.skipped) return { ok: false, blocked: true, reason: guard.reason };
    if (!isEnabled()) return { ok: false, skipped: true };

    const baselineGate = global.SyncBaseline?.assertPushAllowed?.({
      branchId: getBranchId(branchId),
      force: options.force === true,
    });
    if (baselineGate && !baselineGate.ok && !options.force) {
      return { ok: false, blocked: true, reason: baselineGate.code || baselineGate.reason, ...baselineGate };
    }

    const restoreGate = global.RestoreReconciliation?.assertPostRestorePushAllowed?.(
      options.afterRestore ? 'after-restore' : (options.trigger || '')
    );
    if (restoreGate && !restoreGate.ok) {
      return { ok: false, blocked: true, ...restoreGate };
    }

    if (global.LicenseIdentity?.verifyGoogleBinding) {
      const idCheck = await global.LicenseIdentity.verifyGoogleBinding();
      if (!idCheck.ok) {
        const handled = global.DriveErrors?.handleFailure?.(idCheck) || {};
        global.SyncState?.setError?.(idCheck.error || 'google_identity_transfer');
        return { ok: false, error: idCheck.error, identity: idCheck, ...handled };
      }
      if (idCheck.needsBind && global.LicenseIdentity.getConnectedGoogleEmail?.()) {
        await global.LicenseIdentity.bindGoogleAccount(global.LicenseIdentity.getConnectedGoogleEmail());
      }
    }

    branchId = getBranchId(branchId);
    if (!branchId) return { ok: false, blocked: true, reason: 'branch_context_required' };
    if (!shouldSyncBranch(branchId)) {
      return { ok: false, blocked: true, reason: 'branch_scope_blocked', branchId };
    }

    const centerId = getCenterId();
    if (!centerId) return { ok: false, error: 'no_center_id' };

    const meta = TABLE_LAYER[table];
    if (!meta) return { ok: false, error: 'unknown_table' };

    const remoteHead = await getRemoteBranchDatabaseRevision(branchId);
    if (!remoteHead.ok && !remoteHead.emptyRemote) {
      return {
        ok: false,
        blocked: true,
        code: 'remote_revision_unconfirmed',
        reason: 'remote_revision_unconfirmed',
        error: remoteHead.error,
      };
    }
    const remoteDbRev = Number(remoteHead.remoteRevision || 0);
    if (options.baseRevision != null && Number(options.baseRevision) < remoteDbRev) {
      await pullOperationalTable(branchId, table);
      return {
        ok: false,
        retry: true,
        code: 'remote_revision_mismatch',
        reason: 'remote_revision_mismatch',
        expectedRemoteRevision: Number(options.baseRevision),
        actualRemoteRevision: remoteDbRev,
      };
    }

    let remotePath;
    let payload;
    let operationalRecordCount = 0;
    let payloadHash = null;
    const deviceId =
      global.DeviceConfig?.getDeviceId?.()
      || global.LicenseIdentity?.getDeviceId?.()
      || 'unknown-device';

    if (meta.layer === 'config' || (meta.file === 'settings.json' && table === 'settings')) {
      const pack = global.ConfigLayer?.exportBranchPack?.(branchId);
      if (!pack) return { ok: false, error: 'no_config_pack' };
      if (table === 'settings') {
        const paths = [
          { path: global.ConfigLayer.drivePathForFile(centerId, branchId, 'settings.json'), data: pack.settings },
          { path: global.ConfigLayer.drivePathForFile(centerId, branchId, 'prices.json'), data: pack.prices }
        ];
        for (const item of paths) {
          const r = await global.DriveAdapter.uploadJson(item.path, item.data, {
            overwrite: true,
            atomicReplace: true,
            operationId: options.operationId,
          });
          if (r?.code === 'remote_revision_mismatch') {
            return { ok: false, retry: true, ...r };
          }
          if (!r?.ok) {
            queueFailedPush(table, branchId, new Error(r?.message || r?.error || 'upload_failed'));
            return r;
          }
        }
      } else {
        if (meta.file === 'settings.json') payload = pack.settings;
        else if (meta.file === 'prices.json') payload = pack.prices;
        else if (meta.file === 'services.json') payload = pack.services;
        else if (meta.file === 'packages.json') payload = pack.packages;
        else if (meta.file === 'users.json') payload = pack.users;
        remotePath = global.ConfigLayer?.drivePathForFile?.(centerId, branchId, meta.file);
        const up = await global.DriveAdapter.uploadJson(remotePath, payload, {
          overwrite: true,
          atomicReplace: true,
          operationId: options.operationId,
        });
        if (up?.code === 'remote_revision_mismatch') {
          return { ok: false, retry: true, ...up };
        }
        if (!up?.ok) {
          queueFailedPush(table, branchId, new Error(up?.message || up?.error || 'upload_failed'));
          return up;
        }
      }
    } else {
      payload = global.OperationalLayer?.exportTable?.(table, branchId);
      operationalRecordCount = Array.isArray(payload?.records) ? payload.records.length : 0;
      payloadHash = hashPayload(payload?.records || payload);
      const pushGuard = await assertPushAllowed(table, branchId, operationalRecordCount, {
        ...options,
        remoteRevision: remoteDbRev,
        skipRemoteFetch: true,
      });
      if (!pushGuard.ok) {
        return { ok: false, blocked: true, reason: pushGuard.code || pushGuard.reason, guard: pushGuard };
      }
      remotePath = global.OperationalLayer?.drivePathForTable?.(centerId, branchId, table);
      const remoteTableHead = await getRemoteTableRevision(branchId, table);
      if (!remoteTableHead.ok && !remoteTableHead.emptyRemote) {
        return {
          ok: false,
          blocked: true,
          code: 'remote_table_revision_unconfirmed',
          reason: 'remote_table_revision_unconfirmed',
          error: remoteTableHead.error,
        };
      }
      const remoteTableRev = Number(remoteTableHead.remoteRevision || 0);
      const localTableRev = Number(payload?.revision || 0);
      const nextRevision = Math.max(localTableRev, remoteTableRev + 1);
      const payloadWithRev = { ...(payload || {}), revision: nextRevision, operationId: options.operationId || null };
      const upOp = await global.DriveAdapter.uploadJson(remotePath, payloadWithRev, {
        overwrite: true,
        casResource: 'table',
        expectedTableRevision: remoteTableRev,
        operationId: options.operationId,
        atomicReplace: true,
      });
      if (upOp?.code === 'remote_revision_mismatch' || upOp?.code === 'manifest_revision_mismatch') {
        await pullOperationalTable(branchId, table);
        return { ok: false, retry: true, ...upOp };
      }
      if (!upOp?.ok) {
        queueFailedPush(table, branchId, new Error(upOp?.message || upOp?.error || 'upload_failed'));
        return upOp;
      }

      const verified = await verifyRemoteTableCommit(centerId, branchId, table, remotePath, {
        revision: nextRevision,
        payloadHash,
      });
      if (!verified.ok) {
        return { ok: false, retry: true, code: verified.code || 'remote_verify_failed', verified };
      }
      payload = payloadWithRev;
    }

    global.SyncState?.dequeuePush?.(meta.layer, meta.table || table, branchId);
    global.SyncState?.touchPush?.();

    const newDbRev = remoteDbRev + 1;
    const versions = global.VersionsIndex?.toDriveJson?.(
      global.VersionsIndex?.syncFromRepository?.(global.Repository, centerId, branchId)
    );
    const manifestUp = await global.DriveAdapter.uploadVersionsConditional?.(centerId, versions, branchId, {
      expectedBranchRevision: remoteDbRev,
      expectedDatabaseVersion: remoteDbRev,
      newDatabaseVersion: newDbRev,
      operationId: options.operationId,
      writerDeviceId: deviceId,
    }) || await global.DriveAdapter.uploadVersions(centerId, versions, branchId);

    if (manifestUp?.code === 'manifest_revision_mismatch') {
      return { ok: false, retry: true, ...manifestUp };
    }
    if (manifestUp?.ok === false) {
      queueFailedPush(table, branchId, new Error(manifestUp?.message || manifestUp?.error || 'manifest_upload_failed'));
      return manifestUp;
    }

    const manifestVerified = await verifyRemoteTableCommit(centerId, branchId, table, remotePath, {
      verifyManifest: true,
      databaseVersion: newDbRev,
    });
    if (!manifestVerified.ok && meta.layer === 'operational') {
      return { ok: false, retry: true, code: manifestVerified.code || 'remote_verify_manifest_failed', manifestVerified };
    }

    const baselineCommit = await global.SyncBaseline?.updateBaselineAfterVerifiedPush?.(branchId, newDbRev, options.operationId);
    if (baselineCommit?.ok === false) {
      await global.SyncBaseline?.enterReconciliationRequired?.({ operationId: options.operationId || null });
      return {
        ok: false,
        retry: false,
        code: baselineCommit.error || baselineCommit.code || 'sync_lifecycle_commit_failed',
        remoteCommitted: true,
        reconciliationRequired: true,
        databaseVersion: newDbRev,
      };
    }
    global.DeviceCache?.snapshotFromLocal?.(branchId).catch(() => {});
    global.AuditLogger?.logSyncEvent?.('LOCAL_PUSH', {
      entity: table,
      entityId: branchId,
      summary: `رفع ${table} إلى Google Drive`,
      operationId: options.operationId || null,
    });

    emit('synced', { direction: 'push', table, branchId, operationId: options.operationId || null });
    return {
      ok: true,
      table,
      branchId,
      remotePath,
      databaseVersion: newDbRev,
      remoteFileId: manifestUp?.id || manifestUp?.fileId || null,
      verified: true,
      operationId: options.operationId || null,
    };
  }

  async function pushTable(table, branchId, options) {
    options = options || {};
    if (!options._coordinator && !options._internalPush) {
      if (global.SyncCoordinator?.withMutex) {
        return global.SyncCoordinator.withMutex(
          ({ operationId }) => pushTable(table, branchId, { ...options, _coordinator: true, operationId }),
          { prefix: 'push', operationId: options.operationId }
        );
      }
      return { ok: false, blocked: true, reason: 'coordinator_required' };
    }
    if (options._coordinator && global.SyncCoordinator?.runWithBoundedRetry) {
      return global.SyncCoordinator.runWithBoundedRetry(
        async () => {
          const result = await pushTableOnce(table, branchId, options);
          if (result?.retry === true) return result;
          return result;
        },
        { operationId: options.operationId, maxAttempts: options.maxAttempts || 4 }
      );
    }
    return pushTableOnce(table, branchId, options);
  }

  async function pushConfigField(field, branchId) {
    branchId = getBranchId(branchId);
    if (!branchId) return { ok: false, blocked: true, reason: 'branch_context_required' };
    const file = CONFIG_FIELD_FILES[field];
    if (!file) return { ok: false, error: 'unknown_field' };
    const tableMap = {
      settingsVersion: 'settings',
      pricesVersion: 'settings',
      servicesVersion: 'services',
      packagesVersion: 'packages',
      usersVersion: 'users'
    };
    return pushTable(tableMap[field] || 'settings', branchId);
  }

  async function pullConfigFile(branchId, fileName) {
    const guard = checkSyncGuard();
    if (!guard.ok && !guard.skipped) return { ok: false, blocked: true, reason: guard.reason };
    branchId = getBranchId(branchId);
    const centerId = getCenterId();
    const paths = global.DriveLayout?.configBranchFileCandidates?.(centerId, branchId, fileName)
      || [global.ConfigLayer?.drivePathForFile?.(centerId, branchId, fileName)];
    const dl = global.DriveAdapter?.downloadJsonFirst
      ? await global.DriveAdapter.downloadJsonFirst(paths)
      : await global.DriveAdapter.downloadJson(paths[0]);
    if (!dl?.ok) return dl;

    const pack = { branchId };
    if (fileName === 'settings.json') pack.settings = dl.data;
    else if (fileName === 'prices.json') pack.prices = dl.data;
    else if (fileName === 'services.json') pack.services = dl.data;
    else if (fileName === 'packages.json') pack.packages = dl.data;
    else if (fileName === 'users.json') pack.users = dl.data;
    else return { ok: false, error: 'unknown_config_file' };

    return blockIfUnsafePull(global.ConfigLayer?.importBranchPack?.(pack, { branchId, mergeUsers: true }), fileName);
  }

  async function pullOperationalTable(branchId, table) {
    const guard = checkSyncGuard();
    if (!guard.ok && !guard.skipped) return { ok: false, blocked: true, reason: guard.reason };
    branchId = getBranchId(branchId);
    if (!branchId) return { ok: false, blocked: true, reason: 'branch_context_required' };
    const centerId = getCenterId();
    const paths = global.DriveLayout?.operationalBranchFileCandidates?.(centerId, branchId, table)
      || [global.OperationalLayer?.drivePathForTable?.(centerId, branchId, table)];
    const dl = global.DriveAdapter?.downloadJsonFirst
      ? await global.DriveAdapter.downloadJsonFirst(paths)
      : await global.DriveAdapter.downloadJson(paths[0]);
    if (!dl?.ok) return dl;

    const localRev = getLocalRevisionForTable(table, branchId);
    const remoteRev = Number(dl.data?.revision || 0);
    let pendingOutbox = 0;
    if (global.SqliteOutboxBridge?.counts) {
      try {
        const counts = await global.SqliteOutboxBridge.counts(branchId);
        pendingOutbox = Number(counts?.pending || 0) + Number(counts?.inflight || 0);
      } catch { /* empty */ }
    }
    const pullGuard = global.SyncPushGuards?.evaluatePullApplyGuard?.({
      localRevision: localRev,
      remoteRevision: remoteRev,
      pendingOutbox,
    }) || { ok: true };
    if (!pullGuard.ok) {
      return { ok: false, blocked: true, reason: pullGuard.code || pullGuard.reason, guard: pullGuard };
    }

    return blockIfUnsafePull(global.OperationalLayer?.importTable?.(table, dl.data, branchId), table);
  }

  async function pullBranchDatabase(branchId) {
    const guard = checkSyncGuard();
    if (!guard.ok && !guard.skipped) return { ok: false, blocked: true, reason: guard.reason };
    branchId = getBranchId(branchId);
    if (!branchId) return { ok: false, blocked: true, error: 'branch_context_required', results: [] };
    const tables = global.OperationalLayer?.OPERATIONAL_TABLES || [];
    const results = [];
    for (const table of tables) {
      try {
        const r = await pullOperationalTable(branchId, table);
        results.push({ table, ok: !!r?.ok });
      } catch (e) {
        results.push({ table, ok: false, error: e.message });
      }
    }
    const failed = results.filter((row) => !row.ok);
    return {
      ok: failed.length === 0,
      branchId,
      results,
      error: failed.length ? 'branch_pull_incomplete' : null,
      failed,
    };
  }

  async function applyRemoteVersions(remote, options) {
    options = options || {};
    const afterRestore = options.afterRestore === true;
    const centerId = getCenterId();
    const local = global.VersionsIndex?.loadLocal?.(centerId);
    const changes = global.VersionsIndex?.diff?.(remote, local) || [];
    const pulled = [];
    const skipped = [];
    const scopeBranch = options.branchId || getSyncBranchScope();

    for (const ch of changes) {
      if (ch.branchId && scopeBranch && ch.branchId !== scopeBranch) continue;
      if (ch.layer === 'branch') {
        const file = CONFIG_FIELD_FILES[ch.field];
        if (file && ch.branchId) {
          if (afterRestore && ch.field === 'databaseVersion') {
            skipped.push({ type: 'operational', branchId: ch.branchId, field: ch.field, reason: 'after_restore_local_authoritative' });
            continue;
          }
          const result = await pullConfigFile(ch.branchId, file);
          if (!result?.ok) {
            if (isAfterRestorePullRecoverable(result, options)) {
              skipped.push({ type: 'config', file, branchId: ch.branchId, result, reason: 'after_restore_recoverable' });
              continue;
            }
            return { ok: false, error: 'remote_pull_failed', failed: { type: 'config', file, branchId: ch.branchId, result }, pulled, skipped };
          }
          pulled.push({ type: 'config', file, branchId: ch.branchId });
        } else if (ch.field === 'databaseVersion' && ch.branchId) {
          if (afterRestore) {
            skipped.push({ type: 'operational', branchId: ch.branchId, field: ch.field, reason: 'after_restore_local_authoritative' });
            continue;
          }
          const result = await pullBranchDatabase(ch.branchId);
          if (!result?.ok) {
            if (isAfterRestorePullRecoverable(result, options)) {
              skipped.push({ type: 'operational', branchId: ch.branchId, result, reason: 'after_restore_recoverable' });
              continue;
            }
            return { ok: false, error: 'remote_pull_failed', failed: { type: 'operational', branchId: ch.branchId, result }, pulled, skipped };
          }
          pulled.push({ type: 'operational', branchId: ch.branchId });
        }
      } else if (ch.layer === 'config') {
        const file = CONFIG_FIELD_FILES[ch.field];
        if (file) {
          const bid = scopeBranch || getBranchId();
          const result = await pullConfigFile(bid, file);
          if (!result?.ok) {
            if (isAfterRestorePullRecoverable(result, options)) {
              skipped.push({ type: 'config', file, branchId: bid, result, reason: 'after_restore_recoverable' });
              continue;
            }
            return { ok: false, error: 'remote_pull_failed', failed: { type: 'config', file, branchId: bid, result }, pulled, skipped };
          }
          pulled.push({ type: 'config', file, branchId: bid });
        }
      }
    }

    if (remote && typeof remote === 'object') {
      global.VersionsIndex?.saveLocal?.({ ...local, ...remote, centerId: centerId || local?.centerId });
    }

    return {
      ok: true,
      changes: changes.length,
      pulled,
      skipped,
      partial: skipped.length > 0,
      afterRestore,
    };
  }

  async function _pollInternal(options) {
    options = options || {};
    if (!global.CloudMeta?.isCloudV2Enabled?.()) return { ok: false, skipped: true };
    const guard = checkSyncGuard(options);
    if (!guard.ok && !guard.skipped) return { ok: false, blocked: true, reason: guard.reason };
    try {
      const centerId = getCenterId();
      if (!centerId) return { ok: false, error: 'no_center_id' };

      if (!global.DriveAdapter?.isConnected?.()) {
        await global.DriveAdapter?.ensureConnected?.().catch(() => false);
      }
      if (!global.DriveAdapter?.isConnected?.()) {
        global.SyncState?.setOnline?.(false);
        global.SyncState?.clearError?.();
        return { ok: false, offline: true, error: 'offline' };
      }

      if (global.LicenseIdentity?.verifyGoogleBinding) {
        const idCheck = await global.LicenseIdentity.verifyGoogleBinding();
    if (!idCheck.ok) {
      const handled = global.DriveErrors?.handleFailure?.(idCheck) || {};
      global.SyncState?.setError?.(idCheck.error || 'google_identity_transfer');
      return { ok: false, error: idCheck.error, identity: idCheck, ...handled };
    }
      }

      global.SyncState?.setOnline?.(true);
      const branchId = getBranchId();
      if (!branchId) return { ok: false, blocked: true, error: 'branch_context_required' };
      const remoteRes = await global.DriveAdapter.downloadVersions(centerId, branchId);
      if (!remoteRes?.ok || !remoteRes.data) {
        global.SyncState?.touchPoll?.();
        const err = remoteRes?.error || 'no_remote_versions';
        if (isBenignSyncError(err)) global.SyncState?.clearError?.();
        else global.SyncState?.setError?.(err);
        return remoteRes || { ok: false, error: 'no_remote_versions' };
      }

      const result = await applyRemoteVersions(remoteRes.data, options);
      global.SyncState?.touchPoll?.();
      emit('synced', { direction: 'poll', ...result });
      return { ok: true, ...result };
    } catch (e) {
      const msg = e.message || String(e);
        if (!isBenignSyncError(msg)) {
          const handled = global.DriveErrors?.handleFailure?.({ message: msg }) || {};
          if (!handled.classified?.pauseSync) global.SyncState?.setError?.(msg);
        }
      return { ok: false, error: msg };
    }
  }

  async function poll(options) {
    if (global.SyncCoordinator?.isLocked?.()) {
      return { ok: false, busy: true, reason: 'sync_mutex_locked' };
    }
    return _pollInternal(options);
  }

  async function _flushPendingInternal(options) {
    options = options || {};
    if (!isEnabled()) return { ok: false, skipped: true };
    const guard = checkSyncGuard();
    const blocked = !!(guard && guard.ok === false && !guard.skipped);
    const state = global.SyncState?.load?.() || {};
    const pending = (state.pendingPushes || []).filter(item =>
      !item.branchId || shouldSyncBranch(item.branchId)
    );
    const results = [];
    if (blocked) {
      // Do not push while revoked/pending, but keep API ok for callers that only need a drain attempt.
      return {
        ok: true,
        blocked: true,
        reason: guard.reason || 'device_sync_blocked',
        flushed: 0,
        results,
      };
    }
    for (const item of pending) {
      const table = item.table;
      if (table) {
        const r = await pushTable(table, item.branchId, {
          ...options,
          _coordinator: true,
          _internalPush: true,
          operationId: options.operationId,
        });
        results.push({ table, ok: !!r?.ok, source: 'memory_queue' });
      }
    }

    // V2-4: also drain durable SQLite outbox via Electron bridge when available
    if (global.SqliteOutboxBridge?.claimPending) {
      try {
        const branchId = getBranchId();
        const claimed = await global.SqliteOutboxBridge.claimPending({
          branch_id: branchId,
          limit: 50,
        });
        const rows = Array.isArray(claimed) ? claimed : claimed?.rows || claimed?.events || [];
        for (const row of rows) {
          try {
            const table = row.table_name || row.table;
            const r = await pushTable(table, row.branch_id || branchId, {
              ...options,
              _coordinator: true,
              _internalPush: true,
              baseRevision: row.base_revision,
              operationId: options.operationId || row.operation_id || null,
            });
            if (r?.ok && r?.verified === true) {
              if (global.SqliteOutboxBridge.ack) {
                await global.SqliteOutboxBridge.ack(row.event_id, r.remoteFileId || r.fileId || null, row.lease_token);
              }
              results.push({ table, ok: true, source: 'sqlite_outbox', eventId: row.event_id, verified: true });
            } else if (r?.ok && r?.verified !== true) {
              if (global.SqliteOutboxBridge.fail) {
                await global.SqliteOutboxBridge.fail(row.event_id, 'remote_verify_pending', { leaseToken: row.lease_token });
              }
              results.push({ table, ok: false, source: 'sqlite_outbox', eventId: row.event_id, reason: 'remote_verify_pending' });
            } else {
              if (global.SqliteOutboxBridge.fail) {
                await global.SqliteOutboxBridge.fail(row.event_id, r?.error || r?.reason || 'push_failed', { leaseToken: row.lease_token });
              }
              results.push({ table, ok: false, source: 'sqlite_outbox', eventId: row.event_id });
            }
          } catch (err) {
            if (global.SqliteOutboxBridge.fail) {
              await global.SqliteOutboxBridge.fail(row.event_id, err.message || String(err), { leaseToken: row.lease_token });
            }
            results.push({
              table: row.table_name || row.table,
              ok: false,
              source: 'sqlite_outbox',
              error: String(err.message || err).slice(0, 200),
            });
          }
        }
      } catch (err) {
        results.push({ ok: false, source: 'sqlite_outbox', error: String(err.message || err).slice(0, 200) });
      }
    }

    return { ok: true, flushed: results.length, results, operationId: options.operationId || null };
  }

  async function flushPending(options) {
    options = options || {};
    if (options._coordinator) {
      return _flushPendingInternal(options);
    }
    if (global.SyncCoordinator?.runCycle) {
      const cycle = await global.SyncCoordinator.runCycle({ ...options, source: 'flushPending' });
      return cycle.push || cycle;
    }
    return _flushPendingInternal(options);
  }

  function setPollIntervalMs(ms) {
    const interval = Math.max(5000, Math.min(300000, Number(ms) || DEFAULT_POLL_MS));
    const s = global.SyncState?.load?.() || global.SyncState?.defaultState?.() || {};
    s.pollIntervalMs = interval;
    global.SyncState?.save?.(s);
    if (global.CloudMeta?.isCloudV2Enabled?.()) {
      start({ pollIntervalMs: interval });
    }
    return interval;
  }

  function start(options) {
    options = options || {};
    stop();
    if (!global.CloudMeta?.isCloudV2Enabled?.()) return { ok: false, skipped: true };

    const interval = Number(options.pollIntervalMs)
      || global.SyncState?.load?.()?.pollIntervalMs
      || DEFAULT_POLL_MS;

    _pollTimer = setInterval(() => {
      if (global.SyncCoordinator?.runCycle) {
        global.SyncCoordinator.runCycle({ source: 'poll' }).catch(() => {});
      } else {
        poll().catch(() => {});
      }
    }, interval);

    if (typeof window !== 'undefined') {
      _handlers.online = () => {
        global.SyncState?.setOnline?.(true);
        if (global.SyncCoordinator?.runCycle) {
          global.SyncCoordinator.runCycle({ source: 'online' }).catch(() => {});
        } else {
          flushPending().catch(() => {});
          poll().catch(() => {});
        }
      };
      _handlers.offline = () => global.SyncState?.setOnline?.(false);
      window.addEventListener('online', _handlers.online);
      window.addEventListener('offline', _handlers.offline);
    }

    setTimeout(() => {
      if (global.SyncCoordinator?.runCycle) {
        global.SyncCoordinator.runCycle({ source: 'startup' }).catch(() => {});
      } else {
        flushPending().catch(() => {});
        poll().catch(() => {});
      }
    }, 3000);

    return { ok: true, pollIntervalMs: interval };
  }

  function stop() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
    _pushTimers.forEach(t => clearTimeout(t));
    _pushTimers.clear();
    if (typeof window !== 'undefined' && _handlers.online) {
      window.removeEventListener('online', _handlers.online);
      window.removeEventListener('offline', _handlers.offline);
      _handlers.online = null;
      _handlers.offline = null;
    }
  }

  function isRunning() {
    return !!_pollTimer;
  }

  const READINESS_LABELS_AR = Object.freeze(
    global.OperationalErrorTruth?.CATALOG
      ? Object.fromEntries(
        Object.entries(global.OperationalErrorTruth.CATALOG).map(([k, v]) => [k, v.userMessageAr])
      )
      : {
    cloud_v2_disabled: 'تفعيل Cloud V2',
    google_not_connected: 'ربط حساب Google',
    center_id: 'Center ID / تفعيل الترخيص',
    branch_id: 'ربط الفرع',
    device_id: 'تسجيل الجهاز',
    device_sync_blocked: 'الجهاز محظور من المزامنة',
    database_unhealthy: 'قاعدة البيانات غير صالحة — أوقف التشغيل واستعد من نسخة احتياطية',
    integrity_check_failed: 'فشل فحص سلامة قاعدة البيانات',
    foreign_key_violation: 'انتهاك قيود الارتباط في قاعدة البيانات',
    schema_version_mismatch: 'إصدار مخطط قاعدة البيانات غير متوقع',
    empty_push_blocked: 'رفض رفع نسخة فارغة — اسحب من السحابة أولاً',
    local_rev_zero_pull_required: 'الجهاز جديد محلياً — اسحب البيانات قبل الرفع',
    stale_remote_skipped: 'نسخة سحابية أقدم من المحلي — تم تخطيها',
    stale_overwrite_blocked: 'رفض استبدال محلي أحدث — أفرغ قائمة الانتظار أو ادمج',
    sync_guard_blocked: 'حارس المزامنة موقوف — اضغط استئناف',
    unsafe: 'حارس المزامنة أوقف المزامنة بعد تحليل البيانات — اضغط استئناف المزامنة',
    UNSAFE: 'حارس المزامنة أوقف المزامنة بعد تحليل البيانات — اضغط استئناف المزامنة',
    analysis_required: 'يلزم تحليل/تأكيد مصدر البيانات قبل المزامنة',
    sync_paused: 'المزامنة موقوفة مؤقتاً',
    conflict: 'يوجد تعارض بيانات يحتاج قراراً',
    no_analysis: 'لا يوجد تحليل بيانات معتمد بعد',
      }
  );

  function normalizeMissingCode(code) {
    const raw = String(code || '').trim();
    if (!raw) return 'sync_guard_blocked';
    const lower = raw.toLowerCase();
    if (lower === 'unsafe') return 'unsafe';
    return raw;
  }

  /**
   * Detailed readiness — never a vague "not ready" without reasons.
   */
  function getReadiness(options) {
    options = options || {};
    const missing = [];
    const googleOk = !!global.DriveAdapter?.isConnected?.()
      || !!(global.settings?.backup?.providers?.google?.connected
        && !global.settings?.backup?.providers?.google?.userDisconnected);
    const cloudV2 = !!global.CloudMeta?.isCloudV2Enabled?.();
    const centerId = getCenterId();
    const branchId = getSyncBranchScope() || getBranchId();
    const deviceId =
      global.DeviceConfig?.getDeviceId?.()
      || global.DeviceConfig?.load?.()?.deviceUuid
      || global.LicenseIdentity?.getDeviceId?.()
      || null;

    if (!cloudV2) missing.push('cloud_v2_disabled');
    if (!googleOk) missing.push('google_not_connected');
    if (!centerId) missing.push('center_id');
    if (!branchId) missing.push('branch_id');
    if (!deviceId) missing.push('device_id');

    try {
      if (deviceId && global.DeviceRegistry?.canSync) {
        const cs = global.DeviceRegistry.canSync(null, deviceId);
        if (cs && cs.ok === false) missing.push(cs.error || 'device_sync_blocked');
      }
    } catch { /* empty */ }

    try {
      const dbHealth = global.OperationalDbHealth?.isOperationalAllowed?.();
      if (dbHealth && dbHealth.ok === false) {
        missing.push(dbHealth.error || 'database_unhealthy');
      }
    } catch { /* empty */ }

    const guard = checkSyncGuard({ force: !!options.force });
    let guardPaused = false;
    if (guard && guard.ok === false && !guard.skipped) {
      guardPaused = true;
      missing.push(normalizeMissingCode(guard.reason || 'sync_guard_blocked'));
    }

    const missingNorm = missing.map(normalizeMissingCode);
    const missingLabelsAr = global.OperationalErrorTruth?.labelsForCodes?.(missingNorm)
      || missingNorm.map((code) => READINESS_LABELS_AR[code] || code);
    const hardMissing = missingNorm.filter((c) => !['unsafe', 'UNSAFE', 'sync_paused', 'analysis_required', 'sync_guard_blocked', 'no_analysis'].includes(c));
    // Guard pause alone is recoverable — expose resume hint but allow force paths.
    const ready = hardMissing.length === 0 && !guardPaused && cloudV2 && googleOk && !!centerId;
    const recoverablePause = hardMissing.length === 0 && guardPaused && cloudV2 && googleOk && !!centerId;
    const engineEnabled = isRunning();
    const cycleInFlight = !!global.SyncCoordinator?.isCycleInFlight?.();
    return {
      ready,
      ok: ready,
      recoverablePause,
      missing: missingNorm,
      missingLabelsAr,
      state: ready
        ? (cycleInFlight ? 'CYCLE_IN_FLIGHT' : (engineEnabled ? 'ENGINE_IDLE' : 'READY_NOT_STARTED'))
        : (recoverablePause ? 'SYNC_PAUSED_RECOVERABLE' : 'WAITING_FOR_PREREQUISITES'),
      enabled: isEnabled(),
      running: isRunning(),
      engineEnabled: isRunning(),
      cycleInFlight: !!global.SyncCoordinator?.isCycleInFlight?.(),
      cloudV2,
      googleConnected: googleOk,
      centerId: centerId || null,
      branchId: branchId || null,
      deviceId: deviceId || null,
      messageAr: ready
        ? (cycleInFlight
          ? 'دورة مزامنة جارية…'
          : (isRunning() ? 'محرك المزامنة يعمل — جاهز' : 'محرك المزامنة جاهز — لم يُبدأ بعد'))
        : (recoverablePause
          ? `المزامنة موقوفة مؤقتاً — ${missingLabelsAr.join('؛ ')}. اضغط «استئناف المزامنة».`
          : `محرك المزامنة غير جاهز — المتطلبات الناقصة: ${missingLabelsAr.join('؛ ')}`),
    };
  }

  function resumeFromGuard(reason) {
    try {
      global.SyncGuard?.resume?.({ reason: reason || 'manual_resume' }, 'sync');
    } catch { /* empty */ }
    return getReadiness({ force: false });
  }

  function publishUiStatus(result, source) {
    const detail = { source: source || 'sync-engine', ok: result?.ok !== false, result: result || null };
    try { global.OwnerHub?.notifyStatusChanged?.('sync-cycle', detail); } catch { /* non-fatal */ }
    try {
      if (global.document?.dispatchEvent && typeof global.CustomEvent === 'function') {
        global.document.dispatchEvent(new global.CustomEvent('tdw:sync-status', { detail }));
      }
    } catch { /* non-fatal */ }
  }

  /**
   * One-shot pull + flush (manual "مزامنة الآن" and BootFlow initial sync).
   */
  async function runOnce(options) {
    options = options || {};
    const readiness = getReadiness(options);
    if (!readiness.ready && !options.force) {
      return {
        ok: false,
        error: 'sync_engine_not_ready',
        readiness,
        message: readiness.messageAr,
      };
    }
    const opGate = global.OperationalReadiness?.canWrite?.();
    if (opGate && !opGate.ok && !options.force) {
      return {
        ok: false,
        blocked: true,
        error: opGate.error || 'operational_not_ready',
        readiness,
        operational: opGate.readiness,
        message: opGate.messageAr,
        messageAr: opGate.messageAr,
      };
    }
    if (!isEnabled() && !options.force) {
      return { ok: false, skipped: true, reason: 'cloud_v2_or_drive_disabled', readiness };
    }

    const guard = checkSyncGuard(options);
    if (guard && !guard.ok && !guard.skipped && !options.force) {
      return { ok: false, blocked: true, ...guard, readiness };
    }

    if (global.SyncCoordinator?.runCycle) {
      const coordinated = await global.SyncCoordinator.runCycle(options);
      publishUiStatus(coordinated, 'sync-coordinator');
      return coordinated;
    }

    let pull = { ok: true, skipped: true };
    let push = { ok: true, skipped: true };
    try {
      pull = await _pollInternal(options);
    } catch (err) {
      pull = { ok: false, error: err.message || String(err) };
    }
    if (options.afterRestore !== true && options.direction !== 'pull') {
      try {
        push = await _flushPendingInternal(options);
      } catch (err) {
        push = { ok: false, error: err.message || String(err) };
      }
    }

    const ok = pull?.ok !== false && push?.ok !== false;
    const result = {
      ok,
      pull,
      push,
      readiness: getReadiness({ force: true }),
      at: new Date().toISOString(),
    };
    publishUiStatus(result, 'sync-engine');
    return result;
  }

  function getCycleState() {
    return {
      engineEnabled: isRunning(),
      cycleInFlight: !!global.SyncCoordinator?.isCycleInFlight?.() || !!global.SyncCoordinator?.isLocked?.(),
      lastCycleResult: global.SyncCoordinator?.getLastCycleResult?.()?.result || null,
      lastCycleCompletedAt: global.SyncCoordinator?.getLastCycleResult?.()?.completedAt || null,
    };
  }

  function getStatus() {
    const cycle = getCycleState();
    const base = {
      enabled: isEnabled(),
      running: cycle.engineEnabled,
      engineEnabled: cycle.engineEnabled,
      cycleInFlight: cycle.cycleInFlight,
      lastCycleResult: cycle.lastCycleResult,
      lastCycleCompletedAt: cycle.lastCycleCompletedAt,
      readiness: getReadiness(),
      ...global.SyncState?.getStatus?.()
    };
    return global.OperationalErrorTruth?.enrichSyncStatus?.(base) || base;
  }

  const _events = {};

  function on(event, handler) {
    if (!_events[event]) _events[event] = [];
    _events[event].push(handler);
  }

  function emit(event, data) {
    (_events[event] || []).forEach(fn => { try { fn(data); } catch { /* empty */ } });
  }

  global.SyncEngine = {
    PUSH_DEBOUNCE_MS,
    DEFAULT_POLL_MS,
    schedulePush,
    push: pushTable,
    pushTable,
    poll,
    _pollInternal,
    flushPending,
    _flushPendingInternal,
    start,
    stop,
    isRunning,
    runOnce,
    getReadiness,
    setPollIntervalMs,
    getSyncBranchScope,
    shouldSyncBranch,
    checkSyncGuard,
    getStatus,
    publishUiStatus,
    resumeFromGuard,
    on,
    pullConfigFile,
    pullOperationalTable,
    pullBranchDatabase,
    applyRemoteVersions,
    getRemoteBranchDatabaseRevision,
    getBranchId,
    verifyRemoteTableCommit,
  };
})(typeof window !== 'undefined' ? window : globalThis);
