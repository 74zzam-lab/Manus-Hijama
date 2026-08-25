# Feature Inventory — Baseline (Phase 1)

Inventory of **existing** product capabilities as of application version **2.0.0**.
Do not treat this as a redesign brief — it freezes what must be preserved.

## Core Clinic Operations

| Feature | Status | Primary location |
|---------|--------|------------------|
| New visit / case entry | Active | `index.html` |
| Edit existing case | Active | `index.html` |
| Client registry / file number | Active | `index.html`, `cupping-client-file.js` |
| Client profile UI | Active | `cupping-client-profile-ui.js` |
| Services & packages | Active | `index.html` |
| Practitioners (doctors) | Active | `index.html` |
| Cupping body maps / atlas | Active | `cupping-cupping-atlas.js`, `cupping-map-editor.js` |
| Bookings / appointments | Active | `index.html` (`saveBooking`, statuses) |
| Next-session follow-ups | Active | `index.html` / DB `nextSessions` |
| Invoices page / reprint | Active | `cupping-invoices-page.js` |
| Simplified tax invoice (VAT) | Active | `cupping-simplified-tax-invoice.js` |
| Expenses & budget | Active | `index.html` |
| Thermal / A4 printing | Active | `electron/devices.js`, tax invoice builders |
| Cash drawer | Active | `preload` → `devices:openCashDrawer` |

## Employees & Payroll

| Feature | Status | Primary location |
|---------|--------|------------------|
| Employee records | Active | `index.html` (`doctors`) |
| Attendance + policy | Active | `cupping-attendance-policy.js` |
| Leave management | Active | `cupping-leave-management.js` |
| OT records | Active | `index.html` |
| Payroll generation | Active | `index.html` `generatePayroll` |
| Commission engine (many types) | Active | `index.html` `calcDoctorCommission` |
| Insurance deduction | Active | `index.html` `calcInsuranceDeduction` |
| Employee ledger / closings | Active | `cupping-employee-ledger.js` |
| Payroll print / WhatsApp | Active | `cupping-production.js` |

## Commission Types (must preserve)

- `global`, `fixed-session`, `fixed-cup`, `fixed-cup-threshold`
- `pct-session`, `pct-after-sessions`, `pct-after-revenue`
- `progressive`, `progressive-sessions`, `retroactive`

## Licensing & Access

| Feature | Status | Primary location |
|---------|--------|------------------|
| Commercial license engine V2 | Active | `license/engine/` |
| Codec V5 keys | Active | `license/core/license-codec-v5.js` |
| Feature packages / registries | Active | `license/registries/` |
| Activation bundles | Active | `license/data/activations/` |
| Developer / admin panels | Active | `license/ui/` |
| Users / roles / permissions | Active | `index.html` |
| First-run / product tour | Active | `cupping-first-run.js`, `cupping-product-tour.js` |

## Backup & Cloud

| Feature | Status | Primary location |
|---------|--------|------------------|
| Local JSON backup | Active | `electron/backup.js`, `index.html` |
| Cloud upload (Google Drive, local folder/vault) | Active | `electron/cloud-providers/` |
| Encrypted clinic DB backup | Active | `electron/clinic-snapshot.js`, `cloud-db-backup.js` |
| Cloud V2 sync / branches | Present | `cloud/` (sync-engine, branch-*, repository) |
| OAuth for Drive | Active | `electron/cloud-oauth-*.js` |
| Communication gateway (SMS/WA providers) | Active | `electron/communication/`, `cupping-communication-gateway.js` |

## Import / Export / Migration

| Feature | Status | Primary location |
|---------|--------|------------------|
| Import Studio | Active | `import-studio/` |
| Import wizard | Active | `cupping-import-wizard.js` |
| Import engine worker | Active | `import-engine-*.js` |
| Legacy migration helpers | Active | `migration/` |
| Monthly archive | Active | `cupping-monthly-archive.js` |

## Installer / Uninstall

| Feature | Status | Primary location |
|---------|--------|------------------|
| NSIS installer | Active | `package.json` build + `build/installer.nsh` |
| Uninstall prep / wipe modes | Active | `electron/uninstall-prep.js` |
| Keep app data on uninstall (default) | Active | `deleteAppDataOnUninstall: false` |

## Reports & UI Polish Modules

| Feature | Status | Primary location |
|---------|--------|------------------|
| Layout composer | Active | `cupping-layout-composer.js` |
| System enhancements / improvements | Active | `cupping-system-*.js` |
| Ext modules (payroll deduction rows, …) | Active | `cupping-ext-modules.js` |
| Bank fee presets | Active | `cupping-bank-presets.js` |
| Report identity | Active | `cupping-report-identity.js` |
| Branding runtime | Active | `cupping-branding.js` |
| Desktop input helpers | Active | `cupping-desktop-input.js` |
| Action menu | Active | `cupping-action-menu.js` |

## Storage (Phase 4+)

| Capability | Status | Notes |
|------------|--------|-------|
| SQLite schema v4 | Active | `database/migrations/001_initial.js` |
| LocalStorage → SQLite migrator | Active | Keeps localStorage mirror |
| Renderer SqliteBridge | Active | Hydrate + write-through |
| CLI migrate from backup file | Active | `npm run db:migrate:file` |

## Explicit Non-Goals of Phase 1

- No SQLite migration (delivered in Phase 4)
- No license V6 / Ed25519 rewrite (delivered in Phase 3)
- No UI redesign
- No removal of features listed above
