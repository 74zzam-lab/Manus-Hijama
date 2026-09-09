# Baseline Results — Phase 1

**Date:** 2026-07-27  
**Branch:** `cursor/phase-01-stabilization-c2ea`  
**Application version:** 2.0.0  
**Node:** 22.x  

## Commands executed

```bash
npm install --include=dev   # lockfile updated for eslint
npm run lint
npm test
npm run verify
```

## Build

| Command | Result | Notes |
|---------|--------|-------|
| `npm ci --include=dev` | PASS | Clean install from lockfile |
| `npm run build:dir` | PASS | Windows unpacked app packaged (`dist/win-unpacked`) |
| `npm run build` (full NSIS) | FAIL on Linux agent | Wine/kernel32 limitation when finalizing NSIS; validate installer on Windows host |

Artifact from successful packaging: `dist/win-unpacked/Hijama Management System.exe` (~181 MB)

## Lint

| Check | Result |
|-------|--------|
| `npm run lint` (`eslint .`, Phase-1 scoped) | PASS |

## Automated tests (`npm test`)

| Suite | Result |
|-------|--------|
| baseline:entities+finance | PASS |
| baseline:tax | PASS |
| baseline:backup-crypto | PASS |
| baseline:license-read | PASS |
| baseline:electron-security | PASS |
| verify:attendance | PASS |
| verify:ledger | PASS |
| verify:tax-invoice | PASS |
| verify:backup-sync | PASS |
| verify:client-import | PASS |
| license:test | PASS |

**Summary:** 11/11 passed

## Golden financial snapshot (selected)

| Metric | Golden value |
|--------|--------------|
| VAT inclusive 115 @ 15% | preTax 100 / vat 15 |
| VAT exclusive 170 @ 15% | total 195.5 |
| Global service commission (5 cups, thr 3, rate 5) | 10 |
| Progressive cups (3@2 + 2@5) | 16 |
| Insurance 9.75% of 7000 | 682.5 |
| Sample payroll net | 6517.5 |
| Invoice format | `TM-2026-0007` |
| Backup `_meta.version` | 3 |
| License codec | V5 (`TDWI2`), storage `commercial_license_data_v2` |

Golden file: `tests/baseline/golden/financial-golden.json`

## Functional behavior

| Area | Changed in Phase 1? |
|------|---------------------|
| Commission formulas | No (snapshot only) |
| Tax/VAT | No |
| Attendance policy | No |
| Payroll math | No |
| License validation | No |
| Backup crypto | No |

## Manual checks still required

- Launch UI on Windows (`npm start`) and smoke-test reception workflow
- Print thermal receipt on physical printer
- Full NSIS install/uninstall on Windows 10/11
- Google Drive OAuth live connect (needs credentials / network)

## Release decision (Phase 1)

**PASS WITH WARNINGS**

Warnings:
- Windows installer build should be validated on a Windows host (or Wine-capable CI)
- OAuth client secret still present in `electron/cloud-oauth.embedded.json` (tracked as K-05; Phase 5)
- Electron `sandbox` still false (K-01; Phase 2)
