# Phase 8 — Branch Switching Correctness

PR8 ensures that after a branch switch (or true process restart), every read, write, UI surface, and report reflects only the active branch scope — with no silent crossover from the previous branch.

## Single branch-context authority

| State | Authority | Notes |
|-------|-----------|-------|
| `lockedBranchId` | `DeviceConfig.lockedBranchId` + `branchLocked` | Permanent device binding |
| `allowedBranchIds` | User `branchScope` ∩ license branches | Owner `*` expands to enrolled branches |
| `activeBranchId` | `BranchAuthority.activeBranchId()` | Aggregate = `*`; else write branch or durable view |
| `operationalWriteBranchId` | `BranchContexts` session write key | `null` in Owner aggregate mode |
| Owner aggregate | `lastOwnerAggregate` (durable) + session `*` | Read-only for operational writes |

**Session-only (not restart authority):** `sessionStorage` keys `__tdw_active_branch__`, `__tdw_operational_write_branch__`.

**Durable restart authority:** `DeviceConfig.lastViewBranchId`, `DeviceConfig.lastOwnerAggregate`, device lock.

Fail-closed: no silent `BR-MAIN` when context is missing.

## A → B switching

1. `BranchSwitcher.applyBranchSwitch` — gate, block pending writes, `invalidateAll`, apply contexts, `persistDurableViewState`, await `rehydrateBranchView`, refresh scoped views.
2. `BranchSwitchCache.scopeGeneration` — stale async UI ops discarded.
3. `BranchSwitchForms` — open edit forms cannot save after generation bump / branch mismatch.

## Write safety

- `SqliteBridge.beginBundle` captures `capturedWriteBranchId`; bundle commits honor captured branch.
- `assertScopeMatch` — invariant violation if record branch ≠ write branch.
- Branch switch blocked while `hasPendingCommits()`.

## KV stores & Employee Ledger

- `BranchDataIsolation.mergeKvBranchSlice` / `sliceKvArrayForBranch`
- `SqliteBridge.commitKv` — branch-scoped merge + write gate
- `EmployeeLedger` — branch filter, stamp, cache invalidation

## Restart

`completeAuthenticatedLogin` → `BranchAuthority.restoreFromDurable` → `SqliteBridge.rehydrateBranchView`.

## Remaining risks

- `database:hydrate` loads all branches internally (exposed stores filtered only).
- `database:exportSnapshot` deferred to Backup/Admin.
- Long-running custom timers outside invalidator registry may need audit.
