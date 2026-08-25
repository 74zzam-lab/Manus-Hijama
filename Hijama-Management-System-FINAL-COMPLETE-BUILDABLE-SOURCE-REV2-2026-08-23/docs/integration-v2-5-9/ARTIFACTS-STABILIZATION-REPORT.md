# V2-5.9 Artifacts Stabilization Report

**Date:** 2026-08-01  
**Repo:** same Single Source of Truth (no new repository, no history rewrite)  
**Scope:** `.github/workflows/*` artifact policy only

## What was consuming Actions artifact storage

| Consumer | Approx size (compressed artifact) | Notes |
|----------|-----------------------------------|-------|
| `dist/win-unpacked/**` | **~275 MB per upload** | Dominant consumer; uploaded by nearly every V2-5.x gate |
| Setup EXE (`HijamaManagement-Setup-*.exe`) | ~100–110 MB | Required for release proof |
| `docs/integration-*/evidence/**` including `source-release-*.tar.gz` | up to several MB | Tarballs unnecessary in CI artifacts |
| Duplicate phase names (`v2-5-*-windows-artifacts`) | ×N concurrent/historical runs | Same tree re-uploaded under new names |

Observed historical pile-up: ~10 × `v2-5-9-windows-artifacts` ≈ **2.7 GB** before owner deletion.

## What was removed from workflows

- **All** `dist/win-unpacked/**` uploads (every historical gate + windows-uat)
- Historical **Setup EXE** duplicate uploads (Setup EXE now only from active V2-5.9 workflow)
- Bulk upload of entire `docs/integration-v2-5-9/**` trees
- Long retention (`retention-days: 30`) → **3** (repo may clamp lower)

## What was merged / standardized

Stable artifact names (V2-5.9 active closure):

| Name | Contents |
|------|----------|
| `setup-exe` | Setup EXE + `SHA-256.txt` |
| `windows-smoke` | install/smoke JSON + logs (zipped) |
| `release-evidence` | slim zipped protocol + evidence (no tarballs) |
| `release-gate` | gate report JSON |
| `runtime-logs` | **failure only** |

Historical phase gates now upload only slim `release-evidence` (JSON/logs &lt;5MB, no tar.gz, no EXE).

Packaging helper: `scripts/ci/package-v259-artifacts.ps1`

## What became conditional

| Artifact | Condition |
|----------|-----------|
| `setup-exe` | STEP1 / Setup EXE recorded successfully |
| `windows-smoke` | Clean install + smoke succeeded |
| `release-evidence` | Slim package step succeeded |
| `release-gate` | Package step succeeded |
| `runtime-logs` | Job `failure()` only |
| No upload | Build failed before Setup EXE |

## Size estimate

| Metric | Before (typical heavy gate) | After (V2-5.9 slim) |
|--------|-----------------------------|---------------------|
| Per successful V2-5.9 run | ~275 MB (win-unpacked bundle) or Setup+docs without structure | **~105–115 MB** (Setup EXE + small zips) |
| Historical phase gate upload | ~275 MB | **&lt; 5 MB** evidence only |
| Reduction (active gate vs win-unpacked era) | — | **~60%+** |
| Reduction (historical gates) | — | **~98%** |

### Post-change CI proof (run 30723115721 @ `eeaedea`)

| Step | Result |
|------|--------|
| Windows build | PASS |
| STEP1 Setup SHA-256 | `489c282fb4a07c391bd8def0af128d47e44631d55db9097f901de2faabdba1f5` (106794739 bytes) |
| STEP2 clean install + smoke | PASS |
| Package slim CI artifacts | PASS (`setup-exe,windows-smoke,release-evidence,release-gate`) |
| CreateArtifact upload | **FAIL** — GitHub storage quota recalculation lag (API artifacts total=0; GitHub docs: 6–12h) |

Until GitHub finishes recalculation, uploads cannot succeed regardless of slim policy. Policy change is still correct and required to prevent re-filling the quota.

## Traceability preserved

- Git / PR / commit / workflow history untouched
- Requirement docs remain in-repo under `docs/integration-v2-5-9/`
- CI artifacts are a short-lived mirror; durable evidence stays in git commits

## Release closure status after this change

| Item | Status |
|------|--------|
| Workflow artifact policy | Stabilized |
| Requirements PASS | **0 / 40** (unchanged — no fake PASS) |
| Next | Re-run STEP1 → STEP2 → confirm uploads → Scenario A |

Ready for release: **NO**  
Ready for main: **NO**
