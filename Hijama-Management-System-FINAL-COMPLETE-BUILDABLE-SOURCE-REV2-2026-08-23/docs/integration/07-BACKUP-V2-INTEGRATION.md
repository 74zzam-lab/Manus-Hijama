# Backup V2 Integration Plan

## Source

Codex: `electron/backup-v2-core.js`, `backup-v2-scheduler.js`, `backup-crypto.js` (CDB2), `atomic-file.js`

## Port rules

- Main-process only → **no CSP change**
- Optional upload callback only (cloud not mandatory)
- Do not replace Cursor legacy CDBK `backup-crypto.js` used by existing paths
- Adapt schema version detection for Cursor `meta.schemaVersion` / TEXT migrations
- Feature flag: `HYBRID_BACKUP_V2` (default enabled for IPC create/verify in tests; restore still cautious)

## Files to add

| File | Role |
|------|------|
| `electron/atomic-file.js` | Atomic writes |
| `electron/backup-crypto-v2.js` | CDB2 scrypt envelope (Codex crypto) |
| `electron/backup-v2-core.js` | Adapted core (hybrid-schema + crypto-v2) |
| `electron/backup-v2-scheduler.js` | Scheduler (local) |
| `electron/backup-v2-ipc.js` | IPC registration helper |
| `tests/baseline/test-hybrid-backup-v2.js` | Structural + roundtrip smoke |

## IPC channels (allowlisted)

- `backup:v2:health`
- `backup:v2:create`
- `backup:v2:verify`
- `backup:v2:inspect`
- `backup:v2:restore` (guarded; requires password ≥ 8)

## Tests required

- Full backup create (temp userData fixture)
- Verify
- Restore to temp dir
- Wrong password
- Corrupted file
- Missing DB
- Version/format field present (`tadawi-backup-v2`)

## Explicit non-goals this RC

- Selective cloud restore matrix (NG-19) full port
- Replacing UI backup screens entirely
- Accepting Codex backups that require schema v11 without foundation migrations
