# Phase 3 — Remove Backup V2 Runtime Encryption

**Branch:** `cursor/phase-3-remove-backup-encryption-7c71`  
**Parent:** `cursor/phase-2-transactions-crash-7c71`

## Requirement (#4)

New Backup V2 files are **plaintext ZIP** inside `.tdw` — no password on create/restore/schedule. Legacy encrypted envelopes (CDB2/CDBK) remain readable only via password or `importLegacy`.

## What changed

| File | Change |
|------|--------|
| `electron/backup-v2-core.js` | Plaintext ZIP create; `inspectBackupBuffer` detects encrypted vs ZIP; manifest `encryption.required: false` |
| `electron/backup-v2-legacy-import.js` | Migration-only legacy encrypted inspect |
| `electron/backup-v2-ipc.js` | `optionalBackupPassword`; `backup:v2:importLegacy` |
| `electron/backup-v2-scheduler.js` | Scheduled backup without stored password |
| `electron/preload.js` | `v2ImportLegacy` IPC |
| `index.html` | No password for create/schedule; restore prompts only for legacy encrypted |
| `cloud/restore-reconciliation.js` | Pre-restore emergency snapshot without password |

## What this branch does NOT do

- Legacy JSON backup encryption (`runBackupNow` / `settings.backup.encrypt`)
- Windows operator kill/disk tests
- Branch SQL isolation (Phase 4)

## Verification

```bash
node scripts/verify-backup-v2-plain.js
node tests/baseline/test-hybrid-backup-v2.js
```

## Operator UAT (you)

1. Create backup — no password prompt; file is valid ZIP
2. Restore plaintext backup — no password
3. Enable scheduled backup — no password stored
4. Legacy encrypted `.tdw` — password required via restore or «نسخة مشفّرة قديمة»
