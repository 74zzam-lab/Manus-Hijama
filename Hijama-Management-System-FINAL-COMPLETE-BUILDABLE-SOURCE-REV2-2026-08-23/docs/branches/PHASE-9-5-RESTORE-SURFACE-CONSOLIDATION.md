# Phase 9.5 — Restore Surface Consolidation & Legacy DR Shutdown

**Branch:** `cursor/restore-surface-consolidation-7c71`  
**Base:** PR9 (`cursor/atomic-restore-recovery-7c71`)

## Goal

Single operational disaster-recovery authority: **Backup V2 atomic pipeline only**.

```
Disaster Recovery Restore
       ↓
Backup V2 Atomic Restore Pipeline ONLY
       ↓
validation → staging → integrity → safety snapshot → atomic swap
       ↓
post-open verification → reconciliation
```

No other path may replace the production database directly.

## Restore Surface Classification

| Surface | Before | Final classification | Can mutate production DB? | Uses PR9 pipeline? |
|---------|--------|----------------------|---------------------------|-------------------|
| `backup:v2:restore` / `restoreLatest` | Active | **ACTIVE_PRODUCTION** | Yes (atomic swap) | Yes |
| `backup:restoreDbBackup` (V1 LevelDB) | Gated by env | **DISABLED** | No | — |
| BootFlow / `confirmedCloudRestore` | Parallel “restore” | **SYNC_HYDRATE_NOT_DR** | Merge/pull only | N/A |
| JSON `RestoreStaging` / `SyncedWrite.restoreFromBackup` | Parallel DR | **MIGRATION_ONLY** | Only via validated bundle commit | Equivalent staging |
| `database:migrateFromBackup` | Privileged IPC | **MIGRATION_ONLY** | Only with `migrationOnly` / internal flags | — |
| CSV/JSON legacy import UI | Merge restore | **MIGRATION_ONLY** | Staged merge only | — |
| Encrypted `.tdw` via import UI | Decrypt+merge | **DISABLED** → routes to V2 | No | Yes (when user picks V2) |

## Changes

### Main process
- `electron/restore-authority.js` — DR authority constants and gates
- `electron/main.js` — `backup:restoreDbBackup` always returns `legacy_restore_disabled`; `database:migrateFromBackup` requires migration context
- `electron/backup-v1-gate.js` — `denyBackupV1Restore()` with no env bypass
- `electron/backup.js` — legacy restore permanently denied

### Renderer
- `cloud/restore-surface-authority.js` — migration-only merge gate
- `cloud/synced-write.js` + `cloud/restore-staging.js` — block DR via JSON merge
- `cloud/boot-flow-ui.js` — cloud = sync hydrate labels; `.tdw` → V2 wizard + execute
- `cloud/cloud-data-discovery.js` — progress stages renamed (no `atomic_swap` for hydrate)
- `index.html` — import ≠ restore; `.tdw` routes to Backup V2

## Definition of Done

- [x] 1 production DR authority (`backup:v2:restore*`)
- [x] 0 legacy direct DB replacement paths (V1 restore hard-disabled)
- [x] 0 renderer bypass for legacy restore (`legacy_restore_disabled`)
- [x] V1/legacy = migration only or disabled
- [x] Cloud hydrate = sync semantics, not DB replacement
- [x] All DR restores require PR9 pipeline (safety snapshot + validation + atomic swap + reconciliation)

## Tests

`tests/baseline/test-restore-surface-consolidation.js` — authority unit tests, env bypass attack, static wiring, classification contract.

## Next

PR10 — Conflict / Tombstone / Idempotency
