# V2-5.6 — Failure / Recovery UAT

Evidence: `docs/integration-v2-5-6/evidence/failure-recovery.json` + unit `ux-unit.json` + scenarios U01/U02/U04.

## Proven paths

1. Cancel mid restore → `RestoreWizard.cancel` → `cancelled`
2. `setRatio(1)` without `markComplete` → percent stays &lt;100
3. Wrong overwrite / wipe phrase → confirm rejected
4. Token expiry / permission / quota → leak-safe recovery copy
5. Ops export → email/bearer/password redacted
6. Offline status → reconnect hint + tone `offline`
