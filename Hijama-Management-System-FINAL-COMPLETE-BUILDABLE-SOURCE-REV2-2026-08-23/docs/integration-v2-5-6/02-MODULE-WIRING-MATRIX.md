# V2-5.6 — Module Wiring Matrix

| Module | Status | Wired into |
|--------|--------|------------|
| `cloud/ops-progress.js` | REAL | `ops-ux-bridge.js`, restore wizard, unit/scenarios |
| `cloud/restore-wizard.js` | REAL | `ops-ux-bridge.js`, `index.html` script |
| `cloud/ops-status.js` | REAL | `cloud/owner-hub.js`, status strip |
| `cloud/backup-history.js` | REAL | `ops-ux-bridge.js` mountBackupHistory |
| `cloud/danger-confirm.js` | REAL | wipe/restore overwrite confirm paths |
| `cloud/error-recovery-ux.js` | REAL | bridge `recoveryFor` |
| `cloud/ops-log-redact.js` | REAL | `cupping-system-improvements.js` export |
| `cloud/ux-i18n.js` | REAL | lang/dir helpers |
| `cloud/ux-a11y.js` | REAL | critical dialog attrs / aria-label |
| `cloud/ops-ux-bridge.js` | REAL | `index.html` + `#ops-ux-backup-host` |
| `renderer/styles/design-system.css` | REAL | `index.html` stylesheet link |
| `tests/baseline/test-v2-5-6-ux-hardening.js` | REAL | `tests/run-all.js` |
| `scripts/v2-5-6-scenarios-all.cjs` | REAL | npm `v2-5-6:scenarios` + run-all |
| `scripts/windows-uat/v2-5-6-ux-runtime.cjs` | REAL | Device A/B evidence |
| `.github/workflows/v2-5-6-release-gate.yml` | REAL | windows-2022 gate |
