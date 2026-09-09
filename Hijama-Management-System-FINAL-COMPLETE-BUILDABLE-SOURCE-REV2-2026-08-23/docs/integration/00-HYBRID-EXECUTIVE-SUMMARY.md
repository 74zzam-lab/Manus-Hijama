# Hybrid Production Candidate — Executive Summary & Planning Report

**Branch:** `integration/hybrid-production-candidate`  
**Base:** `origin/cursor/fix-local-qr-csp-c2ea` @ `c1efdd3`  
**Mode:** Selective port from Codex extract (not full merge)  
**App version:** 2.0.0  

---

## Planning Only (pre-execution decisions)

### Cursor changes to preserve
All commits from `cursor/phase-20-production-release-c2ea`..`cursor/fix-local-qr-csp-c2ea` (~30 commits), including:
- Local WOFF2 fonts + `@font-face` + print font URL hardening
- Strict CSP (no Google Fonts / no `api.qrserver.com`)
- Local QR (`cupping-qr-local.js` + vendor)
- Receipt EN fallback `Cupping Center` + Phase 9 test alignment
- Phase 4 SQLite ABI test clarity
- NextGen 21–40 Owner Hub layers
- OAuth/NSIS/activation UX fixes
- Windows verify / brand asset automation
- Font/QR audit tests

**Must preserve: YES** for all functional commits (see `01-CURSOR-POST-PHASE20-CHANGES.md`).

### Codex components recommended
- Build icon embedding strategy: `signAndEditExecutable: true` on Windows (+ explicit BrowserWindow icon)
- Backup V2 core/scheduler (+ crypto v2 + atomic-file) behind secure IPC / feature flag
- SQLite SoT **foundation** (schema adapter + migration plan; **no full cutover in one commit**)
- Domain services starting with appointments (adapter over Cursor snapshot/bridge)
- Installer lifecycle ideas (`install-lifecycle.js`, update fail-closed) — selective
- Operational manuals (AR) adapted to Hybrid paths
- `npmRebuild: false` packaging note where it improves Windows rebuild control
- Design-system CSS as **optional additive** (local fonts only)

### Codex components rejected
- Google Fonts CDN / CSP allowlists
- `api.qrserver.com` and any remote QR (+ tests that assert it)
- Full Electron 33→39 + better-sqlite3 11→13 jump in this RC
- Full Codex `database/schema.js` v11 cutover without staged migration
- Full `renderer/` rewrite
- Fastify `server/` as required desktop dependency
- Codex OAuth secrets / any additional embedded secrets
- ZIP-only history as source of truth

### Build/icon root cause
ICO files are **byte-identical** (`build/Program-Icon.ico`, SHA256 match).  
Cursor sets `build.win.signAndEditExecutable: false` → electron-builder **skips rcedit**, so Windows EXE often keeps **default Electron icon**.  
Codex sets `true` → rcedit embeds icon into EXE/shortcuts metadata.

Neither tree sets `BrowserWindow({ icon })` explicitly (window/taskbar rely on EXE resource).

ICO currently has 16/32/48/64/128/256 — **missing 24×24** (will add).

### Recommended Electron version
**`^33.2.0` (Cursor)** — keep for Hybrid RC.

### Recommended electron-builder version
**`^25.1.8` (Cursor)** — keep; adopt Windows `signAndEditExecutable` behavior without forcing builder 26.

### Recommended better-sqlite3 version
**`^11.10.0` (Cursor)** — keep ABI pairing with Electron 33.

### Expected conflicts
- `backup-crypto.js` format (CDBK vs CDB2) → introduce `backup-crypto-v2.js`, leave legacy intact
- `schema_migrations` shape (TEXT id vs INTEGER version) → hybrid schema adapter
- Codex services expect v4+ domain tables Cursor lacks → adapters / feature flags
- `installer.nsh` diverged (Cursor wipe fixes vs Codex lifecycle) → **keep Cursor NSH**; port lifecycle as separate modules only

### Migration risks
- Dual-run data drift if SoT enabled prematurely
- Restoring Codex v11 `.tdw` into Cursor schema unsupported initially
- Enabling `signAndEditExecutable` may fail on Linux CI without Wine — gate by platform/script
- Domain UI still monolith — service port without UI wiring = dead code risk (wire minimally + tests)

### Proposed commits
1. `docs(integration): planning and protected feature matrix`
2. `chore(build): embed Windows program icon via rcedit + window icon`
3. `docs(deps): lock Hybrid RC on Electron 33 / sqlite 11 / builder 25`
4. `feat(backup): port Backup V2 core behind secure IPC`
5. `feat(database): add SQLite SoT foundation + hybrid schema adapter`
6. `feat(appointments): port appointment V2 service with Cursor adapter`
7. `feat(ui): add optional design-system stylesheet (local fonts)`
8. `docs(ops): port adapted Arabic operational manuals`
9. `test(integration): hybrid gates for backup/icon/fonts/qr`
10. `docs(integration): Hybrid RC verification reports`

### Execution order
H1 → H2 → H3 → H4 → H5 → H6 → H7 → H8 → H9 → H10 (no skipping).

### Rollback strategy
- Git revert per commit (small commits)
- Feature flags: `HYBRID_BACKUP_V2=0`, `HYBRID_SQLITE_SOT=0`, `HYBRID_APPOINTMENTS_V2=0`
- Legacy backup CDBK path remains default until V2 verified
- Dual-run bridge remains until SoT cutover checklist passes
- Icon: revert `signAndEditExecutable` to false if Windows CI breaks

---

## Success definition for this agent pass
- Branch exists from Cursor tip
- Protected Cursor features intact (`npm test` green)
- Icon packaging configured correctly (Windows runtime verification may be PARTIAL on Linux)
- Backup V2 + SoT foundation + selective domain port present behind flags
- Full docs under `docs/integration/`


## Execution outcome

Completed H1–H10 on branch `integration/hybrid-production-candidate` @ `51e1577`.

- `npm test`: **60/60 PASS**
- `build:dir`: **PASS** (win-unpacked)
- SQLite SoT: **PARTIAL** (foundation only)
- Backup V2: **PASS** (smoke)
- Security regression vs Cursor tip: **NO**
