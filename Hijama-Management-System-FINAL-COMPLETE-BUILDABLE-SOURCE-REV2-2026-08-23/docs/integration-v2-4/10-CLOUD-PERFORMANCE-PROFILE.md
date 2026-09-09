# 10 — Cloud Performance Profile

**Environment:** TBD Windows runners / Device A/B hardware — fill after measurement.

## Automated micro-benchmark (FileRemote, not Drive)

From `test-v2-4-large-queue.js` (120 records flush) — see console `flushMs` on CI artifacts.

| Metric | Target | Measured median | Result |
|--------|--------|-----------------|--------|
| Offline cold start cloud overhead | ≤ +1s vs baseline | NOT_STARTED | NOT_STARTED |
| Poll no-change (no operational download) | manifest-only | NOT_STARTED | NOT_STARTED |
| UI main-thread sync block | ≤ 100ms | NOT_STARTED | NOT_STARTED |
| Single record local save | non-blocking | Design: outbox async | UNVERIFIED |
| 100-event flush | document | partial (120 FileRemote) | IN_PROGRESS |
| 1000-event flush | document | NOT_STARTED | NOT_STARTED |
| Memory 30min poll | no unbounded growth | NOT_STARTED | NOT_STARTED |

Raw JSON: `docs/integration-v2-4/evidence/performance/*.json` (when collected).
