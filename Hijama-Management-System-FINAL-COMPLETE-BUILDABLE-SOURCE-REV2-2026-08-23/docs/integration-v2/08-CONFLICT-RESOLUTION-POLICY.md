# 08 — Conflict Resolution Policy

| Data class | Policy |
|------------|--------|
| Visits / invoices / payments | **Append-only** (no silent overwrite of finalized rows) |
| Client demographics | **Version check** + merge UI on conflict |
| License / roles / device binding | **Server-authoritative** |
| Settings (non-destructive) | Last-write-wins **per key** with audit |
| Sensitive concurrent edits | Explicit `sync_conflicts` record — no blind LWW |

## Rules

- Idempotent apply by `eventId`.
- Duplicate events never duplicate financial rows.
- Revoked device: stop accepting uploads; do not wipe local DB.
- License withdrawal: block writes; preserve local read/export until Owner decides.
