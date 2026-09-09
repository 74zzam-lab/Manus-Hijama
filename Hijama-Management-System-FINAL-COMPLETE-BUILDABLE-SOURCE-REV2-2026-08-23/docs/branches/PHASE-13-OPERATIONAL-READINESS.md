# Phase 13 — Operational readiness

**Branch:** `cursor/phase-13-operational-readiness-7c71`  
**Parent:** `cursor/phase-12-operational-db-health-7c71`

## Requirement (#14)

Unified operational readiness for save, sync, restore, and diagnostics:

- **Aggregate gates** — DB health + legacy branch migration + sqlite primary
- **Status API** — `database:status` exposes `operationalReadiness`
- **Sync gate** — `runOnce` / `pushTable` blocked when not operational
- **Backup restore** — staged DB assessed via `operational-db-health` after migrate
- **Owner Hub** — diagnostics snapshot includes `operational` block

## What changed

| File | Change |
|------|--------|
| `database/operational-readiness.js` | `assessOperationalReadiness`, `assertOperationalReady` |
| `cloud/operational-readiness.js` | Renderer cache, `canWrite`, `canSync` |
| `electron/database/service.js` | Status includes `operationalReadiness` |
| `electron/backup-v2-core.js` | Restore health via full operational assessment |
| `cupping-sqlite-bridge.js` | `getOperationalReadiness`; refresh on hydrate |
| `cloud/sync-engine.js` | Operational gate on push/runOnce |
| `cloud/owner-hub.js` | Diagnostics `operational` section |
| `index.html` | Load `operational-readiness.js` |

## Verification

```bash
node scripts/verify-operational-readiness.js
node scripts/verify-operational-db-health.js
node scripts/verify-migration-safety.js
```

## Operator UAT (you)

1. After boot → `SqliteBridge.getOperationalReadiness()` shows `ok: true` on healthy clinic
2. Legacy branch pending → readiness blocked; sync push refused with Arabic message
3. Owner Hub diagnostics JSON includes `operational` with blockers when unhealthy

## Not in this branch

- Hybrid-schema Stage B additive migrations
- Auto-repair / VACUUM on startup
- Windows installer build gates (Phase 14 candidate)
