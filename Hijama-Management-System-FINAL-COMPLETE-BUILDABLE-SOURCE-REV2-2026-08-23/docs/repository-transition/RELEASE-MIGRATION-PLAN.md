# V2-6 Repository Transition — Release Migration Plan

**Status:** CUTOVER STARTED (2026-08-03) — early migration by owner decision  
**Archive repo:** `https://github.com/7uzzam/Cupping-System-Management`  
**Production SoT:** `https://github.com/7uzzam/Tadawi-Clinic-Production`  
**Seed tip:** former branch `cursor/v2-5-10-quality-consolidation-c2ea` (clean tip; no source tarballs)

> Honesty: Requirements / A–E / Production Candidate remain **NO**.  
> Owner chose to migrate **before** personal live UAT. New-repo UAT is Category A evidence home.

---

## 1. Role split after cutover

| Repo | Role |
|------|------|
| `Cupping-System-Management` | Development / audit **archive** (do not delete) |
| `Tadawi-Clinic-Production` | Production SoT · Releases · CI · UAT evidence |

---

## 2. Seed contents

### Included

- Full application tree at V2-5.10 tip (Electron, `cloud/`, `database/`, `license/`, tests, workflows)  
- `docs/integration-v2-5-10/` (handoff + UAT + vision)  
- `docs/repository-transition/`  
- `docs/final-review/` (baseline scores — do not treat as new scores)  
- Root package manifests, electron-builder config, branding assets  

### Excluded

- `docs/integration-v2-5-7/evidence/source-release-*.tar.gz`  
- Untracked `docs/comparison/`  
- History rewrite of the archive repo  

### History strategy used

**Option Clean Tip:** V2-5.10 tip as lineage start on Production SoT. Full history remains in the archive.

---

## 3. After seed is on `main`

1. Confirm Actions can run  
2. Prefer Release channel for Setup EXE (`uat-v2-5-10-<run_id>`) — no large Actions `setup-exe` artifacts  
3. Operator runs A–E on Installed EXE from **this** repo Releases  
4. Only after A–E PASS: declare Production Candidate on **this** repo  
5. Archive repo: add README banner “ARCHIVED — production SoT moved to Tadawi-Clinic-Production” (owner/archive agents; do not delete)

---

## 4. Explicit non-claims

- Cutover does **not** make Production Candidate YES  
- Migrating early does **not** skip A–E  
- Baseline Overall **58** stays until independent re-score after A–E  
- Do **not** rewrite history without an explicit owner request
