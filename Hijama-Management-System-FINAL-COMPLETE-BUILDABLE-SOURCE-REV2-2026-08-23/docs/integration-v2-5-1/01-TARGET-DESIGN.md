# V2-5.1 — Target Design (Restore & DR)

**Phase:** V2-5.1  
**Status:** Design registered before production implementation (Gate A → Gate B).

## Goal

Prove the clinic can be fully restored after device/DB loss without losing records, attachments, identity, or permissions — with fail-closed identity gates and atomic rollback.

## Target production path (Backup V2 primary for SQLite DR)

```text
UI (Settings Restore / Auto-DR)
  → preload backup.v2*
  → IPC backup:v2:create | backup:v2:restore | backup:v2:inspect
  → backup-v2-core
       create: Online Backup → ZIP roots → CDB2 encrypt → verify → write .tdw
               (+ centerId/branchId/organizationId/deviceId in manifest.source)
       restore: inspect → identity gate → stage → migrate → emergency backup
                → closeDatabase → swap roots → health → needRestart → relaunch
  → attachments/images/documents under restored roots
  → optional cloud download of authorized .tdw then same restore path
```

## Identity gate (fail closed)

Before any live swap:

1. Decrypt/inspect manifest.
2. Compare `manifest.source.centerId` / `organizationId` to live device binding (when live binding exists).
3. Compare `manifest.source.branchId` / `scope.branchIds` to authorized branch set.
4. Mismatch → throw typed error (`restore_center_mismatch` / `restore_branch_unauthorized`); **do not** touch live DB.
5. Corrupt/auth failure → same: leave live data intact; keep diagnostic/emergency copy when applicable.

## Atomic restore

- Stage outside live roots.
- Emergency backup of live DB when present.
- Close SQLite handle before rename swap.
- On any failure after close: rollback swaps + reopen DB.
- On success: `needRestart: true` and main process relaunches (mirror legacy).

## Auto latest authorized

1. Enumerate local `Backups/V2/*.tdw` + optional cloud backup list.
2. Inspect each with password/vault; skip decrypt failures.
3. Filter by identity gate.
4. Pick newest `createdAt` among authorized.
5. Restore that file through the same IPC path.
6. No silent empty-database fallback if restore required and fails.

## Legacy path during V2-5.1

- Keep legacy LevelDB/cloud-db-backup available (no silent deletion) to avoid V2-4 regression.
- Product UI for new DR flows prefers Backup V2 when `HYBRID_BACKUP_V2` is enabled.
- Document SoT: SQLite restore is authoritative for `database/tadawi.db` + listed roots; LevelDB primary UI remains a known dual-stack constraint until SoT cutover (tracked in regression notes).

## Scheduler

- `BackupV2Scheduler` constructed from `main.js` after app ready when V2 enabled.
- Password from OS credential vault only.
- Tick creates local V2 backup; optional upload hook when cloud available.

## Out of scope for V2-5.1 (later phases)

- Full SoT cutover / deleting LevelDB as primary UI store (may be V2-5.2+).
- New production security features unrelated to restore/DR or regression prevention.
- Merge to `main` (blocked until V2-5.7 + independent review).
