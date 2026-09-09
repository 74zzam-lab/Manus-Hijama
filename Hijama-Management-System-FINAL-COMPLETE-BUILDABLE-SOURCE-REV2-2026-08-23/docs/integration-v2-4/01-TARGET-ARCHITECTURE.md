# 01 — Target Architecture (V2-4)

## Pipeline

```
Application UI
  → Repository / Local SQLite (SoT)
  → Durable Outbox (+ business row) in ONE transaction
  → Sync Engine (flush / poll)
  → Google Drive Adapter (transport only)
  → Remote versions/manifest + branch-scoped JSON/objects
  → Peer devices Pull
  → Inbox ledger + Merge / Conflict
  → Local SQLite apply (atomic)
```

## Rules

1. Local SQLite is device SoT.
2. Drive is transport + versioned blobs — not per-read database.
3. Offline-first: all writes succeed locally then queue.
4. No silent last-write-wins across financial tables.
5. Branch isolation in UI, IPC, Service, Repository, Outbox, Cloud paths.
6. Google auth ≠ Owner authorization.
7. Backup ≠ Sync.
8. Idempotent push (ACK only after verified remote write).
9. Poll reads manifest first; downloads only changed objects.
10. Failure: STOP APPLY, preserve local DB + outbox + remote original, quarantine bad payload.

## Remote layout (centerId-keyed)

```
NajjarTech/{centerId}/
  license/
  config/
  branches/{branchId}/
    versions.json
    operational/*.json
    attachments/{hash}
  backups/
  audit/
  devices/
```

## Identity

- organizationId, centerId, branchId, deviceUuid stable.
- Rename never changes IDs or root paths.
- App-only reinstall preserves identity; full wipe does not delete remote center silently.
