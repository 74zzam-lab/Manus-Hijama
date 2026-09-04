# True Root Causes — Visual Regression Analysis

## Root Cause #1: CSP Blocks All Google Fonts (CRITICAL)

### The Problem

Commit `9c21720` (Phase 2: harden Electron security) introduced `electron/security/window-policy.js` with a Content Security Policy (CSP) that is applied to all windows via `applyContentSecurityPolicy(session)` in `electron/main.js`.

The CSP contains:
```
style-src 'self' 'unsafe-inline'
font-src 'self' data:
```

The app loads fonts from Google CDN:
```html
<!-- index.html line 7 -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Tajawal:wght@300;400;500;700;800;900&family=Cairo:wght@300;400;600;700;900&display=swap" rel="stylesheet">
```

### Why This Breaks Everything

**Step 1:** Browser tries to load the Google Fonts CSS from `https://fonts.googleapis.com/css2?...`
- CSP `style-src 'self' 'unsafe-inline'` does NOT allow `https://fonts.googleapis.com`
- **BLOCKED** — the CSS file never loads

**Step 2:** Even if step 1 worked, the CSS contains `@font-face` rules with `src: url(https://fonts.gstatic.com/s/tajawal/...)`
- CSP `font-src 'self' data:` does NOT allow `https://fonts.gstatic.com`
- **BLOCKED** — the font files never load

### Cascade of Visual Impact

The CSS declares these fonts throughout:

| CSS Property | Font | Usage Count | Fallback When Blocked |
|-------------|------|-------------|----------------------|
| `body { font-family: 'Tajawal', sans-serif }` | Tajawal | 1 (global) | System sans-serif |
| `font-family: 'Cairo', sans-serif` | Cairo | ~10 declarations | System sans-serif |
| `font-family: 'Tajawal', sans-serif` | Tajawal | ~20 declarations | System sans-serif |
| `--font-sans: 'Inter', 'Tajawal', system-ui...` | Inter+Tajawal | CSS variable | system-ui |
| `--font-display: 'Cairo', 'Inter', sans-serif` | Cairo+Inter | CSS variable | sans-serif |

**Every single text element** in the app is affected because:
- `body` uses `Tajawal` → falls back to system font
- All headings use `Cairo` → falls back to system font
- Login, forms, buttons, tables, modals, receipts, invoices — ALL affected

### Specific Visual Changes Caused

| Element | Original Font | After CSP Block | Visual Effect |
|---------|--------------|-----------------|---------------|
| Body text | Tajawal 15px | Segoe UI / Arial 15px | Different character width, line height, spacing |
| Headings | Cairo 900 | Segoe UI Bold / Arial Bold | Thinner, different shape, different weight rendering |
| Login title | Cairo 20px 900 | System font 20px bold | Very different appearance |
| Buttons | Tajawal 14-15px | System font 14-15px | Different button width due to character metrics |
| Tables | Tajawal | System font | Column widths change, text wrapping changes |
| Inputs/Selects | Tajawal 15px | System font 15px | Different padding/sizing appearance |
| Stats values | Cairo 28px 900 | System font 28px bold | Number display completely different |
| Receipt/Invoice | Tajawal | System font | Layout shifts, line breaks change |
| QR container | Inherited | System font | Text around QR changes, affecting apparent QR size |
| Sidebar | Tajawal | System font | Menu item spacing/wrapping changes |
| Modals | Tajawal/Cairo | System font | All modal text appearance changes |

### Why Previous Audit Missed This

The previous audit compared **source CSS** between `ed5d6f3` and current, found zero changes, and concluded "zero CSS regressions." This was technically correct for source files — no CSS rule text was modified. However, the regression is caused by a **runtime CSP header** in a **new Electron main-process file** that prevents CSS and font files from loading at all. The fonts are referenced in unchanged CSS but are **never delivered to the renderer**.

### Fix (Superseded by Local-Font Migration)

Do **not** expand CSP for external font domains.  
The applied safe fix is:

1. Bundle Tajawal/Cairo/Inter locally under `assets/fonts/`
2. Define local `@font-face` in `index.html`
3. Keep CSP unchanged (`style-src 'self' 'unsafe-inline'`, `font-src 'self' data:`)

---

## Root Cause #2: Receipt English Name Fallback (MEDIUM)

### The Problem

Commit `82b0e33` (Phase 9: unify branding) changed the English center name fallback:

**`defaultSettings.centerNameEn`** (line ~9981):
```javascript
// BEFORE:
centerNameEn: '',
// AFTER:
centerNameEn: APP_META.productName || 'Hijama Management System',
```

**`buildReceiptHTML` cnEn fallback** (line ~18829):
```javascript
// BEFORE:
const cnEn = settings.centerNameEn || 'Cupping Center';
// AFTER:
const cnEn = settings.centerNameEn || APP_META.productName || 'Hijama Management System';
```

### Impact

- Existing users who never set `centerNameEn` (stored as `''` in DB) now see "Hijama Management System" instead of "Cupping Center" on receipts.
- The longer text may change line wrapping on 58mm thermal receipts.
- New installations get a non-empty default English name.

### Fix

Revert both lines to original values.

---

## Root Cause #3: sandbox: true (LOW-MEDIUM)

### The Problem

Commit `9c21720` changed `sandbox` from `false` to `true` in all BrowserWindow `webPreferences`:

```javascript
// BEFORE (all windows):
sandbox: false

// AFTER (all windows):  
sandbox: true
```

### Impact

Chromium sandbox mode restricts:
- System font enumeration (may affect font availability)
- File system access for local fonts
- Some GPU acceleration behaviors

This is a **secondary contributor** to font issues (primary is CSP blocking). Even with CSP fixed, sandbox may subtly affect font rendering compared to the original.

---

## Root Cause #4: Print Window Preload Change (LOW)

### The Problem

Child/print windows now use `preload-print.js` instead of the main `preload.js`:

```javascript
// BEFORE:
preload: path.join(__dirname, 'preload.js')

// AFTER:
preloadPath: PRINT_PRELOAD,  // preload-print.js
```

### Impact

Print windows get a minimal preload with fewer APIs. If print/receipt rendering depends on APIs exposed by the main preload (e.g., `tadawi.*` bridge functions), those features won't work in print windows. The **print/receipt rendering itself** (HTML/CSS) should be unaffected since it's self-contained, but any JavaScript-driven formatting may fail.

---

## Summary of Root Causes

| # | Root Cause | Commit | Severity | Affects |
|---|-----------|--------|----------|---------|
| 1 | **CSP blocks Google Fonts CDN** | `9c21720` | **CRITICAL** | ALL fonts → ALL elements → ALL screens |
| 2 | Receipt English name fallback | `82b0e33` | Medium | Receipt/invoice English name only |
| 3 | sandbox: true | `9c21720` | Low-Medium | Potential font rendering subtleties |
| 4 | Print preload changed | `9c21720` | Low | Print window API availability |
