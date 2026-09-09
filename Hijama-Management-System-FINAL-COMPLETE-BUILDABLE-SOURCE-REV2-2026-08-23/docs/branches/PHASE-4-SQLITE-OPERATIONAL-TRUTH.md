# PR4 — SQLite Operational Truth

**Branch:** `cursor/sqlite-operational-truth-7c71`  
**Parent:** `cursor/backup-scope-truth-dr-readiness-7c71`

## Requirement

SQLite is the sole authority for operational data in Electron. `localStorage` must not resurrect stale data over SQLite for patients, sessions, bookings, invoices/payments, inventory, employees, users, Owner profile, conflicts, and attachments metadata.

## What changed

| File | Change |
|------|--------|
| `database/sqlite-operational-registry.js` | Canonical operational key catalog + LS block helper |
| `cupping-sqlite-bridge.js` | Registry wiring, stale LS guard on hydrate, expanded KV mirror + syncMemory |
| `index.html` | Block LS fallback for operational keys; expand `reloadClientStoreFromDb` |
| `scripts/verify-sqlite-operational-truth.js` | Static verifier |
| `tests/baseline/test-sqlite-operational-truth.js` | Runtime: hydrate, stale LS, restart, failed write, mixed profile |

## Operator UAT (deferred to final HEAD round)

1. Save patient → close app → reopen → same data from SQLite.
2. After login, tamper localStorage → operational lists still from SQLite.
3. Restart after invoice/booking/inventory save.

## Verification

```bash
node scripts/verify-sqlite-operational-truth.js
node tests/baseline/test-sqlite-operational-truth.js
node tests/run-all.js
node scripts/verify-stable-operational-core.js
```
