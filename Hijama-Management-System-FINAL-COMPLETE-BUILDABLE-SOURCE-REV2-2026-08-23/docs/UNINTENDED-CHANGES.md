# Unintended Changes Report — CORRECTED (v2)

| Item | Value |
|------|-------|
| **Original** | `ed5d6f3` (ZIP-identical baseline) |
| **Current** | `09244f5` (43 commits later) |

---

## Critical Unintended Change #1: CSP Blocks Google Fonts

| Detail | Value |
|--------|-------|
| **File** | `electron/security/window-policy.js` (NEW) + `electron/main.js` |
| **Commit** | `9c21720` (Phase 2: harden Electron security) |
| **Category** | **D — Breaks design** |
| **Severity** | **Critical** |
| **Impact** | ALL fonts (Tajawal, Cairo, Inter) blocked → ALL elements render with system fallback fonts |
| **Restoration** | Keep CSP strict; bundle local fonts only (`assets/fonts` + local `@font-face`) |

## Unintended Change #2: Receipt English Name Fallback

| Detail | Value |
|--------|-------|
| **File** | `index.html` lines ~9981, ~18829 |
| **Commit** | `82b0e33` (Phase 9: unify branding) |
| **Category** | C — Unintended side-effect |
| **Severity** | Medium |
| **Impact** | Receipts show "Hijama Management System" instead of "Cupping Center" when English name is not set |
| **Restoration** | Revert fallback to `'Cupping Center'` |

## Unintended Change #3: sandbox: true

| Detail | Value |
|--------|-------|
| **File** | `electron/main.js` via `window-policy.js` |
| **Commit** | `9c21720` |
| **Category** | C — Potential side-effect |
| **Severity** | Low-Medium |
| **Impact** | Chromium sandbox restricts renderer capabilities; may subtly affect font rendering even after CSP fix |
| **Restoration** | Consider `sandbox: false` for main window if issues persist |

## Unintended Change #4: Print Window Preload

| Detail | Value |
|--------|-------|
| **File** | `electron/main.js` |
| **Commit** | `9c21720` |
| **Category** | C — Potential side-effect |
| **Severity** | Low |
| **Impact** | Print windows get minimal preload; may lack APIs needed for advanced print features |
| **Restoration** | Evaluate if `preload-print.js` exposes sufficient APIs |

---

## Confirmed Requested Changes (NOT Unintended)

| Change | Commit | Category |
|--------|--------|----------|
| Login setup panel hidden | `de51774` | A — Requested |
| Branch fields hidden until pull | `de51774` | A — Requested |
| Booking statuses expanded | `c838167` | A — Requested |
| License check timeout | `3f40106`, `518a824` | A — Requested |
| Blank screen prevention | `518a824` | A — Requested |
| syncCloudStatusFromElectron fix | `de51774` | A — Requested |
| Owner Hub new sections | Multiple | A — Requested |
| CSP for script.google.com | `d9d070c` | A — Requested |
| NSIS wipe | `549c57e` | A — Requested |
| license.json Drive push | `e57b9b1` | A — Requested |
| Owner bootstrap gate | `e57b9b1` | A — Requested |

---

## Restoration Plan

### Group 1 — Restore Exactly

| # | What | Action | File | Severity |
|---|------|--------|------|----------|
| 1 | **CSP font blocking** | Keep CSP unchanged and load bundled local fonts from `assets/fonts` | `index.html` + `assets/fonts/*` | **Critical** |
| 2 | Receipt cnEn fallback | Revert to `'Cupping Center'` | `index.html:~18829` | Medium |
| 3 | defaultSettings.centerNameEn | Revert to `''` | `index.html:~9981` | Low |

### Group 2 — Keep Current

All other changes (Owner Hub, booking statuses, bootstrap order, license push, blank screen fix, etc.)

### Group 3 — Merge Carefully

| # | What | Consideration |
|---|------|--------------|
| 1 | sandbox: true → false for main window | Security vs font rendering trade-off |
| 2 | Print preload | Verify receipt/invoice printing works correctly |

### Group 4 — User Decision Required

| # | What | Options |
|---|------|---------|
| 1 | sandbox setting | Keep `true` (more secure) or revert to `false` (original behavior) |
| 2 | Print preload | Keep `preload-print.js` (more secure) or revert to main `preload.js` |
