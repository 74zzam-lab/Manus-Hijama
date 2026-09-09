# Attachments Lifecycle UAT

States: `PENDING` · `UPLOADING` · `SYNCED` · `FAILED` · `MISSING_REMOTE` · `QUARANTINED` · `DELETED`

| Check | Result |
|-------|--------|
| Renderer `AttachmentLifecycle` wired | CODE |
| Electron `attachments-ipc` validate/hash/read/write | CODE |
| Create → upload → SYNCED (unit) | CODE (`residual-closure`) |
| Delete propagation | CODE |
| Branch isolation helper | CODE |
| Device A/B pull + hash verify | **UNVERIFIED** |
| Resume / large file / offline / restore reconcile | **UNVERIFIED** |

Ready for main: **NO**
