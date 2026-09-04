# PR7 — Branch & Organization SQL Isolation

**Branch:** `cursor/branch-sql-isolation-7c71`  
**Parent:** `cursor/remove-backup-encryption-7c71` (PR6)

## Goal

Enforce `organizationId (centerId) + branchId` at trusted SQL/IPC/repository boundaries — not UI filtering alone. Branch A cannot read/write Branch B; forged IPC denied; owner aggregate read preserved; owner write requires explicit branch.

## Changes

| File | Change |
|------|--------|
| `database/operational-scope.js` | Trusted scope: write branch required, session access, owner aggregate read |
| `database/repositories/branch-slice.js` | `listForBranch`, `sumTotalForBranch` |
| `database/repositories/index.js` | `getAllForBranch`, `sumTotalForBranch` per table |
| `electron/database/service.js` | Fail-closed operational writes; scoped reads; `listForBranch` op |
| `electron/main.js` | IPC `branch_id_required`, session branch gate on persist/query |
| `cupping-sqlite-bridge.js` | No BR-MAIN write fallback; `assertOperationalWriteBranch` |
| `index.html` | Scoped topbar search + custom backup export |
| `cupping-system-improvements.js` | Scoped invoice search |
| `cupping-ext-modules.js` | Scoped inventory view |

## Verification

```bash
node scripts/verify-branch-sql-isolation.js
node tests/baseline/test-branch-sql-isolation-leakage.js
node tests/run-all.js
```

## Out of scope

- Branch switch rehydrate (PR8)
- UI redesign, Owner policy change, Google CAS, Backup refactor
