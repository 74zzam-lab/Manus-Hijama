# UI Visual Regression Report — Phase 1 → Phase Zero NextGen

| Item | Value |
|------|-------|
| **Original** | `ed5d6f3` |
| **Current** | `09244f5` |

---

## Visual Regression Assessment

### Method
Since this is a cloud agent environment without a display server, visual screenshots cannot be captured. This report is based on **exhaustive code-level diff analysis** of all CSS, HTML structure, inline styles, JS-generated DOM, themes, and Electron window configuration.

### Key Finding

**Zero CSS changes exist between the two versions.** All visual styling — fonts, colors, sizes, spacing, borders, shadows, layouts, grids, tables, modals, cards, buttons, inputs, themes, print styles — is byte-for-byte identical.

---

## Component-by-Component Analysis

| # | Component | Visual Change? | Details |
|---|-----------|---------------|---------|
| 1 | Login screen | Minor | `login-center-setup-panel` now starts `hidden`; typo fix `الترخiص` → `الترخيص` |
| 2 | Dashboard | None | — |
| 3 | Sidebar (open/closed) | None | — |
| 4 | New case form | None | — |
| 5 | Existing case | None | — |
| 6 | Client file | None | — |
| 7 | Clients table | None | — |
| 8 | Bookings | **Added** | 2 new statuses: `completed` (🏁), `cancelled` (🛑); 3 new action buttons |
| 9 | Staff | None | — |
| 10 | Attendance | None | — |
| 11 | Payroll | None | — |
| 12 | Reports | None | — |
| 13 | Settings | None | — |
| 14 | Invoice settings | None | — |
| 15 | Thermal 58mm preview | **Minor** | English name fallback changed (only visible if centerNameEn is empty) |
| 16 | Thermal 80mm preview | **Minor** | Same as 58mm |
| 17 | PDF | None | — |
| 18 | QR Code | None | — |
| 19 | Print window | None | — |
| 20 | Themes | None | All themes identical |
| 21 | Owner Hub | **New content** | Owner Profile card, setup card, push-to-Drive button, branch/device controls |
| 22 | Boot Flow wizard | **New content** | Owner Profile creation step, branch/device after license pull |

---

## Detailed Changes That Affect Visible UI

### 1. Login Screen — Setup Panel Hidden by Default (Category A)
```
<details class="login-extra-panel" id="login-center-setup-panel" hidden>
```
Previously visible as a collapsed `<details>`. Now `hidden` until activated by JS. **Requested change.**

### 2. Login Screen — Typo Fix (Category B)
```
- الترخiص → الترخيص
```
Latin `i` replaced with Arabic `ي`. Pure bugfix.

### 3. Login Screen — Branch Fields Hidden Until Pull (Category A)
```
<div id="login-drive-branch-fields" ... style="display:none" hidden>
```
Branch/device selection now hidden until license is actually pulled from Drive. **Requested change.**

### 4. Bookings Table — New Statuses (Category A)
Two new booking statuses with new tag colors:
- `completed` → `<span class="tag tag-green">🏁 مكتمل</span>`
- `cancelled` → `<span class="tag tag-gray">🛑 ملغي</span>`

Three new action buttons:
- `completeBooking()` — close as completed
- `cancelBooking()` — cancel without delete
- `reopenBooking()` — reopen to pending

**Uses existing CSS classes** (`tag-green`, `tag-gray`, `btn-accent`). No new CSS required.

### 5. Receipt English Name (Category C)
```
- const cnEn = settings.centerNameEn || 'Cupping Center';
+ const cnEn = settings.centerNameEn || APP_META.productName || 'Hijama Management System';
```
**Only visible when `settings.centerNameEn` is empty.** Existing installations with a custom name are unaffected.

### 6. User Management — Protection (Category B)
- Admin #1 cannot be demoted or deactivated
- Duplicate username prevention
- Permission sanitization for custom roles
These are logic-only changes with no visual CSS impact.

### 7. License Storage Wipe — Expanded Keys (Category B)
`clearAllLicenseStorage()` now also clears: `commercial_license_v6*`, `__tdw_owner_*`, `__tdw_boot*`. No visual impact.

### 8. Startup Timing — License Check Timeout (Category B)
`licCheck()` now has a 3.5s timeout with fallback UI. Login status text may show `⛔ تعذّر إكمال التحقق بسرعة` faster than before. **Requested fix for stuck login.**

### 9. Owner Hub — New Sections (Category A)
All new content within the existing Owner Hub page:
- Owner Profile status card
- Owner setup/migration card with create/skip buttons
- Push license.json to Drive button
- Subscription/licensing panel
These use existing `.oh-card`, `.btn`, `.card` CSS classes.

---

## Electron Window Configuration

| Property | Original | Current | Changed? |
|----------|----------|---------|----------|
| `webPreferences` | Direct | Via `windowPolicy.secureWebPreferences()` | Yes (B) |
| `zoomFactor` | Not explicitly set | Not explicitly set | No |
| `deviceScaleFactor` | Not set | Not set | No |
| Window size | From saved state | Same | No |
| CSP | Basic | Enhanced (allows `script.google.com`) | Yes (B) |

**No visual impact** from Electron changes. The `secureWebPreferences` wrapper adds security headers without changing rendering.

---

## Summary

| Category | Count | Items |
|----------|-------|-------|
| A — Requested | 5 | Setup panel hidden, branch fields hidden, confirm button, booking statuses, Owner Hub content |
| B — Technical fix | 5 | Typo fix, user protection, license wipe scope, startup timeout, Electron security |
| C — Unintended | 1 | Receipt English name fallback |
| D — Breaking | 0 | — |
| E — User decision | 0 | — |

**No CSS regressions. No font changes. No theme changes. No layout changes. No print style changes.**
