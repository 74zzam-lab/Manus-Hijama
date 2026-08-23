/**
 * V2-5.9 Restore Reconciliation — NEVER push immediately after restore.
 *
 * Flow: validate → mandatory pre-restore snapshot → staging restore → integrity →
 * atomic swap → compare remote revisions → pull newer → reconcile → then push only unsynced.
 */
(function (global) {
  'use strict';

  const STATE_KEY = '__tdw_restore_reconcile__';

  function loadState() {
    try {
      return global.DB?.get?.(STATE_KEY, null) || null;
    } catch {
      return null;
    }
  }

  function saveState(state) {
    try { global.DB?.set?.(STATE_KEY, state); } catch { /* empty */ }
    return state;
  }

  function getLocalCheckpoint() {
    const versions = global.VersionsIndex?.getAll?.()
      || global.Repository?.getAllRevisions?.()
      || {};
    const branchId =
      global.BranchContexts?.getOperationalWriteBranch?.()
      || global.BranchScope?.getActiveBranchId?.()
      || global.DeviceConfig?.getLockedBranchId?.()
      || 'BR-MAIN';
    return {
      at: new Date().toISOString(),
      branchId,
      centerId: global.CenterId?.getStoredCenterId?.() || global.LicenseCloud?.loadLocal?.()?.centerId || '',
      tableRevisions: versions && typeof versions === 'object' ? { ...versions } : {},
    };
  }

  async function createMandatoryPreRestoreSnapshot(options) {
    options = options || {};
    const hasData = (() => {
      try {
        const clients = (global.clientsRegistry || []).length;
        const cases = (global.cases || []).length;
        const bookings = (global.bookings || []).length;
        return clients + cases + bookings > 0;
      } catch {
        return true;
      }
    })();

    if (!hasData && options.allowEmptySkip === true) {
      return { ok: true, skipped: true, reason: 'empty_local_db' };
    }

    // Prefer Backup V2 emergency snapshot (plaintext — no password).
    try {
      const api = global.cuppingElectron?.backup || global.tadawi?.backup;
      if (api?.v2Create) {
        const res = await api.v2Create({
          backupType: 'emergency-before-restore',
          cloud: false,
          ...(typeof global.getBackupV2IdentityMeta === 'function' ? global.getBackupV2IdentityMeta() : {}),
        });
        if (res?.ok || res?.path || res?.hash) {
          return { ok: true, path: res.path || null, hash: res.hash || null, type: 'backup_v2' };
        }
        return { ok: false, error: res?.error || 'pre_restore_snapshot_failed', mandatory: true };
      }
    } catch (e) {
      return { ok: false, error: String(e?.message || e), mandatory: true };
    }

    if (typeof global.runBackupNow === 'function') {
      try {
        await global.runBackupNow('pre-restore');
        return { ok: true, type: 'legacy_backup' };
      } catch (e) {
        return { ok: false, error: String(e?.message || e), mandatory: true };
      }
    }

    return { ok: false, error: 'pre_restore_unavailable', mandatory: true };
  }

  /**
   * After restore: pull remote changes newer than snapshot checkpoint; do NOT cloud-push.
   */
  async function reconcileAfterRestore(options) {
    options = options || {};
    try {
      const guarded = await global.SyncBaseline?.enterReconciliationRequired?.({ operationId: options.operationId || null });
      if (guarded?.ok === false) return { ok: false, error: guarded.error || 'sync_lifecycle_commit_failed', pushAllowed: false };
    } catch {
      return { ok: false, error: 'sync_lifecycle_commit_failed', pushAllowed: false };
    }
    const snapshotCheckpoint = options.snapshotCheckpoint || getLocalCheckpoint();
    const state = {
      phase: 'reconciling',
      startedAt: new Date().toISOString(),
      snapshotCheckpoint,
      pushBlocked: true,
      pullDone: false,
      pushAllowed: false,
      error: null,
    };
    saveState(state);

    try {
      // Near-real-time pull only — never immediate cloud DB push of restored snapshot.
      if (global.SyncEngine?.runOnce) {
        const pull = await global.SyncEngine.runOnce({
          direction: 'pull',
          force: true,
          afterRestore: true,
          baseCheckpoint: snapshotCheckpoint,
        });
        state.pullResult = pull || null;
        state.pullDone = pull?.ok !== false;
      } else if (global.CloudBootstrap?.hydrateFromDrive) {
        const pull = await global.CloudBootstrap.hydrateFromDrive(null, {
          allowMissingLicense: true,
          afterRestore: true,
        });
        state.pullResult = pull || null;
        state.pullDone = !!(pull?.ok || pull?.skipped);
      } else {
        state.pullDone = false;
        state.error = 'no_pull_engine';
      }

      // Only allow subsequent sync pushes of NEW local changes after pull/reconcile.
      state.phase = state.pullDone ? 'reconciled' : 'reconcile_incomplete';
      state.pushBlocked = !state.pullDone;
      state.pushAllowed = state.pullDone === true;
      state.finishedAt = new Date().toISOString();
      saveState(state);
      if (state.pullDone && global.SyncBaseline?.completeReconciliation) {
        try {
          const completed = await global.SyncBaseline.completeReconciliation({ source: 'restore_reconciliation' });
          if (completed?.ok === false) {
            state.pullDone = false;
            state.pushBlocked = true;
            state.pushAllowed = false;
            state.error = completed.error || 'sync_lifecycle_commit_failed';
            saveState(state);
          }
        } catch { /* empty */ }
      }
      return { ok: state.pullDone !== false, state, pushAllowed: state.pushAllowed };
    } catch (e) {
      state.phase = 'failed';
      state.error = String(e?.message || e);
      state.pushBlocked = true;
      state.pushAllowed = false;
      state.finishedAt = new Date().toISOString();
      saveState(state);
      return { ok: false, error: state.error, state };
    }
  }

  /** Gate any post-restore cloud backup / full push. */
  function assertPostRestorePushAllowed(trigger) {
    const t = String(trigger || '');
    if (!/post-.*restore|after.?restore/i.test(t)) return { ok: true };
    const state = loadState();
    if (!state) {
      return { ok: false, error: 'restore_reconcile_required', message: 'يجب مواءمة السحابة بعد الاستعادة قبل أي رفع' };
    }
    if (state.pushAllowed !== true || state.pullDone !== true) {
      return {
        ok: false,
        error: 'restore_push_blocked',
        message: 'ممنوع الرفع الفوري بعد الاستعادة — اسحب التغييرات الأحدث أولاً',
        state,
      };
    }
    return { ok: true, state };
  }

  /**
   * Public entry used by BootFlow instead of runCloudDbBackupNow('post-*-restore').
   */
  async function afterRestoreDataSourceSelected(choice) {
    const checkpoint = getLocalCheckpoint();
    saveState({
      phase: 'awaiting_reconcile',
      choice: choice || null,
      snapshotCheckpoint: checkpoint,
      pushBlocked: true,
      pushAllowed: false,
      pullDone: false,
      at: new Date().toISOString(),
    });
    const res = await reconcileAfterRestore({ snapshotCheckpoint: checkpoint });
    if (res.ok) {
      global.notify?.('✅ تمت مواءمة الاستعادة مع السحابة (سحب الأحدث — بلا رفع فوري)', 'success');
    } else {
      global.notify?.(
        '⚠️ مواءمة ما بعد الاستعادة غير مكتملة — لن يُرفع Snapshot قديم. ' + (res.error || ''),
        'warning'
      );
    }
    return res;
  }

  global.RestoreReconciliation = {
    STATE_KEY,
    loadState,
    saveState,
    getLocalCheckpoint,
    createMandatoryPreRestoreSnapshot,
    reconcileAfterRestore,
    assertPostRestorePushAllowed,
    afterRestoreDataSourceSelected,
  };
})(typeof window !== 'undefined' ? window : globalThis);
