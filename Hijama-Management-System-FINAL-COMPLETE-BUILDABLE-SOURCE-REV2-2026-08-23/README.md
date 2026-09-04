# Tadawi Al-Madinah / Hijama Management System

**Production Source of Truth** for the Hijama Management desktop product.

Electron desktop application for cupping center operations (clients, visits,
bookings, payroll, licensing, backup).

| Role | Repo |
|------|------|
| **Production SoT (this repo)** | https://github.com/7uzzam/Tadawi-Clinic-Production |
| Development archive (do not delete) | https://github.com/7uzzam/Cupping-System-Management |

**Version:** 2.0.1 (V2-5.10 program)  
**Publisher:** NajjarTech  

**Production Candidate:** NO until live A–E on Installed Setup EXE.  
**Baseline score:** Overall **58** — do not inflate without independent re-score after A–E.  
Operator start: `docs/integration-v2-5-10/OPERATOR-HANDOFF.md`

**Stable operational core (in progress):** `docs/STABLE-OPERATIONAL-TRACEABILITY.md` — phase branches `cursor/phase-*-7c71`.

## Requirements

- Node.js **20 or 22 LTS only** (do **not** use Node 24 — no `better-sqlite3` prebuilds; needs Python/build tools)
- npm 10+
- Windows 10/11 for running the packaged app and full installer validation

## Daily Windows workflow (normal)

Inside the project folder:

```bat
npm ci
npm run build:prod
```

OAuth production credentials ship in `electron/cloud-oauth.production.b64` and decode automatically at `prebuild`. No manual copy, ZIP, or vendor files — `npm run build:prod` only.

## Why phase4 failed on your PC

- Node `v24.18.0` → no prebuilt `better-sqlite3` binary
- npm tried to compile from source → needs Python + Visual Studio Build Tools
- Fix = switch to Node 22 (preferred), not install Python for every clone

## Useful scripts

| Script | Purpose |
|--------|---------|
| `npm ci` | Clean install from lockfile (preferred) |
| `npm start` | Launch Electron app |
| `npm test` | Baseline + existing verification suite |
| `npm run lint` | ESLint (Phase-1 scoped) |
| `npm run verify` | lint + test |
| `npm run verify:sensitive` | Critical finance/license/backup checks |
| `npm run generate:brand` | Generate installer BMP/NSIS branding assets |
| `npm run release:gate` | Production release structural gate |
| `npm run build:prod` | Strict OAuth config + Windows installer build |
| `npm run build` / `build:win` | Package Windows installer |

## Documentation

- `docs/ARCHITECTURE-CURRENT.md` — current architecture baseline
- `docs/FEATURE-INVENTORY.md` — feature inventory
- `docs/KNOWN-ISSUES.md` — known issues
- `docs/BASELINE-RESULTS.md` — Phase 1 test baseline
- `CHANGELOG.md` / `MIGRATIONS.md`

## Phase roadmap

Stabilization → Electron security → Licensing V6 → SQLite → … → Enterprise release.
See the executive roadmap (20 phases). Do not merge breaking work without baseline comparison.
