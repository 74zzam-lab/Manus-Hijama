> Hybrid adaptation note: sourced from Codex-20Phase docs; CSP/fonts/QR remain Cursor tip policy (local only).

# Database schema — version 11

The authoritative desktop database is `userData/database/tadawi.db`, SQLite with WAL, foreign keys, busy timeout, schema migrations, transactions, `quick_check`, and foreign-key verification. Before applying an unapplied schema to an existing data-bearing database, the runtime creates a consistent `.db` backup with `VACUUM INTO`, verifies it, and records SHA-256, size, and source/target versions. JSON payload columns preserve compatible fields while indexed columns support constraints and reports.

## Migration history

| Version | Scope |
|---:|---|
| 1 | Core clients, visits, invoices, appointments, workforce, roles, attachments, audit, settings, migration metadata |
| 2 | Performance indexes |
| 3 | Treatment plans, clinical notes, consents |
| 4 | Appointment rooms, blocks, leave, history, waitlist, follow-up |
| 5 | Finance V2: invoice/payment state, refunds, credit, cash sessions/movements |
| 6 | Workforce V2: split attendance, adjustments, commission rules, advances, payroll reopen |
| 7 | Assistant approval audit |
| 8 | Import batches and reversible changes |
| 9 | Document templates and print jobs |
| 10 | Branches, user access, numbering sequences, branch columns/indexes |
| 11 | Durable sync queue, conflicts, versions, device sessions, notifications, sync audit |

## Main relationships

- `clients` → `client_medical_history`, `treatment_plans`, `medical_notes`, `consents`, `visits`, `appointments`, `client_credit_ledger`.
- `employees` → `practitioners`, `attendance`, leave, commission rules, advances, payroll entries.
- `visits` → `visit_cups`, one invoice, optional medical notes/commission/follow-up.
- `invoices` → items, payments, refunds. Issued financial records use status/void/refund fields.
- `appointments` → history and follow-up; practitioner/room availability is enforced by the service.
- `payroll_periods` → entries and reopen events; attendance → segments and adjustments.
- `branches` → persisted user access and number sequences; operational tables carry `branch_id`.
- `sync_outbox` → optional conflict; record versions are unique by entity, record, and branch.

## Integrity and indexing

Foreign-key deletion behavior is explicit (`CASCADE`, `RESTRICT`, or `SET NULL`). Money/count fields reject negative values where invalid. Unique indexes protect file numbers per branch, usernames, visit invoices, cash session date/branch, import sequence, access pairs, and idempotency keys.

High-volume indexes cover client name/phone/identity/branch, visits and invoices by date/branch, appointment slots, attendance/payroll, expenses/refunds/payments, audit time, due sync queue, conflicts, and notifications.

## Compatibility snapshot

`kv_store` retains the application compatibility snapshot. `SnapshotRepository.replaceSnapshot` writes it and relational projections in one transaction and compares exact counts/financial totals. Sensitive fields are AES-GCM protected before storage when a field protector is configured. The schema 11 sync tables are relational operational metadata and are captured by full Backup V2 with the whole database.

## Cloud PostgreSQL schema

`server/migrations/001_cloud_platform.sql` defines the optional hosted data plane separately from desktop SQLite:

- tenants, users, user-to-branch access, and device sessions;
- versioned sync records and durable idempotency responses;
- append-only audit events and user notifications;
- tenant/branch composite keys, foreign keys, JSON checks, and change-sequence indexes.

All repository statements are parameterized and tenant-scoped. Apply the migration only after a verified PostgreSQL snapshot and using a dedicated migration identity.

Never modify production SQLite manually. Use migrations, tested service operations, or verified restore.
