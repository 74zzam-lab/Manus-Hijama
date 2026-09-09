# V2-5.2 — Current Reality (Backup & Cloud Sync Hardening)

**Phase:** V2-5.2  
**Branch:** `cursor/v2-5-2-backup-sync-c2ea`  
**Baseline:** V2-5.1 tip `200dc53` (release gate green)  
**Rule:** Classification from live code only.

## Summary

Backup V2 local DR is **REAL** after V2-5.1. Cloud upload of Backup V2 `.tdw` is **UNWIRED** (scheduler reports fake `cloudOk: true`). Sync has a proven peer/outbox contract (LOCAL ONLY / harness) while product SyncEngine still uses JSON Drive with partial outbox wiring.

## Backup stack

| Module | Path | Status |
|--------|------|--------|
| Backup V2 core local create/verify/restore | `electron/backup-v2-core.js` | **REAL** |
| Backup V2 IPC + UI | `backup-v2-ipc.js`, `index.html` | **REAL** (local) |
| `createBackupWithUpload` | core | **DEAD CODE** — no production caller |
| Scheduler | `backup-v2-scheduler.js` | **WIRED BUT UNPROVEN** — local only; fake cloudOk |
| Retention `retentionCount` | scheduler config | **UNWIRED** — never applied |
| Interrupted upload resume | — | **MISSING** (download staging resume REAL) |
| Quota on V2 upload | — | **MISSING** |
| Incremental / differential | — | **MISSING** (unsupported — document decision) |
| Legacy cloud-db-backup / BackupLayer JSON | `cloud-db-backup.js`, `backup-layer.js` | **REAL** but **not** Backup V2 format |

## Sync stack

| Module | Path | Status |
|--------|------|--------|
| Peer sync + FileRemote/DriveRemote | `database/peer-sync-engine.js` | **REAL** (harness) |
| Outbox SQLite | `database/sync-outbox.js` | **REAL** |
| Product SyncEngine | `cloud/sync-engine.js` | **WIRED BUT UNPROVEN** — null payloads common |
| Attachment blob sync product path | `attachment-sync.js` + DriveRemote | **UNWIRED** in SyncEngine |
| Dead-letter UI/requeue | outbox status only | **MISSING** product surface |
| Conflict SQLite → Owner Hub | peer REAL; UI localStorage parallel | **PARTIAL** |
| Token/401/403/404/429 classify | `sync-error-classify.js` | **REAL** classify; product path unproven E2E |
| Logout keeps pending | disconnect clears tokens only | **REAL** by separation — needs explicit test |

## Gaps blocking V2-5.2 DoD (pre-implementation)

1. Wire Backup V2 cloud upload; stop fake cloudOk.
2. Retention prune for local (+ cloud) V2 backups.
3. Upload resume / atomic remote commit; quota handling.
4. Document incremental/differential unsupported with rationale.
5. Harden product sync: full outbox payloads, dead-letter recovery, attachment blobs, conflict bridge.
6. A↔B↔C + offline/reconnect Windows/real-cloud evidence.
7. Accurate OBS counts from SQLite outbox/conflicts.
