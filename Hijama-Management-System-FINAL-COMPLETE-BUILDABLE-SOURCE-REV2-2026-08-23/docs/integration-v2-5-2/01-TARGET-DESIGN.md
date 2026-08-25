# V2-5.2 — Target Design

## Backup V2 cloud path

```text
UI / Scheduler
  → backup:v2:create | scheduled tick
  → createBackupFile (local atomic .tdw)
  → optional createBackupWithUpload → Drive binary put
       on success: verify remote hash; prune retention
       on fail: localOk=true, cloudOk=false, classify quota/network; never mark partial remote valid
```

## Incremental / differential

**Decision:** Not implemented as Backup V2 formats. Full snapshot backups remain the DR unit. Operational deltas are the responsibility of Cloud Sync (outbox revisions). Documented in BACK-252-003/004.

## Sync hardening

- Outbox rows carry full entity payload (no null-only enqueue for push).
- Flush prefers SQLite outbox; pending survives disconnect/logout.
- Dead-letter list + requeue IPC; Owner Hub shows counts from SQLite.
- Attachment meta + blob put/get with retry.
- Conflicts open in `sync_conflicts` and surface to Hub; resolutions propagate.
- Error classify (token/401/403/404/429/corrupt) applied on product flush path.

## Non-goals

- Deleting legacy LevelDB backup path in this phase (keep labeled).
- Merge to main.
