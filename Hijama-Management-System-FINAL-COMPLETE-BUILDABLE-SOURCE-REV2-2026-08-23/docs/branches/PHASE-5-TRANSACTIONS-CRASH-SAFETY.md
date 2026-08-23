# PR5 — Transactions & Crash Safety

**Branch:** `cursor/transactions-crash-safety-7c71`  
**Parent:** `cursor/sqlite-operational-truth-7c71`

## Requirement

Compound operational writes must be atomic in SQLite. Crash, exception, or DB lock mid-write must leave either full success or full rollback — no half records and no duplicate outbox events.

## What changed

| File | Change |
|------|--------|
| `database/sqlite-busy-retry.js` | SQLITE_BUSY / SQLITE_LOCKED retry wrapper |
| `database/sync-outbox.js` | Retry on `enqueueAtomic`, `enqueueAtomicBundle`, `persistAtomic` |
| `cupping-employee-ledger.js` | `saveStore` atomic bundle; double-click guard on `recordPayment` |
| `cloud/restore-staging.js` | Multi-table restore merge via single `commitBundle` |
| `cloud/synced-write.js` | Await atomic restore merge |
| `index.html` | `saveSharedPackageCase` wrapped in atomic bundle + busy guard |

## Covered compound paths

- **Case save** — patient + session + inventory + cash drawer (existing bundle, retained)
- **Shared case save** — two sessions + registry in one bundle (new)
- **Ledger payment** — accruals + payments + entries + settings in one bundle (new)
- **Restore merge** — multi-table staged apply in one bundle (new)
- **Restore swap** — atomic file swap + rollback (existing in `backup-v2-core.js`, tested in backup suite)
- **Sync outbox** — idempotent enqueue + atomic bundle (hardened with busy retry)

## Verification

```bash
node scripts/verify-transactions-crash-safety.js
node tests/baseline/test-transactions-crash-safety.js
node tests/run-all.js
node scripts/verify-stable-operational-core.js
```

## Operator UAT (deferred to final HEAD round)

1. Save case with inventory deduct + cash → restart → all consistent
2. Kill app mid-save → no half case without inventory
3. Double-click payment save → single voucher
