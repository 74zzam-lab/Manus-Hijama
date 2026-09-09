# Phase 0 — Git Baseline

**Branch:** `cursor/phase-0-git-baseline-7c71`

## What this branch does

- Extracts and publishes the full Tadawi/Hijama application source to the repository root
- Replaces the ZIP-only `main` layout with a normal Node/Electron project tree
- Adds stable-operational traceability documentation (no product code changes)

## What this branch does NOT do

- No SQLite, backup, sync, or RBAC logic changes
- No removal of encryption or branch isolation work

## Commits

| Commit | Summary |
|--------|---------|
| (see git log) | Publish source tree from v2-5-10 consolidation baseline |
| (see git log) | Add STABLE-OPERATIONAL traceability docs |

## Verification

```bash
npm ci
npm test   # legacy suite — not used as SoT for new phases
```

Operator: no UAT required for Phase 0.
