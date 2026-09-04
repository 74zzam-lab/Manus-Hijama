# Phase 10 — Error truthfulness

**Branch:** `cursor/phase-10-error-truthfulness-7c71`  
**Parent:** `cursor/phase-9-owner-rbac-hardening-7c71`

## Requirement (#11)

Surface truthful, actionable errors — never raw codes or secrets to operators:

- **Canonical catalog** — sync guards, RBAC, SQLite, drive codes → Arabic user messages
- **Redaction** — tokens/passwords stripped from audit `meta.raw` and display paths
- **Sync status** — `getStatus()` exposes `lastErrorMessageAr` alongside `lastError` code
- **SQLite commit** — failed authoritative writes notify with catalog message (not raw code only)

## What changed

| File | Change |
|------|--------|
| `database/operational-error-truth.js` | Node catalog, `present`, `enrichResult`, redaction |
| `cloud/operational-error-truth.js` | Renderer API + `notifyTruthful`, `enrichSyncStatus` |
| `cloud/sync-engine.js` | Readiness labels + status enrichment |
| `cloud/drive-errors.js` | Truthful messages + redacted audit meta |
| `cloud/operational-rbac-guard.js` | `userMessageAr` on deny results |
| `cupping-sqlite-bridge.js` | Truthful notify on commit failure |
| `index.html` | Load module; backup panel shows `lastErrorMessageAr` |

## Verification

```bash
node scripts/verify-error-truthfulness.js
node scripts/verify-operational-rbac.js
node tests/baseline/test-v2-5-6-ux-hardening.js
```

## Operator UAT (you)

1. Trigger `empty_push_blocked` → UI shows pull-first Arabic message (not raw code)
2. SQLite commit failure → message mentions restore, no token/password in toast
3. Drive quota error → quota message, not generic "unknown"

## Not in this branch

- Full ops log UI redesign
- Migration safety (Phase 11+)
