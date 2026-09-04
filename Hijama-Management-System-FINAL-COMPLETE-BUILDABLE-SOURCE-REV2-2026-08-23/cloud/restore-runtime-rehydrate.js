/**
 * RC Hotfix Round 7 — inline post-restore runtime rehydrate (no app restart).
 * Main process requests rehydrate via IPC; renderer reloads bridge/memory from restored SQLite.
 */
(function (global) {
  'use strict';

  function countMemoryRecords(key) {
    try {
      if (global.SqliteBridge?.getCommittedRaw) {
        const raw = global.SqliteBridge.getCommittedRaw(key);
        if (Array.isArray(raw)) return raw.length;
      }
      const v = global.DB?.get?.(key, []);
      return Array.isArray(v) ? v.length : 0;
    } catch {
      return 0;
    }
  }

  function normalizeSqliteCounts(rowCounts) {
    const rc = rowCounts && typeof rowCounts === 'object' ? rowCounts : {};
    return {
      clients: Number(rc.clientsRegistry ?? rc.clients ?? 0),
      visits: Number(rc.cases ?? rc.visits ?? 0),
      bookings: Number(rc.bookings ?? 0),
    };
  }

  function verifyMemoryAgainstSQLite(rowCounts) {
    const sqliteCounts = normalizeSqliteCounts(rowCounts);
    const memoryCounts = {
      clients: countMemoryRecords('clientsRegistry'),
      visits: countMemoryRecords('cases'),
      bookings: countMemoryRecords('bookings'),
    };
    const mismatches = [];
    Object.keys(sqliteCounts).forEach((key) => {
      const expected = sqliteCounts[key];
      if (!Number.isFinite(expected) || expected <= 0) return;
      const got = memoryCounts[key] || 0;
      if (got !== expected) mismatches.push({ key, sqlite: expected, memory: got });
    });
    return {
      ok: mismatches.length === 0,
      mismatches,
      sqliteCounts,
      memoryCounts,
    };
  }

  async function rehydrateAfterRestore(options = {}) {
    const stages = [];
    const emit = (name, ratio) => {
      stages.push(name);
      try { options.onSubstage?.(name, ratio); } catch { /* observer */ }
    };

    async function withTimeout(promise, ms, label) {
      if (typeof setTimeout !== 'function' || !(Number(ms) > 0)) {
        return promise;
      }
      let timer;
      try {
        return await Promise.race([
          promise,
          new Promise((resolve) => {
            timer = setTimeout(() => resolve({ ok: false, error: 'restore_rehydrate_timeout', stage: label }), ms);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    emit('invalidate_caches', 0.05);
    try { global.SqliteBridge?.invalidateOperationalCaches?.(); } catch { /* empty */ }

    emit('sqlite_boot', 0.2);
    const bootFromRestoredDb = global.SqliteBridge?.bootFromSQLiteSoT
      || global.SqliteBridge?.bootFromSQLiteSoTOnce;
    if (bootFromRestoredDb) {
      const boot = await withTimeout(
        bootFromRestoredDb.call(global.SqliteBridge),
        Number(options.bootTimeoutMs) > 0 ? Number(options.bootTimeoutMs) : 45000,
        'sqlite_boot'
      );
      if (boot && boot.ok === false) {
        return { ok: false, error: boot.error || 'restore_rehydrate_boot_failed', stages };
      }
    }

    emit('branch_rehydrate', 0.45);
    if (global.SqliteBridge?.rehydrateBranchView) {
      const hyd = await withTimeout(
        global.SqliteBridge.rehydrateBranchView(),
        Number(options.branchTimeoutMs) > 0 ? Number(options.branchTimeoutMs) : 30000,
        'branch_rehydrate'
      );
      if (hyd && hyd.ok === false) {
        return { ok: false, error: hyd.error || 'restore_rehydrate_branch_failed', stages };
      }
    }

    emit('users_closure', 0.6);
    try { await global.reconcileAuthUsersAfterHydrate?.(); } catch { /* empty */ }
    if (global.AuthCredentialTruth?.syncUsersFromAuthoritativeStore) {
      global.AuthCredentialTruth.syncUsersFromAuthoritativeStore();
    }

    emit('owner_lifecycle', 0.72);
    try {
      global.OwnerLifecycleAuthority?.reconcileAfterRestore?.({
        gateId: options.diagnosticId || null,
        source: options.source || 'backup_v2_restore_rehydrate',
      });
    } catch { /* empty */ }

    emit('branch_authority', 0.82);
    if (global.BranchAuthority?.restoreFromDurable) {
      const restored = global.BranchAuthority.restoreFromDurable(global.currentUser);
      if (restored && restored.ok === false && restored.error === 'branch_context_missing') {
        return { ok: false, error: 'restore_rehydrate_branch_context_missing', stages };
      }
    } else if (global.BranchScope?.initSessionBranch) {
      global.BranchScope.initSessionBranch();
    }

    emit('reload_operational', 0.92);
    try {
      if (typeof global.reloadClientStoreFromDb === 'function') global.reloadClientStoreFromDb();
      if (typeof global.syncAppGlobals === 'function') global.syncAppGlobals();
    } catch { /* empty */ }

    emit('reconcile_sequences', 0.94);
    try {
      global.DocumentSequences?.reconcileDocumentSequences?.();
    } catch { /* empty */ }

    emit('seed_branch_settings', 0.97);
    try {
      const bid = global.DeviceConfig?.getLockedBranchId?.()
        || global.BranchScope?.getActiveBranchId?.();
      if (bid) global.BranchDataIsolation?.persistBranchSettings?.(bid);
    } catch { /* empty */ }

    emit('verify_memory', 1);
    const verify = verifyMemoryAgainstSQLite(options.rowCounts);
    if (!verify.ok) {
      return {
        ok: false,
        error: 'restore_rehydrate_memory_mismatch',
        stages,
        ...verify,
      };
    }

    return { ok: true, stages, ...verify };
  }

  function installRestoreRehydrateListener() {
    const api = global.cuppingElectron?.backup
      || global.tadawiElectron?.backup
      || global.tadawi?.backup
      || null;
    if (!api?.onRestoreRehydrateRequest || !api?.restoreRehydrateResult) return false;
    if (installRestoreRehydrateListener._installed) return true;
    installRestoreRehydrateListener._installed = true;
    api.onRestoreRehydrateRequest(async (req) => {
      const payload = req || {};
      let result;
      try {
        result = await rehydrateAfterRestore({
          diagnosticId: payload.diagnosticId,
          rowCounts: payload.rowCounts,
          manifest: payload.manifest,
          scopeTruth: payload.scopeTruth,
          source: payload.source || 'backup_v2_restore_rehydrate',
        });
      } catch (err) {
        result = { ok: false, error: String(err?.message || err || 'restore_rehydrate_failed') };
      }
      try {
        await api.restoreRehydrateResult({
          diagnosticId: payload.diagnosticId,
          ...result,
        });
      } catch { /* main may have timed out */ }
    });
    return true;
  }

  global.RestoreRuntimeRehydrate = {
    rehydrateAfterRestore,
    verifyMemoryAgainstSQLite,
    countMemoryRecords,
    installRestoreRehydrateListener,
  };

  try { installRestoreRehydrateListener(); } catch { /* preload may arrive later */ }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.RestoreRuntimeRehydrate;
  }
})(typeof window !== 'undefined' ? window : globalThis);
