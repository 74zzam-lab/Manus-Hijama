# Git Bisect Visual Result — Commit-by-Commit Visual Impact

## Methodology

All 43 commits between `ed5d6f3` and `09244f5` were analyzed. Only 14 touched `index.html`. The remaining 29 added new modules, docs, or tests.

## Commit Table

| Commit | Changed Files (visual) | Visual Change | Likely Cause | Confidence |
|--------|----------------------|---------------|--------------|------------|
| **`9c21720`** Phase 2: Electron security | `electron/main.js`, NEW `electron/security/window-policy.js`, NEW `electron/security/preload-print.js` | **🔴 CRITICAL: All fonts (Tajawal/Cairo/Inter) blocked by CSP** | CSP `font-src 'self' data:` blocks `fonts.gstatic.com`; CSP `style-src 'self' 'unsafe-inline'` blocks `fonts.googleapis.com` CSS | **100%** |
| `9894143` Phase 3: Licensing V6 | `index.html` (script tags only) | None — only added `<script src>` tags | — | — |
| `c53b579` Phase 4: SQLite | `index.html` (1 script tag) | None | — | — |
| `bea9373` Phase 6: Permissions | `index.html` (JS logic only) | None — only JS guards in `saveUserAsync` | — | — |
| **`82b0e33`** Phase 9: Branding | `index.html` | **🟡 MEDIUM: Receipt English name changed** | `centerNameEn` fallback: `''` → `APP_META.productName` (`'Hijama Management System'`) | **100%** |
| **`c838167`** Phase 11: Bookings | `index.html` | **🟢 LOW: New booking status tags/buttons** | Added `completed`/`cancelled` statuses; new action buttons | 100% |
| **`3f40106`** Fix stuck license | `index.html` | **🟡 MEDIUM: Login status text/color** | `finalizeLicCheckUi()` forces status out of pending; 3.5s timeout | 100% |
| **`518a824`** Fix blank screen | `index.html` | **🟡 MEDIUM: Overlay closing, login visibility** | Removes `bf-active`, closes modals, resets login opacity/visibility | 100% |
| `c500d34` Phase 21: Org facade | `index.html` (1 script tag) | None | — | — |
| `54b0e74` Phase 23: Owner profile | `index.html` (1 script tag) | None | — | — |
| `78e2c1c` Phase 24-28: Owner setup | `index.html` (3 script tags) | None | — | — |
| `ad81d6f` Phase 35-36: Backup metadata | `index.html` (data header only) | None — only backup JSON header | — | — |
| `9b80311` Phase 37-38: Owner migration | `index.html` (1 script tag) | None | — | — |
| **`de51774`** Fix Google activation | `index.html` | **🟡 MEDIUM: New login flow elements** | Hidden branch fields, connect-only button, confirm button, status messages | 100% |
| `d9d070c` Fix Failed to fetch | `index.html` (wipe keys only) | None — only `clearAllLicenseStorage` keys | — | — |
| `e57b9b1` License push + Owner bootstrap | `cloud/*.js`, `license/*.js` | None in index.html | — | — |
| `09244f5` Owner Hub V5 copy | `cloud/owner-hub.js` (1 line) | None — text change in non-CSS area | — | — |

## Summary

| Category | Count | Commits |
|----------|-------|---------|
| 🔴 Critical visual regression | **1** | `9c21720` (CSP blocks all fonts) |
| 🟡 Moderate visual change | **4** | `82b0e33`, `3f40106`, `518a824`, `de51774` |
| 🟢 Minor visual addition | **1** | `c838167` (booking statuses) |
| No visual impact | **37** | All others |
