# Phase 14 — Build reliability gates

**Branch:** `cursor/phase-14-build-reliability-gates-7c71`  
**Parent:** `cursor/phase-13-operational-readiness-7c71`

## Requirement (#15)

Close the Stable Operational Core arc with packaging gates and a master verifier:

- **Build gates** — electron-builder NSIS, asarUnpack, operational modules packaged
- **Index wiring** — phases 8–13 cloud modules loaded in `index.html`
- **Master verifier** — `verify-stable-operational-core.js` runs phases 1–14 scripts
- **npm scripts** — `verify:stable-operational-core`, `verify:build-reliability-gates`

## What changed

| File | Change |
|------|--------|
| `scripts/verify-build-reliability-gates.js` | Build + packaging + SOC module presence |
| `scripts/verify-stable-operational-core.js` | Master runner for phases 1–14 |
| `package.json` | npm verify scripts; `build:test` includes build gates |

## Verification

```bash
node scripts/verify-build-reliability-gates.js
node scripts/verify-stable-operational-core.js
npm run verify:stable-operational-core
npm run build:test
```

## Operator UAT (you)

1. `npm run build:win` on Windows host → installer produces without missing-module runtime errors
2. Installed app loads sync/RBAC/health scripts (no 404 in DevTools Network)
3. Operational save + sync work on packaged build (smoke after install)

## Stable Operational Core complete

Phases 0–14 traceability index covers the full independent verification chain.  
Windows installer smoke remains operator UAT after merge.

## Not in this branch

- Hybrid-schema Stage B additive migrations
- Full NSIS signing / Windows Store pipeline
- index.html split / UI redesign
