# 06 — Cloud Sync Architecture (Target)

## Principle

**Backup V2 ≠ Sync Engine.** Backup remains DR. Sync is continuous, event-based, multi-device.

## Target shape

```text
Local SQLite
 + transactional outbox
 → server sync API
 → server revision / event log
 → inbox / apply engine
 → periodic snapshots
 → conflict policy
```

## Minimum event fields

`eventId`, `organizationId`, `branchId`, `deviceId`, `entityType`, `entityId`, `operation`, `payload`, `entityVersion`, `deviceTimestamp`, `serverTimestamp`

## Current Hybrid

- Drive `SyncEngine` JSON push/poll
- `pendingPushes` retry list
- Daily Backup V2 Auto
- **No** outbox table / server revision cursor

## Codex reusable

- Fastify `/v2/sync/mutations`, `/v2/sync/changes`, conflict resolve
- `CloudSyncService` client patterns

## Electron CSP

Allow only configured API origin in `connect-src` via trusted env — never `*`.
