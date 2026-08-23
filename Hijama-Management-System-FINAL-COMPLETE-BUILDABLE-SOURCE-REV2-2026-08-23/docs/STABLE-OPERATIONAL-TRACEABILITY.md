# Stable Operational Core — Traceability

Independent verification plan (not relying on legacy test PASS claims).

| Branch | Phase | Status | Operator UAT |
|--------|-------|--------|--------------|
| `cursor/phase-0-git-baseline-7c71` | 0 — Git baseline | DONE | — |
| `cursor/phase-1-sqlite-sot-7c71` | 1 — SQLite SoT | DONE (code) | Required after merge |
| `cursor/phase-2-transactions-crash-7c71` | 2 — Atomic transactions | DONE (code) | Required after merge |
| `cursor/phase-3-remove-backup-encryption-7c71` | 3 — Backup V2 plaintext | DONE (code) | Required after merge |
| `cursor/phase-4-branch-sql-isolation-7c71` | 4 — Branch SQL isolation | DONE (code) | Required after merge |
| `cursor/phase-5-branch-switch-hardening-7c71` | 5 — Branch switch re-hydrate | DONE (code) | Required after merge |
| `cursor/phase-6-sync-guards-7c71` | 6 — Sync guards | DONE (code) | Required after merge |
| `cursor/phase-7-conflict-tombstone-idempotency-7c71` | 7 — Tombstone / idempotency | DONE (code) | Required after merge |
| `cursor/phase-8-attachments-authority-7c71` | 8 — Attachments authority | DONE (code) | Required after merge |
| `cursor/phase-9-owner-rbac-hardening-7c71` | 9 — Owner/RBAC hardening | DONE (code) | Required after merge |
| `cursor/phase-10-error-truthfulness-7c71` | 10 — Error truthfulness | DONE (code) | Required after merge |
| `cursor/phase-11-migration-safety-7c71` | 11 — Migration safety | DONE (code) | Required after merge |
| `cursor/phase-12-operational-db-health-7c71` | 12 — DB health gates | DONE (code) | Required after merge |
| `cursor/phase-13-operational-readiness-7c71` | 13 — Operational readiness | DONE (code) | Required after merge |
| `cursor/phase-14-build-reliability-gates-7c71` | 14 — Build reliability gates | DONE (code) | Required after merge |
| `cursor/phase-15-oauth-drive-build-7c71` | 15 — OAuth/Drive build restore | DONE (code) | Required after merge |

## Branch naming

`cursor/phase-<N>-<short-name>-7c71`

Each branch includes `docs/branches/PHASE-<N>-*.md` and descriptive commits.

## Phase 0 — Git baseline

**Goal:** Publish full source tree (replace ZIP-only `main`).

**Deliverables:**
- Complete application source at repo root
- This traceability index
- `docs/branches/PHASE-0-GIT-BASELINE.md`

**Not included:** Runtime behavior changes.

## Phase 1 — SQLite source of truth

**Goal:** Operational data reads/writes authoritative via SQLite; localStorage cache-only.

**Code targets:**
- `index.html` — `DB.get` delegates operational keys to `SqliteBridge.readOperational`
- `cupping-sqlite-bridge.js` — memory SoT, read-through, boot hydrate, no LS read for operational when Electron present

**Operator UAT (you):**
1. Create patient → close app → reopen → same data
2. Clear localStorage in DevTools after login → operational data still from SQLite
3. Restart after save (patient, invoice, booking)

## Phase 3 — Backup V2 plaintext

**Goal:** New `.tdw` backups are plaintext ZIP; no password on create/schedule/restore. Legacy encrypted import only.

**Operator UAT (you):**
1. Create backup without password
2. Restore without password
3. Scheduled backup without stored password
4. Legacy encrypted file requires password

## Phase 4 — Branch SQL isolation

**Goal:** Branch-scoped SQLite writes; cross-branch row wipe prevented; IPC `getById` enforces branch.

**Operator UAT (you):**
1. Clients on BR-A and BR-B — save on A → B rows remain in DB
2. Cross-branch id read via IPC → denied

## Phase 5 — Branch switch hardening

**Goal:** Switch branch re-hydrates from SQLite; UI shows active branch only; writes merge without cross-branch memory corruption.

**Operator UAT (you):**
1. Data on BR-A and BR-B — switch branches → correct lists
2. No stale rows from previous branch in operational forms

## Phase 6 — Sync guards

**Goal:** Block empty push, localRev=0 destructive push, stale remote overwrite.

**Operator UAT (you):**
1. New device + cloud data → pull before push
2. Empty export does not wipe Drive

## Phase 7 — Tombstone / idempotency

**Goal:** Tombstone delete sync rules; stable outbox idempotency; revision-based bridge outbox.

**Operator UAT (you):**
1. Delete vs offline edit → conflict queue (not silent overwrite)
2. Duplicate save → no duplicate outbox rows
3. Dual tombstone → newer delete wins automatically

## Phase 8 — Attachments authority

**Goal:** `attachments_meta` canonical; legacy manifest migrate; branch + hash authority.

**Operator UAT (you):**
1. Device A attachment → B pull shows same hash metadata
2. Branch switch → attachment list scoped correctly
3. Legacy manifest clinic → migrates without data loss

## Phase 9 — Owner / RBAC hardening

**Goal:** Authoritative role resolution; manager IPC gates for conflict resolve; owner hub mutate guards.

**Operator UAT (you):**
1. Reception cannot open conflict manager or resolve via IPC
2. Forged `currentUser.role` does not elevate privileges
3. Owner-only hub actions blocked for non-owner

## Phase 10 — Error truthfulness

**Goal:** Actionable Arabic messages for sync/RBAC/SQLite errors; redacted secrets in UI/audit.

**Operator UAT (you):**
1. Empty push blocked → pull-first message (not raw code)
2. Drive quota → quota-specific message
3. No tokens/passwords in sync status bar text

## Phase 11 — Migration safety

**Goal:** Mandatory pre-backup, dry-run on copy, rollback on failed import.

**Operator UAT (you):**
1. Migrate existing SQLite DB → `pre-migrate-*.db` backup created first
2. Failed import → data restored; Arabic error (not raw code)
3. Dry-run → live DB unchanged

## Phase 12 — Operational DB health

**Goal:** Integrity/FK/schema gates before writes and sync.

**Operator UAT (you):**
1. Unhealthy DB → operational saves blocked; sync not ready
2. Healthy clinic → `operationalHealth.ok` in status
3. Blocked save shows Arabic backup-restore guidance

## Phase 13 — Operational readiness

**Goal:** Single readiness signal for save/sync/restore/diagnostics.

**Operator UAT (you):**
1. Healthy boot → `operationalReadiness.ok: true`
2. Legacy migration pending → sync blocked with Arabic message
3. Owner Hub diagnostics shows `operational` blockers when unhealthy

## Phase 14 — Build reliability gates

**Goal:** Packaging gates + master verifier for phases 1–14.

**Operator UAT (you):**
1. `npm run build:win` on Windows → installer without missing-module errors
2. Packaged app loads operational cloud scripts (DevTools Network)
3. Save + sync smoke on installed build

## Phase 15 — OAuth / Drive / Sheets build

**Goal:** Production OAuth + vault embedded — `npm run build:prod` with zero manual copy.

**Operator UAT (you):**
1. Fresh clone → `npm run build:prod` with no ZIP/vendor steps
2. Installed app OAuth + Drive + vault work

## Stable Operational Core — verification

```bash
npm run verify:stable-operational-core
```

Phases 0–15 code complete; operator UAT on Windows after merge chain.
