# Cursor Post–Phase 20 Changes (Preserve List)

Range: `origin/cursor/phase-20-production-release-c2ea`..`origin/cursor/fix-local-qr-csp-c2ea`

**Policy:** Assume MUST PRESERVE unless proven temporary debug / superseded / artifact-only.

Total commits: **30**

---

## fix(qr): generate receipt QR images locally under CSP

Commit SHA: `c1efdd3764ecdc13f592b1e6d3061ba4e79fe022`

Files changed: CHANGELOG.md, assets/vendor/LICENSES.md, assets/vendor/qrcode-generator-utf8.js, assets/vendor/qrcode-generator.js, cupping-client-file.js, cupping-qr-local.js, cupping-simplified-tax-invoice.js, docs/EXTERNAL-QR-SERVICE-AUDIT.md, docs/LOCAL-QR-FIX-VERIFICATION.md, index.html, package-lock.json, package.json, tests/font-csp-audit.test.js, tests/local-qr.test.js

Feature or fix: fix(qr): generate receipt QR images locally under CSP

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Security-relevant — preserve

Must preserve: **YES**

---

## test(sqlite): fail clearly when better-sqlite3 ABI mismatches after rebuild

Commit SHA: `e4cf0075d2599fdc0666bedc49595a813ea85b37`

Files changed: tests/baseline/test-phase4-sqlite.js

Feature or fix: test(sqlite): fail clearly when better-sqlite3 ABI mismatches after rebuild

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## test(receipt): align Phase-9 expectations with restored legacy fallback

Commit SHA: `d967268ae6cfb139aad3edd3f699f5ee6750456b`

Files changed: tests/baseline/test-phase9-branding-consistency.js

Feature or fix: test(receipt): align Phase-9 expectations with restored legacy fallback

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## test(fonts): harden print-window font URL resolution and verification docs

Commit SHA: `a39e830cfa61c37fbd45005d9e2537a8b10812c7`

Files changed: CHANGELOG.md, docs/CSP-FONT-FIX-VERIFICATION.md, docs/EXTERNAL-QR-SERVICE-AUDIT.md, docs/FONT-LOADING-DIFF.md, docs/LOCAL-FONTS-MIGRATION.md, docs/TRUE-ROOT-CAUSES.md, docs/UNINTENDED-CHANGES.md, docs/VISUAL-REGRESSION-AFTER-FONT-FIX.md, index.html, tests/font-csp-audit.test.js

Feature or fix: test(fonts): harden print-window font URL resolution and verification docs

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Security-relevant — preserve

Must preserve: **YES**

---

## test(fonts): verify offline and packaged font loading

Commit SHA: `c0a20b10665f060e08c165669287d07f9427897d`

Files changed: (none listed)

Feature or fix: test(fonts): verify offline and packaged font loading

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Security-relevant — preserve

Must preserve: **YES**

---

## fix(receipt): restore original English center name fallback

Commit SHA: `9d062316bc1036c7de9ff31d1b55626e9b587b57`

Files changed: docs/CSP-FONT-FIX-VERIFICATION.md, docs/LOCAL-FONTS-MIGRATION.md, docs/OFFLINE-RESOURCES-AUDIT.md, tests/font-csp-audit.test.js

Feature or fix: fix(receipt): restore original English center name fallback

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## fix(csp): replace Google Fonts CDN with local @font-face declarations

Commit SHA: `51d23b83ff0d464e725fdf1ef7dbdc6e5e045154`

Files changed: index.html

Feature or fix: fix(csp): replace Google Fonts CDN with local @font-face declarations

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Security-relevant — preserve

Must preserve: **YES**

---

## fix(fonts): bundle Tajawal Cairo and Inter locally as woff2

Commit SHA: `ba137d5a5ea604f6dc88260ddf85660065faf5da`

Files changed: assets/fonts/LICENSES.md, assets/fonts/cairo-variable-arabic.woff2, assets/fonts/cairo-variable-latin-ext.woff2, assets/fonts/cairo-variable-latin.woff2, assets/fonts/inter-variable-latin-ext.woff2, assets/fonts/inter-variable-latin.woff2, assets/fonts/tajawal-300-arabic.woff2, assets/fonts/tajawal-300-latin.woff2, assets/fonts/tajawal-400-arabic.woff2, assets/fonts/tajawal-400-latin.woff2, assets/fonts/tajawal-500-arabic.woff2, assets/fonts/tajawal-500-latin.woff2, assets/fonts/tajawal-700-arabic.woff2, assets/fonts/tajawal-700-latin.woff2, assets/fonts/tajawal-800-arabic.woff2, assets/fonts/tajawal-800-latin.woff2, assets/fonts/tajawal-900-arabic.woff2, assets/fonts/tajawal-900-latin.woff2

Feature or fix: fix(fonts): bundle Tajawal Cairo and Inter locally as woff2

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Security-relevant — preserve

Must preserve: **YES**

---

## Deep audit: CSP blocks Google Fonts — true root cause of all visual regressions

Commit SHA: `8aad9d0d31143201d3b6ae53c36919986ab5cdc8`

Files changed: docs/BASELINE-VALIDATION.md, docs/COMPUTED-STYLE-RUNTIME-DIFF.md, docs/CSS-CASCADE-RUNTIME-DIFF.md, docs/CSS-DIFF-AUDIT.md, docs/FONT-LOADING-DIFF.md, docs/GIT-BISECT-VISUAL-RESULT.md, docs/INVOICE-RUNTIME-DIFF.md, docs/QR-RUNTIME-DIFF.md, docs/TRUE-ROOT-CAUSES.md, docs/UNINTENDED-CHANGES.md, docs/USERDATA-SETTINGS-DIFF.md

Feature or fix: Deep audit: CSP blocks Google Fonts — true root cause of all visual regressions

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: root-cause documentation

Security impact: Security-relevant — preserve

Must preserve: **YES**

---

## Add comprehensive CSS/UI/Invoice/QR audit reports (read-only, no code changes)

Commit SHA: `60e802cb07148efd9bc5650367752460fb2f4266`

Files changed: docs/CSS-DIFF-AUDIT.md, docs/INVOICE-SETTINGS-DIFF.md, docs/QR-CODE-DIFF.md, docs/UI-VISUAL-REGRESSION.md, docs/UNINTENDED-CHANGES.md

Feature or fix: Add comprehensive CSS/UI/Invoice/QR audit reports (read-only, no code changes)

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Security-relevant — preserve

Must preserve: **YES**

---

## Restore Owner Hub V5-valid copy expected by bootstrap UX checks

Commit SHA: `09244f581dac6a23d540e12a4d4d65b911334bb3`

Files changed: cloud/owner-hub.js

Feature or fix: Restore Owner Hub V5-valid copy expected by bootstrap UX checks

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## Fix license.json Drive upload signing and Owner bootstrap catch-22

Commit SHA: `e57b9b16c078473a8f98535080b4bf5b1ec7a5e1`

Files changed: cloud/boot-flow-ui.js, cloud/cloud-v2-init.js, cloud/license-activation-gate.js, cloud/license-cloud.js, cloud/owner-hub.js, cloud/owner-migration.js, cloud/role-policy.js, license/license-router.js, tests/baseline/test-phase22-owner-policy.js, tests/baseline/test-phase37-legacy-owner-migration.js, tests/baseline/test-phase39-license-drive-push.js, tests/baseline/test-phase39-owner-bootstrap.js, tests/run-all.js

Feature or fix: Fix license.json Drive upload signing and Owner bootstrap catch-22

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## Fix Cupping Center surviving NSIS install wipe and uninstall

Commit SHA: `549c57e0b19aa522dfd54abb4a12250ff3347546`

Files changed: build/installer.nsh, tests/baseline/test-nsis-cupping-center-wipe.js, tests/baseline/test-vault-csp-uninstall-wipe.js, tests/run-all.js

Feature or fix: Fix Cupping Center surviving NSIS install wipe and uninstall

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Security-relevant — preserve

Must preserve: **YES**

---

## Fix Failed to fetch on activation and NSIS license wipe

Commit SHA: `d9d070c6d5545116932ece07514d051cb24015a1`

Files changed: build/installer.nsh, cloud/license-activation-gate.js, cloud/license-vault-client.js, electron/main.js, electron/security/window-policy.js, electron/uninstall-prep.js, index.html, scripts/verify-uninstall-prep.js, tests/baseline/test-phase2-electron-security.js, tests/baseline/test-vault-csp-uninstall-wipe.js, tests/run-all.js

Feature or fix: Fix Failed to fetch on activation and NSIS license wipe

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Security-relevant — preserve

Must preserve: **YES**

---

## Fix Google activation gate, Drive license pull, and bootstrap order

Commit SHA: `de5177417d009b404d2f2a35e8dd1612623b9209`

Files changed: cloud/boot-flow-ui.js, cloud/bootstrap.js, cloud/drive-adapter.js, cloud/license-activation-gate.js, cloud/owner-hub.js, electron/cloud-providers/google-drive.js, index.html, license/license-router.js, tests/baseline/test-licensing-google-bootstrap-flow.js, tests/run-all.js

Feature or fix: Fix Google activation gate, Drive license pull, and bootstrap order

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## phase39-40: add UAT checklist and handover closure gate

Commit SHA: `93821b074c2edb33b64ed51f1d14b1adba7c8422`

Files changed: docs/PHASE-39-RESULTS.md, docs/PHASE-40-RESULTS.md, docs/UAT-CHECKLIST-NEXTGEN.md, scripts/verify-nextgen-gate.js, tests/baseline/test-phase40-handover-gate.js, tests/run-all.js

Feature or fix: phase39-40: add UAT checklist and handover closure gate

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## phase37-38: add legacy owner migration and final nextgen gate

Commit SHA: `9b803111f64e2cae2133b78858fc1e4a4e033009`

Files changed: cloud/owner-hub.js, cloud/owner-migration.js, docs/PHASE-37-RESULTS.md, docs/PHASE-38-RESULTS.md, index.html, scripts/verify-nextgen-gate.js, tests/baseline/test-phase37-legacy-owner-migration.js, tests/baseline/test-phase38-nextgen-final-gate.js, tests/run-all.js

Feature or fix: phase37-38: add legacy owner migration and final nextgen gate

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## phase35-36: add backup org metadata and compatibility guard

Commit SHA: `ad81d6f935157f58deeed2d46800156cd9263008`

Files changed: cloud/backup-layer.js, cupping-cloud-db-backup.js, docs/PHASE-35-RESULTS.md, docs/PHASE-36-RESULTS.md, index.html, tests/baseline/test-phase35-backup-org-branch-metadata.js, tests/baseline/test-phase36-compat-matrix.js, tests/run-all.js

Feature or fix: phase35-36: add backup org metadata and compatibility guard

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## phase30-34: add owner branch mode, summaries, and freeze gate

Commit SHA: `26822a7f381dd0008137b53d6d15daf2e352cb4a`

Files changed: cloud/branch-summary.js, cloud/owner-branch-mode.js, cloud/owner-hub.js, docs/PHASE-30-RESULTS.md, docs/PHASE-31-RESULTS.md, docs/PHASE-32-RESULTS.md, docs/PHASE-33-RESULTS.md, docs/PHASE-34-RESULTS.md, scripts/verify-nextgen-gate.js, tests/baseline/test-phase30-owner-branch-mode.js, tests/baseline/test-phase31-owner-audit-expansion.js, tests/baseline/test-phase32-ownerhub-licensing-panel.js, tests/baseline/test-phase33-branch-summary-contract.js, tests/baseline/test-phase34-nextgen-freeze-gate.js

Feature or fix: phase30-34: add owner branch mode, summaries, and freeze gate

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## phase24-28: enforce owner setup, device limits, and branch governance

Commit SHA: `78e2c1ccee55319362ada44600437b87dfd6ba97`

Files changed: cloud/boot-flow-ui.js, cloud/branch-enrollment.js, cloud/device-registry.js, cloud/license-activation-gate.js, cloud/license-limits.js, cloud/owner-setup-state.js, docs/PHASE-24-RESULTS.md, docs/PHASE-25-RESULTS.md, docs/PHASE-26-RESULTS.md, docs/PHASE-27-RESULTS.md, docs/PHASE-28-RESULTS.md, index.html, scripts/verify-cloud-v2.js, tests/baseline/test-phase24-owner-activation-flag.js, tests/baseline/test-phase25-owner-setup-gate.js, tests/baseline/test-phase26-device-limits.js, tests/baseline/test-phase27-owner-hub-device-branch-controls.js, tests/baseline/test-phase28-branch-gate.js, tests/run-all.js

Feature or fix: phase24-28: enforce owner setup, device limits, and branch governance

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## phase23: add owner profile storage layer

Commit SHA: `54b0e74c9d9c81fcfb26c85f91bc322e29c311ed`

Files changed: cloud/owner-profile.js, docs/PHASE-23-RESULTS.md, index.html, tests/baseline/test-phase23-owner-profile-store.js, tests/run-all.js

Feature or fix: phase23: add owner profile storage layer

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## phase22: add owner semantics policy layer

Commit SHA: `a7ac22981951e51df55d1015205d7129355f5a89`

Files changed: cloud/role-policy.js, docs/PHASE-22-RESULTS.md, tests/baseline/test-phase22-owner-policy.js, tests/run-all.js

Feature or fix: phase22: add owner semantics policy layer

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## phase21: add organization facade on top of center id

Commit SHA: `c500d348d5c31dc846e8136b31d6a4dc56b98549`

Files changed: cloud/organization.js, docs/PHASE-21-RESULTS.md, index.html, tests/baseline/test-phase21-organization-facade.js, tests/run-all.js

Feature or fix: phase21: add organization facade on top of center id

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## docs: Phase Zero Next-Gen architecture proposal (design only)

Commit SHA: `548d1cebf9cb3f1cb318ac33f5896ac7502cf73c`

Files changed: docs/PHASE-ZERO-NEXTGEN-ARCHITECTURE.md

Feature or fix: docs: Phase Zero Next-Gen architecture proposal (design only)

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## Fix pre-auth blank screen and sticky license check for real

Commit SHA: `518a824edfdab2650ed8b38c016a5406a8009da8`

Files changed: cloud/boot-flow-ui.js, index.html, tests/baseline/test-login-license-ux.js

Feature or fix: Fix pre-auth blank screen and sticky license check for real

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## Fix stuck license check and blank screen after closing activation

Commit SHA: `3f40106f01ab23fe688b60020dea8879dc40013d`

Files changed: CHANGELOG.md, cloud/boot-flow-ui.js, index.html, tests/baseline/test-login-license-ux.js, tests/run-all.js

Feature or fix: Fix stuck license check and blank screen after closing activation

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## Restore embedded Google OAuth secret for automatic builds

Commit SHA: `41f60e5f5e5fe11f932a072d3b3baf444e3d1fe2`

Files changed: .gitignore, CHANGELOG.md, README.md, docs/KNOWN-ISSUES.md, electron/cloud-oauth-config.js, electron/cloud-oauth.embedded.json, scripts/generate-oauth-config.mjs, scripts/verify-google-oauth-config.js

Feature or fix: Restore embedded Google OAuth secret for automatic builds

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Security-relevant — preserve

Must preserve: **YES**

---

## Add machine OAuth store so builds need no manual secret edits

Commit SHA: `b66c92ac2b17045487816d24e9e2919cd83ea50e`

Files changed: CHANGELOG.md, README.md, package.json, scripts/generate-oauth-config.mjs, scripts/oauth-machine-store.mjs, scripts/oauth-save-local.mjs

Feature or fix: Add machine OAuth store so builds need no manual secret edits

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Security-relevant — preserve

Must preserve: **YES**

---

## Pin Node 20-22 and commit allowScripts for Electron/SQLite

Commit SHA: `3c2ca400d1764c885c0094963defc1b0dbdb9a00`

Files changed: CHANGELOG.md, README.md, package.json

Feature or fix: Pin Node 20-22 and commit allowScripts for Electron/SQLite

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

## Fix Windows verify: mock Electron, rebuild guidance, auto brand assets

Commit SHA: `73f0e7268c3e564ee8c5189fcf613858f7970585`

Files changed: CHANGELOG.md, README.md, docs/PHASE-20-RESULTS.md, scripts/production-release-gate.mjs, tests/baseline/test-phase2-electron-security.js, tests/baseline/test-phase20-production-release.js, tests/baseline/test-phase4-sqlite.js

Feature or fix: Fix Windows verify: mock Electron, rebuild guidance, auto brand assets

Why it was added: Part of post–Phase-20 hardening / NextGen / offline fonts-QR / Windows operability.

Production impact: functional or supporting

Security impact: Neutral or operational

Must preserve: **YES**

---

