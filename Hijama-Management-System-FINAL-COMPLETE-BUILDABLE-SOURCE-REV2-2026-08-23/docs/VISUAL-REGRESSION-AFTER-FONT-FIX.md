# Visual Regression After Font Fix

## Status

Runtime visual comparison against `ed5d6f3` requires actual Electron execution with a display pipeline, and Windows packaged runtime checks.  
Current cloud environment does not provide Windows runtime execution, installed app flow, or interactive print-preview capture.

Result state for this run: **INCOMPLETE (verification-only environment constraint)**.

## What was verified in-code

1. Google Fonts CDN references removed from `index.html` and print templates.
2. Local fonts bundled in `assets/fonts/` (17 files).
3. Main CSS uses local `@font-face`.
4. Print templates now resolve absolute local font URLs using:
   - `new URL('./assets/fonts/...', window.location.href).href`
5. CSP remained strict (no added external font domains).

## Context-by-context resolution model (code-level)

| Context | How document is created | Document URL | baseURI | Font URL strategy | Expected result |
|---|---|---|---|---|---|
| Main window | `loadFile(index.html)` | `file://.../index.html` | `file://.../index.html` | relative local `./assets/fonts/...` | PASS |
| Report preview iframe | `iframe.srcdoc = buildA4PrintDocument(...)` | `about:srcdoc` | runtime-defined | absolute `file://` from parent `window.location.href` | PASS |
| Popup print preview | `window.open('')` + `document.write(...)` | `about:blank` | `about:blank` | absolute `file://` injected in generated CSS | PASS |
| Thermal/A4 hardware print | HTML written to temp file, then `BrowserWindow.loadFile(tmpPath)` | `file:///tmp/...` | `file:///tmp/...` | absolute `file://` injected in generated CSS | PASS |
| PDF generation | HTML temp file + `printToPDF` | `file:///tmp/...` | `file:///tmp/...` | absolute `file://` injected in generated CSS | PASS |

## Required Windows runtime follow-up

Before merge to `develop`/`main`, execute:

1. Development run (`npm start`) on Windows.
2. Packaged build (`npm run build:win`) + unpacked + installed app.
3. Offline test pass (network disconnected).
4. Screenshot and pixel diff vs `ed5d6f3`.
5. Font console error scan:
   - `ERR_FILE_NOT_FOUND`
   - `Failed to decode downloaded font`
   - `OTS parsing error`
   - CSP font errors

## Provisional verdict

- **Code fix readiness:** PASS
- **Runtime visual proof on Windows:** INCOMPLETE
- **Merge gate recommendation:** PASS WITH WARNINGS (do not merge until Windows runtime verification passes)
