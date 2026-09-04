# Computed Style Runtime Diff

## Environment Limitation

This analysis is performed on a cloud agent VM **without a display server or Electron runtime**. Actual `getComputedStyle()` values cannot be captured. However, the root cause has been definitively identified through code analysis, making runtime verification a confirmation step rather than a discovery step.

## Predicted Computed Style Differences

Based on CSP blocking all three Google Fonts (Tajawal, Cairo, Inter), the following computed style differences are **guaranteed** at runtime:

### `<html>`
| Property | Original (fonts load) | Current (fonts blocked) |
|----------|-----------------------|------------------------|
| All properties | Identical CSS source | Identical CSS source |

### `<body>`
| Property | Original | Current (predicted) |
|----------|----------|-------------------|
| `font-family` | `Tajawal, sans-serif` (computed: "Tajawal") | `Tajawal, sans-serif` (computed: **"Segoe UI"** or **"Arial"**) |
| `font-size` | `15px` | `15px` (same) |
| All other properties | Unchanged | Unchanged |

### `#sidebar`
| Property | Original | Current (predicted) |
|----------|----------|-------------------|
| `font-family` | Inherited: "Tajawal" | Inherited: **system sans-serif** |

### `.page-title` / Section headings
| Property | Original | Current (predicted) |
|----------|----------|-------------------|
| `font-family` | `Cairo, sans-serif` → "Cairo" | `Cairo, sans-serif` → **system sans-serif** |
| `font-weight` | `900` → renders as Cairo Black | `900` → **renders as Bold** (900 unavailable in system font) |

### `.btn` / Buttons
| Property | Original | Current (predicted) |
|----------|----------|-------------------|
| `font-family` | `Tajawal, sans-serif` → "Tajawal" | → **system sans-serif** |
| Computed `width` | Based on Tajawal character widths | **Different** (system font has different metrics) |

### `input`, `select`, `textarea`
| Property | Original | Current (predicted) |
|----------|----------|-------------------|
| `font-family` | `Tajawal, sans-serif` → "Tajawal" | → **system sans-serif** |

### Tables (`<th>`, `<td>`)
| Property | Original | Current (predicted) |
|----------|----------|-------------------|
| `font-family` | Inherited "Tajawal" | Inherited **system sans-serif** |
| Column widths | Based on Tajawal metrics | **Different** due to different character widths |

### `.stat-value` (Dashboard stats)
| Property | Original | Current (predicted) |
|----------|----------|-------------------|
| `font-family` | `Cairo, sans-serif` → "Cairo" | → **system sans-serif** |
| `font-size` | `28px` | `28px` (same) |
| `font-weight` | `900` → Cairo Black | `900` → **system Bold** (looks very different) |

### `.login-title`
| Property | Original | Current (predicted) |
|----------|----------|-------------------|
| `font-family` | `Cairo, sans-serif` → "Cairo" | → **system sans-serif** |
| `font-size` | `20px` | `20px` (same) |
| `font-weight` | `900` → Cairo Black | `900` → **system Bold** |

### Receipt/Invoice container
| Property | Original | Current (predicted) |
|----------|----------|-------------------|
| `font-family` | `Tajawal, sans-serif` → "Tajawal" | → **system sans-serif** |
| Text wrapping | Based on Tajawal metrics | **Different line breaks** |

### QR Container / QR Canvas
| Property | Original | Current (predicted) |
|----------|----------|-------------------|
| QR canvas dimensions | Unchanged | Unchanged |
| QR data content | Unchanged | Unchanged |
| **Surrounding text** | Tajawal metrics | **System font metrics** → container layout shifts |

## Properties NOT Affected by Font Blocking

These CSS properties are **identical** in both versions because they don't depend on font loading:

- `width`, `height`, `min-width`, `max-width`, `min-height`, `max-height`
- `padding`, `margin`, `gap`
- `display`, `position`, `overflow`
- `transform`, `zoom`, `box-sizing`
- `background`, `border`, `border-radius`
- `color` (text color set by CSS, not font)
- `z-index`, `opacity`

## Verification Script

When running in Electron, this script can verify font loading status:
```javascript
// Run in DevTools console
const fonts = ['Tajawal', 'Cairo', 'Inter'];
fonts.forEach(f => {
  console.log(`${f} 15px:`, document.fonts.check(`15px ${f}`));
  console.log(`${f} 20px 900:`, document.fonts.check(`900 20px ${f}`));
});
console.log('Loaded fonts:', [...document.fonts].map(f => `${f.family} ${f.weight}`));
```

Expected output in **original** version: all `true`
Expected output in **current** version: all `false`
