# QR Code Diff — Phase 1 → Phase Zero NextGen

| Item | Value |
|------|-------|
| **Original** | `ed5d6f3` |
| **Current** | `09244f5` |

---

## 1. QR Code Library

**No change.** The QR code library (loaded from `node_modules/qrcode/...`) is identical.

## 2. QR Generation Function

**No change** to `thermalQrImageUrl()`:
- Size/dimensions — unchanged
- Margin — unchanged
- Error correction level — unchanged
- Data encoding (TLV for tax invoice) — unchanged
- Base64 output — unchanged
- Canvas/Image handling — unchanged

## 3. QR CSS

**No change.** No CSS rules affecting `canvas`, `img`, or QR-specific elements were modified.

Checked properties:
- `image-rendering` — unchanged (not set)
- `object-fit` — unchanged (not set on QR)
- `aspect-ratio` — unchanged (not set on QR)
- `transform` / `scale` — unchanged (not set on QR)
- `max-width: 100%` on `img` — no global rule exists; not added

## 4. TLV Tax Invoice Data

**No change.** The TLV builder for simplified tax invoices is identical.

## 5. QR Display in Receipt

**No change.** The QR code section in `buildReceiptHTML()` is identical in structure, sizing, and styling.

---

## Summary

**Zero QR code changes.** No regressions, no visual impact, no readability impact.
