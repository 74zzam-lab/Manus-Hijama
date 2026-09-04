# V2-5.1 — Failure & Recovery UAT Results

**Status:** PASS with evidence in `evidence/failure-recovery.json` and scenarios S06/S07/S10/S12.

| Scenario | Result | Evidence |
|----------|--------|----------|
| Wrong center | PASS | S06 |
| Unauthorized branch | PASS | S06 |
| Corrupt `.tdw` | PASS | S07 (+ diagnostics/) |
| Failpoint after first swap / rollback + reopen | PASS | S07 |
| Network interrupt + resume | PASS | S12 |
| Failed restore leaves live DB | PASS | S10 |
| Friendly recoverable messages | PASS | `friendlyBackupError` + unit |
| No silent empty DB | PASS | S10 |

Evidence paths under `docs/integration-v2-5-1/evidence/`.
