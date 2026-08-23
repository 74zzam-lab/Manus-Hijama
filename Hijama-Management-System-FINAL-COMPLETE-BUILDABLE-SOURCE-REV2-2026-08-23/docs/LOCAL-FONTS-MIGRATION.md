# Local Fonts Migration

## Summary

Migrated all Google Fonts (Tajawal, Cairo, Inter) from external CDN to bundled local woff2 files. The application now loads all fonts from `assets/fonts/` without any network requests.

## Fonts Added

| Font | Weights | Subsets | Files | Total Size |
|------|---------|--------|-------|------------|
| Tajawal | 300, 400, 500, 700, 800, 900 | Arabic, Latin | 12 | ~114 KB |
| Cairo | 300–900 (variable) | Arabic, Latin, Latin-Ext | 3 | ~81 KB |
| Inter | 400–800 (variable) | Latin, Latin-Ext | 2 | ~133 KB |
| **Total** | | | **17 files** | **~328 KB** |

## Changes Made

### 1. Removed Google Fonts CDN references
- `index.html` line 7: Removed `<link href="https://fonts.googleapis.com/...">` 
- `index.html` thermal print template: Replaced CDN link with inline `@font-face`
- `index.html` A4 report template: Replaced CDN link with inline `@font-face`

### 2. Added local @font-face declarations
- 12 declarations for Tajawal (6 weights × 2 subsets)
- 3 declarations for Cairo (variable font, 3 subsets)
- 2 declarations for Inter (variable font, 2 subsets)
- All use `font-display: swap` for consistent behavior with original
- Unicode-range subsetting preserved for optimal loading

### 3. Print templates
- Thermal print template: 6 inline `@font-face` declarations (Tajawal 400/700/900)
- A4 report template: 6 inline `@font-face` declarations (Tajawal 400/700/900)
- Print windows now resolve local font URLs via `new URL(..., window.location.href).href` and inject absolute `file://` URLs in generated HTML to avoid `about:blank` / temp-file base URI issues

### 4. CSP unchanged
- `font-src 'self' data:` already allows local fonts
- No external domains added to any CSP directive
- All security hardening from Phase 2 preserved

## License Compliance

All fonts are licensed under the **SIL Open Font License 1.1** (OFL), which permits:
- Bundling in commercial applications
- Redistribution
- Modification

Full license documentation: `assets/fonts/LICENSES.md`

## WOFF2 Validation Table

| Font file | Declared family | Declared weight | Subset | Size (bytes) | Validation |
|---|---|---:|---|---:|---|
| tajawal-300-arabic.woff2 | Tajawal | 300 | Arabic | 8296 | PASS (valid WOFF2 header/type) |
| tajawal-300-latin.woff2 | Tajawal | 300 | Latin | 9896 | PASS |
| tajawal-400-arabic.woff2 | Tajawal | 400 | Arabic | 8932 | PASS |
| tajawal-400-latin.woff2 | Tajawal | 400 | Latin | 10256 | PASS |
| tajawal-500-arabic.woff2 | Tajawal | 500 | Arabic | 8940 | PASS |
| tajawal-500-latin.woff2 | Tajawal | 500 | Latin | 9900 | PASS |
| tajawal-700-arabic.woff2 | Tajawal | 700 | Arabic | 9024 | PASS |
| tajawal-700-latin.woff2 | Tajawal | 700 | Latin | 9996 | PASS |
| tajawal-800-arabic.woff2 | Tajawal | 800 | Arabic | 8700 | PASS |
| tajawal-800-latin.woff2 | Tajawal | 800 | Latin | 10224 | PASS |
| tajawal-900-arabic.woff2 | Tajawal | 900 | Arabic | 9448 | PASS |
| tajawal-900-latin.woff2 | Tajawal | 900 | Latin | 10584 | PASS |
| cairo-variable-arabic.woff2 | Cairo | 300–900 | Arabic | 30896 | PASS |
| cairo-variable-latin-ext.woff2 | Cairo | 300–900 | Latin-Ext | 16648 | PASS |
| cairo-variable-latin.woff2 | Cairo | 300–900 | Latin | 33820 | PASS |
| inter-variable-latin-ext.woff2 | Inter | 400–800 | Latin-Ext | 85068 | PASS |
| inter-variable-latin.woff2 | Inter | 400–800 | Latin | 48256 | PASS |

Validation method: `file` utility confirms all are `Web Open Font Format (Version 2), TrueType`.

## Rollback Plan (Corrected)

If a rollback is required:

1. Revert the four commits created on the local-font fix branch.
2. Return to the exact previous repository state.
3. **Do not** add Google Fonts domains to CSP.
4. **Do not** modify CSP as part of rollback.
