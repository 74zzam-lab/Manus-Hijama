# V2-5.5 — Current Reality (Performance, Scale & Reliability)

**Branch:** `cursor/v2-5-5-performance-c2ea`
**Baseline:** V2-5.4 tip `5e376de` (release gate green)
**Post-implementation tip:** see git log on branch

## Summary

Clinic-scale synthetic datasets, median-of-3 perf harness, SQLite maintenance (ANALYZE/indexes/VACUUM policy/WAL/FK/integrity + busy_timeout), reliability ops (crash markers, soak, backoff proof, disk/mem classifiers, log rotation), and bounded `pendingPushes` are REAL with runtime evidence under `docs/integration-v2-5-5/evidence/`.

## Delivered

1. Perf harness (`cloud/perf-harness.js`) — host doc + median of 3 + claim gate
2. Scale generator FULL: 100k clients / 500k visits / 50k invoices & appointments / 10k attachments
3. DB maintenance (`database/db-maintenance.js`) wired into `openDatabase` via `busy_timeout=5000`
4. Reliability (`cloud/reliability-ops.js`) + `SyncState.MAX_PENDING_PUSHES=2000`
5. Incremental backup remains unsupported by policy (PERF-255-013 evidence, not faked)
