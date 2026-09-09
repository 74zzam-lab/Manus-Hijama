# SQLite Source of Truth Cutover

| Item | Status |
|------|--------|
| `enqueueAtomicPersistTable` in main syncOp | CODE |
| `SqliteBridge.commitOperational` | CODE |
| `enableSqlitePrimary` IPC | CODE |
| Write-through fails loudly (no silent LS-only success for users/settings) | CODE |
| Dual-write divergence eliminated on all paths | REMOVED optimistic operational cache — commit-then-mirror + restoreLastCommit |
| Same-transaction outbox for every UI write | CORE tables use enqueueAtomicPersistTable; Repository bump skipOutbox when authoritative |
| Windows proof | **UNVERIFIED** |

## Rule

Operational SoT = SQLite. localStorage = cache / UI prefs only.

## Tests

- Unit: v2-5.9 + rbac audit  
- Windows: MULTI-DEVICE-WINDOWS-UAT **UNVERIFIED**
