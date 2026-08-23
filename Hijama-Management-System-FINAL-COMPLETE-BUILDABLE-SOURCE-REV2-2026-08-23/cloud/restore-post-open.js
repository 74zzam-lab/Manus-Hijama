/**
 * PR9 — Post-restore open verification: hydrate gate + branch authority + reconciliation.
 */
(function (global) {
  'use strict';

  const GATE_POLL_KEY = '__tdw_restore_post_open_done__';

  async function readRestoreGateFromMain() {
    try {
      const api = global.cuppingElectron?.backup || global.tadawi?.backup;
      if (api?.v2Gate) return await api.v2Gate();
    } catch { /* empty */ }
    return null;
  }

  async function runPostOpenVerification(options) {
    options = options || {};
    if (typeof sessionStorage !== 'undefined') {
      try {
        if (sessionStorage.getItem(GATE_POLL_KEY) === '1' && !options.force) {
          return { ok: true, skipped: true, reason: 'already_verified_session' };
        }
      } catch { /* empty */ }
    }

    const gate = options.gate || (await readRestoreGateFromMain());
    if (!gate || gate.missing || !gate.verified || gate.failed) {
      return { ok: true, skipped: true, reason: 'no_verified_restore_gate' };
    }
    if (gate.postOpenComplete === true && !options.force) {
      return { ok: true, skipped: true, reason: 'post_open_already_complete' };
    }

    const stages = [];
    const fail = (code, stage) => ({ ok: false, error: code, stage, stages });

    try {
      stages.push('reopen_integrity');
      if (global.OperationalDbHealth?.refresh) {
        const health = await global.OperationalDbHealth.refresh({ force: true });
        if (health && health.ok === false) {
          return fail(health.error || 'restore_post_open_integrity_failed', 'reopen');
        }
      }

      stages.push('hydrate');
      if (global.SqliteBridge?.rehydrateBranchView) {
        const hyd = await global.SqliteBridge.rehydrateBranchView();
        if (hyd && hyd.ok === false) {
          return fail(hyd.error || 'restore_post_open_hydrate_failed', 'hydrate');
        }
      } else if (global.SqliteBridge?.hydrateIntoMemory) {
        const hyd = await global.SqliteBridge.hydrateIntoMemory();
        if (hyd && hyd.ok === false) {
          return fail(hyd.error || 'restore_post_open_hydrate_failed', 'hydrate');
        }
      }

      stages.push('branch_authority');
      if (global.BranchAuthority?.restoreFromDurable) {
        const restored = global.BranchAuthority.restoreFromDurable(global.currentUser);
        if (restored && restored.ok === false && restored.error === 'branch_context_missing') {
          return fail('restore_post_open_branch_context_missing', 'branch_authority');
        }
      } else if (global.BranchScope?.initSessionBranch) {
        global.BranchScope.initSessionBranch();
      }

      stages.push('reconciliation_required');
      try {
        const guarded = await global.SyncBaseline?.enterReconciliationRequired?.({ source: 'backup_v2_restore' });
        if (guarded?.ok === false) return fail(guarded.error || 'sync_lifecycle_commit_failed', 'reconciliation_required');
      } catch {
        return fail('sync_lifecycle_commit_failed', 'reconciliation_required');
      }

      if (global.RestoreReconciliation?.reconcileAfterRestore) {
        stages.push('reconciliation_pull');
        const checkpoint = global.RestoreReconciliation.getLocalCheckpoint?.() || null;
        const rec = await global.RestoreReconciliation.reconcileAfterRestore({
          snapshotCheckpoint: checkpoint,
          operationId: gate.backupId || null,
          source: 'backup_v2_restore',
        });
        if (rec && rec.ok === false) {
          return {
            ok: false,
            error: rec.error || 'restore_reconcile_incomplete',
            stage: 'reconciliation',
            stages,
            reconcileState: rec.state || null,
            pushBlocked: true,
          };
        }
        try {
          if (rec?.pushAllowed && global.SyncBaseline?.completeReconciliation) {
            const completed = await global.SyncBaseline.completeReconciliation({ source: 'backup_v2_restore' });
            if (completed?.ok === false) return fail(completed.error || 'sync_lifecycle_commit_failed', 'reconciliation_complete');
          }
        } catch { /* empty */ }
      }

      stages.push('owner_lifecycle');
      if (global.OwnerLifecycleAuthority?.reconcileAfterRestore) {
        const ownerRec = global.OwnerLifecycleAuthority.reconcileAfterRestore({
          gateId: gate?.backupId || null,
          source: options.source || 'backup_v2_restore',
        });
        if (ownerRec && ownerRec.ok === false && ownerRec.readyBlocked) {
          return fail(ownerRec.error || 'owner_invariant_violation', 'owner_lifecycle');
        }
      }

      try { sessionStorage.setItem(GATE_POLL_KEY, '1'); } catch { /* empty */ }

      if (typeof global.refreshAllBranchScopedViews === 'function') {
        global.refreshAllBranchScopedViews({ fromRestore: true });
      }

      return {
        ok: true,
        stages,
        reconciliationRequired: gate.reconciliationRequired !== false,
        pushBlockedUntilReconcile: true,
        gate,
      };
    } catch (e) {
      return fail(String(e?.message || e), 'reopen');
    }
  }

  global.RestorePostOpen = {
    runPostOpenVerification,
    readRestoreGateFromMain,
  };
})(typeof window !== 'undefined' ? window : globalThis);
