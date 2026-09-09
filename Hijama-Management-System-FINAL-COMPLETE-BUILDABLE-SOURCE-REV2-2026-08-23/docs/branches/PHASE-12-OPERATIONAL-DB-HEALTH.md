# Phase 12 — Operational DB health gates

**Branch:** `cursor/phase-12-operational-db-health-7c71`  
**Parent:** `cursor/phase-11-migration-safety-7c71`

## Requirement (#13)

Block operational writes and sync when SQLite is unhealthy:

- **Health assessment** — integrity + foreign keys + schema version at status/readiness
- **Write gates** — `persistTable`, `persistKv`, atomic sync ops refuse when unhealthy
- **Bridge gates** — `commitOperational` / `commitKv` check cached health
- **Sync readiness** — `database_unhealthy` in missing prerequisites list
- **Truthful errors** — catalog entries for health failure codes

## What changed

| File | Change |
|------|--------|
| `database/operational-db-health.js` | `assessHealth`, `assertWriteAllowed` |
| `cloud/operational-db-health.js` | Renderer cache + `isOperationalAllowed` |
| `electron/database/service.js` | Status enrichment + write gates |
| `cupping-sqlite-bridge.js` | Health gate on commits; refresh on hydrate |
| `cloud/sync-engine.js` | Readiness includes DB health |
| `database/operational-error-truth.js` | Health error catalog |
| `index.html` | Load `operational-db-health.js` |

## Verification

```bash
node scripts/verify-operational-db-health.js
node scripts/verify-migration-safety.js
node scripts/verify-error-truthfulness.js
```

## Operator UAT (you)

1. Corrupt `tadawi.db` (or inject FK violation) → saves blocked; sync readiness shows DB unhealthy
2. Healthy clinic → `database:status` includes `operationalHealth.ok: true`
3. Arabic toast on blocked save mentions backup restore (not raw PRAGMA text)

## Not in this branch

- Auto-repair / VACUUM on startup
- Owner Hub health dashboard redesign
- Hybrid-schema Stage B additive migrations
