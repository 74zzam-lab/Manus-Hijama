# V2-5.10 — Production Lock (Final development phase)

**Effective:** 2026-08-04  
**Phase:** Last development pass before launch — **stability only**

## Policy (non-negotiable)

| Allowed | Forbidden |
|---------|-----------|
| Fix bugs on **Installed Setup EXE** | New features |
| Fix release blockers | New architecture |
| UX simplification (remove duplicate / unused UI) | Redesign of stable surfaces |
| Unify duplicate paths using **existing** services | Parallel implementations |
| Root-cause fix → rebuild → full scenario retest | “Code-only PASS” without EXE proof |
| Operator UAT evidence on Installed EXE | Inflated scores / Production Candidate without A–E |

**Baseline Overall score: 58** — unchanged until independent re-score after live A–E.

## Priority order

1. **Installed EXE errors** — reproduce, root cause, fix, rebuild, retest full scenario.
2. **Regression review** — every current function behaves as documented.
3. **UI cleanup** — remove repetition, dead buttons, redundant pages (no new alternatives).
4. **End-to-end workflows** on Installed EXE (see `OPERATOR-E2E-WORKFLOW-LOCK.md`).
5. **UAT loop:** reproduce → root cause → fix → build → retest entire scenario.

## Bug-fix workflow (mandatory)

```
Installed EXE symptom
  → reproduce (Device A/B, clean profile if needed)
  → root cause in existing code (no new layer)
  → minimal fix + npm test green
  → push main → CI UAT EXE tag
  → retest FULL scenario (not only the single click)
  → evidence JSON + screenshot/log
```

## What agents must not do after this lock

- Add FEATURE_REGISTRY entries, new cloud modules, or new wizards unless blocking save/sync/data-loss.
- Declare Production Candidate or Requirements PASS without `INSTALLED` evidence.
- Merge “consolidation” work that increases surface area without EXE proof.
- Replace EXPECTED PASS / SHOULD WORK with operator proof.

## What agents should do

- Prefer **delete / hide / merge** over **add**.
- Wire fixes through existing: `BootFlow`, `Owner Hub`, `Backup V2`, `SyncEngine`, `LegacyBranchMigration`, `SetupStateDom`.
- Keep CenterSetup / BootFlow support CTAs **ADVANCED_ONLY** (support mode).
- Update `FINAL-CONSOLIDATION-TRACEABILITY.md` row only when EXE evidence exists.

## Gates (unchanged)

| Gate | Status until… |
|------|----------------|
| Production Candidate | A–E PASS on Installed EXE from this repo |
| Release Gate exit 0 | Evidence validator + live UAT |
| Live Google Device A/B | Operator-owned |
| Category B engineering | Complete (not a PC substitute) |

## Related docs

- `OPERATOR-E2E-WORKFLOW-LOCK.md` — full workflow checklist
- `OPERATOR-LIVE-UAT.md` — A–E protocol
- `PRODUCTION-CANDIDATE-CHECKLIST.md` — flip rows with evidence only
- `FINAL-CONSOLIDATION-TRACEABILITY.md` — consolidation matrix

## Operator truth (~90% complete)

Remaining ~10% is **not new code volume** — it is bugs, UX polish, real UAT, cleanup, and reviewing every screen, button, report, and workflow on the Installed EXE.

**After this lock:** no new features unless discovered during **real** usage with a documented release blocker.
