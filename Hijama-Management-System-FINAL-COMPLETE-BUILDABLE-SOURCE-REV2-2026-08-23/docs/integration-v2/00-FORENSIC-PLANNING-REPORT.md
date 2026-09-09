# Forensic Planning Report (J) — Hybrid Cloud/Owner V2

**Audit branch tip:** `729b7eb` (includes winCodeSign icon fix `729b7eb`; user-reported tip `5589018` is **before** that fix)  
**Base for execution:** `integration/hybrid-cloud-owner-v2` ← from `integration/hybrid-production-candidate`  
**Mode completed:** Forensic Audit / Planning Only (this document + siblings). Execution of V2-1+ follows after this report.

---

## Icon root cause

**Codex** sets `signAndEditExecutable: true` → electron-builder downloads **winCodeSign** and runs **rcedit** to stamp `build/Program-Icon.ico` into the EXE. That succeeds on machines with symlink privilege / where winCodeSign extracts cleanly → correct EXE/shortcut icons.

**Hybrid @ 5589018** either:
1. still had `signAndEditExecutable: true` and **failed** winCodeSign extract on Windows (`Cannot create symbolic link` for darwin dylibs) → build aborted or EXE left without proper icon embed, **or**
2. used Linux CI path that forced `signAndEditExecutable=false` → default Electron icon.

**Hybrid @ 729b7eb (current tip):** `signAndEditExecutable: false` + `afterPack` `resedit` embeds ICO without winCodeSign. Config PASS on Linux smoke; **Windows artifact visual verification still required by user**.

ICO itself is valid (Hybrid now 16/24/32/48/64/128/256). Installer NSIS icon fields already point at `Program-Icon.ico` (same as Codex).

---

## Data deletion root cause

**Primary (STRONG):** `build/installer.nsh` Hybrid policy:

1. `!macro customRemoveFiles` **always** calls `un.NT_RemoveAppDataIfNeeded` which **always** ends at `nt_un_wipe_live` → `un.NT_ForceWipeAllUserData` **twice** — including during **Upgrade** (electron-builder uninstalls old files via this hook).
2. Uninstall UX text: “Cupping Center data folder is **always** deleted”.
3. `electron/uninstall-prep.js` non-full mode archives then **`wipeAllLegacyUserDataRoots`** (deletes live folder anyway).

**Codex contrast:** `customUnInstall` only; mode `0` = keep DB/attachments/settings/backups, wipe license only. Full wipe only mode `1`.

**Not the cause:** `appId`/`productName` drift — both force `USER_DATA_FOLDER = 'Cupping Center'`. `deleteAppDataOnUninstall: false` in package.json is irrelevant; custom NSIS overrides.

Empty DB after wipe: `database/connection.js` `openDatabase` creates schema if missing → looks like “all clients gone.”

---

## License loss root cause

License/OAuth live in Chromium Local Storage + `cache\…\license.json` + `CloudVault\tokens`. Hybrid wipe deletes the entire `Cupping Center` tree (and strips license from archives). Device fingerprint includes `userData` path hash — path stable, but wiped store ⇒ re-activation required. Same wipe path as data loss.

---

## Current Owner implementation

**PARTIAL**

- Real modules: `OwnerHub`, `OwnerProfile`, `OwnerSetupState`, `RolePolicy`, NextGen 21–40 gates.
- Mutation gate: `canManageOrganization` (owner/hq_admin/dev).
- UI access broader (managers can **view** hub) — not “Google = Owner”.
- First Google login is **Authentication/Drive identity**, not automatic Owner authorization.
- Bootstrap exists but is Drive-centric (`bootstrap.js` / `BootFlowUI`), not a hardened invitation/token org bootstrap.

## Current Owner creation method

Hybrid: `OwnerSetupState` / `OwnerMigration` / activation flags + optional owner profile — **not** a single production-safe invitation/token flow. Codex: explicit `createInitialOwnerAccount` (role `owner`) in Owner setup UI.

## Current cloud sync

**BACKUP + DRIVE FILE SYNC (not event sync)**

- `SyncEngine`: Drive JSON push/poll (~15s).
- `BackupLayer` / Backup V2: daily/manual `.tdw` snapshots.
- **No** transactional outbox/inbox/event log on Hybrid.
- Codex Fastify `/v2/sync/*` exists in Codex extract but is **not** wired into Hybrid and is parallel to Drive SyncEngine.

## Current branch restore behavior

Hybrid Owner Hub: **Missing** selective branch restore. Codex: `branch-restore.js` present. Device activation: bootstrap hydrate from Drive if available — **not** guaranteed latest snapshot + incremental apply pipeline.

---

## Codex backend components reusable

- `server/` Fastify + Postgres migrations (`/v2/auth/*`, `/v2/sync/mutations|changes`, conflicts, attachments).
- `database/services/cloud-sync-service.js` client (Codex).
- Backup V2 already ported to Hybrid (keep as DR, not sync).
- Installer lifecycle / uninstall preserve policy (port NSIS + uninstall-prep behavior).
- Owner setup UI patterns (`createInitialOwnerAccount`).

## Critical release blockers

1. Hybrid NSIS/uninstall **always destroys userData** (including Upgrade).
2. License/OAuth destroyed with userData wipe.
3. Icon: user may be on pre-`729b7eb` tip; Windows visual proof still pending.
4. Branch create surfaces in BranchLock (“فرع جديد”) conflict with Owner-only policy / Phase 28.
5. No real continuous sync / automatic branch snapshot bootstrap.
6. Owner bootstrap not production-hardened (invitation/token).

## Proposed files to change (execution)

- `build/installer.nsh` — Codex-aligned preserve-by-default; **never wipe on update**
- `electron/uninstall-prep.js` — non-full = license wipe only
- `tests/baseline/test-nsis-cupping-center-wipe.js` — invert assertions
- `cloud/branch-lock-ui.js` — remove create-branch from activation
- `cloud/owner-hub.js` / enrollment — unify branch create through Owner Hub + enrollment source
- `electron/security/window-policy.js` — allowlist only configured API host in `connect-src` (later)
- New: sync outbox schema, server client, snapshot bootstrap (V2-6+)
- Docs under `docs/integration-v2/`

## Proposed database migrations

- Additive: `sync_outbox`, `sync_inbox_cursor`, `device_binding`, org/branch membership mirrors as needed (align toward Codex v10–v11 tables gradually)
- **No** destructive wipe migrations
- Always Backup V2 before migrate

## Proposed backend migrations

- Adopt/adapt Codex Postgres `server/migrations` for tenants/branches/devices/events/snapshots
- Device tokens scoped org+branch+device
- Row-level branch isolation

## Security risks

- Broad manager Hub view vs Owner mutate confusion
- Drive as sole control plane (not authoritative RBAC server)
- Embedded OAuth client secret (pre-existing)
- Expanding CSP accidentally for API — must use explicit env allowlist only
- Treating Google login as Owner

## Execution phases

```text
V2-1 Build/icon Windows artifact verification (afterPack/resedit)
V2-2 Data/license persistence + userData migration (BLOCKER FIRST)
V2-3 Owner bootstrap and RBAC
V2-4 Branch/device/license backend model
V2-5 Owner Hub branch/device management
V2-6 Snapshot bootstrap
V2-7 Incremental sync outbox/inbox
V2-8 Conflict handling
V2-9 Branch reports and sync health
V2-10 Upgrade/restore/disaster tests
```

**Rule:** Do not start Cloud Features (V2-4+) before V2-2 persistence PASS.

## Rollback plan

- Per-phase git revert on `integration/hybrid-cloud-owner-v2`
- Keep Backup V2 emergency before any SoT/sync cutover
- Feature flags: `HYBRID_CLOUD_SYNC=0`, `HYBRID_SQLITE_SOT=0`
- NSIS: revert to previous installer.nsh only if new preserve path regresses wipe-when-intended

---

## Ready flags (now)

| Gate | Status |
|------|--------|
| Forensic docs | YES (this pack) |
| V2-2 persistence code | YES (Windows UAT pending) |
| V2-3 Owner RBAC / activation no-create | YES (unit tests) |
| Ready for Hybrid RC | NO (Windows persistence + icon UAT) |
| Ready for develop | NO until V2-2 Windows PASS |
| Ready for main / Stable | NO |
