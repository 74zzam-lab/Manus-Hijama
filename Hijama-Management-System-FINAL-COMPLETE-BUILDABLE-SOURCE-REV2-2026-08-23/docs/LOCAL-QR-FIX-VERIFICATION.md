# Local QR Fix Verification

## Root Cause

Receipt QR images used:

```
https://api.qrserver.com/v1/create-qr-code/...
```

Phase 2 CSP sets:

```
img-src 'self' data: blob:
```

Chromium therefore blocked the external QR image requests. The receipt modal showed broken-image placeholders under "موقع المركز" and "واتساب المركز".

This matches the screenshot: labels present, QR graphics missing.

## Fix

1. Vendored MIT `qrcode-generator` into `assets/vendor/`
2. Added `cupping-qr-local.js` helper (`CuppingQr.makeDataUrl`)
3. Replaced external QR URLs with local `data:image/...` URLs in:
   - `index.html` → `thermalQrImageUrl`
   - `cupping-simplified-tax-invoice.js` → `zatcaQrImageUrl`
   - `cupping-client-file.js` → `buildQrBlock`
4. Kept CSP unchanged (no `api.qrserver.com` allowlisting)

## Expected Runtime Result

- Receipt preview shows scannable WhatsApp / Site QR images
- Works offline
- Zero network requests to `api.qrserver.com`
- CSP remains strict

## Tests

- `tests/local-qr.test.js`
- Updated `tests/font-csp-audit.test.js` QR expectation
