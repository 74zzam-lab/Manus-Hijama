# V2-5.2 — Module Wiring Matrix

| Module | File(s) | Status | Notes |
|--------|---------|--------|-------|
| Backup V2 local | backup-v2-core.js | REAL | V2-5.1 |
| Backup V2 cloud upload | createBackupWithUpload | DEAD CODE | Gate B wire |
| Scheduler | backup-v2-scheduler.js | WIRED BUT UNPROVEN | retention unused; fake cloudOk |
| Transfer resume | backup-v2-transfer.js | REAL download | upload resume MISSING |
| Cloud DB legacy | cloud-db-backup.js | REAL | LevelDB |
| BackupLayer JSON | cloud/backup-layer.js | REAL | not V2 |
| Peer sync | peer-sync-engine.js | REAL harness | |
| Outbox | sync-outbox.js | REAL | |
| SyncEngine product | cloud/sync-engine.js | WIRED BUT UNPROVEN | |
| Attachment sync | attachment-sync.js | LOCAL helpers | product UNWIRED |
| Error classify | sync-error-classify.js | REAL | |
| Owner Hub OBS | owner hub UI | PARTIAL | SyncState not SQLite counts |

## Gate B targets

1. Upload + retention + quota + no fake cloudOk
2. Outbox payload + dead-letter recovery
3. Attachment blob + conflict surface
4. A↔B↔C / offline evidence
