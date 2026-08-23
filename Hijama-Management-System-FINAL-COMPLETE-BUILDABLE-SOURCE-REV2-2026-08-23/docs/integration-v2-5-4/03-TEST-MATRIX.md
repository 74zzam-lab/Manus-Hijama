# V2-5.4 — Test Matrix

| Suite | Command | Result |
|-------|---------|--------|
| Unit | `node tests/baseline/test-v2-5-4-rbac-audit.js` | PASS |
| Scenarios | `npm run v2-5-4:scenarios` | PASS 5/5 |
| Windows UAT runtime | `node scripts/windows-uat/v2-5-4-rbac-runtime.cjs` | PASS |
| Release gate | `npm run verify:v2-5-4-release-gate` | PASS |
