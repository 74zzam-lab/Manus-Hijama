# Final Production Audit (FPA) Report

**Date:** 2026-07-21T13:58:39.931Z
**Branch:** cursor/pre-release-final-review-d976

## Summary

| Metric | Value |
|--------|-------|
| Scenarios | 23 |
| Passed | 17 |
| Failed | 3 |
| Warnings | 3 |
| **Readiness** | **86%** |

## Electron Manual Checklist (required before merge)

- [ ] First run + Setup Wizard
- [ ] Product Tour (after enabling in Dev › Diagnostics)
- [ ] Thermal print 58mm + 80mm (physical)
- [ ] A4 Portrait + Landscape + PDF
- [ ] Monthly Archive PDF
- [ ] Employee Ledger + Backup/Restore
- [ ] Zero console errors

## Detailed Results

### 1 — Thermal Stress
- [FAIL] **T-58-struct** — Thermal 58mm stress receipt: rows:124 vals:32 QR:true
- [FAIL] **T-80-struct** — Thermal 80mm stress receipt: rows:124 vals:32 QR:true
- [PASS] **T-58-layout** — Thermal 58mm DOM metrics: util:100% wrap:0 rows:61
- [PASS] **T-80-layout** — Thermal 80mm DOM metrics: util:100% wrap:0 rows:61
### 2 — Typography
- [PASS] **TY-01** — Multi-page overflow scan: 0 overflows
- [PASS] **TY-02** — Multi-page wrap scan: 0 wrap hints
### 3 — Product Tour
- [PASS] **TOUR-OFF** — Disabled: no JS/DOM/listeners: {"hasTourScript":false,"tourDom":false,"tourStyles":false,"productTourGlobal":false,"tourBtnVisible":false,"loadedTourScript":false,"tourDomAfter":false,"scriptsDelta":0}
- [PASS] **TOUR-OFF-UI** — Disabled: UI hidden
### 4 — Setup Wizard
- [FAIL] **WIZ-01** — Wizard independent of tour: {"tourLoaded":false,"wizardDom":false,"tourDom":false,"wizardBody":0,"tourStillNotLoaded":true,"setupWizardFeat":false,"tourFeat":false}
### 3 — Product Tour
- [PASS] **TOUR-ON** — Enabled: single script load: scripts:1
- [PASS] **TOUR-ON-DUP** — No duplicate overlay: overlays:1
- [PASS] **TOUR-ON-AUDIT** — Audit log on start
### 5 — Licenses
- [PASS] **LIC-01** — Feature registry: 74 keys
- [PASS] **LIC-02** — Product tour opt-in default
- [PASS] **LIC-03** — DOM feature gates: 45 data-feature
- [WARN] **LIC-04** — Ungated addons (module-level): book_schedule, book_confirm, book_no_show, ops_map_editor, rep_sales, tech_print_pdf, att_daily, att_leave, hr_leave_requests, pay_salary, pay_commission, hw_thermal, bk_local, bk_cloud, bk_drive
### 6 — Performance
- [PASS] **PERF-01** — Product tour not in index.html bundle
- [PASS] **PERF-02** — Lazy scripts count: 119 modules
### 7 — Electron
- [WARN] **E-01** — Electron runtime validation: Manual — see checklist in report
- [PASS] **E-02** — electron/ package present: electron/main.js present; cupping-product-tour.js lazy (not in index.html script tags); PASS: product-tour not statically bundled
### 8 — Production Audit
- [PASS] **PA-01** — Product tour not in index.html
- [WARN] **PA-LEG** — Legacy path: dist/ (build artifact — not source of truth)
- [PASS] **PA-BR** — Branch diff: diff vs main: 23 files changed, 1965 insertions(+), 345 deletions(-)

### Static Repo Audit

- dist/ (build artifact — not source of truth)
- diff vs main: 23 files changed, 1965 insertions(+), 345 deletions(-)