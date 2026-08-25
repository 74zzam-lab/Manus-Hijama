# 14 — Electron Upgrade Compatibility

**Generated:** research + local package.json inspection (runtime upgrade evidence completed by Windows GHA).

## Matrix (as of 2026-07-29)

| Line | Version | Chromium | Node (embedded) | Support status |
|------|---------|----------|-----------------|----------------|
| Current Hybrid | Electron ^33.2.0 | (EOL line) | ~20.x era | Outside Electron supported latest-3 |
| Codex extract (historical) | Electron 39 (per prior audit notes) | — | — | Historical reference |
| Supported latest-3 | 41.10.3 / 42.8.0 / **43.2.0** | M146 / M148 / M150 | Node 24 | Officially supported |
| Latest stable | **43.2.0** | M150 | 24 | Target candidate |
| Prerelease | 44.0.0-alpha.* | — | — | **Forbidden** |

Sources: https://endoflife.date/electron , https://github.com/electron/electron/releases

## Companion deps (current → target)

| Package | Current | Target candidate | Notes |
|---------|---------|------------------|-------|
| electron | ^33.2.0 | 43.2.0 | Major jump |
| better-sqlite3 | ^11.10.0 | **13.0.2** | `engines.node >=22`; ships **N-API** `prebuilds/*.node` (no ABI tarball) |
| Host Node (CI/tests) | 20 | **22** | Required by better-sqlite3@13 (NAPI_VERSION=10) |
| electron-builder | ^25.1.8 | keep ≥25.x | `npmRebuild: false` — keep N-API prebuilds |
| @electron/rebuild | via electron-builder | **disabled** for sqlite | N-API prebuilds load in Electron 43 without ABI rebuild |
| resedit | ^2.0.3 | keep | Icon Method B |

## Decision process (mandatory)

1. Attempt `electron@43.2.0` + `better-sqlite3@13` on clean `npm ci` with **Node 22**.
2. Verify `require('better-sqlite3')` uses shipped N-API `prebuilds/<platform>.node` (do **not** force ABI `electron-rebuild` for host tests).
3. `npm test`.
4. `npm run build:win` on `windows-2022` with `npmRebuild: false`.
5. Run install lifecycle UAT.
6. If any hard failure (ABI, print, OAuth, CSP, SQLite), pin to newest fully green major and document failure logs under `docs/integration-v2/evidence/electron-upgrade/`.

## Status

| Item | Result |
|------|--------|
| Research matrix written | YES |
| Runtime upgrade executed | **YES** — Electron `^43.2.0`, better-sqlite3 `^13.0.2` |
| `npm test` after upgrade | **65/65 PASS** (local Linux CI agent) |
| Forbidden prerelease used | NO |
| --force / permanent --legacy-peer-deps | NO |
| Windows build + install lifecycle | pending GHA `windows-uat.yml` evidence |

## Before → After

| Package | Before | After |
|---------|--------|-------|
| electron | ^33.2.0 | ^43.2.0 |
| better-sqlite3 | ^11.10.0 | ^13.0.2 |
| electron-builder | ^25.1.8 | ^25.1.8 (unchanged; compatible) |

Cloud Sync not part of this decision.
