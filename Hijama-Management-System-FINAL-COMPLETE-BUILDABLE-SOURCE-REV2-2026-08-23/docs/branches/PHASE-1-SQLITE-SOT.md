# Phase 1 — SQLite Source of Truth

**Branch:** `cursor/phase-1-sqlite-sot-7c71`  
**Parent:** `cursor/phase-0-git-baseline-7c71`

## Requirement

Operational data must read from SQLite after boot — not localStorage as authority.

## What changed

| File | Change |
|------|--------|
| `index.html` | `DB.get` delegates operational keys to `SqliteBridge.readOperational` before LS fallback |
| `cupping-sqlite-bridge.js` | Memory SoT, `readOperational`, `bootFromSQLiteSoT`, expanded operational keys |

## Operator UAT (required)

1. Save patient → close app → reopen → same data.
2. After login, clear localStorage → operational lists still from SQLite.
3. Restart after invoice/booking save.

## Verification

```bash
node scripts/verify-sqlite-sot-readpath.js
```
