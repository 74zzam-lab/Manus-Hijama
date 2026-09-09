# V2-5.10 — SetupState Runtime Proof (phase)

## What this phase proves (code + CI Installed-EXE harness)

| # | Requirement | Status |
|---|-------------|--------|
| 1 | All gates use SetupStateService / SetupStateDom as SoT | **CODE PASS** — Login/finishLogin/showPage/BootFlow/OwnerHub/Settings |
| 2 | Full UI inventory KEEP/HIDE/ADVANCED/DELETE/MERGE | **DOC + CODE** — `SETUP-STATE-UI-INVENTORY.md` |
| 3 | Owner password sync A→B (revision merge) | **CODE PASS** (ConfigLayer) — **live Google Pull UNVERIFIED** |
| 4 | `getReadiness` lists all missing + Arabic labels | **CODE PASS** — UI `#bk-cv2-setup-hint` + Sync Now notify |
| 5 | Auto local + cloud backup start + file restore proof | **PARTIAL** — services started + FS roundtrip evidence; **live Google cloud UNVERIFIED** |
| 6 | Restart loop ×N no Ready return | **CODE PASS** (consume-once ×5) |
| 7 | Layout/responsive BootFlow + login footer | **CODE PASS** (CSS zoom/wrap) — visual QA on EXE still operator |
| 8 | Full journeys new/existing/restore/logout/A-B | **UNVERIFIED** until operator on Installed Setup EXE |

## Evidence artifacts

- `scripts/windows-uat/v2-5-10-setupstate-runtime-evidence.cjs`
- `docs/integration-v2-5-10/evidence/setupstate-runtime-evidence.json` (produced on CI Windows after install)
- `tests/baseline/test-v2-5-10-setupstate-runtime-proof.js`

## Installed Setup EXE (this phase)

- Release: https://github.com/7uzzam/Tadawi-Clinic-Production/releases/tag/uat-v2-5-10-30821313092
- SHA-256: `8a0ffd62bb54d903e3816404eaa63beb9f3a872278d43667898c638dcd81dd62`
- Commit: `2e0e078`
- CI: npm test + clean install + setup-state smoke + setupstate-runtime-evidence **PASS**; job red only on expected A–E gate

## Honesty

- Production Candidate: **NO**
- Do not mark items 3/5/8 live Google journeys PASS without Installed EXE operator evidence
- Baseline Overall score remains **58**
