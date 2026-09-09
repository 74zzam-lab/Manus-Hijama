# Repository Transition — Prepared Checklist

**Status:** EARLY CUTOVER IN PROGRESS (owner decision 2026-08-03)  
**Production SoT:** https://github.com/7uzzam/Tadawi-Clinic-Production  
**Archive:** https://github.com/7uzzam/Cupping-System-Management  

Owner migrated **before** Production Candidate. Live UAT A–E and PC declaration happen on the Production SoT.

---

## Still blocked until evidence (do not skip)

- [ ] Requirements 40/40 PASS (Installed Setup EXE evidence on **this** repo)  
- [ ] `npm run verify:v2-5-9-release-gate` exit 0  
- [ ] Scenario A–E PASS with validated evidence packs  
- [ ] Windows runtime / console errors = 0 on Installed EXE  
- [ ] Independent re-score completed (fresh; not baseline 58)  
- [ ] Production Candidate declared **YES** in `CURRENT-STATUS.md`  

---

## Cutover steps (seed)

1. [x] `RELEASE-MIGRATION-PLAN.md` written  
2. [x] Owner created empty GitHub repository `Tadawi-Clinic-Production`  
3. [x] Export/push clean production tree (no source-release tarballs)  
4. [x] CI publishes Setup EXE to GitHub Releases on this repo (`uat-v2-5-10-30817956273`)  
5. [ ] Operator A–E on Installed EXE from this repo  
6. [ ] Archive README banner on `Cupping-System-Management` (owner; do not delete)

---

## Explicitly out of scope

- Declaring Production Candidate while any Requirement is UNVERIFIED  
- Inflating scores to ≥90 without independent re-score after A–E  
- Squashing / rewriting archive history without explicit request  
- Deleting the archive repository  
