# V2-5 Final Stabilization — Test Matrix

| Suite | Command | Covers |
|-------|---------|--------|
| Unit | `node tests/baseline/test-v2-5-final-stabilization.js` | Public IPC, soft RBAC, Owner role, Sheets soft/hard, PKCE source |
| Scenarios | `node scripts/v2-5-stabilization-scenarios-all.cjs` | S01–S12 Google/License/Owner/Sheets/Restore |
| Windows UAT | `node scripts/windows-uat/v2-5-stabilization-runtime.cjs` | Device A/B/C + full cycle checklist |
| Gate | `npm run verify:v2-5-stabilization-release-gate` | Traceability + evidence |
| Regression | prior `verify:v2-5-*-release-gate` + `npm test` | No regression |
