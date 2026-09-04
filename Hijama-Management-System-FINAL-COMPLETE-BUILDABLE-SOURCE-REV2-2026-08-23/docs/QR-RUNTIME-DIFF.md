# QR Code Runtime Diff

## Source Code Changes

**Zero changes** to QR code generation, rendering, or display between `ed5d6f3` and `09244f5`.

| Component | Changed? | Details |
|-----------|----------|---------|
| QR library | No | Same library, same version |
| `thermalQrImageUrl()` | No | Same function, same parameters |
| QR size/dimensions | No | Same values |
| QR margin | No | Same value |
| Error correction level | No | Same level |
| TLV data builder | No | Same tax invoice TLV encoding |
| QR CSS rules | No | No CSS changes |
| Canvas/Image elements | No | Same HTML structure |

## Runtime Differences (Predicted)

### Font-Related QR Impact

The QR code itself (the pixel pattern) is **identical** because it's generated from data, not affected by fonts.

However, the **text surrounding the QR** (labels, receipt header/footer) uses `Tajawal`/`Cairo` which are now blocked by CSP. This causes:

1. **Receipt layout around QR shifts** — different font metrics change line breaks and spacing above/below QR
2. **QR container apparent size** — if surrounding text wraps differently, the QR image may appear to have different relative prominence
3. **QR intrinsic dimensions** — unchanged (canvas width/height set programmatically)
4. **QR readability** — unchanged (pixel pattern is font-independent)

### Print Window QR

Print windows now use `preload-print.js` instead of main `preload.js`. The QR generation happens in the main window and is embedded as a base64 image in the print HTML, so the print preload change does **not** affect QR rendering.

### QR Data Content

The QR encodes tax invoice TLV data. If `settings.centerNameEn` is empty and falls through to `APP_META.productName`:
- **Original:** QR may contain "Cupping Center" (if English name was part of QR data)
- **Current:** QR may contain "Hijama Management System"

However, the simplified tax invoice QR typically encodes:
1. Seller name (Arabic: `settings.centerName`)
2. VAT registration number
3. Invoice date
4. Total amount
5. VAT amount

The English name is **not** part of the standard ZATCA TLV encoding, so QR data content is likely unchanged.

## Conclusion

QR code generation and scanning are **unaffected**. Visual differences around QR are caused by font fallback changing text layout in the receipt container.
