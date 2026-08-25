> Hybrid adaptation note: sourced from Codex-20Phase docs; CSP/fonts/QR remain Cursor tip policy (local only).

# Backup & Restore System V2

Date: 2026-07-27  
Backup format: `tadawi-backup-v2` / version `2`

## Purpose

Backup V2 is the canonical full-clinic backup path for the Electron application. A backup is not reported as successful until the source SQLite database, the encrypted archive, every manifest file hash, and the persisted destination file have all passed verification.

## Package format

Every new full backup is an authenticated `.tdw` envelope:

```text
CDB2 encrypted envelope (AES-256-GCM + scrypt)
└── ZIP
    ├── database/tadawi.db
    ├── attachments/
    ├── settings/
    ├── center-assets/
    ├── security/field-key.json
    └── backup-manifest.json
```

The field-encryption key is present only inside the password-encrypted envelope. Cache, temporary data, license-administration data, private keys, credential files, OAuth tokens, and secret-like setting properties are excluded. JSON settings are recursively sanitized before packaging.

`backup-manifest.json` records:

- format and backup version;
- unique backup ID and backup type;
- application/build version and creation time;
- source database schema version;
- center/device metadata;
- the expected restore roots;
- byte size and SHA-256 for every packaged file;
- encryption and integrity algorithms.

The manifest does not hash itself. The outer AES-GCM authentication covers the complete ZIP, including the manifest.

## Backup transaction

1. Run SQLite `quick_check` on the live database.
2. Use the SQLite Online Backup API to create a transactionally consistent `tadawi.db` snapshot.
3. Run `quick_check` on the snapshot.
4. Collect the approved roots and sanitize settings.
5. Generate SHA-256 entries and the manifest.
6. Compress the snapshot to ZIP.
7. Encrypt the ZIP with AES-256-GCM/scrypt.
8. Decrypt the in-memory result and verify the manifest, every hash, and SQLite again.
9. Commit the `.tdw` file through a temporary file and atomic rename.
10. Read the committed destination and verify it again.

An interrupted write or `ENOSPC` never creates a successful final file. Scheduled backup passwords are stored through the OS-bound credential vault, while `settings/backup-v2-schedule.json` contains only non-secret scheduling state.

## Restore transaction

1. Decrypt and authenticate the complete envelope.
2. Validate safe archive paths, manifest version, declared files, sizes, and SHA-256 values.
3. Reject a database schema newer than the running application.
4. Extract into a private staging directory without touching live data.
5. Run SQLite integrity checks and pending schema migrations on the staged database.
6. Create and verify an encrypted emergency backup of the current clinic.
7. Close the active database only after all earlier checks succeed.
8. Move current data roots to a timestamped rollback directory.
9. Atomically move staged roots into place and run a final database check.
10. Relaunch the application.

If any swap fails, every moved root and the prior field-encryption key are restored, and the database service is reopened. A successful restore retains both the emergency `.tdw` file and the rollback directory.

Older Phase 5 cloud packages remain readable. The compatibility adapter still creates a V2 emergency backup before allowing the legacy restore path to replace data.

## Local, scheduled, and Google Drive behavior

- Manual, export, operation-triggered, and scheduled Electron backups use the same V2 engine.
- Local full backups use unique `.tdw` names and configurable retention (default 20).
- Retention runs only after a new local backup has been fully committed and verified.
- Google Drive uploads start only after local verification.
- A Drive failure returns a clear local-only result and leaves the verified local backup intact.
- Remote pruning runs only after the new upload succeeds; automatic cloud backup can update its designated main file, while manual backups remain timestamped.
- Reauthentication and token storage continue through the Phase 5 OAuth credential vault.

## Operational error codes

The main process maps internal failures to clear user messages. Important codes include:

- `backup_authentication_failed`
- `backup_manifest_missing`
- `backup_version_unsupported`
- `backup_schema_newer_than_application`
- `backup_file_hash_mismatch`
- `backup_disk_space_insufficient`
- `backup_database_integrity_failed`
- `restored_sqlite_integrity_failed`

## Acceptance tests

`tests/backup/backup-restore-v2.test.js` covers empty and large backups, approved/excluded files, same-version restore, older-schema migration, corrupt packages, wrong passwords, backup interruption, restore interruption and rollback, Drive failure, insufficient disk space, manifest tampering, emergency backups, and scheduled credential handling.
