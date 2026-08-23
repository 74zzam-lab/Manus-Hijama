# Invoice Runtime Diff

## Template Changes

### English Center Name Fallback
| Area | Original | Current | Impact |
|------|----------|---------|--------|
| `defaultSettings.centerNameEn` | `''` | `APP_META.productName \|\| 'Hijama Management System'` | New installs get non-empty default |
| `buildReceiptHTML` cnEn fallback | `'Cupping Center'` | `APP_META.productName \|\| 'Hijama Management System'` | Receipts show different English name |

### All Other Template Elements
**IDENTICAL.** No changes to:
- Receipt HTML structure
- Item table
- Totals/subtotals/VAT
- Payment methods
- QR code section
- Footer/thank-you text
- Center Arabic name
- Address/phone/tax number
- Invoice number
- Date formatting
- 58mm/80mm width handling

## Font Impact on Invoice Rendering

**This is the primary invoice visual regression.**

The receipt template uses:
```css
font-family: 'Tajawal', sans-serif;  /* Receipt body */
font-family: 'Cairo', sans-serif;    /* Receipt header */
```

With CSP blocking Google Fonts:
| Receipt Element | Original Font | Current Font | Visual Difference |
|----------------|---------------|--------------|-------------------|
| Header (center name) | Cairo 900 | System Bold | Thinner, different shape |
| Body text | Tajawal | System sans-serif | Different character widths |
| Item names | Tajawal | System sans-serif | Different wrapping |
| Prices/numbers | Tajawal | System sans-serif | Different alignment |
| Footer | Tajawal | System sans-serif | Different spacing |
| Arabic text | Tajawal (Arabic-optimized) | System font | **Significant** quality/shape difference |

### 58mm Thermal Receipt Impact

On 58mm paper width, font metrics are critical. Different character widths cause:
- Line breaks at different positions
- Text truncation differences
- Column alignment shifts
- Overall receipt length changes

### 80mm Thermal Receipt Impact

Same issues as 58mm but with more tolerance due to wider paper.

### Print Window Font Loading

Print windows (child BrowserWindows) also have CSP applied via `session.defaultSession`, AND they now use `preload-print.js` instead of main preload.

The print template inline-loads Tajawal:
```html
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
```

This is ALSO blocked by CSP → print output uses system fallback fonts.

## Invoice Settings

### Settings Keys — No Changes
All invoice-related settings keys are identical between versions.

### Settings Values — No Migration Issues
- No destructive spread order (`{ ...defaults, ...saved }`)
- `DB.get('settings', defaultSettings)` returns saved values if they exist
- No `resetSettings()` or `migrateSettings()` functions exist
- `SettingsGuard` is a cloud-sync conflict guard, not a value migration

### Invoice Counter — No Changes
`invoiceCounter` key and logic are identical.

### Tax Settings — No Changes
`simplifiedTaxInvoice`, `vatRate`, tax number handling are identical.

## Print Settings — Changes

| Setting | Original | Current | Impact |
|---------|----------|---------|--------|
| Print preload | `preload.js` | `preload-print.js` | Print window has fewer APIs |
| Print window sandbox | `false` | `true` | Chromium sandbox in print window |
| Print window CSP | None | Applied from session | Blocks external fonts in print |

## Root Causes Summary

| Issue | Cause | Severity |
|-------|-------|----------|
| Invoice font appearance | CSP blocks Tajawal/Cairo → system fallback | **Critical** |
| English name on receipt | Fallback changed to `APP_META.productName` | Medium |
| Print window rendering | sandbox + print preload change | Low-Medium |
