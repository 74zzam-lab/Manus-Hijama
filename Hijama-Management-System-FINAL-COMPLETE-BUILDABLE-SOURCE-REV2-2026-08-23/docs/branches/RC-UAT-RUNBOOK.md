# RC UAT Runbook — Authorized Build Only

**Status:** `SOURCE VERIFIED / RUNTIME UAT PENDING`

## Authorized identity

| Role | Value |
|------|-------|
| RC branch | `cursor/final-stable-operational-rc-7c71` |
| **RUNTIME / BUILD SOURCE** | `c2c2ad6650797af8e9769722aaa094f76176459e` |
| **EVIDENCE / DOC HEAD** | see `docs/branches/RC-BUILD-IDENTITY.json` (git HEAD of this branch) |
| **EXE SHA-256** | `174ab10a016deddfe3758e08bec59e47cd953a0535b167bbd108e4bbb25747a9` |
| **ASAR SHA-256** | `f8a02983e7fedf5c8027c18665e6c8a48fdd8aea2302b7b00cb4f8056d6400fe` |

Path: `dist/win-unpacked/Hijama Management System.exe`

## Post-build audit (`c2c2ad6..HEAD`)

**Docs/scripts only** — no packaged runtime path changes. **No rebuild.**

## Execution order (mandatory)

1. Clean Install → 2. Owner/Admin Login → 3. Branch A/B → 4. Migration/Existing Upgrade → 5. Backup/Restore → 6. Device A/B → 7. Offline/Reconnect → 8. Google OAuth → 9. Live Drive CAS → 10. Final restart/integrity checks

## UAT log (2026-08-20, updated)

| Step | Status | Notes |
|------|--------|-------|
| SHA-256 verify (EXE) | **PASS** | `174ab10a...` exact match on disk |
| SHA-256 verify (ASAR) | **PASS** | `f8a02983...` exact match on disk |
| 1 Clean Install | **BLOCKED (Wine)** | Authorized EXE crashes under Wine — native Windows required |
| 2–7, 9–10 | **PENDING** | Requires native Windows + Google OAuth test account |
| 8 Google OAuth | **PENDING** | Cannot complete on Linux/Wine |

**Authorized UAT must continue on native Windows** using the EXE with SHA-256 above only. Do not use `npm start` or any other build.

## RC Hotfix Round 1 — Windows retest checklist (after new build)

1. EXISTING org step: Center ID + name read-only
2. NEW org step: name editable, Center ID readonly
3. Cloud discovery: stage-based % + ETA + summary + 3 backups table
4. Backup page «فحص السحابة»: same engine/progress as wizard
5. Initial sync: lifecycle label + not-ready reason + conflict button if any
6. Existing profile upgrade: `.tdw` safety snapshot before migration
7. Full wizard NEW + EXISTING end-to-end per mandatory order
