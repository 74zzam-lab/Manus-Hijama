# Phase 11 — Migration safety

**Branch:** `cursor/phase-11-migration-safety-7c71`  
**Parent:** `cursor/phase-10-error-truthfulness-7c71`

## Requirement (#12)

Harden data migrations with mandatory backups, dry-run on copy, and automatic rollback:

- **Pre-backup gate** — refuse live migration when DB exists without `backupPath`
- **Dry-run** — runs import on temp copy; original file unchanged
- **Rollback** — on integrity/comparison failure, restore pre-migration backup
- **Truthful errors** — migration codes in operational error catalog + UI notify

## What changed

| File | Change |
|------|--------|
| `database/migration-safety.js` | Pre-backup, dry-run temp, rollback helpers |
| `database/migrate-from-json.js` | Wrap import with safety layer |
| `cloud/migration-safety.js` | Renderer enrich + notify on migration failure |
| `database/operational-error-truth.js` | Migration error catalog entries |
| `cloud/operational-error-truth.js` | Matching renderer catalog |
| `cupping-sqlite-bridge.js` | Truthful notify on `migrateAndEnable` failure |
| `index.html` | Load `migration-safety.js` |

## Verification

```bash
node scripts/verify-migration-safety.js
node scripts/verify-error-truthfulness.js
node database/migration-release.js
```

## Operator UAT (you)

1. SQLite migration on clinic with existing DB → pre-migrate `.db` backup created before import
2. Simulate failed migration (bad import) → clinic data restored from backup; Arabic error toast
3. Dry-run migration → no change to live `tadawi.db`

## Not in this branch

- Full migration UI wizard redesign
- Hybrid-schema Codex port (Stage B+ in SQLITE-SOT plan)
- Windows installer migration automation
