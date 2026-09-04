# V2-5.6 — Regression Report

Workflow `.github/workflows/v2-5-6-release-gate.yml` runs:

- `npm test` (includes V2-5.6 unit/scenarios/runtime via `tests/run-all.js`)
- Prior `verify:v2-5-5` … `verify:v2-4` gates as configured
- Font CSP + local QR baselines (also spawned from UX unit)
- Layout/branding: `evidence/layout-branding-regression.json` proves `design-system.css` linked and branding paths exist

REG-256-001 evidence paths point at unit + scenarios + windows runtime + prior phase gates.
