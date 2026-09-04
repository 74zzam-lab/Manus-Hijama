# Stage 4 Category B — Maintainability

## Completed

| Item | Detail |
|------|--------|
| Docs archive | v2-5.9 fix notes → `docs/archive/v2-5-9-notes/` |
| Final-review copy | `docs/archive/final-review-2026-08/` |
| Ops inventory | `scripts/inventory-operational-keys.cjs` |
| Transition policy | Deferred until PC |
| Login activation IA | BootFlow primary; license support details |

## Not a rewrite

No application rewrite. Mega-renderer extract remains **incremental after PC** or as separate maintainability PRs with regression each step.

## Remaining debt (tracked)

1. `FEATURE_REGISTRY` inline vs `license/registries/`  
2. Remove V1 script after pilot  
3. Module extract plan under Stage 4 post-PC  
