# V2-5.6 — Performance / Timing

UX phase inherits V2-5.5 medians. Ops progress UI never reports 100% without `markComplete` (proven in `ux-unit.json` and scenario U02).

No tight polling loops introduced by progress sessions — in-memory Map updates only. Scenario timings recorded in `evidence/scenarios-all.json` / `evidence/scenarios/U0*.json`.
