# 02 — Module Wiring Matrix

| Module | Imported | Initialized | Called | Persisted | Restart-safe | Class | Evidence |
|--------|----------|-------------|--------|-----------|--------------|-------|----------|
| SyncEngine | index.html | CloudV2.init | VersionsIndex bump | SyncState + outbox enqueue | partial | WIRED BUT UNPROVEN | code |
| SqliteOutboxBridge | index.html | load | schedulePush | via IPC | yes if Electron | WIRED | code |
| sync_outbox | migration 002 | openDatabase | syncOp | tadawi.db | **yes** | WIRED + peer-proven | test-v2-4-outbox |
| sync_inbox_applied | migration 002 | pull path harness | markRemoteApplied | tadawi.db | yes | WIRED + peer-proven | test-v2-4-outbox |
| sync_conflicts | migration 002 | flush conflict | openConflict | tadawi.db | yes | WIRED + peer-proven | test-v2-4-conflict |
| DriveAdapter | yes | ensureConnected | upload/download | remote | token store | REAL Electron / MOCK browser | |
| atomicReplaceJson | google-drive | uploadCloud meta | sync JSON | Drive | N/A | WIRED BUT UNPROVEN | needs real UAT |
| DriveLayout id paths | yes | helpers | versions/ops | path strings | N/A | WIRED | code |
| Repository | yes | createRepository | setAll | localStorage adapter | yes | LOCAL SoT | SQLite SoT pending |
| OwnerHub | yes | render | enroll/push | license.json | partial | REAL local | remote E2E pending |
| DeviceRegistry request/approve/revoke | yes | APIs | Owner Hub TBD UI | license doc | partial | WIRED BUT UNPROVEN | |
| ConflictQueue | yes | enqueue | UI | localStorage | local | LOCAL ONLY | migrate to SQLite |
| attachment-sync | Node | helpers | tests | local blobs | yes local | LOCAL REAL | Drive E2E pending |
| FileRemote peer harness | tests | createDevice | flush/pull | file + sqlite | yes | REAL contract (not Drive) | automated |
| SyncErrorClassify | index + Node | classify | fail paths | N/A | N/A | REAL policy | unit test |

**Graduation rule:** Class becomes REAL only with Device A/B + remote evidence linked in REQUIREMENTS-TRACEABILITY.
