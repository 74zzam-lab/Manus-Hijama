# Phase 5 — Branch Switch Hardening

**Branch:** `cursor/phase-5-branch-switch-hardening-7c71`  
**Parent:** `cursor/phase-4-branch-sql-isolation-7c71`

## Requirement (#6)

On branch switch, UI must **re-hydrate from SQLite** and show only the active branch (or aggregate when All Branches). Writes must remain branch-scoped without corrupting `lastCommitted` for other branches.

## What changed

| File | Change |
|------|--------|
| `cupping-sqlite-bridge.js` | `rehydrateBranchView`, view filter on read/hydrate, merge on branch-scoped writes |
| `cloud/branch-switcher.js` | Awaits `rehydrateBranchView` before UI refresh |

## Behavior

- `lastCommitted` holds **all branches** after SQLite hydrate
- Globals / `readOperational` return **branch-filtered** view (or all in aggregate mode)
- `commitOperational` merges branch slice into full `lastCommitted` after SQL write

## What this branch does NOT do

- Sync empty-push guards (Phase 6+)
- Owner SQL aggregate reads at IPC layer

## Verification

```bash
node scripts/verify-branch-switch-rehydrate.js
```

## Operator UAT (you)

1. Clients on BR-A and BR-B — switch A→B → lists show B only
2. Switch back → A data visible; B data not leaked in forms
3. Save on A after switch → B rows unchanged in SQLite
