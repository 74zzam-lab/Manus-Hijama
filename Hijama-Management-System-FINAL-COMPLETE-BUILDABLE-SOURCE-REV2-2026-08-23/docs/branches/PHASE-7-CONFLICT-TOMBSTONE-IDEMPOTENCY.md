# Phase 7 — Tombstone, conflict merge, idempotency hardening

**Branch:** `cursor/phase-7-conflict-tombstone-idempotency-7c71`  
**Parent:** `cursor/phase-6-sync-guards-7c71`

## Requirement (#8)

Harden sync correctness for deletes and duplicate enqueue:

- **Tombstone merge** — `delete_vs_update` / `update_vs_delete` → conflict; both tombstones auto-resolve by newer `deletedAt` / revision
- **Idempotency keys** — stable SHA-256 payload hash in outbox `idempotency_key`; `ON CONFLICT DO NOTHING` blocks duplicates
- **Bridge revisions** — `cupping-sqlite-bridge` outbox entries use table revision (not `Date.now()`)

## What changed

| File | Change |
|------|--------|
| `database/tombstone-policy.js` | Tombstone decision, `recordsConflict`, `applyTombstone` |
| `database/idempotency-keys.js` | Stable outbox key builder |
| `cloud/tombstone-policy.js` | Renderer mirror |
| `cloud/idempotency-keys.js` | Renderer mirror (catalog) |
| `database/sync-outbox.js` | Uses `idempotency-keys` module |
| `cloud/merge-policy.js` | Tombstone pre-check in `decideRecord` |
| `cloud/table-merge-policy.js` | Tombstone pre-check in `decideForTable` |
| `cloud/repository.js` | Tombstone delete via `TombstonePolicy.applyTombstone` |
| `database/peer-sync-engine.js` | `recordsConflict` for push/pull conflict detection |
| `cupping-sqlite-bridge.js` | Revision-based outbox entries |
| `index.html` | Load tombstone + idempotency scripts |

## Verification

```bash
node scripts/verify-tombstone-idempotency.js
node tests/baseline/test-v2-4-conflict-resolution.js
node tests/baseline/test-v2-4-outbox-dual-device.js
node scripts/verify-record-merge.js
```

## Operator UAT (you)

1. Delete client on device A, edit same client on device B offline → conflict queue shows delete vs update
2. Repeat save same table without changes → outbox does not grow duplicate rows (SQLite `sync_outbox` count stable)
3. Both devices delete same record → newer tombstone wins without manual conflict

## Not in this branch

- Attachment authority (Phase 8+)
- Owner/RBAC hardening
- UI conflict manager redesign
