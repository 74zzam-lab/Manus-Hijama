# Near-Real-Time Sync Performance Profile

Terminology: **Near-real-time polling sync** (not real-time WebSocket).

| Metric | Target SLO | Measured |
|--------|------------|----------|
| Local commit → remote visible (median) | ≤ 20s | UNVERIFIED |
| Local commit → remote visible (P95) | ≤ 60s | UNVERIFIED |
| Remote → Device B applied (median) | ≤ 20s | UNVERIFIED |
| Attachment propagation | ≤ 60s median | UNVERIFIED |
| Offline reconnect flush (100 events) | UNVERIFIED | UNVERIFIED |
| 1000 outbox events | UNVERIFIED | UNVERIFIED |

Runs 1–3, network conditions, device specs: **UNVERIFIED**
