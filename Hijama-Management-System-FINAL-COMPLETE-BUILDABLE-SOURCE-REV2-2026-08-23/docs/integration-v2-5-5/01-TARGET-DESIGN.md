# V2-5.5 — Target Design

## Goals

- Measure, do not claim: every PERF row has median-of-3 samples on a documented host.
- Prove clinic-scale cardinalities with a reproducible generator.
- Harden SQLite open/maintenance without unsafe auto-VACUUM.
- Bound queues and classify disk/memory/crash failure paths.
- Keep incremental Backup V2 unsupported; full snapshot remains the DR unit.

## Architecture

```
openDatabase → applyOpenPragmas (WAL/FK/busy_timeout)
scale-dataset → synthetic tables for benches
perf-harness → documentHost + runMedianOf3 + claim gate
reliability-ops → markers / soak / rotate / classifiers
sync-state → MAX_PENDING_PUSHES + exponential retryBackoffMs
```

## Non-goals

- Fake incremental backup implementation
- Replacing in-memory UI search in this phase (SQL helpers used for scale benches)
