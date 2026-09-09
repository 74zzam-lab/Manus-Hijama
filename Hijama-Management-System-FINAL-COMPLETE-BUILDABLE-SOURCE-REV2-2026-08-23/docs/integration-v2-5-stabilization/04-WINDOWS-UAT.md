# V2-5 Final Stabilization — Windows UAT

Evidence: `docs/integration-v2-5-stabilization/evidence/device-a-uat.json`, `device-b-uat.json`, `device-c-uat.json`, `full-cycle.json`, `windows-build.json`.

## Full production cycle (mandatory)
Install → Login with Google → Download License → Select Organization → Select Branch → Restore Data → Synchronization → Open Every Screen → CRUD → Reports → Google Sheets (vault) → Backup → Restore → Restart → Repeat.

## Host modes
- **Windows CI (GHA):** builds installer, indexes artifacts, re-runs unit/scenarios/UAT with `distPresent=true` when build succeeds.
- **Linux cloud agent:** structural harness PASS; `distDeferred=true` until Windows artifacts exist.

Ready for main: **NO**
