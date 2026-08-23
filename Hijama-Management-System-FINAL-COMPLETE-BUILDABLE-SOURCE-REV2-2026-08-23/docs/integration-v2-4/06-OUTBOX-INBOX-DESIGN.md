# 06 — Outbox / Inbox Design

## Storage

SQLite tables (migration `002_sync_platform`, schemaVersion ≥ 5):

- `sync_outbox` — durable pending/inflight/acked/dead-letter
- `sync_inbox_applied` — idempotent apply ledger
- `sync_conflicts` — open/resolved conflicts with snapshots
- `sync_audit` — redacted operational audit
- `sync_meta` — revisions + table snapshots (peer harness)

## Atomic rule

`createSyncPlatform().enqueueAtomic(entry, mutateFn)` runs business mutation + outbox insert in one SQLite transaction.

## ACK rule

`ack(eventId, remoteFileId)` only after verified remote write (FileRemote verifies temp checksum; Google Drive `atomicReplaceJson` verifies temp before commit).

## Failure rule

`fail()` keeps event; exponential backoff + jitter; dead-letter after max attempts — never deletes on failed push.

## Production wiring

| Layer | Status |
|-------|--------|
| Node API `database/sync-outbox.js` | Implemented |
| Electron IPC `database:syncOp` | Implemented |
| Renderer `SqliteOutboxBridge` | Implemented |
| SyncEngine enqueue on schedulePush | Best-effort (payload often null until Repository SQLite SoT complete) |
| Outbox-driven primary flush replacing Drive-direct | IN_PROGRESS |

## Tests

- `test-v2-4-outbox-dual-device.js` — A↔B, restart pending, conflict, branch isolation, failed push retention
