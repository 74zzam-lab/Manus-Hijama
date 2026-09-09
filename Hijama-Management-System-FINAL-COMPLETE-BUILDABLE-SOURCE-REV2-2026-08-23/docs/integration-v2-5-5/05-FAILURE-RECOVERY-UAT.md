# V2-5.5 — Failure / Recovery UAT

Evidence: `docs/integration-v2-5-5/evidence/failure-recovery.json` + unit `perf-scale-unit.json`.

| Path | Behavior | Result |
|------|----------|--------|
| Crash mid backup | `.crash-in-progress-backup` + `recoverIncompleteOps` | PASS |
| Crash mid sync | `.crash-in-progress-sync` + recover | PASS |
| Crash mid restore | `.crash-in-progress-restore` + recover | PASS |
| Disk full | `classifyDiskError(ENOSPC)` → stop_write | PASS |
| Low memory | `classifyMemoryPressure` → defer_bulk | PASS |
| Retry storm | `retryBackoffMs` exponential 4s→300s, not tight loop | PASS |
| Unbounded queue | `MAX_PENDING_PUSHES=2000` drops overflow | PASS |
| Large logs | `rotateLogIfNeeded` keeps capped rotations | PASS |
