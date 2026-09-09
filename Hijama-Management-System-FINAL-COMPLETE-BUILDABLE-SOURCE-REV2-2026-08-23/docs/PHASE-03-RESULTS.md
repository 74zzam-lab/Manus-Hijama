# Phase 3 Results — Commercial Licensing V6

**Date:** 2026-07-27  
**Branch:** `cursor/phase-03-licensing-v6-c2ea`  
**Application version:** 2.0.0  

## Implemented

- Ed25519 V6 license schema (`schemaVersion: 6`) with signed JSON + `TDW6.` compact tokens
- Client verify-only modules (public key embedded)
- Separate License Admin CLI under `tools/license-admin` (private key never in client tree)
- Device fingerprint (multi-signal + soft drift)
- Offline activation via router (`applyV6Activation`)
- Online client interface stub (`license/api/license-online-client.js`)
- V5 compatibility preserved; V5→V6 migration request helper (keeps V5 until V6 succeeds)
- Revocation list support

## Security checks

| Check | Result |
|-------|--------|
| No private key under `license/`, `electron/`, `cloud/` | PASS |
| `tools/` excluded from electron-builder files | PASS |
| Tampered features/expiry rejected | PASS |
| Forged / foreign-key signatures rejected | PASS |
| Expired / revoked rejected | PASS |
| Device mismatch rejected; soft drift allowed | PASS |
| V5 keys still not treated as V6 | PASS |

## Tests

`npm run verify` includes `phase3:licensing-v6`.

## Release decision

**PASS WITH WARNINGS**

Warnings:
- Embedded public key is the **dev/test** keypair (`keys/dev`). Replace for production.
- V5 HMAC shared secrets still exist for legacy compatibility (K-06 partial until V5 retired).
- Full License Admin GUI not built — CLI covers issue/renew/revoke/migrate/verify.
