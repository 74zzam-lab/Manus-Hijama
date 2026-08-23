# V2-5.9 Inventory — Activation / Owner / Sync / Responsive

Base commit: `e39b94f` (V2-5.8 tip). Branch: `cursor/v2-5-9-final-activation-ownerhub-release-c2ea`.

## Classification legend

KEEP · MERGE · REPLACE · DELETE · BROKEN · DEAD CODE · DUPLICATE

| Area | Surface / Service | Path | Class | V2-5.9 action |
|------|-------------------|------|-------|---------------|
| Activation wizard | BootFlow | `cloud/boot-flow-ui.js` | KEEP→REPLACE steps | Remove Owner step from customer journey; auto-discover after Google; data source choices; restart gate |
| Google OAuth | BootFlow Google step | same | KEEP | Auto-scan Drive after connect |
| Google OAuth | `#login-drive-bootstrap-panel` | `index.html` + CSS hide | DELETE / DEAD | Remove dead DOM/updater when safe |
| Google OAuth | `#lic-drive-bootstrap-panel` | `index.html` | KEEP | License Recovery on activation page |
| Google OAuth | CenterSetup Google | `cloud/center-setup-ui.js` | MERGE | Post-login manage only |
| Google OAuth | `#cloudConnectModal` | `index.html` | KEEP | Shared confirm |
| License pull | `CloudBootstrap.discoverAndFetchLicenseFromDrive` | `cloud/bootstrap.js` | KEEP | Multi-select already |
| License Recovery | DevTools section | `license/ui/developer-panel.js` | KEEP | Support recovery |
| Owner Bootstrap auto | startup/login/hydrate | `index.html`, `bootstrap.js` | REPLACE | **No** auto Owner Bootstrap for Google activation |
| Owner create | BootFlow owner step | `boot-flow-ui.js` | DELETE from journey | Support/migration only |
| Owner seed | `defaultUsers` | `index.html` | KEEP+ADD | Seed `owner` role account |
| Owner Hub | `cloud/owner-hub.js` | BROKEN/UI debt | REPLACE prompts; add Approvals/Sync; fix KPIs |
| Owner Emergency | DevTools | `developer-panel.js` | REPLACE | Reset Owner Password primary; Create Owner emergency-only |
| Branch create | BootFlow branch | `boot-flow-ui.js` | KEEP | Custom name required (no placeholder-as-name) |
| Device lock | `DeviceConfig.setBranchLock` | `device-config.js` | KEEP | Add `lockToBranch` alias |
| Restore | BootFlow restore | `boot-flow-ui.js` | REPLACE | Local/Cloud/File/Empty choices |
| Restore bridge | `OpsUxBridge.openRestoreWizard` | missing | BROKEN→FIX | Alias to `runRestoreWizardFlow` |
| Sync defaults | `saveGoogleOAuthFromResult` / CloudV2 | `index.html`, `cloud-v2-init.js` | MERGE | SSOT enable after Google+License+Branch |
| Branch drawer | topbar `BranchSwitcher` | `branch-switcher.js` | KEEP+EXTEND | Add All Branches; persist context |
| Owner RO | `OwnerBranchMode` + `BranchScope.assertWriteAllowed` | | BROKEN→FIX | Owner Mode operational writes denied |
| Activation layout | license screen / design-system | CSS | REPLACE | Responsive 3-col grid |

## Duplicate Google / License CTAs

| CTA | Action |
|-----|--------|
| BootFlow Google + Drive pull | KEEP (canonical) |
| Login Drive bootstrap | DELETE (CSS-dead) |
| Lic Drive bootstrap | KEEP recovery |
| DevTools Pull License | KEEP recovery |
| CenterSetup Google | MERGE secondary |

## Policy decisions (final)

1. Google Login ≠ Owner. No Owner Bootstrap in customer activation.
2. Owner is a normal seeded user (`role: owner`) with local password.
3. Developer Tools: Reset Owner Password for support; Create Owner not daily.
4. Sync/backup/V2 Sync enabled by default after Google + License + Branch binding.
5. Windows Setup EXE evidence required — unit PASS ≠ release PASS.
