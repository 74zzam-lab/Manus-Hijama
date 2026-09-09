# PR13 — Error Truthfulness + Upgrade/Migration Safety

**Branch:** `cursor/error-truth-migration-safety-7c71`  
**Parent:** `cursor/owner-admin-runtime-separation-7c71` (PR12)

## Scope

- Error truthfulness: structured IPC envelope, benign error classification, no programmer-error suppression
- Upgrade/migration safety: idempotent crash-safe orchestrator, schema v7 markers, READY gates
- **Not in scope:** UI redesign, feature work, sync architecture, Owner/Role policy changes

## A) Error catalog (before → after)

| Area | Before | After (PR13) |
|------|--------|--------------|
| Known codes | ~39 generic/sync/RBAC/SQLite | **51** codes incl. `branch_context_missing`, `sqlite_busy`, `sync_baseline_required`, `remote_revision_mismatch`, `owner_corrupted`, `migration_pending/in_progress`, `restore_*` |
| Aliases | Raw codes surfaced | `owner_count_invariant_violation` → `owner_corrupted`, `branch_id_required` → `branch_context_missing` |
| IPC failures | `{ ok:false, error, message }` | **Structured envelope:** `code`, `stage`, `userMessageAr/En`, `retryable`, `requiresAction`, redacted `diagnostic` |
| Benign whitelist | Divergent `index.html` vs `sync-engine.js`; suppressed generic `is not defined` | Shared `cloud/benign-operational-errors.js`; **never** suppress `ReferenceError` / random undefined |
| Silent catch | Unclassified in conflict queue mirror | Telemetry-only `logBenignMirrorFailure` with audit stage |

## B) Suppressed errors removed

- `isBenignCloudErr`: no longer treats arbitrary `* is not defined` as benign
- `sync-engine.js`: delegates to shared benign module (no divergent set)
- Programmer errors (`ReferenceError`, `TypeError`, non-optional-module undefined) → logged, not swallowed

## C) Migration inventory

| Step ID | Source | Action |
|---------|--------|--------|
| `owner_legacy_preserve` | Duplicate/missing owner rows | Fail-closed on duplicate IDs; preserve sole owner ID |
| `ls_conflict_queue_sqlite` | `__tdw_conflict_queue__` KV | One SQLite `sync_conflicts` row per logical conflict (dedupe) |
| `attachment_metadata_canonical` | Legacy manifest object/array | Canonical array in KV |
| `null_branch_assignment` | NULL `branch_id` rows | Deterministic `BR-MAIN` (single-branch); multi-branch → fail-closed |
| `encryption_settings_strip` | Active `settings.backupEncryption*` | Strip from active config; `legacyEncryptionImportSupported` meta for CDB2/CDBK import |
| `restore_settings_v2` | `backupRegistry` legacy entries | V2 semantics + `encryptedDirectRestoreBlocked` for CDB2/CDBK |

**Orchestrator flow:** detect → pre-backup → migrate steps → verify invariants → commit marker (`upgradeMigrationVersion=1`)  
**Crash safety:** `upgrade_migration_runs` tracks `in_progress`; resume via `resumeInProgressRun`  
**Schema:** migration `004_upgrade_markers` → **schema v7**

## D) Source-version matrix (tested)

| Source case | Expected |
|-------------|----------|
| Old profile + LS only | `migrate-from-json` + orchestrator (existing path); SQLite primary |
| Old SQLite + stale LS | SQLite wins (`sqlitePrimary` meta) |
| NULL branch rows (single-branch) | `BR-MAIN` assignment, no cross-branch leakage |
| Old Owner profile | Same owner ID preserved |
| LS conflict queue duplicates | One SQLite open conflict per record identity |
| Encrypted CDB2/CDBK backup | Import-only flag; no direct restore |
| Crash mid-migration | `in_progress` run → resume → completed marker |

## E) Post-migration invariants

Verified in orchestrator `verifyInvariants`:

- `PRAGMA integrity_check = ok`
- Owner primary count = 1 (no duplicate owner IDs)
- No unresolved null-branch in multi-branch mode
- Step markers prevent repeat on every startup

## F) READY gate blockers (new)

`operational-readiness` blocks when:

- `migration_pending` / `migration_in_progress` / `migration_failed`
- `owner_corrupted`
- `legacy_branch_migration_required` (unresolved null branch, multi-branch)
- Existing: `database_unhealthy`, `sqlite_primary_required`

## Files / functions

| File | Functions |
|------|-----------|
| `database/operational-error-truth.js` | `buildEnvelope`, `normalizeCode`, `CODE_ALIASES`, extended `CATALOG` |
| `database/operational-error-catalog.json` | Shared catalog snapshot |
| `cloud/benign-operational-errors.js` | `isProgrammerError`, `isBenignOperationalError` |
| `cloud/operational-error-truth.js` | Renderer mirror + envelope |
| `electron/security/ipc-validate.js` | `guard()` → `enrichResult` |
| `database/migrations/004_upgrade_markers.js` | Schema v7 run tracking |
| `database/upgrade-migration-orchestrator.js` | `assessUpgradeState`, `runUpgradePipeline`, `resumeInProgressRun` |
| `database/operational-readiness.js` | Migration/owner blockers |
| `electron/database/service.js` | Full write gate + `upgradeState` in status |
| `cloud/operational-readiness.js` | Renderer READY includes upgrade blockers |
| `cloud/conflict-queue.js` | `logBenignMirrorFailure` |
| `cloud/sync-engine.js` | Shared benign delegate |
| `index.html` | Load benign module; hardened `isBenignCloudErr` |

## Verification

```bash
node tests/baseline/test-pr13-error-truth-migration-safety.js
node scripts/verify-error-truthfulness.js
node tests/run-all.js
```

## Remaining risks

- Full Windows UAT of legacy LS-only clinic profiles not run in CI (matrix covered behaviorally in Node)
- Multi-branch null-branch assignment still requires explicit operator migration UI (fail-closed by design)
- Renderer catalog JSON is generated from Node — run regen if catalog edits skip cloud file

## After PR13

Stop feature development → **RC Consolidation / Final HEAD Freeze** (PR1→PR13 merge, full suite, single EXE, Windows + Google + Device A/B UAT).
