# V2-5.3 — Failure / Recovery UAT

**Evidence:** `docs/integration-v2-5-3/evidence/failure-recovery.json`

| Path | Scenario | Result |
|------|----------|--------|
| Expired / reused token | O01 | PASS |
| Two-device race loser | O02 | PASS |
| Unauthorized emergency recovery | O03 | PASS |
| Offline grace exceeded | L01 | PASS |
| Device revoke sync block | I02 | PASS |
