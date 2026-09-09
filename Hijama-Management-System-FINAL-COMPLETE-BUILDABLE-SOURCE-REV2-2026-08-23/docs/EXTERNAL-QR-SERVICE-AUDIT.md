# External QR Service Audit

## Status (Updated)

**Resolved in local-QR fix.** Runtime code no longer calls `api.qrserver.com`.

Receipt / ZATCA / client-file QR images are now generated locally via:

- `assets/vendor/qrcode-generator.js` (+ UTF-8 helper)
- `cupping-qr-local.js` → `CuppingQr.makeDataUrl(...)`
- Output: CSP-safe `data:image/...` URLs

## Historical usage (before fix)

- Endpoint: `https://api.qrserver.com/v1/create-qr-code/`
- Used by:
  - `thermalQrImageUrl` in `index.html` (WhatsApp / Site QR on receipts)
  - `zatcaQrImageUrl` in `cupping-simplified-tax-invoice.js`
  - `buildQrBlock` in `cupping-client-file.js`

## Why it broke after Phase 2

CSP:

```
img-src 'self' data: blob:
```

blocked external QR image loads → broken `<img>` icons in receipt preview.

## Risk classification (historical)

| Category | Risk | Notes |
|---|---|---|
| Privacy | Medium | URL payload sent to third-party |
| Security | Low-Medium | External dependency in print path |
| Offline availability | High | Failed without internet / under CSP |
| Reliability | Medium | External SLA not controlled |

## Current verification

See `docs/LOCAL-QR-FIX-VERIFICATION.md`.
