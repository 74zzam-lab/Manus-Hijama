# Invoice Settings Diff — Phase 1 → Phase Zero NextGen

| Item | Value |
|------|-------|
| **Original** | `ed5d6f3` |
| **Current** | `09244f5` |

---

## 1. Invoice Template (buildReceiptHTML)

### Changed: English Center Name Fallback

| Property | Original | Current | File:Line |
|----------|----------|---------|-----------|
| `cnEn` fallback | `'Cupping Center'` | `APP_META.productName \|\| 'Hijama Management System'` | `index.html:18829` |

**Category: C — Unintended side-effect**
**Severity: Medium**

The English center name shown on receipts changed from the hardcoded `'Cupping Center'` to the app's product name `'Hijama Management System'` when `settings.centerNameEn` is empty.

**Impact:** Only affects receipts when the user has NOT set a custom English center name in settings. If `settings.centerNameEn` is already set (e.g. "My Clinic"), this change has no effect.

### Changed: defaultSettings.centerNameEn

| Property | Original | Current | File:Line |
|----------|----------|---------|-----------|
| `defaultSettings.centerNameEn` | `''` (empty) | `APP_META.productName \|\| 'Hijama Management System'` | `index.html:9981` |

**Category: C — Unintended side-effect**
**Severity: Medium**

New installations will default to `'Hijama Management System'` instead of empty. Existing installations retain their saved value from DB.

---

## 2. Invoice Settings Keys

**No changes.** All invoice setting key names are identical:
- `cupPrice`, `vatRate`, `threshold`, `commissionRate` — unchanged
- `centerName`, `centerNameEn`, `address`, `phone`, `taxNum`, `brandLogo` — unchanged
- `simplifiedTaxInvoice` — unchanged
- `branchName` — unchanged
- All thermal/receipt settings — unchanged

## 3. Invoice Template HTML Structure

**No changes** to the receipt HTML template structure, ordering, or elements:
- Header (logo, center name AR/EN, address, phone, tax number) — unchanged
- Invoice number, date — unchanged
- Items table — unchanged
- Totals (subtotal, VAT, total) — unchanged
- Payment methods — unchanged
- QR code section — unchanged
- Footer / thank-you text — unchanged
- 58mm / 80mm width handling — unchanged

## 4. Invoice CSS / Print Styles

**No changes.** The `@media print` rules and receipt-specific CSS are identical.

## 5. Invoice Functions

**No changes** to:
- `buildReceiptHTML()` (except cnEn fallback noted above)
- `thermalPrint()`
- `thermalQrImageUrl()`
- `printReceipt()`
- `buildA4Receipt()` / `printA4()`
- Invoice counter / numbering
- Tax calculation logic
- Payment method rendering
- Silent print settings
- Number of copies

## 6. Electron Print Configuration

**No changes** to:
- `devices:printThermal` IPC handler
- Print window creation
- Print options (margins, page size, silent mode)

## 7. LocalStorage / DB Keys for Invoice

**No changes** to invoice-related storage keys:
- `invoiceCounter` — unchanged
- `settings.simplifiedTaxInvoice` — unchanged
- Receipt template settings — unchanged

## 8. Migration Impact

**No migration touches invoice settings.** The SQLite migration (`001_initial.js`) creates invoice tables but does not modify invoice settings stored in the `settings` KV entry.

---

## Summary

| Area | Changes | Severity |
|------|---------|----------|
| English center name fallback | `'Cupping Center'` → `APP_META.productName` | Medium (C) |
| defaultSettings.centerNameEn | `''` → `APP_META.productName` | Medium (C) |
| All other invoice areas | None | — |

**Restoration needed:** Revert `cnEn` and `defaultSettings.centerNameEn` fallback to `'Cupping Center'` or `''`.
