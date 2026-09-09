# Phase 15 — OAuth / Drive / Sheets build (zero-step)

**Branch:** `cursor/phase-15-oauth-drive-build-7c71`  
**Parent:** `cursor/phase-14-build-reliability-gates-7c71`

## Goal

`npm run build:prod` works on fresh clone with no manual OAuth setup.

## Committed production assets

| File | Purpose |
|------|---------|
| `electron/cloud-oauth.production.b64` | Base64-encoded production OAuth JSON (original v2-5-10 credentials) |
| `electron/cloud-oauth-production-bundle.js` | Decode helper (build + runtime fallback) |
| `license/license-vault.defaults.json` | Apps Script license vault URL |

`prebuild` decodes bundle → writes `cloud-oauth.config.json` → packaged in installer.

## Windows

```bat
npm ci
npm run build:prod
```

## Verification

```bash
npm run verify:oauth-build-packaging
```

## Operator UAT

1. Fresh clone → build succeeds without any copy steps
2. Installed app → Google OAuth + Drive + license vault work
