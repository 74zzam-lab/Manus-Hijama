# PR6 — Remove Data/Backup Encryption

**Branch:** `cursor/remove-backup-encryption-7c71`  
**Parent:** `cursor/transactions-crash-safety-7c71` (PR5)

## Goal

Remove **application-level encryption** from Backup V2 operational create/restore paths. New `.tdw` files are plaintext ZIP DR archives (SQLite + attachments + settings). Legacy encrypted envelopes remain **migration/import only** — never direct production restore.

## Out of scope (unchanged)

- Password hashing (`pbkdf2:` user/Owner credentials)
- OAuth token vault / license signature verification
- Legacy JSON backup encryption (`runBackupNow` / `settings.backup.encrypt`)
- UI redesign, Google CAS UAT, Branch Isolation

## Changes

| File | Change |
|------|--------|
| `electron/backup-v2-core.js` | `assertOperationalRestoreAllowed`; block encrypted in `restoreBackupFile` + `pickLatestAuthorizedBackup` |
| `electron/backup-v2-legacy-import.js` | Stage decrypted package under `Backups/V2/legacy-migration-staging` |
| `electron/backup-v2-ipc.js` | Reject encrypted buffer in `runRestore`; create without password |
| `electron/backup-v2-scheduler.js` | Scheduled backups without stored password |
| `index.html` | Restore blocks legacy encrypted → directs to import; create without password |
| `tests/baseline/test-remove-backup-encryption.js` | PR6 acceptance tests |
| `scripts/verify-backup-v2-plain.js` | Static checks for fail-closed operational path |

## Legacy compatibility

| Format | Operational restore | Migration import |
|--------|---------------------|------------------|
| Plaintext ZIP V2 (new default) | ✅ No password | N/A |
| CDB2 / CDBK encrypted V2 | ❌ `backup_legacy_encrypted_direct_restore_blocked` | ✅ Password + staging |
| Corrupt / unknown magic | ❌ `invalid_backup_format` | ❌ Fail closed |

## Verification

```bash
node scripts/verify-backup-v2-plain.js
node tests/baseline/test-remove-backup-encryption.js
node tests/baseline/test-hybrid-backup-v2.js
node tests/run-all.js
node scripts/verify-stable-operational-core.js
```

## Crypto files retained

| File | Why kept |
|------|----------|
| `electron/backup-crypto-v2.js` | Legacy CDB2/CDBK decrypt + SHA-256 for manifest integrity |
| User `pbkdf2:` hashes in `index.html` | Login password hashing — not backup layer |
| OAuth / license crypto modules | Unrelated security primitives |
