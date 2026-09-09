# Phase 9 — Atomic Restore & Recovery

PR9 hardens Backup V2 restore: staged, validated, reversible — production DB is not mutated until all pre-swap gates pass.

## Restore call graph

```
UI / backup:v2:restore
  → backup-v2-ipc runRestore
    → recoverInterruptedRestore (startup / IPC register)
    → backup-v2-core restoreBackupFile
        1. inspectBackupBuffer (validation: manifest, hashes, schema)
        2. assertIdempotentRestoreAllowed
        3. assertOperationalRestoreAllowed
        4. assertRestoreIdentityAllowed (center/org/branch)
        5. assertRestoreScopeTruthAllowed (scopeTruth)
        6. writeRestoreGate pending
        7. extractEntriesToStage → .restore-v2-stage-*
        8. databaseHealth + validateStagedAttachments + validateStagedSemanticInvariants
        9. migrateStagedDatabase (integrity_check, FK, operational-db-health)
       10. emergency .tdw safety backup (assertSafetySnapshotOk)
       11. closeDatabase
       12. createSafetyDatabaseCopy (DB file copy)
       13. atomic rename swap + rollback dir
       14. post-swap databaseHealth + countDatabaseRows
       15. writeRestoreGate verified + reconciliationRequired
  → app relaunch
  → completeAuthenticatedLogin
    → BranchAuthority.restoreFromDurable
    → RestorePostOpen.runPostOpenVerification
        → OperationalDbHealth.refresh
        → SqliteBridge.rehydrateBranchView
        → BranchAuthority.restoreFromDurable
        → SyncBaseline.enterReconciliationRequired
        → RestoreReconciliation.reconcileAfterRestore (pull only)
        → SyncBaseline.completeReconciliation (when pull ok)
```

## Validation gates

| Gate | Stage code | Module |
|------|------------|--------|
| Archive format / manifest / hashes | `validation` | backup-v2-core parseAndVerifyArchive |
| Center/org identity | `validation` | assertRestoreIdentityAllowed |
| scopeTruth / branch scope | `validation` | restore-v2-validation |
| Staged attachments | `staging` | validateStagedAttachments |
| PRAGMA integrity + FK + health | `integrity` | migrateStagedDatabase |
| Semantic invariants (owner count, branch IDs, orphans) | `integrity` | validateStagedSemanticInvariants |
| Emergency + DB safety copy | `snapshot` | createBackupFile + createSafetyDatabaseCopy |
| Atomic swap | `swap` | rename roots |
| Post-open integrity + hydrate | `reopen` / `hydrate` | RestorePostOpen |
| Reconciliation | `reconciliation` | RestoreReconciliation + SyncBaseline |

## Rollback path

- Before swap: stage dir removed; production untouched.
- During/after swap failure: `rollbackSwaps` from `.restore-v2-rollback-*`; `reopenDatabase`.
- Crash mid-swap: `recoverInterruptedRestore` on next IPC boot rolls back from rollback dir.
- Safety copies: emergency `.tdw` + `.restore-v2-safety-*` DB copy.

## Post-restore sync safety

- Gate file: `reconciliationRequired: true`
- `SyncBaseline.enterReconciliationRequired` on post-open
- Push blocked until `RestoreReconciliation.reconcileAfterRestore` pull completes
- `SyncBaseline.completeReconciliation` when pull succeeds

## Remaining risks

- `database:exportSnapshot` still outside restore path (Backup/Admin audit).
- Cloud/BootFlow hydrate restore (non-V2) not unified with this pipeline.
- Legacy `backup:restoreDbBackup` parallel path still exists.
- Resume orchestrator for pending gate without rollback dir is fail-closed only.

## Tests

- `tests/baseline/test-atomic-restore-recovery.js`
- `tests/backup/backup-restore-v2.test.js` (existing rollback/success)
