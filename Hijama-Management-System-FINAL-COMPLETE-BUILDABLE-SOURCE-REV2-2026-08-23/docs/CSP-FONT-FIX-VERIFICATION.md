# CSP Font Fix Verification

## CSP Policy (Unchanged)

```
default-src 'self'
script-src 'self' 'unsafe-inline'
style-src 'self' 'unsafe-inline'
img-src 'self' data: blob:
font-src 'self' data:
connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com https://www.google.com https://googleapis.com https://script.google.com https://script.googleusercontent.com https://timeapi.io https://worldtimeapi.org
object-src 'none'
base-uri 'self'
form-action 'self'
frame-ancestors 'none'
worker-src 'self' blob:
```

**No changes were made to the CSP.** The fix was to bring fonts inside `'self'` instead of adding external origins.

## Security Checklist

| Check | Status |
|-------|--------|
| Local fonts work with `font-src 'self'` | PASS |
| Google Fonts still blocked (no CDN references remain) | PASS |
| External scripts blocked | PASS (script-src 'self') |
| eval blocked | PASS (no 'unsafe-eval') |
| External navigation guarded | PASS (unchanged) |
| Window open handler | PASS (unchanged) |
| nodeIntegration disabled | PASS (unchanged) |
| contextIsolation enabled | PASS (unchanged) |
| sandbox enabled | PASS (unchanged) |

## How Local Fonts Satisfy CSP

1. Font files live in `assets/fonts/` within the application directory
2. index.html is loaded via `file://` protocol from the same directory
3. Main UI `@font-face src: url('./assets/fonts/...')` resolves to same origin
4. Print templates generate absolute local URLs using `new URL('./assets/fonts/...', window.location.href).href` to survive `about:blank` and temp-file contexts
5. `font-src 'self'` allows these local `file://` resources
6. No external requests needed

## Rollback Plan (Corrected)

1. Revert the four commits from the local-font fix branch.
2. Return to the exact previous repository state.
3. Do **not** add Google Fonts domains to CSP.
4. Do **not** modify CSP as part of rollback.

## Console Verification

After fix, DevTools console should show:
- Zero CSP violation errors for fonts
- Zero network requests to `fonts.googleapis.com` or `fonts.gstatic.com`
- `document.fonts.check('15px Tajawal')` → `true`
- `document.fonts.check('15px Cairo')` → `true`
- `document.fonts.check('15px Inter')` → `true`

## Window Context / Base URI Matrix

| Context | Creation method | Expected URL | baseURI | Font URL behavior |
|---|---|---|---|---|
| Main app | `BrowserWindow.loadFile(index.html)` | `file://.../index.html` | `file://.../index.html` | Main `@font-face` uses local relative URLs |
| Popup preview | `window.open('')` + `document.write(...)` | `about:blank` | `about:blank` | Generated doc injects absolute local `file://` URLs |
| Report preview | `iframe.srcdoc` | `about:srcdoc` | `about:srcdoc` | Generated doc injects absolute local `file://` URLs |
| Thermal/A4 print job | temp HTML + `loadFile(tmpPath)` | `file:///tmp/...` | `file:///tmp/...` | Generated doc injects absolute local `file://` URLs |
| PDF export | temp HTML + `printToPDF` | `file:///tmp/...` | `file:///tmp/...` | Generated doc injects absolute local `file://` URLs |

## Development Runtime Diagnostic Hook

In Development mode only, run:

```js
await window.__fontRuntimeDiagnostics?.();
```

Output includes:
- `documentUrl`
- `baseUri`
- `devicePixelRatio`
- `loadedFonts`
- `failedFonts`
- `bodyFont`
- `receiptFont`
- `qrContainerDimensions`
- `networkFontRequests`
