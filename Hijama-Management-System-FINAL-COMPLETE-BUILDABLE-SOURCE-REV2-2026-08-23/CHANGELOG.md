# Changelog

All notable project changes are documented in this file.

## [Unreleased]

### Hotfix — Local offline QR images under CSP (2026-07-29)

#### Fixed

- Receipt / tax / client-file QR images no longer load from `api.qrserver.com` (blocked by CSP `img-src 'self' data: blob:` and offline-hostile).
- QR images are generated locally as `data:` URLs via vendored `qrcode-generator` + `cupping-qr-local.js`.
- CSP remains unchanged (no external image hosts added).

#### Added

- `assets/vendor/qrcode-generator.js`
- `assets/vendor/qrcode-generator-utf8.js`
- `cupping-qr-local.js`
- `tests/local-qr.test.js`
- `docs/LOCAL-QR-FIX-VERIFICATION.md`

### Font Runtime Verification Hardening (2026-07-29)

#### Fixed

- Print-template font URLs now resolve to absolute local `file://` paths using `new URL(..., window.location.href)` to avoid base-URI failures in:
  - `window.open('') + document.write(...)` (`about:blank`)
  - `iframe.srcdoc`
  - temp-file print/PDF windows (`loadFile(tmpPath)`)
- Kept CSP unchanged and strict; no external font domains added.
- Corrected rollback documentation to forbid reintroducing Google Fonts or widening CSP.

#### Added

- Runtime-only (Development) diagnostics hook:
  - `window.__fontRuntimeDiagnostics()`
  - Outputs document URL/base URI, loaded/failed font families, computed body/receipt fonts, QR container dimensions, and observed font resource requests.
- External QR service audit:
  - `docs/EXTERNAL-QR-SERVICE-AUDIT.md`
- Visual regression verification status:
  - `docs/VISUAL-REGRESSION-AFTER-FONT-FIX.md`
- Extended font/CSP tests (`tests/font-csp-audit.test.js`) for:
  - variable-font range declarations
  - print-template URL-resolution strategy
  - QR endpoint unchanged assertion

### Hotfix — Login / license screen blank-page recovery (2026-07-28)

#### Fixed

- Closing activation/licensing screen always restores the login screen when no user session exists (prevents blank body + false "login required" toasts).
- `licCheck()` now has a hard timeout so login never stays stuck on "جارٍ التحقق من الترخيص...".
- Startup IPC/cloud waits are timeout-bounded so a hung Electron call cannot freeze the login UI.
- BootFlow close path forces login visibility for unauthenticated sessions.

#### Changed

- Restored `electron/cloud-oauth.embedded.json` from original program defaults (owner-requested private automation).
- `npm run build:prod` / `prebuild` now auto-generates `cloud-oauth.config.json` from the embedded file with zero manual edits.
- Runtime resolver again falls back to embedded secrets when bundled config is missing.
- Verifier now requires the embedded file instead of blocking it.
- Removed `electron/cloud-oauth.embedded.json` from `.gitignore`.

### Hotfix — Windows local verify compatibility (2026-07-27)

#### Fixed

- Phase 2 security test now mocks `electron` before loading `window-policy` (works when Electron binary is missing/corrupt).
- Phase 4 SQLite test prints actionable Windows rebuild guidance when `better-sqlite3` native bindings fail.
- Production release gate auto-runs `generate:brand` when installer BMP/NSIS branding assets are missing (gitignored generated files).
- Committed npm `allowScripts` allowlist for `electron`, `better-sqlite3`, and `sharp` (npm 12 install-script policy).
- Documented supported Node engines: `>=20 <23` (Node 22 LTS recommended; Node 24 unsupported for local sqlite/electron tooling).
- Added machine-level OAuth store (`npm run oauth:save`) so `build:prod` auto-loads Google credentials without manual edits on every branch/build.

#### Docs

- README clarifies one-time setup vs daily `npm ci` + `npm run build:prod` workflow.

### Phase 20 — Production Release Gate (2026-07-27)

#### Added

- Production release gate script: `scripts/production-release-gate.mjs`
- Baseline test: `tests/baseline/test-phase20-production-release.js`
- Scripts:
  - `npm run release:gate`
  - `npm run releasegate:test`
- Release artifacts:
  - `pat-reports/PRODUCTION-RELEASE-REPORT.md`
  - `pat-reports/production-release-results.json`

#### Changed

- Final release pipeline now validates installer assets, packaging invariants, NSIS policy, and source production dependencies.
- Signing remains optional for internal builds (`signAndEditExecutable=false`) with explicit warning for public Authenticode signing (K-32).

#### Security / Data

- No runtime business logic changes
- No DB schema or migration changes

### Phase 19 — Owner Hub Diagnostics Polish (2026-07-27)

#### Added

- Owner Hub analytics summary (`buildAnalyticsSummary`) for sync health, conflicts, and device freshness
- Owner Hub diagnostics snapshot (`buildDiagnosticsSnapshot` / `showDiagnosticsSnapshot`)
- Baseline test: `tests/baseline/test-phase19-owner-hub.js`
- Script: `npm run ownerhub:test`

#### Changed

- Owner Hub UI now surfaces sync-health, recent audit activity, and a diagnostics snapshot panel
- K-31 multi-branch / Owner Hub polish marked addressed for Phase 19 operational diagnostics scope

#### Security / Data

- Diagnostics are manager/owner scoped via existing Owner Hub access policy
- No DB schema or finance formula changes
- Cross-branch revenue analytics remain intentionally deferred

### Phase 18 — Multi-Branch Cloud Foundation Hardening (2026-07-27)

#### Added

- Branch write-access guard: `BranchScope.assertWriteAllowed`
- User-scoped record filter: `BranchScope.filterByUserScope`
- Conflict queue user/branch helpers: `ConflictQueue.listForUser` + branch filters
- Baseline test: `tests/baseline/test-phase18-multibranch-cloud.js`
- Scripts:
  - `npm run multibranch:test`
  - `npm run cloud:test` (wires existing `scripts/verify-cloud-v2.js`)

#### Changed

- `Repository.upsert` now enforces branch-scope write guard for user-facing writes
- Conflict resolve now denies out-of-scope branch conflicts
- Unified verify pipeline now includes Cloud V2 verification

#### Security / Data

- Prevents cross-branch write/leak paths for restricted users
- Trusted sync/import sources remain allowed for cloud reconcile flows
- No DB schema or finance formula changes

### Phase 17 — Release Evidence Bundle (2026-07-27)

#### Added

- New release evidence bundler: `scripts/release-evidence-bundle.mjs`
- New baseline test: `tests/baseline/test-phase17-release-evidence.js`
- New scripts:
  - `npm run evidence:test`
  - `npm run release:evidence`

#### Changed

- Release process now generates cryptographic evidence manifest (`sha256`) for core FPV/RC/Freeze artifacts.
- Added consolidated outputs:
  - `pat-reports/release-evidence-bundle.json`
  - `pat-reports/RELEASE-EVIDENCE-REPORT.md`

#### Security / Data

- No runtime business logic changes
- No DB schema or migration changes

### Phase 16 — Code Freeze Gate Automation (2026-07-27)

#### Added

- New freeze gate script: `scripts/code-freeze-gate.mjs`
- New baseline test: `tests/baseline/test-phase16-code-freeze-gate.js`
- New scripts:
  - `npm run freezegate:test`
  - `npm run freeze:gate`

#### Changed

- Release process now emits dedicated freeze-gate artifacts:
  - `pat-reports/CODE-FREEZE-REPORT.md`
  - `pat-reports/code-freeze-results.json`
- Freeze decision now explicitly derives from RC readiness + blocking-fail policy.

#### Security / Data

- No runtime business logic changes
- No DB schema or migration changes

### Phase 15 — RC Gate Blocking Classification (2026-07-27)

#### Added

- RC gate baseline test: `tests/baseline/test-phase15-rc-gate.js`
- Script: `npm run rcgate:test`

#### Changed

- `scripts/rc-validation.mjs` now classifies FPV FAIL rows into blocking/non-blocking before RC decision.
- RC decision no longer depends on raw total FAIL count; it now depends on blocking FAIL only.
- `pat-reports/rc-results.json` now includes `blockingFails` for auditable release-gate traceability.

#### Security / Data

- No runtime business logic changes
- No DB schema or migration changes

### Phase 14 — Final Gate Classification (2026-07-27)

#### Added

- Final gate baseline test: `tests/baseline/test-phase14-final-gate.js`
- Script: `npm run finalgate:test`

#### Changed

- `scripts/fpv-final-production-validation.mjs` now computes:
  - `FN-02` = raw total FAIL count
  - `FN-03` = blocking FAIL count (after explicit non-blocking classification)
- FPV process exit now depends on **blocking** failures (`FN-03`)

#### Security / Data

- No runtime/business logic changes
- No DB schema or migration changes

### Phase 13 — Electron Readiness Automation (2026-07-27)

#### Added

- Electron readiness baseline test: `tests/baseline/test-phase13-electron-readiness.js`
- Script: `npm run electron:test`

#### Changed

- Verify pipeline now includes structural checks for Electron-only critical flows:
  - thermal/A4/PDF print handlers and preload bridges
  - backup upload/restore IPC handlers
  - runtime info bridge and key renderer entrypoints

#### Security / Data

- No runtime feature changes
- No DB schema or finance logic changes

### Phase 12 — Build Reliability Gates (2026-07-27)

#### Added

- Build baseline gate test: `tests/baseline/test-phase12-build.js`
- Script: `npm run build:test`

#### Changed

- Unified verify pipeline now checks build configuration invariants (files/asarUnpack/prebuild/product-name consistency)

#### Security / Data

- No runtime behavior change
- No DB schema or finance logic changes

### Phase 11 — Booking Status Lifecycle (2026-07-27)

#### Changed

- Added booking status normalization with alias mapping (`normalizeBookingStatus`)
- Expanded lifecycle statuses to include `completed` and `cancelled`
- Added booking actions: complete, cancel (soft), and reopen to pending
- Booking table now renders normalized status badges for the expanded lifecycle
- Added Phase 11 baseline test: `tests/baseline/test-phase11-booking-statuses.js`
- Added script: `npm run bookings:test`

#### Security / Data

- No finance formula changes
- No DB schema changes
- Backward-compatible normalization for legacy status aliases

### Phase 10 — Setup Wizard & Product Tour Hardening (2026-07-27)

#### Changed

- Added explicit audit events for setup wizard pause/skip/restart
- Added duplicate-username guard in setup wizard user creation step
- Added product-tour audit metadata for skip/complete/restart actions
- Persisted final `tourStep` on product tour completion
- Added Phase 10 baseline test: `tests/baseline/test-phase10-wizard-tour.js`
- Added script: `npm run wizard:test`

#### Security / Data

- No licensing-crypto changes
- No DB schema or finance logic changes
- Improves traceability of onboarding control actions

### Phase 9 — Branding Consistency (2026-07-27)

#### Changed

- Unified English center-name defaults to APP metadata product name in `index.html`
- Receipt English header fallback now uses `APP_META.productName` instead of legacy `'Cupping Center'`
- Added Phase 9 baseline test: `tests/baseline/test-phase9-branding-consistency.js`
- Added script: `npm run branding:test`

#### Security / Data

- No data-path or storage migration
- Preserved fixed `userData` folder naming for backward compatibility

### Phase 8 — Developer Panel Diagnostics (2026-07-27)

#### Added

- Diagnostics snapshot builder in `license/ui/developer-panel.js`
- New Dev Panel action: **Diagnostics Snapshot** (renders JSON snapshot in-panel)
- Public API hook: `licDevDiagnosticsSnapshot()`
- Baseline test: `tests/baseline/test-phase8-dev-panel.js`
- Script: `npm run devpanel:test`

#### Changed

- Diagnostics metrics now include `integrityIssues` and `integrityWarnings`
- Snapshot toast now highlights warning state when integrity or license health is degraded

#### Security / Data

- No licensing-engine behavior change
- No database schema or finance logic changes

### Phase 7 — Backup & Restore Hardening (2026-07-27)

#### Added

- Backup snapshot ZIP inspection helper (`inspectClinicZipBuffer`) in `electron/clinic-snapshot.js`
- Phase 7 baseline test: `tests/baseline/test-phase7-backup.js`
- Script: `npm run backup:test`

#### Changed

- Restore flow now verifies remote `.meta.json` hash (when available) before decrypt/restore
- Restore flow now rejects malformed ZIP backups missing required `clinic.db` or `backup.manifest`
- Restore result now includes parsed backup manifest when present

#### Security / Data

- Prevents restore from tampered backup payloads (hash mismatch)
- Prevents destructive restore from structurally invalid archive

### Phase 6 — Permissions Hardening (2026-07-27)

#### Changed

- Added permission map sanitization for custom and preset role resolution (`cupping-ext-modules.js`)
- Unknown permission keys are denied explicitly in `hasPermission`
- Exposed `window.PermissionPolicy.sanitizePermissionMap` for secure normalization at user-save time
- Strengthened users management save path (`saveUserAsync`) with explicit admin guard
- Added duplicate username protection (case-insensitive)
- Protected primary admin account (`id=1`) from role downgrade or deactivation

#### Security / Data

- Reduces privilege-escalation surface through forged permission objects or console-triggered user edits
- No finance formulas or DB schema changes

### Phase 5 — Data Security & Credentials (2026-07-27)

#### Changed

- Removed committed OAuth secret source file `electron/cloud-oauth.embedded.json`
- OAuth resolver no longer falls back to embedded secret files
- Build generator `scripts/generate-oauth-config.mjs` now requires local/env credentials (no embedded secret path)
- Verification `scripts/verify-google-oauth-config.js` now fails if embedded secret file is committed
- `.gitignore` now blocks `electron/cloud-oauth.embedded.json`

#### Security / Data

- Eliminates client-secret-at-rest in repository for Google OAuth bootstrap
- Keeps runtime compatibility via encrypted userData override and build-time config file

### Phase 4 — SQLite Migration (2026-07-27)

#### Added

- SQLite layer via `better-sqlite3`: `database/connection.js`, `database/migrations/001_initial.js`, repositories
- Main-process service `electron/database/service.js` + IPC (`database:status|hydrate|persistTable|persistKv|migrateFromBackup|querySafe|exportSnapshot`)
- LocalStorage/backup → SQLite migrator (`database/migrate-from-json.js`, CLI `scripts/migrate-local-backup-to-sqlite.js`)
- Renderer bridge `cupping-sqlite-bridge.js` (hydrate + write-through; localStorage mirror retained)
- Phase 4 tests (`tests/baseline/test-phase4-sqlite.js`); scripts `db:test`, `db:migrate:file`
- `branding.config.json` `dbSchemaVersion` → **4**

#### Changed

- electron-builder packs `database/**/*` and unpacks `better-sqlite3` from asar
- Preload exposes typed `tadawi.database.*` / `cuppingElectron.database.*` (no arbitrary SQL)

#### Security / Data

- Dual-run: SQLite can become primary after migrate; **localStorage is not deleted**
- `querySafe` allowlist only — no raw SQL from renderer
- Pre-migrate DB file backup + migration JSON report under `userData/database/`

### Phase 3 — Commercial Licensing V6 (2026-07-27)

#### Added

- Ed25519 License V6 verify modules (`license/core/license-pubkey-v6.js`, `license-codec-v6.js`, `device-fingerprint.js`)
- V6 verification / migration / online-client stubs under `license/engine` and `license/api`
- Router support for V6 activation alongside V5
- `tools/license-admin` CLI (issue / renew / revoke / migrate-v5 / verify / generate-keypair)
- Dev Ed25519 keypair under `tools/license-admin/keys/dev` (test only)
- Phase 3 automated tests
- `app:getDeviceFingerprintParts` IPC for stable device signals

#### Changed

- `index.html` loads V6 scripts; `_licApplyCode` prefers V6 when input matches
- electron-builder `files` explicitly excludes `tools/`, `tests/`, `docs/`

#### Security

- Private key is **not** in the Electron client tree
- Client can verify but cannot sign V6 licenses
- V5 HMAC path retained for compatibility (legacy)

### Phase 2 — Electron Security Hardening (2026-07-27)

#### Added

- `electron/security/` modules: path-guard, ipc-validate, window-policy, sanitize-text, preload-print
- Typed `window.tadawi` alias (same surface as `cuppingElectron`)
- Preload IPC channel allowlist (no generic invoke)
- Session CSP + Chromium permission denials
- `app:openExternal` gated IPC
- Phase 2 security test suite

#### Changed

- BrowserWindow: `sandbox: true`, `webSecurity: true`
- Child `window.open` windows use print-only preload (not main preload)
- External http(s)/sms/mailto open via `shell.openExternal` after protocol checks
- Navigation guards block leaving the local app shell
- Backup local paths reject absolute/UNC/traversal hints from renderer
- License/cache IDs validated against path traversal

#### Security / Data

- No financial/payroll/commission behavior changes
- No database migration

### Phase 1 — Project Stabilization & Baseline (2026-07-27)

#### Added

- Extracted full application source from archive into the Git repository root.
- Documentation baseline:
  - `docs/ARCHITECTURE-CURRENT.md`
  - `docs/FEATURE-INVENTORY.md`
  - `docs/KNOWN-ISSUES.md`
  - `docs/BASELINE-RESULTS.md`
- `CHANGELOG.md` and `MIGRATIONS.md`
- Unified test runner: `tests/run-all.js`
- Baseline / golden tests under `tests/baseline/`
- npm scripts: `test`, `lint`, `verify`, `build:win`
- ESLint flat config (`eslint.config.mjs`) with Phase-1 scoped ignores
- Archived historical artifacts under `docs/archive/` (source ZIP + `pat-reports`)

#### Changed

- Root `README.md` updated for clone → install → verify workflow
- `.gitignore` extended for ESLint cache and test artifacts

#### Security / Data

- No functional security changes (deferred to Phase 2+)
- No data migrations
- No changes to financial, commission, payroll, or attendance calculations

#### Compatibility

- Fully backward compatible with existing localStorage / backup / license data
