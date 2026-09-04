# V2-5.5 — Regression Report

## Prior phases

Workflow `.github/workflows/v2-5-5-release-gate.yml` runs:

- `npm test` (includes V2-5.1…V2-5.5 suites)
- `verify:v2-5-4-release-gate`
- `verify:v2-5-3-release-gate`
- `verify:v2-5-2-release-gate`
- `verify:v2-5-1-release-gate`
- `verify:v2-4-release-gate`
- Windows build + `verify:v2-5-5-release-gate`

## This phase additions

- `busy_timeout` on open (compatible with existing WAL/FK)
- Bounded pending pushes (additive field `pendingDropped`)
- New modules do not alter Backup V2 encrypt/decrypt path; incremental remains unsupported

## Result

REG-255-001 tracked as PASS when CI green and local suites exit 0.
