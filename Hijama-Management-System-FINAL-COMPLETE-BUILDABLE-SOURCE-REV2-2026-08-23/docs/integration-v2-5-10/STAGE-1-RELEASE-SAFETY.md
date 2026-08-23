# Stage 1 — Release Safety

Close these before any Architecture cleanup (Stage 2).

| # | Closure item | Status | Evidence |
|---|--------------|--------|----------|
| 1 | 40/40 Windows Runtime Requirements | **UNVERIFIED** | `docs/integration-v2-5-9/REQUIREMENTS-TRACEABILITY.md` (0 PASS / 40 UNVERIFIED) |
| 2 | Scenario A–E on Installed Setup EXE | **UNVERIFIED** | A Device A/B → B Branch → C DR → D Owner → E Google |
| 3 | Google OAuth / Drive / Sheets live | **UNVERIFIED** | Scenario E on Installed EXE |
| 4 | Device A/B sync | **UNVERIFIED** | Scenario A (blocking) |
| 5 | Backup V2 Disaster Recovery | **UNVERIFIED** | Scenario C |
| 6 | Attachment A/B hashes | **UNVERIFIED** | Attachments UAT on Installed EXE |
| 7 | Branch isolation | **UNVERIFIED** | Scenario B + branch UAT |
| 8 | Responsive matrix | **UNVERIFIED** | 1024×768–2560×1440; 100–175% |
| 9 | Zero runtime/console errors | **UNVERIFIED** | Live Installed EXE sweep |
| 10 | Hide/disable Backup V1 from all customer UI | **CODE LANDED** (UI + renderer + IPC gate) | Installed EXE visual confirm still **UNVERIFIED** |

## Item 10 — Backup V1 customer UI (this branch)

Landed in `index.html` (wiring/unit only):

- Legend: Backup V2 = only official DR; V1 disabled notice
- `#btn-cdb-backup|restore|sync` forced hidden + disabled
- V1 auto schedule wrap hidden
- OAuth connect/disconnect kept for Cloud V2 / license
- Cloud V2 “مزامنة الآن” → `runCloudV2SyncNow()` → `SyncEngine.runOnce`
- Guards: `BACKUP_V1_CUSTOMER_UI_DISABLED`, `denyBackupV1CustomerAction`
- Stubs deny: `runCloudDbBackupNow`, `syncCloudDbBackupNow`, `openCloudDbRestoreList`, `restoreCloudDbBackupItem`
- `startCloudDbAutoTimer` does not schedule V1 uploads
- Main/IPC gate: `electron/backup-v1-gate.js` (override only via `HIJAMA_ALLOW_BACKUP_V1=1`)
- Renderer bridge `CloudDbBackupBridge.isDisabled()`
- Unit: `tests/baseline/test-v2-5-10-stage1-backup-v1.js`
- Operator path: `OPERATOR-LIVE-UAT.md` + `validate-ae-evidence-pack.cjs`

**Still required for Stage 1 close:** confirm on Installed Setup EXE that Settings → Backup shows no operable V1 backup/restore/sync controls.

## Gates

| Gate | Required | Current |
|------|----------|---------|
| Requirements | 40/40 PASS | 0 PASS / 40 UNVERIFIED |
| `npm run verify:v2-5-9-release-gate` | exit 0 | FAIL while UNVERIFIED |
| `npm run verify:v2-5-10-stage1` | exit 0 for Stage-1 code checklist | tracks Backup V1 hide + honesty markers |
| Stage 2 Architecture | blocked until both release gates allow | **BLOCKED** |

## Honest score policy

- Do not assign >90 from code presence.
- Do not flip Requirement rows from unit tests or docs alone.
- Re-score only after Installed EXE proof + independent review.
