# V2-5.6 — Target Design

## Goals

Improve operational UX and visibility without changing correct business behavior.

## Delivered surfaces

1. **OpsProgress** (`cloud/ops-progress.js`) — honest stage/percent for backup, sync, restore.
2. **RestoreWizard** (`cloud/restore-wizard.js`) — select → validate → pre-summary → confirm → progress → post-summary.
3. **OpsStatus** (`cloud/ops-status.js`) — offline, reconnect, pending, conflicts, dead-letter, last sync, per-device.
4. **BackupHistory** (`cloud/backup-history.js`) — normalize, sort newest, restore-point selection, validation state.
5. **DangerConfirm** (`cloud/danger-confirm.js`) — typed confirm for wipe (`مسح الكل`) and restore overwrite (`استعادة`).
6. **ErrorRecoveryUx** (`cloud/error-recovery-ux.js`) — actionable AR/EN recovery; leak-safe.
7. **OpsLogRedact** (`cloud/ops-log-redact.js`) — strip email/bearer/password keys before export.
8. **UxI18n / UxA11y** — EN/LTR toggle helpers, focus/aria on critical dialogs.
9. **OpsUxBridge** — UI shell wiring into `index.html` host `#ops-ux-backup-host`.

## Non-goals (unchanged)

- Changing Backup V2 crypto format
- Fake incremental backup
- Softening RBAC or license gates
