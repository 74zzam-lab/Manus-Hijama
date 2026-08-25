# Phase 10 — Conflict / Tombstone / Idempotency

**Branch:** `cursor/conflict-tombstone-idempotency-7c71`  
**Base:** PR9.5 (`cursor/restore-surface-consolidation-7c71`)

## Goal

Prevent lost updates, resurrected deletes, duplicate operations, and multiple conflict authorities — without changing sync architecture, backup, restore, or UI.

## Conflict Authority (Before → After)

| Aspect | Before | After |
|--------|--------|-------|
| Runtime authority | localStorage queue primary + SQLite dual-write | **SQLite `sync_conflicts` only** when bridge primary |
| Conflict ID | `cf-${Date.now()}-${random}` / UUID | **Stable:** `cf:{center}:{branch}:{table}:{recordId}` |
| Open dedupe | Per LS array index | **Unique partial index** on open record identity |
| LS queue | Read/write authority | **Read-only cache** for UI compatibility |

## Tombstone Schema / Policy

Tombstones are **inline record fields** (no separate table):

| Field | Required | Purpose |
|-------|----------|---------|
| `deletedAt` | Yes | Tombstone marker |
| `revision` | Yes | Causal ordering |
| `branchId` | Yes | Cross-branch isolation |
| `deviceId` | Recommended | Origin device |
| `operationId` | When available | Idempotent delete tracking |
| `updatedAt` | Yes | Timestamp tie-break |

**Retention policy** (`TOMBSTONE_RETENTION`):

- `MIN_RETENTION_DAYS: 90`
- `REQUIRE_ALL_DEVICES_PASSED: true`
- `CLEANUP_ENABLED: false` (no aggressive cleanup in PR10)

**No resurrection:** `assertNotResurrecting()` blocks upsert on tombstoned records unless `options.revive === true`. Tombstone wins over stale live edits when deletion revision/time is newer.

## Idempotency Key Strategy

| Layer | Key format |
|-------|------------|
| Record op with `operationId` | `{center}:{branch}:{table}:{recordId}:{op}:{operationId}` |
| Record op without opId | `{center}:{branch}:{table}:{recordId}:{op}:{newRevision}:{payloadHash}` |
| Table bump | `{center}:{branch}:{table}:TABLE_BUMP:{base}:{new}:{payloadHash}` |

Outbox: `INSERT ... ON CONFLICT(idempotency_key) DO NOTHING`  
Inbox: `UNIQUE(center, branch, table, remote_revision, payload_hash)`

## Key Files

| File | Role |
|------|------|
| `database/conflict-keys.js` | Stable conflict ID builder |
| `database/migrations/003_conflict_authority.js` | Unique open-conflict index |
| `database/sync-outbox.js` | Uses stable conflict IDs |
| `database/tombstone-policy.js` | Wins-over-stale + resurrection guard + retention |
| `database/peer-sync-engine.js` | Per-record merge on pull; upsert guard |
| `cloud/conflict-queue.js` | SQLite-first authority |
| `cloud/conflict-keys.js` | Renderer mirror |
| `cloud/tombstone-policy.js` | Renderer mirror |
| `cloud/repository.js` | Upsert resurrection block |
| `cloud/idempotency-keys.js` | operationId-aware keys |

## A/B Scenarios Tested

1. A creates R → B pulls → A deletes R → B offline stale edit → B reconnects → **R stays deleted**
2. Duplicate outbox `operationId` → **one row**
3. Conflict resolve → retry resolve → **idempotent no-op**
4. Same-record dual edit → **one stable open conflict**
5. Branch A vs B → **zero cross-branch conflict bleed**

## Tests

- `tests/baseline/test-pr10-conflict-tombstone-idempotency.js` (new)
- Full suite must stay **118+ PASS**

## Remaining Risks

- Drive/cloud renderer pull path still uses `RecordMerger` → LS enqueue (SQLite mirror); peer engine path is hardened
- Tombstone cleanup job not implemented (intentionally deferred)
- Live Windows Device A/B UAT still UNVERIFIED (Category A)

## Next

PR11 — Owner Lifecycle
