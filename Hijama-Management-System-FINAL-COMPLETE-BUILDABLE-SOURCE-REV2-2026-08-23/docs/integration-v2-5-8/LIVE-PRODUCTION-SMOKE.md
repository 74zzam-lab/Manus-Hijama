# V2-5.8 Live Production Smoke Checklist

**Release blocking.** CI / GitHub Actions / unit tests / Windows **build** success alone does **not** close this phase.

Fill every row after exercising the **installed Windows Setup EXE** with real Google / license / org data.

**Status legend:** leave blank until exercised · `PASS` only with proof · `FAIL` blocks release until fix + full re-test from the top.

Ready for main: NO — until every mandatory live row is PASS with evidence.

---

## How to record a step

For each step, complete:

| Field | Value |
|-------|-------|
| Result | PASS / FAIL |
| Runtime Logs | path or paste (redact secrets) |
| Console Errors | none / list |
| Screenshots | path(s) |
| Notes | — |
| Root Cause | (if FAIL) |
| Fix Commit | (if FAIL) |
| Re-Test Result | PASS / FAIL / n/a |

---

## A. Windows Release Validation Flow

| # | Step | Result | Runtime Logs | Console Errors | Screenshots | Notes | Root Cause | Fix Commit | Re-Test Result |
|---|------|--------|--------------|----------------|-------------|-------|------------|------------|----------------|
| A01 | Clean Install (Setup EXE) | | | | | | | | |
| A02 | First Launch | | | | | | | | |
| A03 | Language Selection | | | | | | | | |
| A04 | Google Login | | | | | | | | |
| A05 | Google OAuth Callback | | | | | | | | |
| A06 | Google Drive Access | | | | | | | | |
| A07 | Google Sheets Access | | | | | | | | |
| A08 | License Download | | | | | | | | |
| A09 | License Validation | | | | | | | | |
| A10 | Organization Download | | | | | | | | |
| A11 | Branch Download | | | | | | | | |
| A12 | Owner Detection | | | | | | | | |
| A13 | Owner Creation (if required) | | | | | | | | |
| A14 | Owner Password | | | | | | | | |
| A15 | First Branch Creation (if required) | | | | | | | | |
| A16 | Restore Detection | | | | | | | | |
| A17 | Restore | | | | | | | | |
| A18 | Initial Synchronization | | | | | | | | |
| A19 | Open Dashboard | | | | | | | | |
| A20 | Open Every Major Screen | | | | | | | | |
| A21 | CRUD Operations | | | | | | | | |
| A22 | Reports | | | | | | | | |
| A23 | Google Sheets Read | | | | | | | | |
| A24 | Google Sheets Write | | | | | | | | |
| A25 | Cloud Sync | | | | | | | | |
| A26 | Logout | | | | | | | | |
| A27 | Owner Login | | | | | | | | |
| A28 | Restart Application | | | | | | | | |
| A29 | Restart Windows | | | | | | | | |
| A30 | Repeat Critical Flow | | | | | | | | |

---

## B. Runtime Error Classes (any occurrence = FAIL)

Mark PASS only when **zero** of these appear across the flow:

| # | Error class | Result | Logs / Evidence | Notes | Root Cause | Fix Commit | Re-Test |
|---|-------------|--------|-----------------|-------|------------|------------|---------|
| B01 | Console Errors | | | | | | |
| B02 | Electron Main Errors | | | | | | |
| B03 | Renderer Errors | | | | | | |
| B04 | IPC Errors | | | | | | |
| B05 | Promise Rejections | | | | | | |
| B06 | OAuth Errors | | | | | | |
| B07 | Google API Errors | | | | | | |
| B08 | Google Drive Errors | | | | | | |
| B09 | Google Sheets Errors | | | | | | |
| B10 | License Errors | | | | | | |
| B11 | Sync Errors | | | | | | |
| B12 | Restore Errors | | | | | | |
| B13 | Database Errors | | | | | | |
| B14 | SQLite Errors | | | | | | |
| B15 | File System Errors | | | | | | |
| B16 | Window Focus Errors | | | | | | |
| B17 | Rendering Errors | | | | | | |
| B18 | Responsive Layout Errors | | | | | | |

---

## C. Google Integration Validation

| # | Check | Result | Runtime Logs | Console Errors | Screenshots | Notes | Root Cause | Fix Commit | Re-Test |
|---|-------|--------|--------------|----------------|-------------|-------|------------|------------|---------|
| C01 | OAuth | | | | | | | | |
| C02 | Refresh Token stored | | | | | | | | |
| C03 | Token Refresh | | | | | | | | |
| C04 | Google Drive | | | | | | | | |
| C05 | Google Sheets | | | | | | | | |
| C06 | Spreadsheet Creation | | | | | | | | |
| C07 | Spreadsheet Read | | | | | | | | |
| C08 | Spreadsheet Update | | | | | | | | |
| C09 | Spreadsheet Write | | | | | | | | |
| C10 | Batch Updates | | | | | | | | |
| C11 | Retry | | | | | | | | |
| C12 | Timeout Recovery | | | | | | | | |
| C13 | Offline Recovery | | | | | | | | |
| C14 | Logout | | | | | | | | |
| C15 | Login Again | | | | | | | | |
| C16 | Change Google Account | | | | | | | | |
| C17 | Restart then continue | | | | | | | | |

---

## D. License Validation

| # | Check | Result | Runtime Logs | Console Errors | Screenshots | Notes | Root Cause | Fix Commit | Re-Test |
|---|-------|--------|--------------|----------------|-------------|-------|------------|------------|---------|
| D01 | New License | | | | | | | | |
| D02 | Existing License | | | | | | | | |
| D03 | Expired License | | | | | | | | |
| D04 | Invalid License | | | | | | | | |
| D05 | Device Limit | | | | | | | | |
| D06 | Branch Limit | | | | | | | | |
| D07 | Offline License | | | | | | | | |
| D08 | License After Restart | | | | | | | | |
| D09 | License After Restore | | | | | | | | |
| D10 | License After Sync | | | | | | | | |

---

## E. Synchronization (Device A + Device B)

| # | Check | Device | Result | Runtime Logs | Console Errors | Screenshots | Notes | Root Cause | Fix Commit | Re-Test |
|---|-------|--------|--------|--------------|----------------|-------------|-------|------------|------------|---------|
| E01 | Create | A→B | | | | | | | | |
| E02 | Update | A→B | | | | | | | | |
| E03 | Delete | A→B | | | | | | | | |
| E04 | Conflict Resolution | A/B | | | | | | | | |
| E05 | Attachment Sync | A/B | | | | | | | | |
| E06 | Image Sync | A/B | | | | | | | | |
| E07 | Reports | A/B | | | | | | | | |
| E08 | Restart | A/B | | | | | | | | |
| E09 | Offline Queue | A/B | | | | | | | | |
| E10 | Resume | A/B | | | | | | | | |
| E11 | Retry | A/B | | | | | | | | |

---

## F. Responsive Validation

Resolutions × scale. Mark FAIL if hidden/clipped controls, modal off-screen, unintended horizontal scroll, or unusable buttons.

| Resolution | 100% | 125% | 150% | 175% | Notes / Screenshots | Root Cause | Fix Commit | Re-Test |
|------------|------|------|------|------|---------------------|------------|------------|---------|
| 1024×768 | | | | | | | | |
| 1280×720 | | | | | | | | |
| 1366×768 | | | | | | | | |
| 1600×900 | | | | | | | | |
| 1920×1080 | | | | | | | | |
| 2560×1440 | | | | | | | | |

Dialogs / modals / major pages covered: _______________

---

## G. Owner Architecture (live)

| # | Check | Result | Runtime Logs | Console Errors | Screenshots | Notes | Root Cause | Fix Commit | Re-Test |
|---|-------|--------|--------------|----------------|-------------|-------|------------|------------|---------|
| G01 | Method 1 — Owner during BootFlow activation wizard | | | | | | | | |
| G02 | Method 2 — Auto Owner Bootstrap via `OwnerManagement.requestOwnerBootstrap` / `getOwnerState()` when NO_OWNER | | | | | | | | |
| G03 | Method 3 — Developer Tools Emergency Recovery only | | | | | | | | |
| G04 | Single Source of Truth: only `getOwnerState()` decides (NO_OWNER / OWNER_EXISTS / OWNER_CORRUPTED / OWNER_RECOVERY_REQUIRED / OWNER_CREATION_IN_PROGRESS) | | | | | | | | |
| G05 | No duplicate Owner decision logic in BootFlow / Startup / Login / Restore | | | | | | | | |
| G06 | All paths use `createOwner()` + same lock (no double create / no BootFlow+Emergency race) | | | | | | | | |
| G07 | Create blocked during Restore / Sync / License Refresh | | | | | | | | |
| G08 | Owner Hub refreshes immediately after create/edit/password/disable/enable/delete | | | | | | | | |
| G09 | Delete Owner blocked when last active Owner | | | | | | | | |
| G10 | Multiple Owners (role = Owner only); day-to-day CRUD in Owner Hub | | | | | | | | |

---

## G2. License Pull Recovery — Developer Tools (Google Drive)

**Regression:** commit `9df1abe` hid `#lic-drive-bootstrap-panel` via CSS (`DED-258`), removing recovery for existing Drive licenses.

**Production flow:** Developer Tools → License Recovery → Pull License from Google Drive → OAuth/verify → list/select → validate signature → match org/device policy → persist → refresh license + Owner/Branch.

| # | Scenario | Result | Runtime Logs | Console Errors | Screenshots | Notes | Root Cause | Fix Commit | Re-Test |
|---|----------|--------|--------------|----------------|-------------|-------|------------|------------|---------|
| L01 | Developer Tools button visible (even with Owner + activation complete) | | | | | | | | |
| L02 | Old customer — no local license, license on Drive | | | | | | | | |
| L03 | Local license exists + Pull same license | | | | | | | | |
| L04 | Multiple licenses on Drive — list shown, no auto-pick | | | | | | | | |
| L05 | Wrong Google account — clear reject, no foreign data | | | | | | | | |
| L06 | No license file on Drive — clear message, no blank license | | | | | | | | |
| L07 | Corrupt license — reject, preserve local | | | | | | | | |
| L08 | Expired license — clear error, preserve good local | | | | | | | | |
| L09 | Device mismatch | | | | | | | | |
| L10 | Branch mismatch | | | | | | | | |
| L11 | Restart after pull | | | | | | | | |
| L12 | Update after pull | | | | | | | | |
| L13 | App-only uninstall/reinstall after pull | | | | | | | | |
| L14 | Offline after successful pull | | | | | | | | |
| L15 | Restore then Pull license | | | | | | | | |
| L16 | Pull then Initial Sync | | | | | | | | |
| L17 | Failed pull does **not** wipe DB / local license / Device ID / Branch / Owner / backups | | | | | | | | |
| L18 | Offline / Timeout / 401 / 403 / 404 / Rate Limit — actionable, no infinite loader, no unhandled console | | | | | | | | |

Evidence fields (fill after Setup EXE):

| Field | Value |
|-------|-------|
| Root cause | `9df1abe` CSS `display:none !important` on `#lic-drive-bootstrap-panel` |
| Last working commit | pre-`9df1abe` |
| First broken commit | `9df1abe` |
| Files changed | (see PR) |
| Production flow used | Developer Tools → License Recovery → Pull License from Google Drive |
| Windows Setup EXE tested | |
| Google account test | |
| License found | |
| License validated | |
| License persisted | |
| Restart result | |
| Update result | |
| App-only reinstall result | |
| Errors remaining | |
| Tests added | `tests/baseline/test-v2-5-8-drive-license-pull-recovery.js` |
| npm test | |
| Release gate | |
| Commit | |
| PR | |

**PASS rule:** button visible + real Drive pull + validate + persist + restart + update + no data loss. UI-only button = **FAIL**.

---

## H. Mandatory live proofs (phase cannot close without these)

| Area | Result | Evidence paths |
|------|--------|----------------|
| Google OAuth | | |
| Google Drive | | |
| Google Sheets | | |
| License Download | | |
| License Validation | | |
| Organization Download | | |
| Branch Download | | |
| Owner Creation | | |
| Owner Login | | |
| Owner Password | | |
| Restore | | |
| Backup | | |
| Synchronization | | |
| Responsive UI | | |
| Windows Runtime | | |

---

## I. Defect → Fix → Rebuild loop

When any live step FAILs:

1. Analyze Root Cause (not “user error”)
2. Fix production code
3. Update tests
4. Build Windows Release / new Setup EXE
5. Re-run **full** validation from Clean Install
6. Record Fix Commit + Re-Test Result above

| Incident | Date | Symptoms | Root Cause | Fix Commit | New Setup EXE build id | Full re-test |
|----------|------|----------|------------|------------|------------------------|--------------|
| | | | | | | |

---

## J. Sign-off

| Role | Name | Date | Verdict |
|------|------|------|---------|
| Manual tester | | | |
| Fix / rebuild agent | | | |
| Independent reviewer | | | |

**Phase V2-5.8 Live Production:** ☐ NOT COMPLETE · ☐ COMPLETE (all mandatory rows PASS)

Ready for main: NO (until independent review after live PASS)
