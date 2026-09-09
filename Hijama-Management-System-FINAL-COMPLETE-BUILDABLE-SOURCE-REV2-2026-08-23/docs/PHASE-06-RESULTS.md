# Phase 6 Results — Permissions Hardening

**Date:** 2026-07-27  
**Branch:** `cursor/phase-06-permissions-c2ea`  
**Application version:** 2.0.0  

## Implemented

- Permission normalization with allowlist-only keys
- Deny unknown permission keys in runtime access checks
- User management hardening:
  - Admin check inside `saveUserAsync`
  - Case-insensitive duplicate username guard
  - Primary admin (`id=1`) cannot be deactivated or downgraded
- New baseline test: `tests/baseline/test-phase6-permissions.js`

## Security checks

| Check | Result |
|-------|--------|
| Custom permission object may inject unknown keys | PASS (sanitized) |
| Unknown permission key allowed at runtime | PASS (denied) |
| Console-triggered save user without admin guard | PASS (blocked) |
| Primary admin demotion/deactivation | PASS (blocked) |

## Tests

- `npm run verify` includes `phase6:permissions`

## Release decision

**PASS WITH WARNINGS**

Warnings:
- Permission checks are still client-side UI/business logic (expected in current architecture).
- Full server-authoritative RBAC is deferred to later cloud phases.
