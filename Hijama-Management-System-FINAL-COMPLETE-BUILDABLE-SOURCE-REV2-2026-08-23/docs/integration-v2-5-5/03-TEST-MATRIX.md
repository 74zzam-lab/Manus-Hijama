# V2-5.5 — Test Matrix

| Suite | Command | Covers |
|-------|---------|--------|
| Unit | `node tests/baseline/test-v2-5-5-performance.js` | harness, TINY scale, maintenance, reliability, queue bound, incremental policy |
| Scale FULL | `npm run v2-5-5:scale` | SCALE-255-001..005 |
| Perf benches | `npm run v2-5-5:perf` | PERF-255-001..022 (TINY default; `V255_PERF_FULL=1` optional) |
| Scenarios | `npm run v2-5-5:scenarios` | P01–P05 |
| Windows UAT runtime | `node scripts/windows-uat/v2-5-5-performance-runtime.cjs` | UAT-255-001 + device A/B |
| Soak harness | `SOAK_HOURS=8` via `cloud/reliability-ops.runSoak` | UAT-255-002 (CI short SOAK_MS) |
| Release gate | `npm run verify:v2-5-5-release-gate` | CLOSE-255-001 |
| Regression | `npm test` + prior verify:* in workflow | REG-255-001 |
