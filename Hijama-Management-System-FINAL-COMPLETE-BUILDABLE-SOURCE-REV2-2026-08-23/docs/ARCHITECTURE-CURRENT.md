# Architecture — Current Baseline (Phase 1)

**Product:** Tadawi Al-Madinah / Hijama Management System  
**Version:** 2.0.0  
**Publisher:** NajjarTech  
**Document date:** 2026-07-27  
**Phase:** 4 — SQLite Migration (baseline doc updated)

## Overview

Electron desktop application (Windows-first) for cupping/hijama clinic operations:
clients, visits (cases), bookings, employees, attendance, payroll, commissions,
invoices/tax, expenses, reports, printing, backup, and commercial licensing.

## Runtime Topology

```text
┌─────────────────────────────────────────────────────────┐
│ Renderer (index.html + cupping-*.js + cloud/ + license/) │
│  - UI + business logic                                   │
│  - DB.get/DB.set → localStorage mirror                   │
│  - SqliteBridge (hydrate / write-through when primary)   │
│  - window.cuppingElectron / window.tadawi                │
└───────────────────────────┬─────────────────────────────┘
                            │ IPC (named channels)
┌───────────────────────────▼─────────────────────────────┐
│ Main Process (electron/main.js)                          │
│  - BrowserWindow + security policy                       │
│  - SQLite service (better-sqlite3)                       │
│  - backup / devices / messaging / license-data / cache   │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│ userData/database/tadawi.db (schema v4)                  │
└─────────────────────────────────────────────────────────┘
```

## Key Entry Points

| Layer | Path |
|-------|------|
| Electron main | `electron/main.js` |
| Preload bridge | `electron/preload.js` → `window.cuppingElectron` |
| UI shell | `index.html` (~25k lines) |
| Feature modules | `cupping-*.js` |
| Cloud V2 | `cloud/` |
| Licensing | `license/` (Engine V2, codec V5) |
| Import | `import-studio/`, `import-engine-*.js` |
| Migration helpers | `migration/` |

## Electron Security (as of Phase 2)

| Setting | Value |
|---------|--------|
| `contextIsolation` | `true` |
| `nodeIntegration` | `false` |
| `sandbox` | `true` |
| `webSecurity` | `true` |
| Main preload | `electron/preload.js` → `window.cuppingElectron` + `window.tadawi` |
| Child/print preload | `electron/security/preload-print.js` (devices/print only) |
| CSP | Applied via `session.webRequest` (`electron/security/window-policy.js`) |
| External links | `shell.openExternal` after protocol allowlist |
| IPC | Explicit channel allowlist + payload validation |

Modules: `electron/security/path-guard.js`, `ipc-validate.js`, `window-policy.js`, `sanitize-text.js`.

Phase 1 baseline noted `sandbox: false` and shared main preload on child windows — both hardened in Phase 2.

## Data Storage

| Store | Usage |
|-------|-------|
| SQLite (`userData/database/tadawi.db`) | Operational primary after migrate (`meta.sqlitePrimary`); schema v4 |
| `localStorage` (Chromium LevelDB under `userData`) | Mirror + fallback via `DB.get` / `DB.set` (not deleted in Phase 4) |
| Electron `userData` files | Device cache, CloudVault tokens, license shards, migration reports |
| Documents/.../Backups | Local JSON backups |
| Google Drive / local vault | Encrypted clinic DB ZIP + AES backups |

### SQLite access path

- Modules: `database/` (connection, migrations, repositories, migrator)
- Main: `electron/database/service.js`
- Renderer: `cupping-sqlite-bridge.js` — no arbitrary SQL; `querySafe` allowlist only

### Primary DB keys

`users`, `settings`, `packages`, `services`, `doctors`, `cases`, `otRecords`,
`attendance`, `bookings`, `expenses`, `budget`, `invoiceCounter`,
`clientsRegistry`, `clientFileCounter`, `messageLog`, `backupLog`,
`backupRegistry`, `activityLog`, `nextSessions`, `employeeLeaveRequests`,
`employeeLedgerAccruals`, `employeeLedgerPayments`, `employeeLedgerEntries`,
`importHistory`, …

License/cloud keys: `commercial_license_data_v2`, `__tdw_lic__*`,
`__tdw_cloud_license__`, `__tdw_device_config__`, `__tdw_sync_state__`, …

## Licensing

- Engine: Commercial License Engine **V2**
- Key codec: **V5** (`TDWI2` magic) — HMAC (legacy, still supported)
- License **V6**: Ed25519-signed JSON / `TDW6.` tokens — verify-only in client
- Public key: `license/core/license-pubkey-v6.js`
- Admin issuance: `tools/license-admin` (private key never shipped in client)
- Registry version: **1.2.0**
- Storage keys: `commercial_license_data_v2` (V5), `commercial_license_v6` (V6)
- Shipped sample data: `license/data/`

## Backup Tracks

1. **JSON backup** — `buildFullBackupObject()` → local / cloud providers  
2. **Encrypted clinic DB** — LevelDB snapshot → ZIP → AES-256-GCM (`CDBK` magic)

## Branding & Currency

- Currency display: `﷼` via `fmtMoney`
- Digits: English via `toEN` / `fmtNum` (`en-US`)
- Branding config: `branding.config.json`
- Fixed packaged `userData` folder name: `Cupping Center`

## Build

- Packager: `electron-builder` (NSIS, win x64)
- App ID: `com.tadawi.cuppingcenter`
- Artifact: `HijamaManagement-Setup-${version}.exe`

## Test Surface (Phase 1)

| Command | Role |
|---------|------|
| `npm test` | Baseline + existing verify suite (`tests/run-all.js`) |
| `npm run lint` | ESLint on allowed paths |
| `npm run verify` | lint + test |
| `npm run verify:sensitive` | attendance, ledger, tax, backup, import, license |

## Out of Scope for This Document

Future phases (credentials hardening, UI modernization, cloud platform) are
described in the executive roadmap and must not alter financial baselines
without comparison tests.
