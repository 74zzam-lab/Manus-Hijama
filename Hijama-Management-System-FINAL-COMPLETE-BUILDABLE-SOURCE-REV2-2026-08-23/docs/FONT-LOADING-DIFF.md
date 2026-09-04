# Font Loading Diff — Original vs Current

## Font Loading Method

Both versions load fonts identically via Google Fonts CDN:

```html
<!-- index.html line 7 (IDENTICAL in both versions) -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Tajawal:wght@300;400;500;700;800;900&family=Cairo:wght@300;400;600;700;900&display=swap" rel="stylesheet">
```

Print templates also load Tajawal:
```html
<!-- index.html lines 18402, 18418 (IDENTICAL) -->
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
```

## The Difference: CSP Blocks Delivery

### Original (ed5d6f3 / ZIP)
- No CSP applied
- `sandbox: false` in Electron
- Fonts load successfully from Google CDN
- `document.fonts.check('15px Tajawal')` → **true**
- `document.fonts.check('15px Cairo')` → **true**
- `document.fonts.check('15px Inter')` → **true**

### Current (09244f5)
- CSP applied via `window-policy.js` + `electron/main.js`
- `style-src 'self' 'unsafe-inline'` → **blocks** `https://fonts.googleapis.com` CSS
- `font-src 'self' data:` → **blocks** `https://fonts.gstatic.com` font files
- `sandbox: true` in Electron
- Fonts **fail to load** from Google CDN
- `document.fonts.check('15px Tajawal')` → **false** (expected)
- `document.fonts.check('15px Cairo')` → **false** (expected)
- `document.fonts.check('15px Inter')` → **false** (expected)

## Actual Rendered Fonts (Current Version)

When Tajawal/Cairo/Inter are blocked, the CSS fallback chain activates:

| CSS Declaration | Intended Font | Actual Rendered Font |
|----------------|---------------|---------------------|
| `'Tajawal', sans-serif` | Tajawal | **System sans-serif** (Segoe UI on Windows, Arial/Liberation Sans on Linux) |
| `'Cairo', sans-serif` | Cairo | **System sans-serif** |
| `'Inter', 'Tajawal', system-ui, -apple-system, sans-serif` | Inter | **system-ui** (Segoe UI on Windows) |
| `'Cairo', 'Inter', sans-serif` | Cairo | **System sans-serif** |

## Visual Impact

| Property | Tajawal (intended) | Segoe UI (actual fallback) | Difference |
|----------|--------------------|---------------------------|------------|
| Arabic support | Native Arabic font | Limited Arabic support | Significant character shape changes |
| Weight 900 | Supported (Black) | Not available (maps to Bold) | Headings appear thinner |
| Weight 300 | Supported (Light) | Not available (maps to Regular) | Light text appears heavier |
| Character width | Narrower | Wider | Layout shifts, text wrapping changes |
| Line height | Optimized for Arabic | Not optimized | Vertical spacing differences |
| Kerning | Arabic-specific | Generic | Letter spacing differences |

| Property | Cairo (intended) | System fallback | Difference |
|----------|-----------------|-----------------|------------|
| Display weight 900 | Decorative Black | System Bold | Dramatically different heading appearance |
| Arabic optimization | Full | Partial | Character rendering quality |
| Metrics | Designed for UI display | Generic | Different baseline alignment |

## No Local/Offline Font Fallback

The project does not include any:
- Local font files (`.woff`, `.woff2`, `.ttf`, `.otf`)
- `@font-face` declarations with local sources
- Font preload (`<link rel="preload" as="font">`)

All fonts are **exclusively loaded from Google CDN**. When CSP blocks the CDN, there is **no offline fallback** — only the generic `sans-serif` system font.

## Commit Responsible

**`9c21720`** — Phase 2: harden Electron security (sandbox, IPC, CSP)

## Fix Applied

Implemented without CSP expansion:

1. Removed all Google Fonts references from `index.html` and print templates
2. Added local `@font-face` declarations for Tajawal, Cairo, and Inter
3. Bundled 17 local WOFF2 files under `assets/fonts/`
4. Kept CSP strict and unchanged
