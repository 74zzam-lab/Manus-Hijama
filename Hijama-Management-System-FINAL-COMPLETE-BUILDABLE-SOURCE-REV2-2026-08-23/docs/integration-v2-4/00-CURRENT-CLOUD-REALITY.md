# 00 — Current Cloud Reality (from production code)

**Branch tip inspection during V2-4 implementation.**  
**Baseline before V2-4 code:** `5b88f84` (traceability-only).  
**Outbox foundation commit:** `7e08067`+.

## Topology (actual)

```
Renderer (index.html loads cloud/*.js)
  → Repository / DbBridge / SyncEngine / SyncState
  → SqliteOutboxBridge → IPC database:syncOp → sync_outbox (SQLite)
  → DriveAdapter → BackupBridge (IPC) → google-drive.js
       optional atomicReplaceJson (temp→verify→commit)
Electron main
  → cloud-service + google-drive (OAuth + Drive API + safeStorage tokens)
  → database/service.js (better-sqlite3 + createSyncPlatform)
```

## Source of truth today

| Layer | Reality |
|-------|---------|
| Synced operational tables | Still primarily **localStorage / `DB` Repository**; SQLite clinic path parallel |
| Pending sync queue | **SQLite `sync_outbox`** (new) + legacy `SyncState.pendingPushes` (still present) |
| Transport | Google Drive JSON; ID-stable paths preferred: `NajjarTech/centers/{centerId}/branches/{branchId}/` |
| Backup | Separate Backup V2 — **not Sync** |

## Module classification (updated mid V2-4)

| Module | Class | Notes |
|--------|-------|-------|
| `database/sync-outbox.js` | WIRED BUT UNPROVEN for real Drive | Durable; peer FileRemote proven |
| `database/peer-sync-engine.js` | Harness REAL for file contract | Not closure for Cloud Sync |
| `cloud/sqlite-outbox-bridge.js` | WIRED | Electron IPC |
| `SyncEngine.schedulePush` enqueue | WIRED BUT UNPROVEN | payload often null |
| `google-drive.atomicReplaceJson` | WIRED BUT UNPROVEN | Needs real Drive UAT |
| `DeviceRegistry` approve/revoke | WIRED BUT UNPROVEN | New APIs |
| `attachment-sync.js` | LOCAL helpers REAL (unit) | Drive blob sync MISSING E2E |
| Hosted sync API | MISSING | Out of scope |

## Gaps remaining for Cloud Sync = PASS

1. Outbox-driven flush as primary path with full payloads (Repository SQLite SoT).  
2. Real multi-device A↔B installed Windows + real Google Drive evidence.  
3. Owner Hub remote device approval E2E.  
4. Attachment blob sync on Drive.  
5. Traceability all PASS + release gate exit 0.

## Non-negotiable preservations (V2-3.5)

Install lifecycle, app-only license preserve, icons, Electron 43, better-sqlite3 13, CSP, local QR/fonts.
