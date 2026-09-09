# Dual-device A→E quick card (operator)

**Repo (SoT):** https://github.com/7uzzam/Tadawi-Clinic-Production  
**Protocol:** `OPERATOR-LIVE-UAT.md`  
**Status:** Production Candidate remains **NO** until this card is fully evidenced.

## 0) Get the EXE

| Field | Value |
|-------|--------|
| Release | https://github.com/7uzzam/Tadawi-Clinic-Production/releases/tag/uat-v2-5-10-30897392063 |
| Asset | `HijamaManagement-Setup-2.0.1.exe` |
| SHA-256 | `b8f3de3ab56179f8aaa4ff8a963f0e46730d27e52daab1714fe5e9a4f66f7a3b` |

Confirm the downloaded file’s SHA-256 matches before install. Prefer a newer `uat-v2-5-10-<run_id>` if one appears on this repo.  

## 1) Install (both PCs)

On Device A and Device B (clean Windows profile):

```powershell
pwsh -File scripts\windows-uat\Install-And-Prove-V259-AE.ps1 -CleanProfile
```

Use **Installed** EXE only — not `npm start`.

## 2) Run order (blocking)

| # | Scenario | Focus |
|---|----------|--------|
| A | Device A/B | Google login, license, sync, CRUD, attachment, conflict, restart |
| B | New Branch | Branch create / enroll / scope |
| C | Backup V2 DR | Restore / DR path; Backup V1 invisible |
| D | Owner Hub | Owner controls / identity |
| E | Google OAuth / Drive / Sheets | Live cloud integrations |

Then: responsive matrix + console/runtime = **0** errors.

## 3) Evidence packs

Fill `docs/integration-v2-5-9/evidence/ae-scenarios/{A..E}-*.json`:

- `result: "PASS"`
- `installedSetupExeProof` starts with `INSTALLED`
- `evidenceComplete: true`
- `setupSha256` = release SHA
- `zeroRuntimeErrors: true`
- pointers to logs/screenshots

## 4) Validate (only after packs filled)

```bash
npm run v2-5-10:validate-ae
```

Exit 0 required before Requirements / Release Gate / Production Candidate.

## Honesty

- Do not declare PC or scores ≥90 without A–E + independent re-score  
- Archive repo is history only — do not delete it  
- Job red while A–E UNVERIFIED is expected if Release publish succeeded  
