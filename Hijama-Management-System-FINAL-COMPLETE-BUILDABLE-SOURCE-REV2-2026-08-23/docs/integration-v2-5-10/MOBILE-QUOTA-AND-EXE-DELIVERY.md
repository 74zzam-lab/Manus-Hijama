# Mobile operator note — Actions quota + Setup EXE delivery

**Updated:** 2026-08-03  
**Production SoT:** https://github.com/7uzzam/Tadawi-Clinic-Production  
**Archive:** https://github.com/7uzzam/Cupping-System-Management  

## Does making the repo Public fix the quota?

| Item | Private (current) | Public |
|------|-------------------|--------|
| Actions **minutes** (Windows runners) | Count against free/paid minutes | Generally **free** for standard public runners |
| Actions **artifact storage** (~500MB free account) | Counts (this blocked ~106MB×2 uploads) | **Still usually counts** toward account storage |
| **GitHub Release** assets (Setup EXE) | OK; download needs login if private | Anyone can download the EXE |

**Verdict:** Public helps minutes and makes EXE links easier to share, but it is **not required** and does **not** by itself clear artifact storage. Prefer the Release channel below. Do **not** make Public only for quota if you are not ready to expose source.

## What CI does on this repo

1. Job **deletes old `setup-exe` Actions artifacts** at start (frees quota automatically).  
2. **Stops uploading** the large Setup EXE as an Actions artifact.  
3. Publishes Setup EXE to a **GitHub prerelease**: tag `uat-v2-5-10-<run_id>`.  

Release assets do **not** use the Actions artifact storage bucket.

## From your phone (no laptop)

### A) Delete leftover artifacts (if any)

GitHub → this repo → **Actions** → **Artifacts** → delete large `setup-exe` items if present.  
The next workflow run also cleans `setup-exe` artifacts automatically.

### B) Get the Setup EXE after CI publish

1. Open https://github.com/7uzzam/Tadawi-Clinic-Production/releases  
2. Current UAT: https://github.com/7uzzam/Tadawi-Clinic-Production/releases/tag/uat-v2-5-10-30897392063  
3. Download `HijamaManagement-Setup-2.0.1.exe`  
4. Verify SHA-256: `b8f3de3ab56179f8aaa4ff8a963f0e46730d27e52daab1714fe5e9a4f66f7a3b`  
5. On Device A/B: install that EXE and follow `OPERATOR-LIVE-UAT.md` / `OPERATOR-AE-QUICK-CARD.md`

Job may still end red because Release Gate fails while A–E are UNVERIFIED — that is expected. If **Publish Setup EXE to GitHub Release** succeeded, the EXE is on Releases anyway.

## Honest reminder

Downloading the EXE ≠ Production Candidate. You still need live A–E evidence on Installed Setup EXE. Baseline Overall remains **58** until an independent re-score after A–E.
