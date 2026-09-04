# V2-5.5 — Module Wiring Matrix

| Module | Role | Wired by |
|--------|------|----------|
| `database/connection.js` | Open path | `applyOpenPragmas` from db-maintenance |
| `database/db-maintenance.js` | ANALYZE/indexes/plans/VACUUM/WAL/FK/integrity | unit + scenarios P04 |
| `database/scale-dataset.js` | FULL/TINY generators | `v2-5-5:scale`, perf-bench |
| `cloud/perf-harness.js` | Host + median-of-3 + claim gate | unit + perf-bench |
| `cloud/reliability-ops.js` | Crash/soak/disk/mem/logs | unit + P05 |
| `cloud/sync-state.js` | Queue bound + backoff | unit + P05 |
| `electron/backup-v2-core.js` | `backupFormatPolicy` incremental=false | PERF-255-013 |
| `scripts/v2-5-5-*.cjs` | Evidence emitters | npm scripts + scenarios |
| `tests/baseline/test-v2-5-5-performance.js` | Automated suite | `tests/run-all.js` |
| `scripts/windows-uat/v2-5-5-performance-runtime.cjs` | Device A/B + build hashes | `tests/run-all.js` |
| `.github/workflows/v2-5-5-release-gate.yml` | windows-2022 gate | push/PR |
