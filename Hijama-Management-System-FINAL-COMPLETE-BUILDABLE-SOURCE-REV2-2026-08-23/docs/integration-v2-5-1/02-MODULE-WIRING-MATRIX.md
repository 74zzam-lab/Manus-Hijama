# V2-5.1 — Module Wiring Matrix

**Baseline:** inspect at `427f1a4` before Gate B code.  
**Legend:** REAL | WIRED BUT UNPROVEN | LOCAL ONLY | MOCK | DEAD CODE | MISSING | UNWIRED

| Module | File(s) | Status | Imported | Initialized | Called | Persisted | Restart-safe | Notes |
|--------|---------|--------|----------|-------------|--------|-----------|--------------|-------|
| Backup V2 core | `electron/backup-v2-core.js` | REAL | Y | Y | Y (IPC/tests) | Y | Partial | Atomic swap; identity gate MISSING |
| Backup crypto V2 | `electron/backup-crypto-v2.js` | REAL | Y | Y | Y | Y | Y | CDB2 |
| Backup V2 IPC | `electron/backup-v2-ipc.js` | WIRED BUT UNPROVEN | Y | Y | If UI calls | N/A | N | No close/reopen/relaunch/metadata |
| Preload V2 API | `electron/preload.js` | WIRED | Y | Y | UNWIRED from UI | N/A | N/A | `v2Health/Create/Verify/Inspect/Restore` |
| Backup V2 scheduler | `electron/backup-v2-scheduler.js` | DEAD CODE | N from main | N | N | Config unused | N | Complete class, never started |
| UI Settings backup | `index.html` | UNWIRED (to V2) | Y | Y | Legacy only | Y | Y | Calls legacy paths |
| Clinic snapshot | `electron/clinic-snapshot.js` | REAL | Y | Y | Y | Y | Y | LevelDB ZIP |
| Cloud DB backup | `electron/cloud-db-backup.js` | REAL | Y | Y | Y | Y | Y | Drive CDBK |
| Legacy restore IPC | `main.js` backup:restoreDbBackup | REAL | Y | Y | Y | Y | Y | Relaunch |
| SyncedWrite restore | `cloud/synced-write.js` | REAL | Y | Y | Y | Y | Partial | Merge staging |
| Cloud backup layer | `cloud/backup-layer.js` | REAL | Y | Y | Y | Y | Y | JSON Drive — not V2 .tdw |
| Bootstrap hydrate | `cloud/bootstrap.js` | REAL (sync) / MISSING (DR snapshot) | Y | Y | Y | Y | Y | Not latest .tdw auto-restore |
| Identity reject restore | core + IPC | MISSING | — | — | — | — | — | REST-251-024/025 |
| tests/backup suite | `tests/backup/` | MISSING | — | — | — | — | — | Docs claim absent |
| Hybrid smoke test | `tests/baseline/test-hybrid-backup-v2.js` | REAL (LOCAL ONLY) | Y | Y | Y | temp | N/A | No identity/IPC/live DB |
| Feature flag | `HYBRID_BACKUP_V2` | REAL | Y | Y | Y | env | Y | Default ON |

## Production entry points (current)

| Entry | Location | Live? |
|-------|----------|-------|
| `registerBackupV2Ipc` | `main.js` ~556 | YES |
| `restoreBackupFile` | `backup-v2-core.js` ~429 | Core YES / product thin |
| `BackupV2Scheduler.start` | scheduler ~129 | NEVER |
| `restoreDbBackup` | cloud-db-backup + UI | YES |
| `runBackupNow` / `importData` | index.html | YES (JSON) |
| `CloudBootstrap.hydrateFromDrive` | bootstrap | Sync only |

## Gate B wiring targets

1. Pass `closeDatabase` / `reopenDatabase` / relaunch from IPC restore.
2. Enforce identity reject in core before staging/swap.
3. Pass center/branch/org/device into create.
4. Wire Settings UI to V2 create/restore (keep legacy labeled).
5. Start scheduler from main.
6. Auto latest authorized restore helper + bootstrap hook when empty/DR.
7. Add `tests/backup/` release-blocking suite.
