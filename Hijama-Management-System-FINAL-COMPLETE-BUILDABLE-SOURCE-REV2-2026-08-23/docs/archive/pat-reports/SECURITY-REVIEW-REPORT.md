# Security Review Report

**Generated:** 2026-07-01T13:24:26.346Z
**Gate:** production-hardening v1.2.0

| Passed | Failed | Warnings |
|--------|--------|----------|
| 10 | 0 | 1 |

## Warnings

- **seed-bundle-sig**: L000001 has test mock-sig (seed data)

## Checks (11)

- [PASS] registry-sig:feature: valid
- [PASS] registry-sig:capability: valid
- [PASS] registry-sig:package: valid
- [PASS] registry-sig:subscription: valid
- [PASS] registry-sig:action: valid
- [PASS] registry-sig:template: valid
- [PASS] no-hardcoded-secrets: 0
- [WARN] seed-bundle-sig: L000001 has test mock-sig (seed data)
- [PASS] reject-invalid-key: format
- [PASS] pbkdf2-iterations: 150000 iterations for registry HMAC
- [PASS] input-normalize: V5 codec normalizeKey preserves commercial segments
