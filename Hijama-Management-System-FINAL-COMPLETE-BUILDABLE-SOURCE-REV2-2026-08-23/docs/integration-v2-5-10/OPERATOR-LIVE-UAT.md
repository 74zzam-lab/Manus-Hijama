# Operator Live UAT — Installed Setup EXE (Stage-1 close)

Cloud agents / unit tests **cannot** complete this. Run on real Windows with Google clinic account.

**Evidence home:** this repo (`Tadawi-Clinic-Production`) — Production SoT.

## Preconditions

1. (Optional) Delete leftover Actions `setup-exe` artifacts — CI also auto-deletes them at job start. See `MOBILE-QUOTA-AND-EXE-DELIVERY.md`.  
2. Wait for workflow `V2-5.10 Quality Consolidation — Stage-1 Release Safety Gate` on **main** (or re-run via `workflow_dispatch`).  
3. Download Setup EXE from **GitHub Releases** prerelease tag `uat-v2-5-10-<run_id>` on **this** repo (not Actions Artifacts) → verify SHA256 from the release notes.  
4. Clean install via `Install-And-Prove-V259-AE.ps1 -CleanProfile`.  
5. Use **Installed** EXE only (not `npm start`).  
6. Job may still fail overall while A–E are UNVERIFIED — that is expected if the Release publish step succeeded.

## Order (blocking)

1. **A** Device A/B (Google login, license, sync, CRUD, attachment, conflict, restart)  
2. **B** New Branch  
3. **C** Backup V2 DR  
4. **D** Owner Hub  
5. **E** Google OAuth / Drive / Sheets  
6. Responsive matrix + console/runtime sweep = 0  
7. Confirm Backup V1 controls invisible/inoperable  

## Evidence

Fill `docs/integration-v2-5-9/evidence/ae-scenarios/{A..E}-*.json` with:

- `result: PASS`
- `installedSetupExeProof` starting with `INSTALLED`
- `evidenceComplete: true`
- `setupSha256`
- per-check evidence pointers (logs/screenshots)
- `zeroRuntimeErrors: true`

Validate:

```bash
node scripts/windows-uat/validate-ae-evidence-pack.cjs
# or
npm run v2-5-10:validate-ae
```

Only after validator PASS: update `REQUIREMENTS-TRACEABILITY.md` rows from evidence, then:

```bash
npm run verify:v2-5-9-release-gate
```

Must exit 0 before Stage 2 / Production Candidate.

## Honesty gates

- Production Candidate = **NO** until A–E PASS on Installed Setup EXE  
- Do not claim scores ≥90 without a fresh independent review after A–E  
- Archive repo EXE is not the SoT channel for this cutover
