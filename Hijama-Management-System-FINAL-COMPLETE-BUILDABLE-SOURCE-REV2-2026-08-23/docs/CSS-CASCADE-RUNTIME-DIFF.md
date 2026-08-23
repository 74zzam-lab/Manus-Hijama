# CSS Cascade Runtime Diff

## Stylesheet Loading Order

### Original (ed5d6f3)
```
1. Google Fonts CSS (external) — https://fonts.googleapis.com/css2?...
2. <style> block in index.html — ~3,800 lines of app CSS
3. <style id="thermal-preview-css"> — empty, dynamically populated
4. JS-injected styles from cupping-*.js modules (identical)
```

### Current (09244f5)
```
1. Google Fonts CSS (external) — BLOCKED BY CSP ⛔
2. <style> block in index.html — ~3,800 lines (IDENTICAL to original)
3. <style id="thermal-preview-css"> — empty, dynamically populated
4. JS-injected styles from cupping-*.js modules (IDENTICAL)
5. NEW: <style id="boot-flow-styles-v2"> — boot flow overlay (scoped to .bf-*)
6. NEW: <style id="branch-lock-styles"> — branch lock modal (scoped to .bl-*)
7. NEW: <style id="center-setup-styles"> — center setup modal (scoped to .cs-*)
8. NEW: <style id="conflict-ui-styles"> — conflict manager (scoped to .cf-*)
9. NEW: <style id="data-state-ui-styles"> — data state overlay (scoped to .ds-*)
10. NEW: <style id="owner-hub-styles"> — owner hub cards (scoped to .oh-*)
```

## Impact of New Injected Stylesheets

### Global Selector Analysis

All new stylesheets use component-prefixed selectors (`.bf-*`, `.bl-*`, `.cs-*`, `.cf-*`, `.ds-*`, `.oh-*`). **None define rules for bare global selectors** like `*`, `body`, `html`, `div`, `table`, `button`, `input`, etc.

### body Class Manipulation

`boot-flow-ui.js` adds/removes `bf-active` class on `<body>`:
```javascript
document.body?.classList.toggle('bf-active', !!active);
```

Rules using `body.bf-active`:
```css
body.bf-active #licenseScreen:not(.hidden) { z-index: 100040 !important }
body.bf-active #devContactModal.open { z-index: 100041 !important }
body.bf-active .cs-overlay.open { z-index: 100039 !important }
body.bf-active .bl-overlay.open { z-index: 100039 !important }
body.bf-active .ds-overlay.open { z-index: 100039 !important }
body.bf-active #cloudConnectModal.open { z-index: 100039 !important }
```

**Impact:** Only affects `z-index` stacking of overlays when boot flow is active. Does NOT affect font, size, spacing, or layout.

### Specificity Conflicts

No new CSS rules conflict with or override existing rules because:
1. All use unique prefixed class names not present in original CSS
2. None target existing IDs or classes (except the `body.bf-active` z-index overrides)
3. The `!important` declarations only affect z-index of modals during boot flow

### `data-theme` / Theme Application

`applyTheme()` sets CSS variables on `:root` identically in both versions. The function, its call site, and the `THEMES` object are **unchanged**.

## Cascade Conclusion

The CSS cascade order difference (blocked Google Fonts + 6 new scoped stylesheets) has **one significant effect**:

1. **Missing Google Fonts CSS** (blocked) → All `font-family` declarations fall back to `sans-serif`

The 6 new scoped stylesheets have **zero cascade impact** on existing elements because they only define styles for their own component containers.
