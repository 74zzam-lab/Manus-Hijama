# V2-5.10 — Setup State / Sync Readiness / Owner Password / Clean Flow

**Date:** 2026-08-03  
**Status:** Production fix landed + Installed EXE rebuild required for live proof  
**Honesty:** Live Google/Owner multi-device password sync on physical PCs remains operator-proven; CI proves install + wiring smoke.

## Root causes

| Issue | Root cause |
|-------|------------|
| SyncEngine not ready | `runOnce` / `isRunning` / `getReadiness` **missing** — UI checked `typeof SyncEngine.runOnce !== 'function'` → always toast |
| Owner password reverted | Forced change runs `_appAuthed=false`; `dbSetGuarded` blocked `DB.set('users')` → in-memory only → old hash after restart |
| Restart loop | `RESTART_REQUIRED_KEY` write-only; never consumed; Ready showed 2–3 duplicate CTAs; `relaunchApp` IPC missing |
| Completed steps remained visible | Login boot CTA always shown; no SetupState visibility resolver |
| Duplicate buttons | Ready: «إتمام الإعداد» + «طلب إعادة تشغيل» + nav «إنهاء والدخول» |
| Support panel placement | Center setup / BootFlow still reachable from login after READY |

## Files changed

| Area | Files |
|------|-------|
| State service | `cloud/setup-state-service.js` (new) |
| Sync readiness | `cloud/sync-engine.js` (`runOnce`, `isRunning`, `getReadiness`) |
| Auth persist | `index.html` (`dbSetGuarded`, forced PW, `persistKv`, RBAC bind) |
| BootFlow cleanup | `cloud/boot-flow-ui.js` (single relaunch CTA, consume restart, hide CTAs) |
| Auto backup/sync | `cloud/activation-sync-defaults.js` |
| Relaunch IPC | `electron/main.js`, `preload.js`, `rbac-session.js` |
| Tests / CI | `tests/baseline/test-v2-5-10-setup-state-sync-auth.js`, `scripts/windows-uat/v2-5-10-setup-state-smoke.cjs`, workflow |

## Acceptance (offline / CI)

| Criterion | Result |
|-----------|--------|
| SyncEngine.getReadiness detailed | PASS (unit) |
| runOnce exists | PASS (unit) |
| Password persist allowed forced | PASS (unit wiring) |
| Single ready CTA | PASS (unit) |
| Restart consume-once | PASS (unit vm) |
| Auto BackupLayer/start timer | PASS (unit wiring) |
| Fresh/Existing/Device B live | **UNVERIFIED on physical operator PCs** — use new EXE |

## Operator proof required on new Installed EXE

1. Fresh setup → single relaunch → login only (no Ready loop)  
2. Owner forced password → logout → old reject / new accept → restart → new accept  
3. Sync Now shows detailed readiness or succeeds  
4. Completed Google/Boot CTA hidden when READY  
5. Local + cloud auto backup schedules active after finalize  


## Installed Setup EXE (post-fix)

- Release: https://github.com/7uzzam/Tadawi-Clinic-Production/releases/tag/uat-v2-5-10-30817956273
- SHA-256: `db62fd5e3a989d7e7a5c4e6df737626b321d50520a5216d3cf20a379159bbcb5`
- Commit: `6bbd614`
- CI: npm test PASS · Clean install + setup-state smoke PASS · Publish PASS
- Release gate: FAIL (A–E UNVERIFIED — expected)
