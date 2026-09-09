# V2-5.7 — Test Matrix

| Suite | Command / path | Evidence |
|-------|----------------|----------|
| Unit | `tests/baseline/test-v2-5-7-production-release.js` | `evidence/production-release-unit.json` |
| Artifacts | `npm run v2-5-7:artifacts` | `evidence/release-artifacts.json`, `checksums.sha256` |
| Migration | `npm run v2-5-7:migration` | `evidence/migration-*.json` |
| Lifecycle | `npm run v2-5-7:lifecycle` | `evidence/lifecycle-matrix.json` |
| Scenarios R01–R08 | `npm run v2-5-7:scenarios` | `evidence/scenarios-all.json` |
| Windows UAT | `npm run v2-5-7:uat` | `device-a/b-uat.json`, `windows-build.json` |
| Prior gates | verify:v2-5-6 … verify:v2-4 | R08-prior-gates |
| npm test | `tests/run-all.js` (wired) | full suite |
| Release gate | `npm run verify:v2-5-7-release-gate` | TRACEABILITY 60 PASS |
