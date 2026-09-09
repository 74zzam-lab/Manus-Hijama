# SQLite SoT Migration Plan (Hybrid)

## Goal

```text
SQLite = Single Source of Truth
```

**Constraint:** Do not remove Cursor dual-run (`cupping-sqlite-bridge.js`) in one commit. No full cutover in this RC foundation phase.

## Current state

| | Cursor tip | Codex |
|--|------------|-------|
| Schema | v4 via `001_initial.js` (`meta.schemaVersion`) | v11 via `database/schema.js` |
| Tracking | `schema_migrations.id` TEXT | `schema_migrations.version` INTEGER |
| Runtime | Dual-run bridge + localStorage | SoT + kv compatibility snapshot |
| Tables | 24 core | 59 (+ many ALTERs) |

## Comparison checklist

1. **Tables:** Codex-only groups — medical (v3), appointments extras (v4), financial extras (v5), workforce extras (v6), assistant (v7), import (v8), printing (v9), branches (v10), sync (v11).
2. **Fields:** Shared tables differ (e.g. Cursor `clients.key` / `is_vip`; Codex medical columns).
3. **Keys / indexes / FKs:** Must be diffed per migration before apply.
4. **Migration paths:** Cursor id-based vs Codex version-based — **hybrid-schema adapter** bridges Backup V2 health/migrate.
5. **Backup/restore:** Legacy CDBK retained; Backup V2 produces Cursor-schema archives initially.
6. **Import/export:** Keep Cursor engines until SoT tables exist.

## Staged plan

### Stage A — Foundation (this RC / H5)
- Add `database/hybrid-schema.js` adapter used by Backup V2.
- Add feature flag `HYBRID_SQLITE_SOT=0` (default off).
- Document mapping Cursor ↔ Codex tables.
- Add dry-run script `scripts/sqlite-sot-dry-run.mjs` (row counts + integrity).
- **Keep** dual-run bridge active.

### Stage B — Additive schema (future)
- Port Codex migrations v3–v6 as **additive** numbered migrations without deleting Cursor columns.
- Dual-write optional experimental path behind flag.

### Stage C — Read SoT (future)
- UI reads from SQLite repos when flag on; bridge write-through remains.

### Stage D — Write SoT / retire bridge (future)
- Disable localStorage mirror after checksum parity N days.
- Backup before cutover mandatory.

## Safety requirements (every stage)

- Backup before migration (Backup V2 or legacy)
- Migration version recorded
- Dry-run mode
- Validation: `PRAGMA integrity_check`, `foreign_key_check`
- Row counts for clients/visits/invoices/appointments
- Optional SHA-256 of sorted id lists
- Rollback: restore backup; feature flag off
- **Never** lose clients / visits / invoices

## Rollback

1. Set `HYBRID_SQLITE_SOT=0`
2. Restore pre-migration `.tdw` / emergency backup
3. Revert migration commit if needed

## This RC acceptance

`SQLite SoT: PARTIAL` — foundation + adapter + plan + dry-run tool; dual-run still default.
