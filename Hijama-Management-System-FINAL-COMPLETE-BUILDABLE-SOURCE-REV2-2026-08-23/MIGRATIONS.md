# Migrations Log

Track **data structure / schema** changes only.

## Policy

- Every storage key change, field rename, backup format change, or DB schema
  bump must be recorded here.
- Application behavior refactors without data shape change do **not** belong here
  (use `CHANGELOG.md`).

---

## Phase 20 — 2026-07-27 — Production Release Gate

**Schema impact:** None.

| Item | Change |
|------|--------|
| Release gate | Added structural production-release validation for installer/build readiness |
| Reports | Added `PRODUCTION-RELEASE-REPORT.md` and `production-release-results.json` |
| Signing policy | Documents unsigned-internal vs signed-public readiness (K-32) |

**Notes:** Release packaging/policy automation only. No storage keys, schema, or backup format changes.

### Rollback

Revert Phase 20 branch.

---

## Phase 19 — 2026-07-27 — Owner Hub Diagnostics Polish

**Schema impact:** None.

| Item | Change |
|------|--------|
| Owner Hub model | Added operational analytics summary fields at runtime |
| Diagnostics | Added JSON snapshot builder for sync/devices/conflicts/audit |
| Persistence | No new localStorage/DB keys |

**Notes:** Presentation/observability only. No storage format or migration changes.

### Rollback

Revert Phase 19 branch.

---

## Phase 18 — 2026-07-27 — Multi-Branch Cloud Foundation Hardening

**Schema impact:** None.

| Item | Change |
|------|--------|
| Branch write policy | Runtime guard denies out-of-scope branch writes for restricted users |
| Conflict queue | Branch-aware list/count/history + resolve access checks |
| Cloud QA | Cloud V2 verify script included in unified release test pipeline |

**Notes:** No storage key rename and no DB migration. Branch metadata fields (`branchId`) already exist.

### Rollback

Revert Phase 18 branch.

---

## Phase 17 — 2026-07-27 — Release Evidence Bundle

**Schema impact:** None.

| Item | Change |
|------|--------|
| Evidence manifest | Added signed-style artifact inventory with SHA256 hashes |
| Release reporting | Added unified bundle JSON + Markdown report for FPV/RC/Freeze outputs |

**Notes:** Release auditing only; no storage key, schema, or backup format changes.

### Rollback

Revert Phase 17 branch.

---

## Phase 16 — 2026-07-27 — Code Freeze Gate Automation

**Schema impact:** None.

| Item | Change |
|------|--------|
| Freeze gate | Added policy script consuming RC artifacts for freeze readiness |
| Reports | Added `CODE-FREEZE-REPORT.md` and `code-freeze-results.json` outputs |

**Notes:** Release gating/reporting only; no storage keys, schema, or backup format changes.

### Rollback

Revert Phase 16 branch.

---

## Phase 15 — 2026-07-27 — RC Gate Blocking Classification

**Schema impact:** None.

| Item | Change |
|------|--------|
| RC decision model | Uses blocking FAIL classification rather than raw FAIL totals |
| RC JSON report | Adds `blockingFails` list for release audit traceability |

**Notes:** Release policy automation only; no storage keys, schema, or backup format changes.

### Rollback

Revert Phase 15 branch.

---

## Phase 4 — 2026-07-27 — SQLite Migration

**Schema impact:** New SQLite DB (schema version **4**). localStorage keys unchanged (mirror retained).

| Item | Change |
|------|--------|
| New DB file | `userData/database/tadawi.db` |
| Schema version | `branding.config.json` `dbSchemaVersion`: **3 → 4** |
| Tables | `clients`, `visits`, `visit_cups`, `invoices`, `appointments`, `employees`, `attendance`, `expenses`, `kv_store`, `meta`, `schema_migrations`, … |
| Meta flags | `sqlitePrimary`, `localStorageRetained`, `migratedFrom`, `migratedAt` |
| localStorage | **Not deleted**; remains mirror + fallback until later phases |
| Backup | Pre-migrate copy under `userData/database/backups/`; report JSON beside DB |

**Migrator:** `database/migrate-from-json.js` — dedupe by id, orphan visits without clients handled, bad attendance skipped, comparison report (counts + visit totals). Idempotent re-run supported.

### Rollback

1. Keep using localStorage mirror (never deleted in Phase 4).
2. Set meta `sqlitePrimary` off / skip hydrate, or delete `tadawi.db` and restore from `database/backups/`.
3. Revert Phase 4 branch if needed. Restore `dbSchemaVersion` to `3` only if no SQLite consumers remain.

---

## Phase 5 — 2026-07-27 — Data Security & Credentials

**Schema impact:** None.

| Item | Change |
|------|--------|
| OAuth secret source | Removed committed `electron/cloud-oauth.embedded.json` |
| Runtime config resolution | Removed embedded-secret fallback path |
| Build pre-step | `generate-oauth-config.mjs` no longer consumes embedded secret files |
| Verification | `verify-google-oauth-config.js` fails if embedded secret file exists |

**Notes:** No data keys, DB schema, or backup formats changed in this phase.

### Rollback

Revert Phase 5 branch. Restore legacy behavior only if a secure alternative secret
provisioning path is in place.

---

## Phase 6 — 2026-07-27 — Permissions Hardening

**Schema impact:** None.

| Item | Change |
|------|--------|
| User save flow | Enforced admin authorization inside `saveUserAsync` |
| Permission maps | Normalized to allowlisted keys only |
| Primary admin record | Protected from demotion/deactivation via UI save path |

**Notes:** No storage key rename and no DB migration in this phase.

### Rollback

Revert Phase 6 branch.

---

## Phase 7 — 2026-07-27 — Backup & Restore Hardening

**Schema impact:** None.

| Item | Change |
|------|--------|
| Backup restore verification | Validate encrypted payload hash against remote `.meta.json` (if present) |
| Backup restore validation | Validate ZIP structure includes `clinic.db/*` and `backup.manifest` before restore |
| Restore output | Includes parsed manifest metadata when available |

**Notes:** No DB schema or localStorage key changes in this phase.

### Rollback

Revert Phase 7 branch.

---

## Phase 8 — 2026-07-27 — Developer Panel Diagnostics

**Schema impact:** None.

| Item | Change |
|------|--------|
| Dev diagnostics | Added structured JSON snapshot view for readiness/integrity/license/runtime |
| QA hooks | Added `licDevDiagnosticsSnapshot()` and Phase 8 baseline test |

**Notes:** UI/diagnostics only. No storage format or DB changes.

### Rollback

Revert Phase 8 branch.

---

## Phase 9 — 2026-07-27 — Branding Consistency

**Schema impact:** None.

| Item | Change |
|------|--------|
| UI naming defaults | English center fallback aligned to `APP_META.productName` |
| Receipt branding | Removed legacy hardcoded `'Cupping Center'` fallback in receipt header |
| Compatibility | `userData` folder naming intentionally unchanged |

**Notes:** Branding consistency update only; no storage layout changes.

### Rollback

Revert Phase 9 branch.

---

## Phase 10 — 2026-07-27 — Setup Wizard & Product Tour Hardening

**Schema impact:** None.

| Item | Change |
|------|--------|
| Setup wizard auditability | Added pause/skip/restart audit events |
| Setup wizard user creation | Added duplicate username guard |
| Product tour telemetry | Added explicit skip/complete/restart audit metadata |
| Tour state | Persist final step on completion |

**Notes:** Onboarding UX/control hardening only; no storage format or DB change.

### Rollback

Revert Phase 10 branch.

---

## Phase 11 — 2026-07-27 — Booking Status Lifecycle

**Schema impact:** None.

| Item | Change |
|------|--------|
| Booking status model | Added canonical lifecycle states (`pending`, `confirmed`, `completed`, `absent`, `deferred`, `cancelled`) |
| Legacy normalization | Aliases (`no_show`, `done`, `canceled`) normalized at runtime |
| Workflow actions | Added complete/cancel/reopen state transitions |

**Notes:** No DB migration needed; status normalization is backward-compatible at runtime.

### Rollback

Revert Phase 11 branch.

---

## Phase 12 — 2026-07-27 — Build Reliability Gates

**Schema impact:** None.

| Item | Change |
|------|--------|
| Build QA | Added baseline checks for electron-builder invariants and branding/build consistency |
| Release guard | Added `build:test` to validate packaging prerequisites before release |

**Notes:** Build/test pipeline hardening only. No storage or schema changes.

### Rollback

Revert Phase 12 branch.

---

## Phase 13 — 2026-07-27 — Electron Readiness Automation

**Schema impact:** None.

| Item | Change |
|------|--------|
| Electron QA | Added baseline structural checks for critical Electron-only flows |
| Release guard | Added `electron:test` and included in unified verify |

**Notes:** QA automation only. No storage, schema, or business-rule changes.

### Rollback

Revert Phase 13 branch.

---

## Phase 14 — 2026-07-27 — Final Gate Classification

**Schema impact:** None.

| Item | Change |
|------|--------|
| FPV gate | Added blocking-fail classifier (`FN-03`) on top of raw fail counter (`FN-02`) |
| Exit policy | FPV exits non-zero only on blocking failures |

**Notes:** QA/release policy automation only. No data model changes.

### Rollback

Revert Phase 14 branch.

---

## Phase 3 — 2026-07-27 — Commercial Licensing V6

**Schema impact:** Additive only.

| Item | Change |
|------|--------|
| New storage key | `commercial_license_v6` (activated V6 license snapshot) |
| New storage key | `commercial_license_v6_revocations` |
| Marker | `commercial_license_v6_prev_marker` (records that V5 store was retained) |
| V5 store `commercial_license_data_v2` | **Unchanged / retained** after V6 activation |
| License file format | New signed JSON `schemaVersion: 6` (+ optional `TDW6.` token) |

**Notes:** No automatic deletion of V5 data. Migration request is generated client-side; Admin signs V6 offline.

### Rollback

Remove V6 keys from localStorage and keep using V5 product keys. Revert Phase 3 branch if needed.

---

## Phase 2 — 2026-07-27 — Electron Security Hardening

**Schema impact:** None.

| Item | Change |
|------|--------|
| localStorage keys | Unchanged |
| Backup JSON / AES formats | Unchanged |
| License storage | Unchanged |
| Path policy for backup `localPath` hints | Absolute / UNC / traversal hints from renderer are **rejected** (Documents-relative hints still work) |

**Notes:** Security hardening only. Existing Documents-relative backup paths remain valid.

### Rollback

Revert Phase 2 commits; restore previous `electron/main.js` / `preload.js` if a client relied on absolute backup path hints (unsupported going forward).

---

## Phase 1 — 2026-07-27 — Stabilization Baseline

**Schema impact:** None.

| Item | Change |
|------|--------|
| localStorage keys | Unchanged |
| Backup format (JSON v3 / clinic AES `CDBK`) | Unchanged |
| License storage (`commercial_license_data_v2`) | Unchanged |
| `branding.config.json` `dbSchemaVersion` | Remains `3` |
| SQLite | Not introduced |

**Notes:** Phase 1 established documentation, baseline golden tests, and npm
scripts only. No migration scripts required. No data rewrite.

### Rollback

N/A — no data migration performed.
