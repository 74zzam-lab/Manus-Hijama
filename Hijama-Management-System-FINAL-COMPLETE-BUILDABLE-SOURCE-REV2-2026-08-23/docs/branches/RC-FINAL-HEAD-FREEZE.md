# RC Consolidation / Final HEAD Freeze

**Status:** `SOURCE VERIFIED / RUNTIME UAT PENDING`  
**Freeze eligible:** **NO** — runtime UAT on authorized Windows build pending

---

## Canonical build identity (authoritative)

| Role | Value |
|------|-------|
| **RC branch** | `cursor/final-stable-operational-rc-7c71` |
| **RUNTIME / BUILD SOURCE COMMIT** | `c2c2ad6650797af8e9769722aaa094f76176459e` |
| **EVIDENCE / DOC HEAD** | `a3bfb74f460736cd6925bf5cccd4085bf060466c` |
| **Prior doc HEAD (pre-identity-fix)** | `28d77d91835bda1c551944f0d3e1619e025e82c4` |
| **PR13 base** | `59d443a148fc271b26065f84b5a697f015504f35` |
| **Version** | `2.0.1` |
| **EXE SHA-256** | `174ab10a016deddfe3758e08bec59e47cd953a0535b167bbd108e4bbb25747a9` |
| **ASAR SHA-256** | `f8a02983e7fedf5c8027c18665e6c8a48fdd8aea2302b7b00cb4f8056d6400fe` |

**UAT rule:** use only the EXE with the SHA-256 above. All commits after `c2c2ad6` are **docs/evidence/scripts only** — packaged runtime unchanged, **no rebuild**.

Machine-readable copy: `docs/branches/RC-BUILD-IDENTITY.json`

---

## 1. Branch roles

| Field | Value |
|-------|-------|
| RC branch | `cursor/final-stable-operational-rc-7c71` |
| Runtime build source | `c2c2ad6` (EXE built from this tree) |
| Evidence/doc HEAD | `a3bfb74` (final identity pin; supersedes `28d77d9`) |
| PR13 feature base | `59d443a` |
| Product | Hijama Management System |
| Electron | 43.2.0 |

---

## 2. PR lineage verification

All 14 anchor commits verified as ancestors of Final HEAD (`scripts/rc-consolidation-verify-lineage.js`):

| PR | SHA | Label |
|----|-----|-------|
| PR1 | `7c28800` | Sync Safety Core |
| PR2 | `8f01499` | Backup Cloud Operations |
| PR3 | `345eb5d` | Backup Scope Truth |
| PR4 | `556b42c` | SQLite Operational Truth |
| PR5 | `1a2f3ad` | Transactions & Crash Safety |
| PR6 | `371d9b6` | Remove Backup Encryption |
| PR7 | `ecef2d3` | Branch SQL Isolation |
| PR8 | `ee2b082` | Branch Switching |
| PR9 | `2a99cb9` | Atomic Restore |
| PR9.5 | `e3e0dbc` | Restore Consolidation |
| PR10 | `c70c859` | Conflict/Tombstone/Idempotency |
| PR11 | `2afd4fd` | Owner Lifecycle |
| PR12 | `2f9446e` | Owner/Admin Separation |
| PR13 | `59d443a` | Error Truth + Migration Safety |

**Result:** 14/14 PASS — linear chain, no divergence.

---

## 3. Source gates

| Gate | Result |
|------|--------|
| `npm ci` | PASS |
| `npm run lint` | PASS (exit 0) |
| `npm test` | **122/122 PASS** |
| `npm run test:e2e` | **N/A** — script not defined in `package.json` |
| `node scripts/verify-stable-operational-core.js` | **15/15 PASS** |
| `node scripts/rc-consolidation-verify-lineage.js` | PASS |
| `node scripts/rc-final-static-audit.js` | PASS |
| PR1–PR13 baseline verifiers | PASS (included in `npm test`) |

**RC fix applied (allowed scope):** `scripts/verify-tombstone-idempotency.js` aligned with PR10 tombstone policy (equal revision → tombstone wins; conflict only when live revision strictly newer).

---

## 4. Final static audit

| Check | Result |
|-------|--------|
| Duplicate authorities | Single upgrade orchestrator |
| Legacy restore bypass | Consolidated restore surface tests present |
| BR-MAIN write fallback | `branch_id_required` on operational IPC writes |
| localStorage operational authority | SQLite primary + migration-only LS path |
| Encrypted direct restore | `restore_encrypted_import_only` + legacy import module |
| Owner duplicate create | Lifecycle `createBlocked` + invariant |
| Admin Owner-only bypass | `owner-trusted-authority.js` gates |
| Uninitialized sync push | Sync guard + operational readiness |
| Stale branch cache | Branch switch rehydrate verifier |
| Programmer error suppression | `benign-operational-errors.js` + IPC envelope |

---

## 5. Build identity

| Field | Value |
|-------|-------|
| Build command | `npm run build:dir` |
| Build time (UTC) | 2026-08-20T20:38:24Z |
| Build source commit | `c2c2ad6650797af8e9769722aaa094f76176459e` |
| EXE | `dist/win-unpacked/Hijama Management System.exe` |
| EXE SHA-256 | `174ab10a016deddfe3758e08bec59e47cd953a0535b167bbd108e4bbb25747a9` |
| ASAR | `dist/win-unpacked/resources/app.asar` |
| ASAR SHA-256 | `f8a02983e7fedf5c8027c18665e6c8a48fdd8aea2302b7b00cb4f8056d6400fe` |
| NSIS installer | Not produced (`build:dir` unpacked only) |

**Note:** UAT must use only this EXE SHA-256. Commits after `c2c2ad6` are docs/scripts only — no rebuild.

### Post-build commit audit (`c2c2ad6..a3bfb74`)

Files changed: `docs/branches/*`, `scripts/verify-tombstone-idempotency.js` (verifier only — not packaged).  
Packaged runtime paths unchanged. Rebuild **not** required.

**Historical note:** manifest at build commit `c2c2ad6` initially recorded `commitSha: 59d443a` (PR13 base).  
Authoritative runtime source is **`c2c2ad6`**; corrected in identity docs above.

---

## 6. UAT matrix (PENDING)

Not executed in this RC pass — requires Windows host + Google credentials + Device A/B:

- Clean install / Existing upgrade / LS-only legacy migration
- Owner + Admin login
- Branch A/B switching, device lock, Device A/B same branch
- Offline/reconnect, concurrent writes, tombstone delete/reconnect
- Backup branch/org, Restore Backup V2, restart after restore
- Google OAuth, Live Drive CAS, cloud hydrate, scope isolation
- Owner/Admin forged IPC

---

## 7. Final invariants

| Invariant | Source verification |
|-----------|---------------------|
| `PRAGMA integrity_check = ok` | PR13 orchestrator tests |
| Owner primary count = 1 | PR11/PR12/PR13 + static audit |
| 0 cross-branch leakage | PR7/PR8 tests |
| 0 resurrected deletes | PR10 dual-device tests |
| 0 legacy direct restore | PR9.5 consolidation tests |
| 0 Owner-only IPC bypass | PR12 forged IPC tests |
| 0 push before baseline | PR1 sync guards |
| 0 silent programmer error suppression | PR13 benign module |

Runtime confirmation on Windows build: **PENDING**.

---

## 8. Failures / blockers

| Item | Severity | Status |
|------|----------|--------|
| Runtime Windows UAT | P0 for freeze | Not run |
| Google OAuth live test | P0 for freeze | Not run |
| Device A/B dual-device | P0 for freeze | Not run |
| NSIS installer artifact | P1 packaging | Not built |
| `npm run test:e2e` | Info | Not defined |

**No P0/P1 data-integrity source gate failures** after tombstone verifier alignment.

---

## 9. Remaining risks

1. Unpacked EXE only — installer/UAC path not validated until NSIS build + Windows UAT.
2. Live Google/Drive requires operator credentials on target Windows machine.
3. LS-only legacy clinic profiles need real upgrade UAT on Windows (behavioral tests cover logic only).

---

## 10. Freeze decision

| Classification | |
|----------------|--|
| Current | **SOURCE VERIFIED / RUNTIME UAT PENDING** |
| Target after full UAT | **STABLE OPERATIONAL BASELINE — FULL PASS** |
| **Freeze now?** | **NO** |

Do not declare freeze until Windows + Google + Device A/B UAT passes on the single build above with zero P0/P1 data-integrity failures.

---

## Scripts added (RC only, no feature work)

- `scripts/rc-consolidation-verify-lineage.js`
- `scripts/rc-final-static-audit.js`
- `scripts/rc-consolidation-run-gates.js`
- `docs/branches/RC-FINAL-HEAD-FREEZE-MANIFEST.json`
