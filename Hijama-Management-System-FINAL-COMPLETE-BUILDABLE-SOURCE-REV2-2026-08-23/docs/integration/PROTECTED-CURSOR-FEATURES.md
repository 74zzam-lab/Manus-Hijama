# Protected Cursor Features

These must not be lost during Hybrid integration.

## Security
- CSP without Google Fonts or `api.qrserver.com` — `electron/security/window-policy.js`
- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`
- Window/navigation policies in `electron/security/*`
- Path guards + IPC validation

## Fonts
- `assets/fonts/*.woff2` + LICENSES
- `@font-face` in main `index.html`
- Print/receipt 58mm/80mm/A4 absolute local font URLs
- Font diagnostics helper
- No external font requests

## QR
- `cupping-qr-local.js` + `assets/vendor/qrcode-generator*.js`
- Offline `data:` QR images
- No third-party QR hosts
- Preserve current QR payload encoding

## Invoice / receipt
- `defaultSettings.centerNameEn === ''`
- English fallback: `Cupping Center`
- Do not break print sizes 58mm/80mm without cause

## Tests
- Baseline `npm test` suite (54/54 on tip)
- Phase 4 SQLite ABI clarity
- Phase 9 branding expectations
- `tests/font-csp-audit.test.js`, `tests/local-qr.test.js` (wire into runner)

## Release gates
- FPV, RC, Freeze, Evidence, Production release scripts + baseline tests

## NextGen (post-20)
- Organization / Owner Hub phases 21–40 modules and tests

## Explicitly not removable for “Codex convenience”
- Dual-run bridge may be retired later via SoT plan, but not deleted blindly in H1–H4
