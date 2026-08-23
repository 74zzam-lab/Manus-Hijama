# 16 — Real Cloud Evidence Index

| Artifact | Path / URL | Status |
|----------|------------|--------|
| Requirements traceability | `docs/integration-v2-4/REQUIREMENTS-TRACEABILITY.md` | Registered; mostly NOT_STARTED |
| Cloud test workflow | `.github/workflows/v2-4-cloud-test.yml` | Added |
| Real-cloud workflow | `.github/workflows/v2-4-real-cloud-uat.yml` | Added; needs Environment secrets |
| Release gate workflow | `.github/workflows/v2-4-release-gate.yml` | Added; will fail until all PASS |
| Real Drive harness | `scripts/v2-4-real-drive-uat.cjs` | Added |
| FileRemote dual-device | `tests/baseline/test-v2-4-outbox-dual-device.js` | Automated |
| Conflict peer test | `tests/baseline/test-v2-4-conflict-resolution.js` | Automated |
| Installer SHA-256 | `evidence/cloud-test-build.json` | After GHA cloud-test |
| real-cloud-uat.json | `evidence/real-cloud-uat.json` | After secrets run |
| Screenshots A/B | `evidence/screenshots/` | NOT_STARTED |
| Drive file IDs (masked) | in real-cloud-uat.json | Pending |

**Secrets:** never commit. Integration token cannot list Actions secrets (403).


## CI runs (tip d57828b)

| Workflow | URL | Conclusion |
|----------|-----|------------|
| v2-4-cloud-test | https://github.com/7uzzam/Cupping-System-Management/actions/runs/30503997707 | success |
| V2-3.5 release gate | https://github.com/7uzzam/Cupping-System-Management/actions/runs/30503997654 | success |
| Windows UAT V2-3.5 | https://github.com/7uzzam/Cupping-System-Management/actions/runs/30503997718 | success |
| v2-4-release-gate | https://github.com/7uzzam/Cupping-System-Management/actions/runs/30503997693 | failure (expected) |
| Installer evidence | `evidence/cloud-test-build.json` | from cloud-test artifact |


## Scenarios 1–25

- File: evidence/scenarios-1-25.json
- Result: 25/25 PASS
- Real Drive center: CTR-UAT-V24-SCEN-66a021
