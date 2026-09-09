# 08 — Backup / Restore Cloud UAT (separate from Sync)

**Rule:** Backup ≠ Sync. Snapshot backup must not be claimed as incremental event sync.

## V2-3.5 baseline

Backup V2 / restore staging integrity — must remain green (REG rows).

## V2-4 requirements

| Case | Result |
|------|--------|
| Manual + scheduled backup independent of outbox flush | NOT_STARTED on dual-device cloud |
| Encrypted backup if policy enabled | Follow existing Backup V2 policy |
| Restore to staging, validate, then apply | Existing staging path — re-prove after sync |
| Restore then sync with Device B — no duplicate storm | NOT_STARTED |
| Corrupt backup quarantined; local preserved | NOT_STARTED |
| Wrong center/license rejected | NOT_STARTED |
| Backup failure does not stop local work | Design intent; runtime evidence pending |

Evidence will live under `docs/integration-v2-4/evidence/backup-restore/`.
