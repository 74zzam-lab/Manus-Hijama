# Phase 4 — Branch SQL Isolation

**Branch:** `cursor/phase-4-branch-sql-isolation-7c71`  
**Parent:** `cursor/phase-3-remove-backup-encryption-7c71`

## Requirement (#5)

Operational SQLite writes must be **branch-scoped** so saving one branch's in-memory slice does not delete another branch's rows. IPC reads by id must enforce branch scope.

## What changed

| File | Change |
|------|--------|
| `database/repositories/branch-slice.js` | Shared branch slice helpers |
| `database/repositories/index.js` | `replaceBranchSlice`, `countForBranch`, `getByIdScoped` |
| `electron/database/service.js` | Branch-scoped `persistTable`, bundles, `querySafe getById` |
| `cupping-sqlite-bridge.js` | Pass `branchId` on table persist and atomic bundles |
| `electron/main.js` / `preload.js` | `persistTable` optional `branchId` IPC arg |

## Write flow

```
UI save (branch view) → SqliteBridge.commitOperational / commitBundle
→ enqueueAtomicPersistTable with branchId
→ replaceBranchSlice (DELETE only rows WHERE branch_id = active branch)
```

## What this branch does NOT do

- Branch switch re-hydrate UI (Phase 5)
- Sync empty-push guards (Phase 6+)
- Owner aggregate SQL read paths

## Verification

```bash
node scripts/verify-branch-sql-isolation.js
```

## Operator UAT (you)

1. Two branches with clients — save on branch A → branch B clients remain in SQLite
2. Tamper branchId in DevTools persist → `branch_id_tamper` / denied
