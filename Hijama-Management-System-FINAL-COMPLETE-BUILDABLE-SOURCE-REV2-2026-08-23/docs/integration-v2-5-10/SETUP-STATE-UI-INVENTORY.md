# V2-5.10 — Setup / Activation UI Inventory

**SoT:** `SetupStateService` (+ `SetupStateDom.applyDomVisibility`)  
**Rule:** BootFlow is a wizard surface only — never an independent visibility authority after this change.

Classification legend:

| Class | Meaning |
|-------|---------|
| KEEP | Remains available in normal customer UX when relevant |
| HIDE_AFTER_COMPLETE | Visible only while setup incomplete (or support mode) |
| ADVANCED_ONLY | Support / Owner Hub advanced / `?support=1` |
| DELETE | Dead or legacy — must stay hidden |
| MERGE | Logic folded into SetupStateService; callers must not diverge |

## Surfaces

| Surface | Selector / entry | Class | Enforcement |
|---------|------------------|-------|-------------|
| Login Boot CTA | `#login-boot-cta` | HIDE_AFTER_COMPLETE | `SetupStateDom` + `showLoginBootCta` |
| Login setup hint | `#login-setup-hint` | HIDE_AFTER_COMPLETE | same |
| Login support details | `.login-support-details` | ADVANCED_ONLY | hidden when READY unless support |
| Drive bootstrap panel | `#login-drive-bootstrap-panel` | DELETE | always hidden |
| BootFlow overlay | `#bootFlowOverlay` | HIDE_AFTER_COMPLETE | closed when READY |
| Ready relaunch CTA | BootFlow ready step | KEEP | single CTA only |
| Settings BootFlow | `#settings-bootflow-cta` | HIDE_AFTER_COMPLETE | SetupStateDom |
| Settings CenterSetup | `#settings-centersetup-cta` | ADVANCED_ONLY | SetupStateDom |
| Settings Google connect | `[data-ss-surface=google_connect]` | KEEP / gated | `visibilityFor('google_connect')` |
| Sync Now | `#btn-cloud-v2-sync-now` | KEEP | `visibilityFor('sync_manual')` |
| Sync readiness hint | `#bk-cv2-setup-hint` | KEEP | shows `missing[]` + Arabic labels |
| Owner Hub BootFlow | `#ownerhub-bootflow-cta` | HIDE_AFTER_COMPLETE | SetupStateDom after render |
| Owner Hub CenterSetup | `#ownerhub-centersetup-cta` | ADVANCED_ONLY | SetupStateDom |
| Owner Hub setup guide | `[data-ss-surface=ownerhub_setup_guide]` | MERGE | hidden when READY |
| Forced password modal | forced PW flow in `index.html` | KEEP | auth-gated persist + credentialRevision |
| Backup V2 create/restore | settings backup V2 | KEEP | ActivationSyncDefaults starts services |
| V1 sync / LevelDB customer buttons | legacy backup V1 | DELETE | customer UI disabled paths |
| `BootFlow.needsBootScreen` | API | MERGE | delegates to `SetupStateDom.needsBootFlow` |
| `finishLogin` / `showPage` gates | `index.html` | MERGE | SetupStateDom first |
| Owner Hub skip Owner | `skipLegacyOwnerMigration` | MERGE | SetupStateDom / SetupStateService |

## Call sites that must use SetupState (not BootFlow alone)

1. `finishLogin`
2. `showPage`
3. `BootFlow.needsBootScreen` / `applyLoginGate` / `shouldAutoOpenBoot`
4. `OwnerHub.renderOwnerHubPage` + skip migration
5. `renderCloudV2BackupStatus` / `runCloudV2SyncNow`
6. App startup after relaunch (`onAppStartupAfterRelaunch` + `SetupStateDom.applyDomVisibility`)

## Honesty

- Inventory + code gates = **implemented**.
- Live Device A/B Google + full journey PASS on Installed Setup EXE = **operator evidence still required** (see runtime evidence JSON).
