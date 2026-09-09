# V2-5.9 Final Mandatory Live Windows Closure Protocol

**Mode:** Release Closure — no new features, no architecture changes unless fixing a proven runtime defect.  
**Ready for release:** **NO** until 40/40 PASS + gate exit 0.  
**Ready for main:** **NO** until independent review after that.

## Hard rules

- Installed Windows Setup EXE only (never `npm start` as final proof)
- Clean machine / clean profile before Scenario A
- No Requirement PASS without runtime evidence package
- Any runtime error = Release Blocker → fix → rebuild → reinstall → restart scenario from beginning
- Do not start Scenario N+1 until Scenario N is PASS with evidence

## STEP 1 — Fresh Windows Release

1. `npm ci`
2. `npm test` (97/97)
3. `npm run build:win` on `windows-2022` or clean Windows
4. Record: Windows version, Node, Electron, Setup EXE path, size, SHA-256, win-unpacked path, commit SHA, GHA run URL
5. Upload artifacts (Setup EXE + `docs/integration-v2-5-9/**`)

## STEP 2 — Clean Windows Install

Wipe before install:

- Previous app install
- `%APPDATA%\Cupping Center` (database, license, OAuth, cache)
- No previous Google session for the test profile

Then silent or UI install of Setup EXE. Smoke launch Installed EXE only.

Tooling: `scripts/windows-uat/Install-And-Prove-V259-AE.ps1 -CleanProfile`

## STEP 3 — Scenario A (Device A/B) — BLOCKING

Nothing else before A succeeds.

**Device A:** Google Login → License Pull → Validation → Branch → Initial Sync → Login → CRUD → Attachment → Push → Restart → Verify  

**Device B:** Clean Install → Google Login → Same License → Same Branch → Pull → Verify → CRUD → Push → Restart → Conflict → Offline Queue → Reconnect → Conflict Resolution → Final Verification  

Evidence: device IDs, branch/org IDs, record counts, attachment hashes, remote revision, restart logs, conflict logs, zero console/runtime errors.

## STEP 4 — Scenario B (New Branch)

Atomic creation, registry, branch context, isolation, device registration, zero inherited operational rows, no duplicate branch/device/records.

## STEP 5 — Scenario C (Disaster Recovery)

Backup → Restore → Reconcile → Restart → Resume Sync → verify IDs/counts/attachments/SQLite/branch context.

## STEP 6 — Scenario D (Owner)

Owner Hub / Owner Mode / Branch Mode / All Branches / Reports / Approvals / Devices / Accounts / License / Backup / Sync / Permissions / RO mode / branch switch / Restart.

## STEP 7 — Scenario E (Google OAuth / Drive / Sheets)

OAuth, refresh, Drive, Sheets discovery/read/write/batch, retry, offline/reconnect, restart, account change, rate limit, timeout, Sheets role (`license_registry_integration`, `isSourceOfTruth: false`), Drive + license registry validation.

## Responsive (cross-cutting, with live scenarios)

Resolutions: 1024×768, 1280×720, 1366×768, 1600×900, 1920×1080, 2560×1440  
Scaling: 100%, 125%, 150%, 175%  
All screens/dialogs/wizards/drawers/BootFlow/Owner Hub/Reports/DevTools.

## PASS conversion

`UNVERIFIED` → `PASS` only after: Installed Setup EXE + successful runtime + evidence attached + zero runtime errors for that requirement.

## Current tracker

| Step | Status |
|------|--------|
| STEP 1 Build + SHA | **PASS in CI** (see `evidence/gha-step1-build-0225cc2.json`) |
| STEP 1 Artifact upload | Policy stabilized (no `win-unpacked`; names `setup-exe` / `windows-smoke` / `release-evidence` / `release-gate`; retention 3d). See `ARTIFACTS-STABILIZATION-REPORT.md`. Re-run after quota recalc if upload still blocked. |
| STEP 2 Clean install + smoke | **PASS in CI** (see `evidence/gha-step2-clean-install-0225cc2.json`) |
| STEP 3 Scenario A Device A/B | **UNVERIFIED** (interactive Google + two devices) — **BLOCKING** |
| STEP 4 Scenario B New Branch | **UNVERIFIED** (do not start until A PASS) |
| STEP 5 Scenario C DR | **UNVERIFIED** |
| STEP 6 Scenario D Owner | **UNVERIFIED** |
| STEP 7 Scenario E Google | **UNVERIFIED** |
| Requirements 40/40 | **0 PASS / 40 UNVERIFIED** |
| Release gate | **FAIL** |
| V2-5.9 complete | **NO** |

### Artifact cleanup required (human)

Delete expired/old Actions artifacts named `v2-5-9-windows-artifacts` (and any other large leftovers) until `Upload Setup EXE artifact` succeeds. This agent cannot delete GitHub artifacts (`gh` is read-only here).
