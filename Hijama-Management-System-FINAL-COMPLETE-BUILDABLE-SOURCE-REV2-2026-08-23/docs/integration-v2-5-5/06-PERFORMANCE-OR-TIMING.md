# V2-5.5 — Performance / Timing

**Host:** see `evidence/host.json` (platform/arch/cpus/mem/node).
**Method:** median of 3 (`cloud/perf-harness.runMedianOf3`).
**Scale seed for benches:** TINY by default in `v2-5-5:perf`; FULL cardinalities proven separately by `v2-5-5:scale` (~3.8s gen).

## Median samples (latest `perf-bench.json` summary)

| Bench | Median ms |
|-------|-----------|
| coldOpen | 1.896 |
| warmOpen | 0.016 |
| offlineStartup | 0.046 |
| onlineStartup | 0.042 |
| dashboardQuery | 0.049 |
| clientSearch | 0.051 |
| largeReport | 0.155 |
| largeExport | 0.258 |
| largeImport | 0.677 |
| fullBackup | 2.951 |
| incrementalBackupPolicy | 0.004 (policy check only; unsupported) |
| fullRestore | 3.833 |
| initialSync | 0.787 |
| noChangePoll | 0.033 |
| singleEventPush | 0.313 |
| flush100 | 4.500 |
| flush1000 | 58.307 |
| largeAttachmentMeta | 0.101 |

Before/after: `evidence/before-after.json`. Claims without measurement are rejected by `assertNoClaimWithoutMeasurement`.
