# Visual Regression — Hybrid vs Cursor tip

**Baseline for visual compare:** `cursor/fix-local-qr-csp-c2ea` (not Phase 20 alone).

## Expected (preserved)

- Local Tajawal/Cairo/Inter fonts in main UI
- Receipt 58mm/80mm/A4 local print fonts
- Local QR data URLs
- Receipt EN fallback `Cupping Center`
- No Google Fonts network requests
- No `api.qrserver.com`

## Hybrid UI changes this RC

- `renderer/styles/design-system.css` **added but not linked** into `index.html` (no intentional visual rewrite)
- No dashboard layout changes

## Screenshots

Linux cloud agent cannot capture Windows Electron UI screenshots for Dashboard/Receipts in this pass.

**Status:** `PASS (structural)` / `PENDING (Windows screenshot matrix)`

Required on Windows host: Dashboard, Sidebar, New Case, Clients, Appointments, Employees, Payroll, Reports, Settings, Receipt 58/80, A4, QR, Print Preview.
