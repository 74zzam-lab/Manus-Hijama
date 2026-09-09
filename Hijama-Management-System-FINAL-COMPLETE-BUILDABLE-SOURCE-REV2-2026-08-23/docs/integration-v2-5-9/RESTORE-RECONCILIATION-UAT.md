# Restore Reconciliation UAT

| Check | Result |
|-------|--------|
| Mandatory pre-restore when local data exists | CODE |
| No immediate `post-*-restore` cloud push | CODE |
| `RestoreReconciliation.afterRestoreDataSourceSelected` pull-first | CODE |
| `assertPostRestorePushAllowed` gate | CODE |
| Staging + integrity + atomic swap (Backup V2) | prior CODE |
| Backup older than cloud → pull newer | UNVERIFIED |
| Interrupted restore | UNVERIFIED |
| Wrong center / multi-branch on branch-only device | UNVERIFIED |

**Forbidden phrase:** prefer pre-restore — it is **mandatory**.

Ready for main: **NO**
