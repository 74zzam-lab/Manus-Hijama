# V2-5.9 Windows A-E Runtime Status (Release Closure Mode)

Generated: 2026-08-01T20:34:35.499Z

| Field | Value |
|-------|-------|
| Platform | linux |
| Commit | cd1ee14 |
| GHA run | n/a |
| Dist present | true |
| Installer size | 554321 |
| Installer valid NSIS (>=50MB) | NO |
| Installer SHA-256 | 66c0b21f5fd829cfda2acd6baab3ef6895971ec640c4abf026a26ffba4dda43d |
| win-unpacked SHA-256 | ea8ca53c9c9d4c08bfc81c31c5db43d0c1cbc301abbb8fcff4822d5d9af7a958 |
| Clean profile wipe | MISSING |
| Installed Setup EXE proof | MISSING |
| Scenario A Device A/B | UNVERIFIED |
| Scenario B New Branch | UNVERIFIED |
| Scenario C Disaster Recovery | UNVERIFIED |
| Scenario D Owner | UNVERIFIED |
| Scenario E Google APIs | UNVERIFIED |
| Ready for release | **NO** |
| Ready for main | **NO** |
| V2-5.9 complete | **NO** |

## Policy

See `LIVE-WINDOWS-CLOSURE-PROTOCOL.md`.
Requirement PASS only after Installed Setup EXE evidence for that row.
Unit/wiring PASS does not flip traceability.
Wine/NSIS stubs under 50MB are **INVALID**.

Do **not** start Scenario B until Scenario A is PASS.
