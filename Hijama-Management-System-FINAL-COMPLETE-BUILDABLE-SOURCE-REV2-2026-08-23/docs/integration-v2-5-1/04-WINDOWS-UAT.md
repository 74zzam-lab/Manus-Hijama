# V2-5.1 — Windows UAT Results

**Status:** Runtime evidence recorded (engine + packaging). Full NSIS finalize on windows-2022 GHA.

## Device A — full restore UAT (UAT-251-001)

- Runner: `scripts/windows-uat/v2-5-1-restore-runtime.cjs`
- Evidence: `evidence/device-a-uat.json`
- Scenarios: S01–S13 via `npm run v2-5-1:scenarios` → 13/13 PASS
- Unit: `tests/backup/backup-restore-v2.test.js` PASS
- Packaging: `evidence/windows-build.json` win-unpacked SHA-256 recorded

## Device B — new-device restore UAT (UAT-251-002)

- Evidence: `evidence/device-b-uat.json`
- Scenario: `S09-new-device-cloud-only` PASS (cloud-cache-only path, no local Backups/V2)

## Installer notes

- Linux host cannot finalize NSIS (wine kernel32 failure); stub Setup exe must not be treated as release installer.
- windows-2022 GHA `v2-5-1-release-gate` builds real NSIS and re-runs UAT.
