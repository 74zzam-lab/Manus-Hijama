# Multi-Device Windows UAT (Release Closure Order)

Protocol: `LIVE-WINDOWS-CLOSURE-PROTOCOL.md`

| Scenario | Result |
|----------|--------|
| A — Device A/B Google + license + branch + CRUD + attachment + conflict + offline | UNVERIFIED |
| B — Atomic new branch + Device B join + isolation | UNVERIFIED |
| C — Disaster recovery + reconcile + resume sync | UNVERIFIED |
| D — Owner multi-branch / Hub / RO / permissions | UNVERIFIED |
| E — Google OAuth / Drive / Sheets (not SoT) | UNVERIFIED |
| Offline queue + reconnect | UNVERIFIED |
| Console errors = 0 | UNVERIFIED |
| Runtime errors = 0 | UNVERIFIED |

Setup EXE / SHA-256: see `evidence/gha-step1-build.json` after CI (install+smoke ≠ Scenario A PASS)

Ready for release: **NO**  
Ready for main: **NO**
