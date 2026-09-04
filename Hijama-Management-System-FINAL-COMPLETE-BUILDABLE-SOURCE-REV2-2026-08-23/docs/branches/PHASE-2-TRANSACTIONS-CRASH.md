# Phase 2 — Atomic Transactions / Crash Safety

**Branch:** `cursor/phase-2-transactions-crash-7c71`  
**Parent:** `cursor/phase-1-sqlite-sot-7c71`

## Requirement (#2, #3)

Compound operations (case + patient + inventory + cash drawer) must commit in **one SQLite transaction**. Crash mid-write must leave either full success or full rollback — no half records.

## What changed

| File | Change |
|------|--------|
| `database/sync-outbox.js` | `enqueueAtomicBundle`, `persistAtomic` |
| `electron/database/service.js` | `enqueueAtomicBundle`, `persistBundle` sync ops + `applyBundleSteps` |
| `cupping-sqlite-bridge.js` | `beginBundle` / `commitBundle` queues operational writes |
| `index.html` | `saveCase()` wraps save in atomic bundle |

## Write flow (saveCase)

```
beginBundle → DB.set / setAuthoritative (queued)
→ deductInventory / cash drawer (queued)
→ commitBundle → single SQLite transaction (tables + kv + outbox)
```

## What this branch does NOT do

- Process kill / disk full Windows tests (operator)
- Branch SQL isolation (Phase 4)
- Backup encryption removal (Phase 3)

## Verification

```bash
node scripts/verify-atomic-bundle.js
```

## Operator UAT (you)

1. Save case with inventory auto-deduct + cash payment → restart → all consistent
2. Kill app during save (Task Manager) → no half case without inventory, or half inventory without case
3. DB locked scenario if possible
