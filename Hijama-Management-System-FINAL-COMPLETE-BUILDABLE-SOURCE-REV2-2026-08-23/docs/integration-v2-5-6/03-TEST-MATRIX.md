# V2-5.6 — Test Matrix

| Suite | Command | Covers |
|-------|---------|--------|
| Unit | `node tests/baseline/test-v2-5-6-ux-hardening.js` | UX-256-001..040, VIS fonts/QR |
| Scenarios | `npm run v2-5-6:scenarios` | U01–U06 |
| Windows UAT runtime | `node scripts/windows-uat/v2-5-6-ux-runtime.cjs` | UAT-256-001/002 + device A/B |
| Visual | `evidence/screenshots/` + `screenshots-index.json` | VIS-256-001..003 |
| Release gate | `npm run verify:v2-5-6-release-gate` | REL-256-001 |
| Regression | prior verify:* in workflow | REG-256-001 |

Evidence emitters write under `docs/integration-v2-5-6/evidence/`.
