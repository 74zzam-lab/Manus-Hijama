# V2-5.3 — Test Matrix

| Suite | Command | Coverage |
|-------|---------|----------|
| Unit | `node tests/baseline/test-v2-5-3-owner-identity-license.js` | OWN/ID/LIC core |
| Scenarios | `npm run v2-5-3:scenarios` | O01–O04, I01–I02, L01–L02 (8/8) |
| Windows UAT runtime | `node scripts/windows-uat/v2-5-3-owner-identity-runtime.cjs` | device-a/b + build hashes |
| Full regression | `npm test` | includes v2-5.3 + prior |
| Release gate | `npm run verify:v2-5-3-release-gate` | 48/48 PASS rows |
| CI | `.github/workflows/v2-5-3-release-gate.yml` | windows-2022 |
