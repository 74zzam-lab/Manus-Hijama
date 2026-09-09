# V2-5.1 — Current Reality (Restore & Disaster Recovery)

**Phase:** V2-5.1  
**Branch:** `cursor/v2-5-1-restore-dr-c2ea`  
**Baseline commit:** `427f1a4` (V2-4 release gate green)  
**Inspect date:** 2026-07-30  
**Rule:** Classification from live code only — not aspirational docs.

## Summary

Production disaster recovery still runs on the **legacy LevelDB/JSON** clinic-snapshot + cloud-db-backup path.  
**Backup V2** (SQLite `.tdw`) has a real core engine and registered IPC, but is **not productized**: UI never calls it, scheduler is never started, create IPC omits identity metadata, restore IPC omits close/reopen DB hooks, and wrong-center/branch reject is absent.

## Dual stacks

### A — Legacy (UI-active / LIVE)

| Module | Path | Classification |
|--------|------|----------------|
| Clinic ZIP (LevelDB) | `electron/clinic-snapshot.js` | **REAL** — create/restore Local Storage + IndexedDB |
| Cloud DB backup | `electron/cloud-db-backup.js` | **REAL** — Drive upload/restore CDBK |
| Legacy crypto | `electron/backup-crypto.js` | **REAL** |
| Main IPC restore | `electron/main.js` `backup:restoreDbBackup` | **REAL** — restore + `app.relaunch()` |
| Settings UI | `index.html` `runBackupNow` / `restoreCloudDbBackupItem` / `importData` | **REAL / WIRED** |
| JSON merge restore | `cloud/synced-write.js` + RestoreStaging | **REAL** — merge, not full file replace |
| Cloud JSON auto backup | `cloud/backup-layer.js` | **REAL** — not Backup V2 format |
| Renderer auto timers | `startAutoBackupTimer` / `startCloudDbAutoTimer` | **REAL** — legacy only |

### B — Backup V2 SQLite (engine REAL / product UNWIRED)

| Module | Path | Classification |
|--------|------|----------------|
| Core create/verify/restore | `electron/backup-v2-core.js` | **REAL** — Online Backup API, ZIP, CDB2, atomic swap + rollback hooks |
| Crypto V2 | `electron/backup-crypto-v2.js` | **REAL** |
| IPC registration | `electron/backup-v2-ipc.js` + `main.js:555-561` | **WIRED BUT UNPROVEN** — handlers exist; restore lifecycle incomplete |
| Preload | `electron/preload.js` `backup.v2*` | **WIRED** — exposed to renderer |
| Settings UI → V2 | `index.html` | **UNWIRED** — zero `v2Create` / `v2Restore` calls |
| Scheduler | `electron/backup-v2-scheduler.js` | **DEAD CODE** — never `require`d / started from `main.js` |
| Create metadata (center/branch/org) | `backup:v2:create` IPC | **MISSING** — manifest source fields empty in production create |
| Identity reject on restore | `restoreBackupFile` / IPC | **MISSING** |
| closeDatabase / reopenDatabase on IPC restore | `backup:v2:restore` | **UNWIRED** — hooks exist in core, not passed |
| Relaunch after V2 restore | IPC | **MISSING** (legacy path does relaunch) |
| Bootstrap auto latest snapshot | `cloud/bootstrap.js` | **MISSING** for Backup V2 — hydrate is sync tables, not `.tdw` DR |
| `tests/backup/` suite | docs claim | **MISSING** — only `tests/baseline/test-hybrid-backup-v2.js` smoke |

## SoT gap

`HYBRID_SQLITE_SOT` defaults off. UI primary remains LevelDB/localStorage dual-run.  
Restoring Backup V2 replaces `database/tadawi.db` (+ attachments/settings/center-assets) but does **not** replace LevelDB the UI still treats as primary until SoT cutover.

## Imported / Initialized / Called / Persisted / Restart-safe

| Module | Imported | Initialized | Called | Persisted | Restart-safe |
|--------|----------|-------------|--------|-----------|--------------|
| backup-v2-core | YES (IPC/tests) | N/A | YES (IPC/tests) | YES (file) | Partial (needRestart flag; IPC may not relaunch) |
| backup-v2-ipc | YES (main) | YES | YES if renderer calls | N/A | N/A |
| backup-v2-scheduler | NO from main | NO | NO | config file unused | NO |
| clinic-snapshot + cloud-db-backup | YES | YES | YES from UI | YES (Drive + local) | YES (relaunch) |
| CloudBootstrap hydrate | YES | YES | YES | sync state | YES — not DR snapshot |

## Gaps blocking V2-5.1 DoD (pre-implementation)

1. Identity/center/branch reject before swap (**REST-251-024/025**).
2. IPC restore close → swap → reopen/relaunch (**REST-251-007**, atomic live safety).
3. Create IPC fills source metadata (**REST-251-015**).
4. UI path to Backup V2 create/restore (**ARCH-251-001**, **REST-251-006**).
5. Scheduler started in main (**supports REST-251-005** local latest).
6. Auto select / restore latest authorized local+cloud backup (**REST-251-005/023**).
7. Automated `tests/backup/` + failure/rollback coverage.
8. Windows Device A/B UAT evidence for full DR scenarios.
9. Clarify LevelDB vs SQLite SoT for DR product path.

## Non-goals for this inspect note

- No PASS claimed here.
- No production code changed in Gate A registration commit.
- Secrets must never appear in evidence.
